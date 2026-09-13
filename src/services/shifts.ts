import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma, type Tx } from "@/lib/db";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { isManager, openShift } from "./common";

export function currentShift(staffId: string) {
  return openShift(prisma, staffId);
}

export async function clockIn(staff: StaffUser) {
  const shift = await prisma.$transaction(async (tx) => {
    const existing = await openShift(tx, staff.id);
    if (existing) return existing;
    const created = await tx.shift.create({ data: { staffId: staff.id } });
    await logEvent(tx, staffActor(staff.id), "SHIFT_CLOCK_IN", { type: "Shift", id: created.id });
    return created;
  });
  new Outbox().add([rooms.managers], "floor", {}).flush();
  return shift;
}

export async function clockOut(staff: StaffUser, cashDeclaredKobo?: number) {
  const shift = await prisma.$transaction(async (tx) => {
    const open = await openShift(tx, staff.id);
    if (!open) throw conflict("You are not clocked in");
    if (staff.role === "WAITER") {
      const owned = await tx.tableSession.findMany({
        where: { waiterId: staff.id, status: { not: "CLOSED" } },
        include: { table: { select: { label: true } } },
      });
      if (owned.length) {
        throw conflict(
          `Hand over or clear your open tables first: ${owned.map((s) => s.table.label).join(", ")}`,
        );
      }
    }
    const summary = await shiftTotals(tx, open.id);
    const updated = await tx.shift.update({
      where: { id: open.id },
      data: { clockOutAt: new Date(), cashDeclaredKobo: cashDeclaredKobo ?? null },
    });
    await logEvent(tx, staffActor(staff.id), "SHIFT_CLOCK_OUT", { type: "Shift", id: open.id }, {
      data: { cashDeclaredKobo: cashDeclaredKobo ?? null, expectedCashKobo: summary.byMethod.CASH },
    });
    return updated;
  });
  new Outbox().add([rooms.managers], "floor", {}).flush();
  return shift;
}

async function shiftTotals(tx: Tx, shiftId: string) {
  const payments = await tx.payment.findMany({ where: { shiftId } });
  const byMethod = { CASH: 0, POS: 0, TRANSFER: 0 };
  let tips = 0;
  for (const p of payments) {
    byMethod[p.method] += p.amountKobo;
    tips += p.tipKobo;
  }
  return { byMethod, tips, count: payments.length, total: byMethod.CASH + byMethod.POS + byMethod.TRANSFER };
}

export async function shiftSummary(shiftId: string) {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { staff: { select: { id: true, name: true, staffCode: true, role: true } }, reconciledBy: { select: { name: true } } },
  });
  if (!shift) throw notFound("Shift not found");
  const totals = await shiftTotals(prisma, shiftId);
  const difference = shift.cashDeclaredKobo == null ? null : shift.cashDeclaredKobo - totals.byMethod.CASH;
  return { shift, totals, difference };
}

export async function reconcileShift(
  manager: StaffUser,
  shiftId: string,
  status: "CONFIRMED" | "DISPUTED",
  note?: string,
) {
  if (!isManager(manager)) throw forbidden("Only managers can reconcile shifts");
  await prisma.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw notFound("Shift not found");
    if (!shift.clockOutAt) throw conflict("The shift is still open — the staff member must clock out first");
    const totals = await shiftTotals(tx, shiftId);
    await tx.shift.update({
      where: { id: shiftId },
      data: { reconcileStatus: status, reconciledById: manager.id, reconciledAt: new Date(), reconcileNote: note ?? null },
    });
    await tx.payment.updateMany({ where: { shiftId }, data: { status } });
    await logEvent(tx, staffActor(manager.id), "SHIFT_RECONCILED", { type: "Shift", id: shiftId }, {
      data: {
        status,
        note: note ?? null,
        staffId: shift.staffId,
        expectedCashKobo: totals.byMethod.CASH,
        declaredCashKobo: shift.cashDeclaredKobo,
      },
    });
  });
}

export async function staffOnShift() {
  return prisma.shift.findMany({
    where: { clockOutAt: null },
    include: { staff: { select: { id: true, name: true, role: true, station: true, photoId: true, staffCode: true } } },
    orderBy: { clockInAt: "asc" },
  });
}
