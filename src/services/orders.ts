import type { ItemStatus, OrderStatus, PaymentMethod, Station } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { CUSTOMER, logEvent, staffActor, type Actor } from "@/lib/audit";
import { billExtras, computeBill, orderTotals } from "@/lib/bill";
import { prisma, type Tx } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound, tooMany } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { Outbox, rooms } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { isWithinOpeningHours, secondsBetween } from "@/lib/time";
import { choicesLabel, ChoiceError, parseChosen, parseOptionGroups, resolveChoices } from "@/lib/options";
import type { PlaceOrderInput } from "@/lib/validators";
import { isManager, kitchenMinutes, requireOnShift, sessionRooms, tableMoney } from "./common";
import { openOrJoinSession } from "./sessions";

const GUEST_ORDER_COOLDOWN_SEC = 20;
const GUEST_MAX_WAITING_ORDERS = 3;

const summarize = (items: { name: string; qty: number }[]) =>
  items.map((i) => `${i.qty}× ${i.name}`).join(", ");

const stationsOf = (items: { station: Station; status?: ItemStatus }[]) =>
  [...new Set(items.filter((i) => i.status !== "VOIDED").map((i) => i.station))];

async function buildLines(tx: Tx, input: PlaceOrderInput) {
  const ids = [...new Set(input.items.map((i) => i.menuItemId))];
  const menuItems = await tx.menuItem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  return input.items.map((line) => {
    const m = byId.get(line.menuItemId);
    if (!m || !m.active) throw badRequest("One of the items is no longer on the menu. Please refresh.");
    if (!m.isAvailable) throw conflict(`Sorry, ${m.name} just sold out. Please remove it and try again.`);
    let picked;
    try {
      picked = resolveChoices(m.name, parseOptionGroups(m.optionGroups), line.choices ?? []);
    } catch (err) {
      if (err instanceof ChoiceError) throw badRequest(err.message);
      throw err;
    }
    return {
      menuItemId: m.id,
      name: m.name,
      unitPriceKobo: m.priceKobo + picked.extraKobo,
      qty: line.qty,
      note: line.note ?? null,
      ...(picked.options.length ? { options: picked.options } : {}),
      station: m.station,
      prepMinutes: m.prepMinutes,
    };
  });
}

/** Order placed by a guest from their phone. Lands in the waiter queue as PLACED. */
export async function placeGuestOrder(sessionId: string, input: PlaceOrderInput) {
  const outbox = new Outbox();
  const order = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);
    if (!settings.orderingEnabled) throw conflict("Ordering from the table is paused right now. Please call a waiter.");
    if (!isWithinOpeningHours(new Date(), settings.openingTime, settings.closingTime)) {
      throw conflict(`The kitchen is closed. Ordering is open ${settings.openingTime}–${settings.closingTime}.`);
    }
    const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { table: true } });
    if (!session || session.status === "CLOSED") {
      throw conflict("This visit has ended. Scan the QR code on your table to order again.");
    }
    const recent = await tx.order.findFirst({
      where: { sessionId, placedByStaffId: null },
      orderBy: { placedAt: "desc" },
    });
    if (recent && secondsBetween(recent.placedAt, new Date()) < GUEST_ORDER_COOLDOWN_SEC) {
      throw tooMany("Your last order was just sent. Please wait a few seconds before sending another.");
    }
    const waiting = await tx.order.count({ where: { sessionId, status: "PLACED" } });
    if (waiting >= GUEST_MAX_WAITING_ORDERS) {
      throw tooMany("You already have orders waiting for a waiter. Please wait for them to be accepted.");
    }
    const lines = await buildLines(tx, input);
    const created = await tx.order.create({
      data: {
        sessionId,
        tableId: session.tableId,
        note: input.note ?? null,
        items: { create: lines },
      },
      include: { items: true },
    });
    if (session.status !== "OPEN") {
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: "OPEN" } });
    }
    const totalKobo = lines.reduce((s, l) => s + l.unitPriceKobo * l.qty, 0);
    await logEvent(tx, CUSTOMER, "ORDER_PLACED", { type: "Order", id: created.id }, {
      tableId: session.tableId,
      sessionId,
      data: { seq: created.seq, items: lines.length, totalKobo },
    });

    const label = session.table.label;
    const ping = {
      kind: "order" as const,
      title: `New order · ${label}`,
      body: `${summarize(lines)} (${formatNaira(totalKobo)})`,
      url: "/staff?tab=queue",
    };
    if (session.waiterId) {
      outbox.ping([rooms.staff(session.waiterId)], [session.waiterId], ping);
      outbox.add([rooms.staff(session.waiterId), rooms.managers], "queue", {});
    } else {
      outbox.ping([rooms.waiters], "waiters-on-shift", ping);
      outbox.add([rooms.waiters, rooms.managers], "queue", {});
    }
    outbox.add(sessionRooms(session), "session", { sessionId });
    outbox.add([rooms.managers], "floor", {});
    return created;
  });
  outbox.flush();
  return order;
}

/**
 * Order keyed in by staff for guests without a smartphone. A waiter's order is
 * accepted by them immediately; it goes to the kitchen/bar once they take payment.
 */
export async function placeStaffOrder(
  staff: StaffUser,
  target: { sessionId?: string; tableId?: string },
  input: PlaceOrderInput,
) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  let sessionId = target.sessionId;
  if (!sessionId) {
    if (!target.tableId) throw badRequest("Choose a table");
    const table = await prisma.table.findUnique({ where: { id: target.tableId } });
    if (!table || !table.active) throw notFound("Table not found");
    sessionId = (await openOrJoinSession(table, staffActor(staff.id))).session.id;
  }
  const outbox = new Outbox();
  const order = await prisma.$transaction(async (tx) => {
    if (staff.role === "WAITER") await requireOnShift(tx, staff);
    const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { table: true } });
    if (!session || session.status === "CLOSED") throw conflict("This table visit has ended");
    if (!isManager(staff) && session.waiterId && session.waiterId !== staff.id) {
      throw forbidden(`${session.table.label} belongs to another waiter`);
    }
    const lines = await buildLines(tx, input);
    const waiterId = staff.role === "WAITER" ? staff.id : session.waiterId;
    const now = new Date();
    const created = await tx.order.create({
      data: {
        sessionId: session.id,
        tableId: session.tableId,
        note: input.note ?? null,
        placedByStaffId: staff.id,
        ...(waiterId ? { status: "AWAITING_PAYMENT" as OrderStatus, waiterId, acceptedAt: now } : {}),
        items: { create: lines },
      },
      include: { items: true },
    });
    if (waiterId && !session.waiterId) {
      await tx.tableSession.update({ where: { id: session.id }, data: { waiterId } });
    }
    if (session.status !== "OPEN") {
      await tx.tableSession.update({ where: { id: session.id }, data: { status: "OPEN" } });
    }
    const totalKobo = lines.reduce((s, l) => s + l.unitPriceKobo * l.qty, 0);
    const ctx = { tableId: session.tableId, sessionId: session.id };
    await logEvent(tx, staffActor(staff.id), "ORDER_PLACED", { type: "Order", id: created.id }, {
      ...ctx,
      data: { seq: created.seq, items: lines.length, totalKobo, staffEntered: true },
    });
    if (waiterId) {
      await logEvent(tx, staffActor(staff.id), "ORDER_CLAIMED", { type: "Order", id: created.id }, {
        ...ctx,
        data: { seq: created.seq, staffEntered: true, waiterId },
      });
      outbox.add([rooms.staff(waiterId)], "tables", {});
    } else {
      outbox.add([rooms.waiters, rooms.managers], "queue", {});
      outbox.ping([rooms.waiters], "waiters-on-shift", {
        kind: "order",
        title: `New order · ${session.table.label}`,
        body: summarize(lines),
        url: "/staff?tab=queue",
      });
    }
    outbox.add(sessionRooms({ id: session.id, waiterId: waiterId ?? null }), "session", { sessionId: session.id });
    outbox.add([rooms.managers], "floor", {});
    return created;
  });
  outbox.flush();
  return order;
}

/**
 * Accept an order from the queue; the waiter then goes to take payment (payOrder),
 * which sends it to the kitchen. The conditional update makes this safe when
 * several waiters tap Accept at the same moment: exactly one wins.
 * A manager may pass `asWaiterId` to assign the order to a waiter.
 */
export async function claimOrder(staff: StaffUser, orderId: string, opts: { asWaiterId?: string } = {}) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    let waiter = { id: staff.id, name: staff.name };
    if (opts.asWaiterId && isManager(staff)) {
      const w = await tx.staff.findUnique({ where: { id: opts.asWaiterId } });
      if (!w || !w.active || w.role !== "WAITER") throw notFound("Waiter not found");
      const onShift = await tx.shift.findFirst({ where: { staffId: w.id, clockOutAt: null } });
      if (!onShift) throw conflict(`${w.name} is not clocked in`);
      waiter = { id: w.id, name: w.name };
    } else if (staff.role === "WAITER") {
      await requireOnShift(tx, staff);
    } else {
      throw badRequest("Choose a waiter to assign this order to");
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { session: { include: { waiter: { select: { id: true, name: true } } } }, table: true, items: true },
    });
    if (!order) throw notFound("Order not found");
    if (order.status !== "PLACED") {
      const taken = order.waiterId
        ? await tx.staff.findUnique({ where: { id: order.waiterId }, select: { name: true } })
        : null;
      throw conflict(taken ? `Already taken by ${taken.name}` : "This order is no longer waiting");
    }
    const owner = order.session.waiter;
    if (owner && owner.id !== waiter.id && !order.escalatedAt && !isManager(staff)) {
      throw forbidden(`${order.table.label} is ${owner.name}'s table`);
    }

    const now = new Date();
    const res = await tx.order.updateMany({
      where: { id: orderId, status: "PLACED" },
      data: { status: "AWAITING_PAYMENT", waiterId: waiter.id, acceptedAt: now },
    });
    if (res.count === 0) {
      const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { waiter: { select: { name: true } } } });
      throw conflict(fresh?.waiter ? `Already taken by ${fresh.waiter.name}` : "This order is no longer waiting");
    }
    await tx.tableSession.updateMany({ where: { id: order.sessionId, waiterId: null }, data: { waiterId: waiter.id } });
    const sessionOwner = owner?.id ?? waiter.id;

    await logEvent(tx, staffActor(staff.id), "ORDER_CLAIMED", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: {
        seq: order.seq,
        waiterId: waiter.id,
        claimSeconds: Math.round(secondsBetween(order.placedAt, now)),
        assignedBy: waiter.id !== staff.id ? staff.id : null,
        escalated: Boolean(order.escalatedAt),
      },
    });

    outbox.add([rooms.waiters, rooms.managers], "queue", {});
    outbox.add([rooms.staff(waiter.id), rooms.staff(sessionOwner)], "tables", {});
    outbox.add(sessionRooms({ id: order.sessionId, waiterId: sessionOwner }), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
    if (waiter.id !== staff.id) {
      outbox.ping([rooms.staff(waiter.id)], [waiter.id], {
        kind: "order",
        title: `Assigned to you · ${order.table.label}`,
        body: `${staff.name} assigned order #${order.seq} to you`,
        url: "/staff?tab=tables",
      });
    }
    return { orderId, waiterId: waiter.id, waiterName: waiter.name };
  });
  outbox.flush();
  return result;
}

/**
 * The waiter takes payment for an accepted order at the table — only then does
 * it go to the kitchen/bar. Money already taken at the table is used first.
 * Returns what was collected and the kitchen time, so the waiter can tell the guests.
 */
export async function payOrder(
  staff: StaffUser,
  orderId: string,
  input: { method: PaymentMethod; tipKobo: number; reference?: string },
) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const shift = await requireOnShift(tx, staff);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        table: true,
        session: { include: { orders: { orderBy: { placedAt: "asc" }, include: { items: true } }, payments: true } },
      },
    });
    if (!order) throw notFound("Order not found");
    if (order.status !== "AWAITING_PAYMENT") {
      throw conflict(order.paidAt ? "This order is already paid" : order.status === "PLACED" ? "Accept this order first" : "This order can't be paid now");
    }
    if (!isManager(staff) && order.waiterId !== staff.id && order.session.waiterId !== staff.id) {
      throw forbidden("This is another waiter's table");
    }
    const { total } = orderTotals(order.items, order.session.vatBps, order.session.serviceChargeBps);
    const collect = tableMoney(order.session).dueByOrder.get(orderId) ?? total;
    const now = new Date();
    const res = await tx.order.updateMany({ where: { id: orderId, status: "AWAITING_PAYMENT" }, data: { status: "ACCEPTED", paidAt: now } });
    if (res.count === 0) throw conflict("Someone else just took payment for this order");
    const ctx = { tableId: order.tableId, sessionId: order.sessionId };
    if (collect > 0) {
      const payment = await tx.payment.create({
        data: {
          sessionId: order.sessionId,
          orderId,
          amountKobo: collect,
          tipKobo: input.tipKobo,
          method: input.method,
          reference: input.reference ?? null,
          collectedById: staff.id,
          shiftId: shift?.id ?? null,
        },
      });
      await logEvent(tx, staffActor(staff.id), "PAYMENT_RECORDED", { type: "Payment", id: payment.id }, {
        ...ctx,
        data: { seq: order.seq, amountKobo: collect, tipKobo: input.tipKobo, method: input.method, reference: input.reference ?? null },
      });
    }
    const estimateMinutes = kitchenMinutes(order.items);
    await logEvent(tx, staffActor(staff.id), "ORDER_SENT_TO_KITCHEN", { type: "Order", id: orderId }, {
      ...ctx,
      data: {
        seq: order.seq,
        estimateMinutes,
        paySeconds: order.acceptedAt ? Math.round(secondsBetween(order.acceptedAt, now)) : null,
        ...(collect < total ? { alreadyPaidKobo: total - collect } : {}),
      },
    });

    const live = order.items.filter((i) => i.status !== "VOIDED");
    for (const st of stationsOf(live)) {
      outbox.add([rooms.station(st), rooms.managers], "kds", { station: st });
      outbox.ping([rooms.station(st)], [], {
        kind: "order",
        title: `${order.table.label} · #${order.seq}`,
        body: summarize(live.filter((i) => i.station === st)),
      });
    }
    const owner = order.session.waiterId ?? order.waiterId;
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add(sessionRooms({ id: order.sessionId, waiterId: owner }), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
    return { amountKobo: collect, estimateMinutes };
  });
  outbox.flush();
  return result;
}

/**
 * The waiter marks a paid order ready themselves (the kitchen isn't using its
 * screen, or called it out at the pass). The guest's phone moves on to Ready,
 * and the Served button appears.
 */
export async function markOrderReady(staff: StaffUser, orderId: string) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    if (staff.role === "WAITER") await requireOnShift(tx, staff);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { session: true, items: true } });
    if (!order) throw notFound("Order not found");
    if (!isManager(staff) && order.session.waiterId !== staff.id && order.waiterId !== staff.id) {
      throw forbidden("This is another waiter's table");
    }
    if (order.status === "AWAITING_PAYMENT") throw conflict("Take payment first — then it goes to the kitchen");
    if (order.status !== "ACCEPTED") throw conflict("This order can't be marked ready now");
    const cooking = order.items.filter((i) => i.status === "PENDING" || i.status === "PREPARING");
    if (cooking.length === 0) throw conflict("Already marked ready");
    const now = new Date();
    // Not credited to a cook: kitchen stats only count what the kitchen bumped.
    await tx.orderItem.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "READY", startedAt: now, readyAt: now } });
    await tx.orderItem.updateMany({ where: { orderId, status: "PREPARING" }, data: { status: "READY", readyAt: now } });
    const sentAt = order.paidAt ?? order.acceptedAt;
    await logEvent(tx, staffActor(staff.id), "ITEMS_READY", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, byWaiter: true, count: cooking.length, prepSeconds: sentAt ? Math.round(secondsBetween(sentAt, now)) : null },
    });
    await syncOrderStatus(tx, orderId, staffActor(staff.id));
    for (const st of stationsOf(cooking)) outbox.add([rooms.station(st), rooms.managers], "kds", { station: st });
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

export async function rejectOrder(staff: StaffUser, orderId: string, reason: string) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    if (staff.role === "WAITER") await requireOnShift(tx, staff);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { session: true, table: true } });
    if (!order) throw notFound("Order not found");
    const owner = order.session.waiterId;
    if (!isManager(staff) && owner && owner !== staff.id && !order.escalatedAt) {
      throw forbidden("This is another waiter's table");
    }
    const now = new Date();
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PLACED", "AWAITING_PAYMENT"] } },
      data: { status: "REJECTED", cancelledById: staff.id, cancelledAt: now, cancelReason: reason },
    });
    if (res.count === 0) throw conflict("Only orders that haven't been paid can be declined");
    await tx.orderItem.updateMany({
      where: { orderId },
      data: { status: "VOIDED", voidedById: staff.id, voidedAt: now, voidReason: "REJECTED" },
    });
    await logEvent(tx, staffActor(staff.id), "ORDER_REJECTED", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, reason },
    });
    outbox.add([rooms.waiters, rooms.managers], "queue", {});
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

/** Recompute an order's status from its items after items change (once it's in the kitchen). */
async function syncOrderStatus(tx: Tx, orderId: string, actor: Actor) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.status === "REJECTED" || order.status === "CANCELLED" || order.status === "PLACED" || order.status === "AWAITING_PAYMENT") {
    return order;
  }
  const live = order.items.filter((i) => i.status !== "VOIDED");
  const now = new Date();
  let next: OrderStatus = "ACCEPTED";
  if (live.length === 0) next = "CANCELLED";
  else if (live.every((i) => i.status === "SERVED")) next = "SERVED";
  else if (live.every((i) => i.status === "READY" || i.status === "SERVED")) next = "READY";
  if (next === order.status) return order;
  const updated = await tx.order.update({
    where: { id: orderId },
    data: {
      status: next,
      readyAt: next === "READY" || next === "SERVED" ? (order.readyAt ?? now) : null,
      servedAt: next === "SERVED" ? (order.servedAt ?? now) : null,
      ...(next === "SERVED" && actor.type === "STAFF" ? { servedById: actor.staffId } : {}),
      ...(next === "CANCELLED" ? { cancelledAt: now, cancelReason: "All items were voided" } : {}),
    },
    include: { items: true },
  });
  const ctx = { tableId: order.tableId, sessionId: order.sessionId };
  if (next === "READY") {
    const sentAt = order.paidAt ?? order.acceptedAt;
    await logEvent(tx, actor, "ORDER_READY", { type: "Order", id: orderId }, {
      ...ctx,
      data: { seq: order.seq, prepSeconds: sentAt ? Math.round(secondsBetween(sentAt, now)) : null },
    });
  } else if (next === "SERVED") {
    const readyAt = updated.readyAt ?? now;
    await logEvent(tx, actor, "ORDER_SERVED", { type: "Order", id: orderId }, {
      ...ctx,
      data: { seq: order.seq, readyToServedSeconds: Math.round(secondsBetween(readyAt, now)) },
    });
  }
  return updated;
}

export { syncOrderStatus };

/** Mark everything that is ready on this order as served. */
export async function serveOrder(staff: StaffUser, orderId: string) {
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    if (staff.role === "WAITER") await requireOnShift(tx, staff);
    else if (!isManager(staff)) throw forbidden();
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { session: true, items: true } });
    if (!order) throw notFound("Order not found");
    if (!isManager(staff) && order.session.waiterId !== staff.id && order.waiterId !== staff.id) {
      throw forbidden("This is another waiter's table");
    }
    if (order.status !== "ACCEPTED" && order.status !== "READY") throw conflict("This order can't be served now");
    const ready = order.items.filter((i) => i.status === "READY");
    if (ready.length === 0) throw conflict("Nothing on this order is ready yet");
    const now = new Date();
    await tx.orderItem.updateMany({ where: { id: { in: ready.map((i) => i.id) } }, data: { status: "SERVED", servedAt: now } });
    const updated = await syncOrderStatus(tx, orderId, staffActor(staff.id));
    if (updated?.status !== "SERVED") {
      // Partial serve (e.g. drinks before food) — still leave a trail.
      await logEvent(tx, staffActor(staff.id), "ORDER_SERVED", { type: "Order", id: orderId }, {
        tableId: order.tableId,
        sessionId: order.sessionId,
        data: { seq: order.seq, partial: true, items: ready.map((i) => `${i.qty}× ${i.name}`) },
      });
    }
    for (const st of stationsOf(ready)) outbox.add([rooms.station(st)], "kds", { station: st });
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

/**
 * Void one line. Waiters may void items on orders not yet paid (guest changed
 * their mind); managers may void or comp anything, refunding if it was paid.
 */
export async function voidItem(staff: StaffUser, itemId: string, reason: string) {
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUnique({ where: { id: itemId }, include: { order: { include: { session: true } } } });
    if (!item) throw notFound("Item not found");
    if (item.status === "VOIDED") throw conflict("Already voided");
    const order = item.order;
    if (order.status === "REJECTED" || order.status === "CANCELLED") throw conflict("This order is already closed");
    if (!isManager(staff)) {
      if (staff.role !== "WAITER") throw forbidden();
      await requireOnShift(tx, staff);
      if (order.session.waiterId !== staff.id && order.waiterId !== staff.id) throw forbidden("This is another waiter's table");
      if (order.paidAt) throw forbidden("This order is paid — ask a manager to void it and refund the guest");
      if (item.status !== "PENDING") throw forbidden("The kitchen has started this item — ask a manager to void it");
    }
    const now = new Date();
    await tx.orderItem.update({
      where: { id: itemId },
      data: { status: "VOIDED", voidedById: staff.id, voidedAt: now, voidReason: reason },
    });
    await logEvent(tx, staffActor(staff.id), "ITEM_VOIDED", { type: "OrderItem", id: itemId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, name: item.name, qty: item.qty, amountKobo: item.unitPriceKobo * item.qty, reason, wasStatus: item.status },
    });
    if (order.status === "PLACED" || order.status === "AWAITING_PAYMENT") {
      const remaining = await tx.orderItem.count({ where: { orderId: order.id, status: { not: "VOIDED" } } });
      if (remaining === 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED", cancelledAt: now, cancelledById: staff.id, cancelReason: "All items were voided" },
        });
        outbox.add([rooms.waiters, rooms.managers], "queue", {});
      }
      outbox.add([rooms.waiters, rooms.managers], "tables", {});
    } else {
      await syncOrderStatus(tx, order.id, staffActor(staff.id));
    }
    outbox.add([rooms.station(item.station)], "kds", { station: item.station });
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

/** Manager cancels a whole order (nothing on it may have been served). */
export async function cancelOrder(staff: StaffUser, orderId: string, reason: string) {
  if (!isManager(staff)) throw forbidden("Only managers can cancel orders");
  const outbox = new Outbox();
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, session: true } });
    if (!order) throw notFound("Order not found");
    if (order.status === "SERVED" || order.status === "REJECTED" || order.status === "CANCELLED") {
      throw conflict("This order is already finished");
    }
    if (order.items.some((i) => i.status === "SERVED")) {
      throw conflict("Part of this order was served — void the remaining items instead");
    }
    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: staff.id, cancelReason: reason },
    });
    await tx.orderItem.updateMany({
      where: { orderId, status: { not: "VOIDED" } },
      data: { status: "VOIDED", voidedAt: now, voidedById: staff.id, voidReason: reason },
    });
    await logEvent(tx, staffActor(staff.id), "ORDER_CANCELLED", { type: "Order", id: orderId }, {
      tableId: order.tableId,
      sessionId: order.sessionId,
      data: { seq: order.seq, reason },
    });
    for (const st of stationsOf(order.items)) outbox.add([rooms.station(st)], "kds", { station: st });
    outbox.add([rooms.waiters, rooms.managers], "queue", {});
    outbox.add(sessionRooms(order.session), "session", { sessionId: order.sessionId });
    outbox.add([rooms.managers], "floor", {});
  });
  outbox.flush();
}

// ---------- Waiter reads ----------

const orderCard = {
  table: { select: { id: true, label: true, area: true } },
  items: { orderBy: { name: "asc" as const } },
  session: {
    select: {
      id: true,
      waiterId: true,
      vatBps: true,
      serviceChargeBps: true,
      waiter: { select: { name: true } },
      orders: { orderBy: { placedAt: "asc" as const }, select: { id: true, status: true, items: true } },
      payments: { select: { orderId: true, amountKobo: true } },
    },
  },
};

/** Orders this waiter can claim: unowned tables, their own tables, or escalated orders. */
export async function waiterQueue(staff: StaffUser) {
  const orders = await prisma.order.findMany({
    where: {
      status: "PLACED",
      ...(isManager(staff)
        ? {}
        : { OR: [{ session: { waiterId: null } }, { session: { waiterId: staff.id } }, { escalatedAt: { not: null } }] }),
    },
    include: orderCard,
    orderBy: { placedAt: "asc" },
  });
  return orders.map((o) => ({
    id: o.id,
    seq: o.seq,
    placedAt: o.placedAt,
    escalatedAt: o.escalatedAt,
    note: o.note,
    table: o.table,
    sessionId: o.session.id,
    newTable: !o.session.waiterId,
    ownerName: o.session.waiter?.name ?? null,
    mine: o.session.waiterId === staff.id,
    items: o.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, note: i.note, station: i.station, options: choicesLabel(parseChosen(i.options)) })),
    totalKobo: orderTotals(o.items, o.session.vatBps, o.session.serviceChargeBps).total,
    /** What the waiter will collect (service charge and VAT included, less anything already paid at the table). */
    dueKobo: tableMoney(o.session).dueByOrder.get(o.id) ?? 0,
    /** "VAT and service charge" etc. — what the total adds to menu prices, or null. */
    extras: billExtras(o.session.vatBps, o.session.serviceChargeBps),
    estimateMinutes: kitchenMinutes(o.items),
  }));
}

/** Live tables owned by the waiter (or every live table, for managers). */
export async function waiterTables(staff: StaffUser, opts: { all?: boolean } = {}) {
  const sessions = await prisma.tableSession.findMany({
    where: { status: { not: "CLOSED" }, ...(opts.all && isManager(staff) ? {} : { waiterId: staff.id }) },
    include: {
      table: { select: { id: true, label: true, area: true } },
      waiter: { select: { id: true, name: true } },
      orders: { orderBy: { placedAt: "asc" }, include: { items: { orderBy: { name: "asc" } } } },
      requests: { where: { status: { not: "DONE" } }, orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { collectedBy: { select: { name: true } } } },
    },
    orderBy: { openedAt: "asc" },
  });
  return sessions.map((s) => {
    const live = s.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
    const bill = computeBill({ orders: live, vatBps: s.vatBps, serviceChargeBps: s.serviceChargeBps, payments: s.payments });
    const money = tableMoney(s);
    return {
      id: s.id,
      status: s.status,
      openedAt: s.openedAt,
      table: s.table,
      waiter: s.waiter,
      bill,
      /** Owed on orders already in the kitchen that were never paid (tables from before pay-first ordering). */
      tableDueKobo: money.tableDueKobo,
      orders: s.orders.map((o) => {
        const pay = s.payments.find((p) => p.orderId === o.id);
        const totalKobo = orderTotals(o.items, s.vatBps, s.serviceChargeBps).total;
        return {
          id: o.id,
          seq: o.seq,
          status: o.status,
          placedAt: o.placedAt,
          acceptedAt: o.acceptedAt,
          paidAt: o.paidAt,
          readyAt: o.readyAt,
          note: o.note,
          cancelReason: o.cancelReason,
          totalKobo,
          /** What the waiter collects for this order (service charge and VAT included, less anything already paid at the table). */
          dueKobo: money.dueByOrder.get(o.id) ?? 0,
          estimateMinutes: kitchenMinutes(o.items),
          payment: pay ? { method: pay.method, amountKobo: pay.amountKobo, collectedBy: pay.collectedBy.name } : null,
          items: o.items.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            note: i.note,
            options: choicesLabel(parseChosen(i.options)),
            status: i.status,
            station: i.station,
            unitPriceKobo: i.unitPriceKobo,
          })),
        };
      }),
      requests: s.requests.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        note: r.note,
        preferredMethod: r.preferredMethod,
        createdAt: r.createdAt,
      })),
      payments: s.payments.map((p) => ({
        id: p.id,
        amountKobo: p.amountKobo,
        tipKobo: p.tipKobo,
        method: p.method,
        reference: p.reference,
        collectedBy: p.collectedBy.name,
        createdAt: p.createdAt,
      })),
    };
  });
}

export type WaiterTable = Awaited<ReturnType<typeof waiterTables>>[number];
export type QueueOrder = Awaited<ReturnType<typeof waiterQueue>>[number];
