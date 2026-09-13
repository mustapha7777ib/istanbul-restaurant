import { Prisma } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { computeBill, orderTotals, type BillLine } from "@/lib/bill";
import type { Tx } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { rooms } from "@/lib/realtime";

export const isManager = (staff: Pick<StaffUser, "role">) => staff.role === "ADMIN" || staff.role === "MANAGER";

export function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** The staff member's open shift, or null. */
export function openShift(tx: Tx, staffId: string) {
  return tx.shift.findFirst({ where: { staffId, clockOutAt: null }, orderBy: { clockInAt: "desc" } });
}

/** Waiters and kitchen staff must be clocked in to act. Managers are exempt. */
export async function requireOnShift(tx: Tx, staff: StaffUser) {
  if (isManager(staff)) return openShift(tx, staff.id);
  const shift = await openShift(tx, staff.id);
  if (!shift) throw conflict("Clock in first to start receiving and handling orders");
  return shift;
}

export const LIVE_SESSION = { not: "CLOSED" } as const;

/** Rooms that care about a session: the guests at the table, the owning waiter, managers. */
export function sessionRooms(session: { id: string; waiterId: string | null }) {
  const r = [rooms.session(session.id), rooms.managers];
  if (session.waiterId) r.push(rooms.staff(session.waiterId));
  return r;
}

/**
 * How long until an order is ready, in minutes: the slowest dish on it (the
 * kitchen and bar work in parallel). Same target the kitchen screen uses.
 */
export const kitchenMinutes = (items: { prepMinutes: number; status: string }[]) =>
  Math.max(0, ...items.filter((i) => i.status !== "VOIDED").map((i) => i.prepMinutes));

const NOT_PAID_YET = new Set(["PLACED", "AWAITING_PAYMENT"]);
const DROPPED = new Set(["REJECTED", "CANCELLED"]);

/**
 * What's left to collect on a table, order by order (orders oldest first).
 * Orders are paid one at a time before they go to the kitchen. Money taken for
 * the whole table instead (the old pay-at-the-end way) covers the orders that
 * have no payment of their own; anything left over is used up before the guests
 * are asked for more, so nobody pays twice.
 */
export function tableMoney(s: {
  vatBps: number;
  serviceChargeBps: number;
  orders: { id: string; status: string; items: BillLine[] }[];
  payments: { orderId: string | null; amountKobo: number }[];
}) {
  const total = (o: { items: BillLine[] }) => orderTotals(o.items, s.vatBps, s.serviceChargeBps).total;
  const hasOwnPayment = new Set(s.payments.flatMap((p) => (p.orderId ? [p.orderId] : [])));
  const live = s.orders.filter((o) => !DROPPED.has(o.status));
  let pool =
    s.payments.filter((p) => !p.orderId).reduce((n, p) => n + p.amountKobo, 0) -
    live.filter((o) => !NOT_PAID_YET.has(o.status) && !hasOwnPayment.has(o.id)).reduce((n, o) => n + total(o), 0);
  // Negative: orders already in the kitchen that were never paid (tables from before pay-first ordering).
  const tableDueKobo = Math.max(0, -pool);
  const dueByOrder = new Map<string, number>();
  for (const o of live.filter((o) => NOT_PAID_YET.has(o.status))) {
    const covered = Math.min(Math.max(0, pool), total(o));
    pool -= covered;
    dueByOrder.set(o.id, total(o) - covered);
  }
  return { tableDueKobo, dueByOrder };
}

/** Bill for a session (excludes rejected/cancelled orders). */
export async function loadBill(tx: Tx, sessionId: string) {
  const session = await tx.tableSession.findUnique({
    where: { id: sessionId },
    include: {
      orders: { where: { status: { notIn: ["REJECTED", "CANCELLED"] } }, include: { items: true } },
      payments: true,
    },
  });
  if (!session) throw notFound("Table visit not found");
  const bill = computeBill({
    orders: session.orders,
    vatBps: session.vatBps,
    serviceChargeBps: session.serviceChargeBps,
    payments: session.payments,
  });
  return { session, bill };
}
