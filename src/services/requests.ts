import type { PaymentMethod, RequestType } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { CUSTOMER, logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { conflict, forbidden, notFound, tooMany } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { secondsBetween } from "@/lib/time";
import { isManager, requireOnShift, sessionRooms } from "./common";

export const REQUEST_LABELS: Record<RequestType, string> = {
  CALL_WAITER: "Waiter called",
  BILL: "Bill requested",
  WATER: "Water requested",
  CUTLERY: "Cutlery / napkins",
  OTHER: "Request",
};

const REQUEST_COOLDOWN_SEC = 10;

/**
 * Guest taps Call waiter / Bill / Water… Repeated taps don't create duplicates.
 * Only once the table has ordered — except calling a waiter to take the order
 * while phone ordering is paused.
 */
export async function createRequest(
  sessionId: string,
  input: { type: RequestType; note?: string; preferredMethod?: PaymentMethod },
) {
  const outbox = new Outbox();
  const request = await prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { table: true } });
    if (!session || session.status === "CLOSED") throw conflict("This visit has ended. Scan the QR code to start again.");
    if ((await tx.order.count({ where: { sessionId } })) === 0) {
      const waiterTakesOrder = input.type === "CALL_WAITER" && !(await getSettings(tx)).orderingEnabled;
      if (!waiterTakesOrder) throw conflict("Place your order first — then you can call your waiter from here.");
    }

    const open = await tx.serviceRequest.findFirst({
      where: { sessionId, type: input.type, status: { not: "DONE" } },
    });
    if (open) {
      if (input.preferredMethod && input.preferredMethod !== open.preferredMethod) {
        return tx.serviceRequest.update({ where: { id: open.id }, data: { preferredMethod: input.preferredMethod } });
      }
      return open;
    }
    const last = await tx.serviceRequest.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    if (last && secondsBetween(last.createdAt, new Date()) < REQUEST_COOLDOWN_SEC) {
      throw tooMany("Your waiter has been notified — please give them a moment.");
    }

    const created = await tx.serviceRequest.create({
      data: {
        sessionId,
        tableId: session.tableId,
        type: input.type,
        note: input.note ?? null,
        preferredMethod: input.type === "BILL" ? (input.preferredMethod ?? null) : null,
      },
    });
    if (input.type === "BILL" && session.status === "OPEN") {
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: "BILL_REQUESTED", billRequestedAt: new Date() } });
    }
    await logEvent(tx, CUSTOMER, "REQUEST_CREATED", { type: "ServiceRequest", id: created.id }, {
      tableId: session.tableId,
      sessionId,
      data: { type: input.type, note: input.note ?? null, preferredMethod: input.preferredMethod ?? null },
    });

    const methodText = input.preferredMethod ? ` · pays by ${input.preferredMethod.toLowerCase()}` : "";
    const ping = {
      kind: "request" as const,
      title: `${session.table.label} · ${REQUEST_LABELS[input.type]}`,
      body: (input.note ?? "Tap to respond") + methodText,
      url: "/staff?tab=requests",
    };
    if (session.waiterId) outbox.ping([rooms.staff(session.waiterId)], [session.waiterId], ping);
    else outbox.ping([rooms.waiters], "waiters-on-shift", ping);
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add(sessionRooms(session), "session", { sessionId });
    outbox.add([rooms.managers], "floor", {});
    return created;
  });
  outbox.flush();
  return request;
}

async function changeRequest(staff: StaffUser, requestId: string, to: "ACKNOWLEDGED" | "DONE") {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    if (staff.role === "WAITER") await requireOnShift(tx, staff);
    const req = await tx.serviceRequest.findUnique({ where: { id: requestId }, include: { session: true } });
    if (!req) throw notFound("Request not found");
    const owner = req.session.waiterId;
    if (!isManager(staff) && owner && owner !== staff.id && !req.escalatedAt) throw forbidden("This is another waiter's table");
    if (req.status === "DONE" || (to === "ACKNOWLEDGED" && req.status !== "OPEN")) {
      throw conflict(req.status === "DONE" ? "Already handled" : "Someone is already on it");
    }
    const now = new Date();
    const ackNow = req.status === "OPEN";
    const res = await tx.serviceRequest.updateMany({
      where: { id: requestId, status: req.status },
      data: {
        status: to,
        ...(ackNow ? { acknowledgedAt: now, acknowledgedById: staff.id } : {}),
        ...(to === "DONE" ? { resolvedAt: now, resolvedById: staff.id } : {}),
      },
    });
    if (res.count === 0) throw conflict("Someone else just responded to this");
    // The first waiter to answer an unowned table takes it on.
    if (!owner && staff.role === "WAITER") {
      await tx.tableSession.updateMany({ where: { id: req.sessionId, waiterId: null }, data: { waiterId: staff.id } });
    }
    const ctx = { tableId: req.tableId, sessionId: req.sessionId };
    if (ackNow) {
      await logEvent(tx, staffActor(staff.id), "REQUEST_ACKNOWLEDGED", { type: "ServiceRequest", id: requestId }, {
        ...ctx,
        data: { type: req.type, responseSeconds: Math.round(secondsBetween(req.createdAt, now)) },
      });
    }
    if (to === "DONE") {
      await logEvent(tx, staffActor(staff.id), "REQUEST_RESOLVED", { type: "ServiceRequest", id: requestId }, {
        ...ctx,
        data: { type: req.type },
      });
    }
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add(sessionRooms({ id: req.sessionId, waiterId: owner ?? staff.id }), "session", { sessionId: req.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

export const acknowledgeRequest = (staff: StaffUser, id: string) => changeRequest(staff, id, "ACKNOWLEDGED");
export const resolveRequest = (staff: StaffUser, id: string) => changeRequest(staff, id, "DONE");

/** Open requests this waiter should see: their tables, unowned tables, escalated ones. */
export async function waiterRequests(staff: StaffUser) {
  const reqs = await prisma.serviceRequest.findMany({
    where: {
      status: { not: "DONE" },
      ...(isManager(staff)
        ? {}
        : { OR: [{ session: { waiterId: staff.id } }, { session: { waiterId: null } }, { escalatedAt: { not: null } }] }),
    },
    include: {
      table: { select: { label: true, area: true } },
      session: { select: { waiterId: true, waiter: { select: { name: true } } } },
      acknowledgedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return reqs.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    note: r.note,
    preferredMethod: r.preferredMethod,
    createdAt: r.createdAt,
    escalatedAt: r.escalatedAt,
    table: r.table,
    sessionId: r.sessionId,
    mine: r.session.waiterId === staff.id,
    ownerName: r.session.waiter?.name ?? null,
    acknowledgedBy: r.acknowledgedBy?.name ?? null,
  }));
}

export type WaiterRequest = Awaited<ReturnType<typeof waiterRequests>>[number];
