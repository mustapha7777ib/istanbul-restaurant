import { logEvent, SYSTEM } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { Outbox, rooms } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { REQUEST_LABELS } from "./requests";
import { closeAbandonedSessions } from "./sessions";

let lastAbandonedSweep = 0;

/**
 * Runs every ~15s (server.ts → /api/internal/tick).
 *  - Orders nobody claimed within the timeout open to every waiter + alert managers.
 *  - Guest requests nobody acknowledged get escalated the same way.
 *  - Food sitting at the pass too long re-pings the waiter and managers.
 * Each item escalates once (tracked by escalatedAt / readyAlertAt).
 */
export async function runEscalations(now = new Date()) {
  const settings = await getSettings();
  const outbox = new Outbox();
  let count = 0;

  const claimCutoff = new Date(now.getTime() - settings.claimTimeoutSec * 1000);
  const unclaimed = await prisma.order.findMany({
    where: { status: "PLACED", escalatedAt: null, placedAt: { lt: claimCutoff } },
    include: { table: true, session: { select: { waiterId: true, waiter: { select: { name: true } } } } },
  });
  for (const o of unclaimed) {
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.order.updateMany({ where: { id: o.id, status: "PLACED", escalatedAt: null }, data: { escalatedAt: now } });
      if (r.count) {
        await logEvent(tx, SYSTEM, "ORDER_ESCALATED", { type: "Order", id: o.id }, {
          tableId: o.tableId,
          sessionId: o.sessionId,
          data: { seq: o.seq, waitedSeconds: Math.round((now.getTime() - o.placedAt.getTime()) / 1000), ownerId: o.session.waiterId },
        });
      }
      return r.count;
    });
    if (!res) continue;
    count++;
    const mins = Math.round((now.getTime() - o.placedAt.getTime()) / 60000);
    outbox.ping([rooms.waiters, rooms.managers], "waiters-on-shift", {
      kind: "alert",
      title: `Unclaimed order · ${o.table.label}`,
      body: `Waiting ${mins} min${o.session.waiter ? ` (${o.session.waiter.name}'s table)` : ""}. Anyone can take it now.`,
      url: "/staff?tab=queue",
    });
    outbox.add([rooms.waiters, rooms.managers], "queue", {});
  }

  const reqCutoff = new Date(now.getTime() - settings.requestEscalateSec * 1000);
  const ignored = await prisma.serviceRequest.findMany({
    where: { status: "OPEN", escalatedAt: null, createdAt: { lt: reqCutoff } },
    include: { table: true },
  });
  for (const r of ignored) {
    const res = await prisma.$transaction(async (tx) => {
      const u = await tx.serviceRequest.updateMany({ where: { id: r.id, status: "OPEN", escalatedAt: null }, data: { escalatedAt: now } });
      if (u.count) {
        await logEvent(tx, SYSTEM, "REQUEST_ESCALATED", { type: "ServiceRequest", id: r.id }, {
          tableId: r.tableId,
          sessionId: r.sessionId,
          data: { type: r.type },
        });
      }
      return u.count;
    });
    if (!res) continue;
    count++;
    outbox.ping([rooms.waiters, rooms.managers], "waiters-on-shift", {
      kind: "alert",
      title: `No response · ${r.table.label}`,
      body: `${REQUEST_LABELS[r.type]} ${Math.round((now.getTime() - r.createdAt.getTime()) / 60000)} min ago`,
      url: "/staff?tab=requests",
    });
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
  }

  const readyCutoff = new Date(now.getTime() - settings.readyAlertSec * 1000);
  const waitingAtPass = await prisma.order.findMany({
    where: { status: "READY", readyAlertAt: null, readyAt: { lt: readyCutoff } },
    include: { table: true, session: { select: { waiterId: true } } },
  });
  for (const o of waitingAtPass) {
    const res = await prisma.$transaction(async (tx) => {
      const u = await tx.order.updateMany({ where: { id: o.id, status: "READY", readyAlertAt: null }, data: { readyAlertAt: now } });
      if (u.count) {
        await logEvent(tx, SYSTEM, "ORDER_READY_ALERT", { type: "Order", id: o.id }, {
          tableId: o.tableId,
          sessionId: o.sessionId,
          data: { seq: o.seq, waiterId: o.session.waiterId },
        });
      }
      return u.count;
    });
    if (!res) continue;
    count++;
    const waiterId = o.session.waiterId ?? o.waiterId;
    const ping = {
      kind: "alert" as const,
      title: `Food waiting · ${o.table.label}`,
      body: `Order #${o.seq} has been ready for ${Math.round((now.getTime() - (o.readyAt?.getTime() ?? now.getTime())) / 60000)} min`,
      url: "/staff?tab=tables",
    };
    outbox.ping(waiterId ? [rooms.staff(waiterId), rooms.managers] : [rooms.managers], waiterId ? [waiterId] : [], ping);
  }

  if (count) outbox.add([rooms.managers], "floor", {});
  outbox.flush();

  if (now.getTime() - lastAbandonedSweep > 10 * 60 * 1000) {
    lastAbandonedSweep = now.getTime();
    count += await closeAbandonedSessions();
  }
  return count;
}
