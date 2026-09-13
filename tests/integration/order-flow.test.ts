import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { recordEvents } from "@/lib/realtime";
import { runEscalations } from "@/services/escalations";
import { loadBill } from "@/services/common";
import { readyTicket, setItemAvailability, startTicket, stationTickets } from "@/services/kitchen";
import { claimOrder, markOrderReady, payOrder, placeGuestOrder, placeStaffOrder, rejectOrder, serveOrder, voidItem } from "@/services/orders";
import { recordPayment } from "@/services/payments";
import { submitRating } from "@/services/ratings";
import { acknowledgeRequest, createRequest } from "@/services/requests";
import { closeSession, joinByQrToken, transferSession } from "@/services/sessions";
import { clockOut } from "@/services/shifts";
import { actionsFor, makeStaff, makeWorld, resetDb } from "../helpers";

async function expectError(p: Promise<unknown>, status: number, message?: RegExp) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected the call to fail").toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
  if (message) expect((err as AppError).message).toMatch(message);
}

beforeEach(async () => {
  await resetDb();
});

describe("guest visit, end to end", () => {
  it("scan → order → accept → pay → kitchen & bar → serve → rating → clear, all audited", async () => {
    const { table, jollof, chapman } = await makeWorld();
    const amina = await makeStaff("WAITER", { name: "Amina" });
    const cook = await makeStaff("KITCHEN", { station: "KITCHEN" });
    const barman = await makeStaff("KITCHEN", { station: "BAR" });
    const events = recordEvents();

    // Two phones at the same table share one visit.
    const { session } = await joinByQrToken(table.qrToken);
    const again = await joinByQrToken(table.qrToken);
    expect(again.session.id).toBe(session.id);

    const order = await placeGuestOrder(session.id, {
      items: [
        { menuItemId: jollof.id, qty: 2, note: "less pepper" },
        { menuItemId: chapman.id, qty: 1 },
      ],
    });
    expect(order.status).toBe("PLACED");
    expect(events.some((e) => e.event === "ping" && e.rooms.includes("waiters"))).toBe(true);

    await claimOrder(amina, order.id);
    const claimed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(claimed.status).toBe("AWAITING_PAYMENT");
    expect((await prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } })).waiterId).toBe(amina.id);
    // The kitchen doesn't see it until the waiter has taken payment.
    expect(events.some((e) => e.event === "kds")).toBe(false);
    expect((await stationTickets("KITCHEN")).active).toHaveLength(0);
    await expectError(startTicket(cook, order.id, "KITCHEN"), 409);

    // 2×₦6,500 + ₦3,500 = ₦16,500, + 7.5% VAT = ₦17,737.50 — worked out by the server, not typed in.
    expect(await payOrder(amina, order.id, { method: "POS", tipKobo: 50_000, reference: "RRN1" })).toEqual({ amountKobo: 1_773_750, estimateMinutes: 15 });
    await expectError(payOrder(amina, order.id, { method: "CASH", tipKobo: 0 }), 409, /already paid/);
    const sent = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(sent.status).toBe("ACCEPTED");
    expect(sent.paidAt).not.toBeNull();
    expect(await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({
      amountKobo: 1_773_750,
      tipKobo: 50_000,
      method: "POS",
      reference: "RRN1",
      collectedById: amina.id,
    });
    // Now tickets go to both stations.
    expect(events.some((e) => e.event === "kds" && e.rooms.includes("station:KITCHEN"))).toBe(true);
    expect(events.some((e) => e.event === "kds" && e.rooms.includes("station:BAR"))).toBe(true);
    expect((await stationTickets("KITCHEN")).active).toHaveLength(1);
    // Paid items can only be removed by a manager (the guest would need a refund).
    const [line] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    await expectError(voidItem(amina, line.id, "Changed mind"), 403, /manager/);

    // Nothing is ready yet, so nothing can be served.
    await expectError(serveOrder(amina, order.id), 409, /ready/);

    // Bar can't touch kitchen tickets.
    await expectError(startTicket(barman, order.id, "KITCHEN"), 403);
    await startTicket(cook, order.id, "KITCHEN");
    await readyTicket(cook, order.id, "KITCHEN");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ACCEPTED");
    await serveOrder(amina, order.id); // food first
    await readyTicket(barman, order.id, "BAR");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("READY");

    // Paid, but not everything is served yet: too early to rate.
    await expectError(submitRating(session.id, { foodRating: 5, serviceRating: 5 }), 409, /served/);
    await serveOrder(amina, order.id);
    const served = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(served.status).toBe("SERVED");
    expect(served.servedById).toBe(amina.id);

    await submitRating(session.id, { foodRating: 5, serviceRating: 4, comment: "Lovely" });
    await expectError(submitRating(session.id, { foodRating: 1, serviceRating: 1 }), 409);
    expect((await prisma.rating.findUniqueOrThrow({ where: { sessionId: session.id } })).waiterId).toBe(amina.id);

    // Can't clock out while owning a table…
    await expectError(clockOut(amina, 0), 409, /T1/);
    await closeSession(amina, session.id);
    // …but can once it's cleared. Next scan starts a fresh visit.
    await clockOut(amina, 0);
    const next = await joinByQrToken(table.qrToken);
    expect(next.session.id).not.toBe(session.id);

    expect(await actionsFor(session.id)).toEqual([
      "SESSION_OPENED",
      "ORDER_PLACED",
      "ORDER_CLAIMED",
      "PAYMENT_RECORDED",
      "ORDER_SENT_TO_KITCHEN",
      "ITEMS_STARTED",
      "ITEMS_READY",
      "ORDER_SERVED",
      "ITEMS_READY",
      "ORDER_READY",
      "ORDER_SERVED",
      "RATING_SUBMITTED",
      "SESSION_CLOSED",
    ]);
  });
});

describe("open pool claiming", () => {
  it("exactly one of five simultaneous claims wins", async () => {
    const { table, jollof } = await makeWorld();
    const waiters = await Promise.all([1, 2, 3, 4, 5].map((i) => makeStaff("WAITER", { name: `W${i}` })));
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });

    const results = await Promise.allSettled(waiters.map((w) => claimOrder(w, order.id)));
    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(4);
    for (const l of losses) expect((l.reason as AppError).message).toMatch(/Already taken by|no longer waiting/);
    expect(await prisma.activityEvent.count({ where: { action: "ORDER_CLAIMED", entityId: order.id } })).toBe(1);
  });

  it("follow-up orders belong to the table's waiter until they escalate", async () => {
    const { table, jollof } = await makeWorld();
    const owner = await makeStaff("WAITER");
    const other = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const first = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await claimOrder(owner, first.id);

    // Guest cooldown between orders.
    await expectError(placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] }), 429);
    await prisma.order.update({ where: { id: first.id }, data: { placedAt: new Date(Date.now() - 60_000) } });

    const second = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await expectError(claimOrder(other, second.id), 403);

    // Nobody claims it for longer than the timeout → the escalation opens it to all.
    await prisma.order.update({ where: { id: second.id }, data: { placedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await runEscalations()).toBeGreaterThanOrEqual(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).escalatedAt).not.toBeNull();
    expect(await prisma.activityEvent.count({ where: { action: "ORDER_ESCALATED", entityId: second.id } })).toBe(1);
    await claimOrder(other, second.id);
    // Running again doesn't escalate twice.
    await runEscalations();
    expect(await prisma.activityEvent.count({ where: { action: "ORDER_ESCALATED" } })).toBe(1);
  });

  it("waiters must be clocked in", async () => {
    const { table, jollof } = await makeWorld();
    const offShift = await makeStaff("WAITER", { onShift: false });
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await expectError(claimOrder(offShift, order.id), 409, /Clock in/);
  });

  it("a manager can assign an order to an on-shift waiter", async () => {
    const { table, jollof } = await makeWorld();
    const manager = await makeStaff("MANAGER", { onShift: false });
    const waiter = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await claimOrder(manager, order.id, { asWaiterId: waiter.id });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).waiterId).toBe(waiter.id);
  });
});

describe("menu choices", () => {
  it("requires required choices, prices extras, and snapshots them on the order", async () => {
    const { table } = await makeWorld();
    const cat = await prisma.menuCategory.findFirstOrThrow();
    const steak = await prisma.menuItem.create({
      data: {
        categoryId: cat.id,
        name: "T-Bone Steak",
        priceKobo: 6_000_000,
        optionGroups: [
          { name: "Side dish", required: true, options: [{ name: "Fries", priceKobo: 0 }, { name: "Mashed potato", priceKobo: 0 }] },
          { name: "Extra", required: false, options: [{ name: "Pepper sauce", priceKobo: 150_000 }] },
        ],
      },
    });
    const { session } = await joinByQrToken(table.qrToken);
    await expectError(placeGuestOrder(session.id, { items: [{ menuItemId: steak.id, qty: 1 }] }), 400, /side dish/i);
    await expectError(
      placeGuestOrder(session.id, { items: [{ menuItemId: steak.id, qty: 1, choices: [{ group: "Side dish", option: "Rice" }] }] }),
      400,
      /isn't available/,
    );
    const order = await placeGuestOrder(session.id, {
      items: [{ menuItemId: steak.id, qty: 2, choices: [{ group: "Side dish", option: "Fries" }, { group: "Extra", option: "Pepper sauce" }] }],
    });
    const [line] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(line.unitPriceKobo).toBe(6_150_000);
    expect(line.options).toEqual([
      { group: "Side dish", name: "Fries", priceKobo: 0 },
      { group: "Extra", name: "Pepper sauce", priceKobo: 150_000 },
    ]);
  });
});

describe("guards and edge cases", () => {
  it("declined orders drop off the bill", async () => {
    const { table, jollof } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 3 }] });
    await rejectOrder(waiter, order.id, "Nobody at the table");
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(items.every((i) => i.status === "VOIDED")).toBe(true);
    await expectError(recordPayment(waiter, session.id, { amountKobo: 100, tipKobo: 0, method: "CASH" }), 409, /nothing to pay/i);
  });

  it("waiters can remove items until the order is paid; after that only a manager can, and a refund is due", async () => {
    const { table, jollof, chapman } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const cook = await makeStaff("KITCHEN", { station: "KITCHEN" });
    const manager = await makeStaff("MANAGER", { onShift: false });
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeStaffOrder(waiter, { sessionId: session.id }, {
      items: [
        { menuItemId: jollof.id, qty: 1 },
        { menuItemId: chapman.id, qty: 1 },
      ],
    });
    expect(order.status).toBe("AWAITING_PAYMENT"); // keyed-in orders are the waiter's, but still paid first
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    const food = items.find((i) => i.station === "KITCHEN")!;
    const drink = items.find((i) => i.station === "BAR")!;
    // The guest changes their mind about the drink before paying: they pay only for the food.
    await voidItem(waiter, drink.id, "Guest changed their mind");
    expect((await payOrder(waiter, order.id, { method: "CASH", tipKobo: 0 })).amountKobo).toBe(698_750); // ₦6,500 + 7.5% VAT
    await startTicket(cook, order.id, "KITCHEN");
    await expectError(voidItem(waiter, food.id, "Changed mind"), 403, /manager/);
    await readyTicket(cook, order.id, "KITCHEN");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("READY");
    // A manager comps the food after it's served — the guest is now owed their money back.
    await serveOrder(waiter, order.id);
    await voidItem(manager, food.id, "COMP");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    const { bill } = await prisma.$transaction((tx) => loadBill(tx, session.id));
    expect(bill.balance).toBe(-698_750);
  });

  it("an accepted order can be declined until it's paid, and the table-level payment can't skip the kitchen step", async () => {
    const { table, jollof } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await expectError(payOrder(waiter, order.id, { method: "CASH", tipKobo: 0 }), 409, /Accept/);
    await expectError(recordPayment(waiter, session.id, { amountKobo: 698_750, tipKobo: 0, method: "CASH" }), 409, /each waiting order/);
    await claimOrder(waiter, order.id);
    await expectError(recordPayment(waiter, session.id, { amountKobo: 698_750, tipKobo: 0, method: "CASH" }), 409, /each waiting order/);
    await rejectOrder(waiter, order.id, "Guest left");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REJECTED");
    await closeSession(waiter, session.id);
  });

  it("without the kitchen screen, the waiter marks a paid order ready, then served", async () => {
    const { table, jollof, chapman } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }, { menuItemId: chapman.id, qty: 1 }] });
    await claimOrder(waiter, order.id);
    await expectError(markOrderReady(waiter, order.id), 409, /payment first/);
    await payOrder(waiter, order.id, { method: "TRANSFER", tipKobo: 0 });
    await markOrderReady(waiter, order.id);
    const ready = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(ready.status).toBe("READY");
    expect(ready.items.every((i) => i.status === "READY" && i.preparedById === null)).toBe(true); // not credited to a cook
    await expectError(markOrderReady(waiter, order.id), 409);
    await serveOrder(waiter, order.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SERVED");
    expect(await actionsFor(session.id)).toEqual(expect.arrayContaining(["ITEMS_READY", "ORDER_READY", "ORDER_SERVED"]));
  });

  it("money already taken at the table (the old pay-at-the-end way) isn't collected twice", async () => {
    const { table, jollof } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    const order = await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    // Before pay-first ordering, a waiter could take the whole table's money up front.
    const shift = await prisma.shift.findFirstOrThrow({ where: { staffId: waiter.id } });
    await prisma.payment.create({ data: { sessionId: session.id, amountKobo: 698_750, method: "CASH", collectedById: waiter.id, shiftId: shift.id } });
    await claimOrder(waiter, order.id);
    // Nothing more to collect: it just goes to the kitchen.
    expect((await payOrder(waiter, order.id, { method: "CASH", tipKobo: 0 })).amountKobo).toBe(0);
    expect(await prisma.payment.count({ where: { sessionId: session.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("ACCEPTED");
    const { bill } = await prisma.$transaction((tx) => loadBill(tx, session.id));
    expect(bill.balance).toBe(0);
  });

  it("sold-out items can't be ordered", async () => {
    const { table, jollof } = await makeWorld();
    const cook = await makeStaff("KITCHEN", { station: "KITCHEN" });
    await setItemAvailability(cook, jollof.id, false);
    const { session } = await joinByQrToken(table.qrToken);
    await expectError(placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] }), 409, /sold out/);
  });

  it("paused ordering blocks guests but not waiters", async () => {
    const { table, jollof } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    await prisma.settings.update({ where: { id: 1 }, data: { orderingEnabled: false } });
    const { session } = await joinByQrToken(table.qrToken);
    await expectError(placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] }), 409, /paused/);
    await placeStaffOrder(waiter, { sessionId: session.id }, { items: [{ menuItemId: jollof.id, qty: 1 }] });
  });

  it("guests can only ask for service once they've ordered, unless the waiter must take the order", async () => {
    const { table, jollof } = await makeWorld();
    const { session } = await joinByQrToken(table.qrToken);
    for (const type of ["CALL_WAITER", "WATER", "CUTLERY", "BILL"] as const) {
      await expectError(createRequest(session.id, { type }), 409, /order first/);
    }
    await expectError(createRequest(session.id, { type: "OTHER", note: "A high chair" }), 409, /order first/);
    expect(await prisma.serviceRequest.count()).toBe(0);
    await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await createRequest(session.id, { type: "WATER" });

    // Phone ordering paused: calling the waiter to take the order is the only way in.
    const t2 = await prisma.table.create({ data: { label: "T2", area: "Main Hall", qrToken: `tok2${Date.now()}` } });
    const { session: fresh } = await joinByQrToken(t2.qrToken);
    await prisma.settings.update({ where: { id: 1 }, data: { orderingEnabled: false } });
    await createRequest(fresh.id, { type: "CALL_WAITER" });
    await expectError(createRequest(fresh.id, { type: "WATER" }), 409, /order first/);
  });

  it("answering a call on an unowned table makes you its waiter; hand-over moves it", async () => {
    const { table, jollof } = await makeWorld();
    const a = await makeStaff("WAITER");
    const b = await makeStaff("WAITER");
    const { session } = await joinByQrToken(table.qrToken);
    await placeGuestOrder(session.id, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    const req = await createRequest(session.id, { type: "CALL_WAITER" });
    // Tapping twice doesn't create a second request.
    expect((await createRequest(session.id, { type: "CALL_WAITER" })).id).toBe(req.id);
    await acknowledgeRequest(a, req.id);
    expect((await prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } })).waiterId).toBe(a.id);
    await transferSession(a, session.id, b.id);
    expect((await prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } })).waiterId).toBe(b.id);
    expect(await actionsFor(session.id)).toContain("SESSION_TRANSFERRED");
  });

  it("only managers can clear an unpaid table, and must say why", async () => {
    const { table, jollof } = await makeWorld();
    const waiter = await makeStaff("WAITER");
    const manager = await makeStaff("MANAGER", { onShift: false });
    const { session } = await joinByQrToken(table.qrToken);
    await placeStaffOrder(waiter, { sessionId: session.id }, { items: [{ menuItemId: jollof.id, qty: 1 }] });
    await expectError(closeSession(waiter, session.id), 409);
    await expectError(closeSession(manager, session.id), 409, /reason/);
    await closeSession(manager, session.id, { reason: "Guests left without paying" });
    const ev = await prisma.activityEvent.findFirstOrThrow({ where: { sessionId: session.id, action: "SESSION_CLOSED" } });
    expect(ev.data).toMatchObject({ forced: true, reason: "Guests left without paying" });
  });
});
