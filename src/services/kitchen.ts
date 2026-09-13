import type { Station } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma, type Tx } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { choicesLabel, parseChosen } from "@/lib/options";
import { secondsBetween } from "@/lib/time";
import { isManager, requireOnShift, sessionRooms } from "./common";
import { syncOrderStatus } from "./orders";

const RECALL_WINDOW_MIN = 20;

function canWorkStation(staff: StaffUser, station: Station) {
  if (isManager(staff)) return true;
  return staff.role === "KITCHEN" && (!staff.station || staff.station === station);
}

/** Tickets for a station: paid orders (sent by the waiter) with items for this station. */
export async function stationTickets(station: Station) {
  const since = new Date(Date.now() - RECALL_WINDOW_MIN * 60 * 1000);
  const items = await prisma.orderItem.findMany({
    where: {
      station,
      order: { status: { in: ["ACCEPTED", "READY"] } },
      OR: [{ status: { in: ["PENDING", "PREPARING"] } }, { status: "READY", readyAt: { gte: since } }],
    },
    include: {
      order: {
        include: {
          table: { select: { label: true, area: true } },
          waiter: { select: { name: true } },
          session: { select: { waiter: { select: { name: true } } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  type Ticket = {
    orderId: string;
    seq: number;
    table: string;
    area: string;
    waiter: string | null;
    /** When the ticket reached the kitchen (paid). */
    sentAt: Date | null;
    note: string | null;
    targetMinutes: number;
    status: "NEW" | "PREPARING" | "READY";
    readyAt: Date | null;
    items: { id: string; name: string; qty: number; note: string | null; options: string; status: string }[];
  };
  const tickets = new Map<string, Ticket>();
  for (const i of items) {
    const o = i.order;
    let t = tickets.get(o.id);
    if (!t) {
      t = {
        orderId: o.id,
        seq: o.seq,
        table: o.table.label,
        area: o.table.area,
        waiter: o.session.waiter?.name ?? o.waiter?.name ?? null,
        sentAt: o.paidAt ?? o.acceptedAt,
        note: o.note,
        targetMinutes: 0,
        status: "READY",
        readyAt: null,
        items: [],
      };
      tickets.set(o.id, t);
    }
    t.items.push({ id: i.id, name: i.name, qty: i.qty, note: i.note, options: choicesLabel(parseChosen(i.options)), status: i.status });
    t.targetMinutes = Math.max(t.targetMinutes, i.prepMinutes);
    if (i.readyAt && (!t.readyAt || i.readyAt > t.readyAt)) t.readyAt = i.readyAt;
  }
  for (const t of tickets.values()) {
    const statuses = t.items.map((i) => i.status);
    t.status = statuses.includes("PENDING") && !statuses.includes("PREPARING")
      ? "NEW"
      : statuses.some((s) => s === "PENDING" || s === "PREPARING")
        ? "PREPARING"
        : "READY";
  }
  const all = [...tickets.values()];
  const bySent = (a: Ticket, b: Ticket) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0);
  return {
    active: all.filter((t) => t.status !== "READY").sort(bySent),
    recent: all
      .filter((t) => t.status === "READY")
      .sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0)),
  };
}

export type StationTickets = Awaited<ReturnType<typeof stationTickets>>;

async function loadTicket(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { table: true, session: true },
  });
  if (!order) throw notFound("Order not found");
  return order;
}

export async function startTicket(staff: StaffUser, orderId: string, station: Station) {
  if (!canWorkStation(staff, station)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    await requireOnShift(tx, staff);
    const order = await loadTicket(tx, orderId);
    if (order.status !== "ACCEPTED") throw conflict("This ticket is not active");
    const now = new Date();
    const res = await tx.orderItem.updateMany({
      where: { orderId, station, status: "PENDING" },
      data: { status: "PREPARING", startedAt: now, preparedById: staff.id },
    });
    if (res.count === 0) throw conflict("Already started");
    await logEvent(tx, staffActor(staff.id), "ITEMS_STARTED", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, station, count: res.count },
    });
    outbox.add([rooms.station(station), rooms.managers], "kds", { station });
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
  });
  outbox.flush();
}

export async function readyTicket(staff: StaffUser, orderId: string, station: Station) {
  if (!canWorkStation(staff, station)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    await requireOnShift(tx, staff);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { table: true, session: true, items: { where: { station, status: { in: ["PENDING", "PREPARING"] } } } },
    });
    if (!order) throw notFound("Order not found");
    if (order.status !== "ACCEPTED") throw conflict("This ticket is not active");
    if (order.items.length === 0) throw conflict("Already marked ready");
    const now = new Date();
    const sentAt = order.paidAt ?? order.acceptedAt;
    // Items bumped straight from PENDING are credited to whoever bumps them.
    await tx.orderItem.updateMany({
      where: { orderId, station, status: "PENDING" },
      data: { status: "READY", readyAt: now, startedAt: now, preparedById: staff.id },
    });
    await tx.orderItem.updateMany({
      where: { orderId, station, status: "PREPARING" },
      data: { status: "READY", readyAt: now },
    });
    await logEvent(tx, staffActor(staff.id), "ITEMS_READY", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: {
        seq: order.seq,
        station,
        count: order.items.length,
        prepSeconds: sentAt ? Math.round(secondsBetween(sentAt, now)) : null,
      },
    });
    const updated = await syncOrderStatus(tx, orderId, staffActor(staff.id));
    const waiterId = order.session.waiterId ?? order.waiterId;
    const what = order.items.map((i) => `${i.qty}× ${i.name}`).join(", ");
    if (waiterId) {
      outbox.ping([rooms.staff(waiterId)], [waiterId], {
        kind: "ready",
        title: `${order.table.label} ready to serve`,
        body: `${station === "BAR" ? "Bar" : "Kitchen"}: ${what}`,
        url: "/staff?tab=tables",
      });
      outbox.add([rooms.staff(waiterId)], "tables", {});
    }
    outbox.add([rooms.station(station), rooms.managers], "kds", { station });
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
    return updated;
  });
  outbox.flush();
}

/** Undo a bump made by mistake: READY items go back to PREPARING. */
export async function recallTicket(staff: StaffUser, orderId: string, station: Station) {
  if (!canWorkStation(staff, station)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    await requireOnShift(tx, staff);
    const order = await loadTicket(tx, orderId);
    const res = await tx.orderItem.updateMany({
      where: { orderId, station, status: "READY" },
      data: { status: "PREPARING", readyAt: null },
    });
    if (res.count === 0) throw conflict("Nothing to recall");
    if (order.status === "READY") {
      await tx.order.update({ where: { id: orderId }, data: { status: "ACCEPTED", readyAt: null } });
    }
    await logEvent(tx, staffActor(staff.id), "ITEMS_RECALLED", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, station, count: res.count },
    });
    outbox.add([rooms.station(station), rooms.managers], "kds", { station });
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    if (order.session.waiterId) outbox.add([rooms.staff(order.session.waiterId)], "tables", {});
  });
  outbox.flush();
}

/** Sold out / back in stock. Guests' menus update instantly. */
export async function setItemAvailability(staff: StaffUser, menuItemId: string, isAvailable: boolean) {
  if (!isManager(staff) && staff.role !== "KITCHEN") throw forbidden();
  const outbox = new Outbox();
  const item = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({ where: { id: menuItemId } });
    if (!item) throw notFound("Menu item not found");
    if (item.isAvailable === isAvailable) return item;
    const updated = await tx.menuItem.update({ where: { id: menuItemId }, data: { isAvailable } });
    await logEvent(tx, staffActor(staff.id), "MENU_ITEM_AVAILABILITY", { type: "MenuItem", id: menuItemId }, {
      data: { name: item.name, isAvailable },
    });
    outbox.add([rooms.everyone], "menu", {});
    if (!isAvailable) {
      // Warn the waiters whose tables have this item waiting.
      const affected = await tx.orderItem.findMany({
        where: { menuItemId, status: "PENDING", order: { status: { in: ["PLACED", "AWAITING_PAYMENT", "ACCEPTED"] } } },
        include: { order: { include: { table: true, session: true } } },
      });
      const byWaiter = new Map<string, string[]>();
      for (const a of affected) {
        const w = a.order.session.waiterId ?? "managers";
        byWaiter.set(w, [...(byWaiter.get(w) ?? []), `${a.order.table.label} (#${a.order.seq})`]);
      }
      for (const [w, tables] of byWaiter) {
        const ping = {
          kind: "alert" as const,
          title: `${item.name} is sold out`,
          body: `Waiting on: ${tables.join(", ")}. Let the guests choose something else.`,
        };
        if (w === "managers") outbox.ping([rooms.managers], [], ping);
        else outbox.ping([rooms.staff(w), rooms.managers], [w], ping);
      }
    }
    return updated;
  });
  outbox.flush();
  return item;
}
