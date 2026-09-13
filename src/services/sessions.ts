import type { StaffUser } from "@/lib/auth";
import { CUSTOMER, logEvent, SYSTEM, staffActor, type Actor } from "@/lib/audit";
import { computeBill, orderTotals } from "@/lib/bill";
import { prisma, type Tx } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { choicesLabel, parseChosen } from "@/lib/options";
import { getSettings } from "@/lib/settings";
import { isManager, isUniqueViolation, kitchenMinutes, loadBill, openShift, sessionRooms, tableMoney } from "./common";

async function createSession(tx: Tx, tableId: string, actor: Actor) {
  const settings = await getSettings(tx);
  const session = await tx.tableSession.create({
    data: {
      tableId,
      activeTableId: tableId,
      vatBps: settings.vatBps,
      serviceChargeBps: settings.serviceChargeBps,
    },
  });
  await logEvent(tx, actor, "SESSION_OPENED", { type: "TableSession", id: session.id }, { tableId, sessionId: session.id });
  return session;
}

/**
 * Find the table's live session or start a new one. The unique `activeTableId`
 * column means two phones scanning at once still end up in the same session.
 */
export async function openOrJoinSession(table: { id: string }, actor: Actor = CUSTOMER) {
  const existing = await prisma.tableSession.findUnique({ where: { activeTableId: table.id } });
  if (existing) return { session: existing, created: false };
  try {
    const session = await prisma.$transaction((tx) => createSession(tx, table.id, actor));
    new Outbox().add([rooms.managers], "floor", {}).flush();
    return { session, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const session = await prisma.tableSession.findUnique({ where: { activeTableId: table.id } });
    if (!session) throw err;
    return { session, created: false };
  }
}

export async function joinByQrToken(qrToken: string) {
  const table = await prisma.table.findUnique({ where: { qrToken } });
  if (!table || !table.active) throw notFound("This QR code is not valid any more. Please ask a waiter for help.");
  const { session } = await openOrJoinSession(table);
  return { session, table };
}

/** Everything the guest page shows. */
export async function getGuestView(sessionId: string) {
  const [session, settings] = await Promise.all([
    prisma.tableSession.findUnique({
      where: { id: sessionId },
      include: {
        table: { select: { id: true, label: true, area: true } },
        waiter: { select: { id: true, name: true, photoId: true } },
        orders: {
          orderBy: { placedAt: "asc" },
          include: { items: { orderBy: { name: "asc" } }, waiter: { select: { name: true } } },
        },
        requests: { where: { status: { not: "DONE" } }, orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
        rating: { select: { id: true } },
      },
    }),
    getSettings(),
  ]);
  if (!session) throw notFound("Table visit not found");
  const liveOrders = session.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
  const bill = computeBill({ orders: liveOrders, vatBps: session.vatBps, serviceChargeBps: session.serviceChargeBps, payments: session.payments });
  const { dueByOrder } = tableMoney(session);
  return {
    session: {
      id: session.id,
      status: session.status,
      openedAt: session.openedAt,
      vatBps: session.vatBps,
      serviceChargeBps: session.serviceChargeBps,
      rated: Boolean(session.rating),
    },
    table: session.table,
    waiter: session.waiter,
    orders: session.orders.map((o) => ({
      id: o.id,
      seq: o.seq,
      status: o.status,
      placedAt: o.placedAt,
      acceptedAt: o.acceptedAt,
      paidAt: o.paidAt,
      readyAt: o.readyAt,
      servedAt: o.servedAt,
      cancelReason: o.cancelReason,
      note: o.note,
      waiterName: o.waiter?.name ?? null,
      /** What this order costs, service charge and VAT included — collected before it goes to the kitchen. */
      totalKobo: orderTotals(o.items, session.vatBps, session.serviceChargeBps).total,
      /** Still to pay the waiter for it (less anything already paid at the table). */
      dueKobo: dueByOrder.get(o.id) ?? 0,
      estimateMinutes: kitchenMinutes(o.items),
      items: o.items.map((i) => ({
        id: i.id,
        name: i.name,
        qty: i.qty,
        note: i.note,
        options: choicesLabel(parseChosen(i.options)),
        unitPriceKobo: i.unitPriceKobo,
        status: i.status,
      })),
    })),
    requests: session.requests.map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.createdAt })),
    payments: session.payments.map((p) => ({ id: p.id, amountKobo: p.amountKobo, method: p.method, createdAt: p.createdAt })),
    bill,
    restaurant: {
      name: settings.restaurantName,
      tagline: settings.tagline,
      phone: settings.phone,
      address: settings.address,
      instagram: settings.instagram,
      logoId: settings.logoId,
      bankName: settings.bankName,
      bankAccountName: settings.bankAccountName,
      bankAccountNumber: settings.bankAccountNumber,
    },
  };
}

export type GuestView = Awaited<ReturnType<typeof getGuestView>>;

export async function closeSession(staff: StaffUser, sessionId: string, opts: { reason?: string } = {}) {
  const outbox = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const { session, bill } = await loadBill(tx, sessionId);
    if (session.status === "CLOSED") throw conflict("This table is already cleared");
    const manager = isManager(staff);
    const hasOrders = session.orders.length > 0;
    if (!manager) {
      if (session.waiterId && session.waiterId !== staff.id) throw forbidden("This is not your table");
      if (!(await openShift(tx, staff.id))) throw conflict("Clock in first");
    }
    const unfinished = session.orders.some((o) => o.status === "PLACED" || o.status === "AWAITING_PAYMENT" || o.status === "ACCEPTED" || o.status === "READY");
    const forced = bill.balance > 0 || unfinished;
    if (forced) {
      if (!manager) {
        throw conflict(
          bill.balance > 0
            ? "The bill has not been fully paid yet. Ask a manager if the guests have left."
            : "Some orders are still in progress. Serve or cancel them first.",
        );
      }
      if (!opts.reason) throw conflict("Give a reason for closing an unpaid or unfinished table");
    }
    const now = new Date();
    await tx.tableSession.update({
      where: { id: sessionId },
      data: {
        status: "CLOSED",
        activeTableId: null,
        closedAt: now,
        closedById: staff.id,
        paidAt: session.paidAt ?? (bill.total > 0 && bill.balance <= 0 ? now : null),
      },
    });
    await tx.serviceRequest.updateMany({
      where: { sessionId, status: { not: "DONE" } },
      data: { status: "DONE", resolvedAt: now, resolvedById: staff.id },
    });
    await logEvent(tx, staffActor(staff.id), "SESSION_CLOSED", { type: "TableSession", id: sessionId }, {
      tableId: session.tableId,
      sessionId,
      data: { totalKobo: bill.total, balanceKobo: bill.balance, forced, reason: opts.reason ?? null, hadOrders: hasOrders },
    });
    outbox.add(sessionRooms(session), "session", { sessionId });
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add([rooms.managers], "floor", {});
    return { ok: true };
  });
  outbox.flush();
  return result;
}

/** Hand a table to another on-shift waiter (e.g. before clocking out). */
export async function transferSession(staff: StaffUser, sessionId: string, toStaffId: string) {
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { table: true } });
    if (!session || session.status === "CLOSED") throw notFound("Open table not found");
    if (!isManager(staff) && session.waiterId !== staff.id) throw forbidden("Only the table's waiter or a manager can hand it over");
    if (session.waiterId === toStaffId) throw conflict("That waiter already has this table");
    const target = await tx.staff.findUnique({ where: { id: toStaffId } });
    if (!target || !target.active || target.role !== "WAITER") throw notFound("Waiter not found");
    if (!(await openShift(tx, target.id))) throw conflict(`${target.name} is not clocked in`);
    await tx.tableSession.update({ where: { id: sessionId }, data: { waiterId: target.id } });
    await logEvent(tx, staffActor(staff.id), "SESSION_TRANSFERRED", { type: "TableSession", id: sessionId }, {
      tableId: session.tableId,
      sessionId,
      data: { fromStaffId: session.waiterId, toStaffId: target.id },
    });
    outbox.add(sessionRooms(session), "session", { sessionId });
    outbox.add([rooms.staff(target.id), rooms.managers], "tables", {});
    if (session.waiterId) outbox.add([rooms.staff(session.waiterId)], "tables", {});
    outbox.add([rooms.managers], "floor", {});
    outbox.ping([rooms.staff(target.id)], [target.id], {
      kind: "info",
      title: `${session.table.label} is now yours`,
      body: `${staff.name} handed table ${session.table.label} to you`,
      url: "/staff?tab=tables",
    });
  });
  outbox.flush();
}

/** Guests who scanned but never ordered: close their empty visits after a few hours. */
export async function closeAbandonedSessions(olderThanHours = 3) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const stale = await prisma.tableSession.findMany({
    where: { status: "OPEN", openedAt: { lt: cutoff }, orders: { none: {} } },
    select: { id: true, tableId: true },
  });
  for (const s of stale) {
    await prisma.$transaction(async (tx) => {
      const res = await tx.tableSession.updateMany({
        where: { id: s.id, status: "OPEN" },
        data: { status: "CLOSED", activeTableId: null, closedAt: new Date() },
      });
      if (res.count === 0) return;
      await tx.serviceRequest.updateMany({ where: { sessionId: s.id, status: { not: "DONE" } }, data: { status: "DONE", resolvedAt: new Date() } });
      await logEvent(tx, SYSTEM, "SESSION_CLOSED", { type: "TableSession", id: s.id }, {
        tableId: s.tableId,
        sessionId: s.id,
        data: { reason: "No orders — closed automatically" },
      });
    });
  }
  if (stale.length) new Outbox().add([rooms.managers], "floor", {}).flush();
  return stale.length;
}
