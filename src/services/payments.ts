import type { PaymentMethod } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { formatNaira } from "@/lib/money";
import { Outbox, rooms } from "@/lib/realtime";
import { isManager, loadBill, requireOnShift, sessionRooms, tableMoney } from "./common";

/**
 * Waiter records money owed on the table that isn't on an order awaiting payment
 * (tables from before pay-first ordering). Split bills = several payments.
 * When the balance hits zero the visit is PAID.
 */
export async function recordPayment(
  staff: StaffUser,
  sessionId: string,
  input: { amountKobo: number; tipKobo: number; method: PaymentMethod; reference?: string; note?: string },
) {
  if (staff.role !== "WAITER" && !isManager(staff)) throw forbidden();
  const outbox = new Outbox();
  const result = await prisma.$transaction(async (tx) => {
    const shift = await requireOnShift(tx, staff);
    const { session, bill } = await loadBill(tx, sessionId);
    if (session.status === "CLOSED") throw conflict("This table is already cleared");
    if (!isManager(staff) && session.waiterId && session.waiterId !== staff.id) {
      throw forbidden("Only the table's waiter can take payment");
    }
    if (bill.total === 0) throw conflict("There is nothing to pay on this table yet");
    if (bill.balance <= 0) throw conflict("This bill is already fully paid");
    // Orders not yet in the kitchen are paid on their own (payOrder), which is what sends them there.
    const due = tableMoney(session).tableDueKobo;
    if (due <= 0) throw conflict("Take payment on each waiting order instead — that sends it to the kitchen");
    if (input.amountKobo > due) {
      throw badRequest(`That is more than the balance of ${formatNaira(due)}. Record the bill amount and give change.`);
    }
    const payment = await tx.payment.create({
      data: {
        sessionId,
        amountKobo: input.amountKobo,
        tipKobo: input.tipKobo,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        collectedById: staff.id,
        shiftId: shift?.id ?? null,
      },
    });
    if (!session.waiterId && staff.role === "WAITER") {
      await tx.tableSession.update({ where: { id: sessionId }, data: { waiterId: staff.id } });
    }
    const balanceAfter = due - input.amountKobo;
    const ctx = { tableId: session.tableId, sessionId };
    await logEvent(tx, staffActor(staff.id), "PAYMENT_RECORDED", { type: "Payment", id: payment.id }, {
      ...ctx,
      data: {
        amountKobo: input.amountKobo,
        tipKobo: input.tipKobo,
        method: input.method,
        reference: input.reference ?? null,
        balanceAfterKobo: balanceAfter,
      },
    });
    if (bill.balance - input.amountKobo <= 0) {
      const now = new Date();
      await tx.tableSession.update({ where: { id: sessionId }, data: { status: "PAID", paidAt: now } });
      await tx.serviceRequest.updateMany({
        where: { sessionId, type: "BILL", status: { not: "DONE" } },
        data: { status: "DONE", resolvedAt: now, resolvedById: staff.id },
      });
      await logEvent(tx, staffActor(staff.id), "SESSION_PAID", { type: "TableSession", id: sessionId }, {
        ...ctx,
        data: { totalKobo: bill.total },
      });
    }
    outbox.add(sessionRooms({ id: sessionId, waiterId: session.waiterId ?? staff.id }), "session", { sessionId });
    outbox.add([rooms.waiters, rooms.managers], "tables", {});
    outbox.add([rooms.managers], "floor", {});
    return { payment, balanceAfter };
  });
  outbox.flush();
  return result;
}
