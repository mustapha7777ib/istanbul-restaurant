// Staff performance and Staff of the Month scoring.
//
// Waiter score (0–100) = weighted sum of components, weights from Settings:
//   rating          Bayesian-average service rating (C=5 against the team mean) → 0–100
//   speed           percentile rank of median claim time and median ready→served time
//   productivity    percentile rank of orders served per hour worked
//   responsiveness  percentile rank of median request acknowledgement time
//   reliability     100 − penalties (disputed shifts ×20, voids on their orders ×2), floored at 0
// Staff below the eligibility thresholds are listed but not ranked.

import { prisma } from "@/lib/db";
import { getSettings, scoreWeights, type ScoreWeights } from "@/lib/settings";
import { lagosMonthRange, secondsBetween } from "@/lib/time";

const BAYES_C = 5;

export function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Percentile rank in [0,100] of `value` among `all`. `lowerIsBetter` flips it
 * (fast times score high). A single participant scores 100; missing data scores 50.
 */
export function percentileRank(value: number | null, all: (number | null)[], lowerIsBetter: boolean) {
  const pool = all.filter((v): v is number => v != null);
  if (value == null) return 50;
  if (pool.length <= 1) return 100;
  let better = 0;
  let equal = 0;
  for (const v of pool) {
    if (v === value) equal++;
    else if (lowerIsBetter ? v > value : v < value) better++;
  }
  return Math.round(((better + (equal - 1) / 2) / (pool.length - 1)) * 100);
}

export function bayesianAverage(sum: number, count: number, prior: number, c = BAYES_C) {
  return (prior * c + sum) / (c + count);
}

function hoursWorked(shifts: { clockInAt: Date; clockOutAt: Date | null }[], start: Date, end: Date) {
  const now = new Date();
  let ms = 0;
  for (const s of shifts) {
    const a = Math.max(s.clockInAt.getTime(), start.getTime());
    const b = Math.min((s.clockOutAt ?? now).getTime(), end.getTime());
    if (b > a) ms += b - a;
  }
  return ms / 3_600_000;
}

export type WaiterStats = {
  staffId: string;
  name: string;
  staffCode: string;
  photoId: string | null;
  ordersClaimed: number;
  ordersServed: number;
  tablesServed: number;
  salesKobo: number;
  tipsKobo: number;
  medianClaimSec: number | null;
  medianServeSec: number | null;
  medianRequestAckSec: number | null;
  ratingCount: number;
  ratingAvg: number | null;
  foodRatingAvg: number | null;
  hours: number;
  shifts: number;
  ordersPerHour: number | null;
  disputedShifts: number;
  voids: number;
};

export async function waiterStats(start: Date, end: Date): Promise<WaiterStats[]> {
  const waiters = await prisma.staff.findMany({
    where: { role: "WAITER" },
    select: { id: true, name: true, staffCode: true, photoId: true, active: true },
  });
  const ids = waiters.map((w) => w.id);
  const inRange = { gte: start, lt: end };

  const [claimed, served, sessions, payments, ratings, acks, shifts, voids] = await Promise.all([
    prisma.order.findMany({
      where: { waiterId: { in: ids }, acceptedAt: inRange },
      select: { waiterId: true, placedAt: true, acceptedAt: true, placedByStaffId: true },
    }),
    prisma.order.findMany({
      where: { servedById: { in: ids }, servedAt: inRange },
      select: { servedById: true, readyAt: true, servedAt: true },
    }),
    prisma.tableSession.findMany({
      where: { waiterId: { in: ids }, paidAt: inRange },
      select: { waiterId: true, payments: { select: { amountKobo: true } } },
    }),
    prisma.payment.findMany({ where: { collectedById: { in: ids }, createdAt: inRange }, select: { collectedById: true, tipKobo: true } }),
    prisma.rating.findMany({
      where: { createdAt: inRange },
      select: { waiterId: true, serviceRating: true, foodRating: true },
    }),
    prisma.serviceRequest.findMany({
      where: { acknowledgedById: { in: ids }, acknowledgedAt: inRange },
      select: { acknowledgedById: true, createdAt: true, acknowledgedAt: true },
    }),
    prisma.shift.findMany({
      where: { staffId: { in: ids }, clockInAt: { lt: end }, OR: [{ clockOutAt: null }, { clockOutAt: { gt: start } }] },
      select: { staffId: true, clockInAt: true, clockOutAt: true, reconcileStatus: true },
    }),
    prisma.orderItem.findMany({
      where: { voidedAt: inRange, voidReason: { notIn: ["REJECTED"] }, order: { waiterId: { in: ids } } },
      select: { order: { select: { waiterId: true } } },
    }),
  ]);

  const group = <T,>(rows: T[], key: (r: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };
  const claimedBy = group(claimed, (r) => r.waiterId);
  const servedBy = group(served, (r) => r.servedById);
  const sessionsBy = group(sessions, (r) => r.waiterId);
  const paymentsBy = group(payments, (r) => r.collectedById);
  const ratingsBy = group(ratings, (r) => r.waiterId);
  const acksBy = group(acks, (r) => r.acknowledgedById);
  const shiftsBy = group(shifts, (r) => r.staffId);
  const voidsBy = group(voids, (r) => r.order.waiterId);

  return waiters
    .map((w) => {
      const c = claimedBy.get(w.id) ?? [];
      const s = servedBy.get(w.id) ?? [];
      const r = ratingsBy.get(w.id) ?? [];
      const sh = shiftsBy.get(w.id) ?? [];
      const hours = hoursWorked(sh, start, end);
      // Staff-entered orders are accepted instantly, so they don't count toward claim speed.
      const claimTimes = c.filter((o) => !o.placedByStaffId && o.acceptedAt).map((o) => secondsBetween(o.placedAt, o.acceptedAt!));
      const serveTimes = s.filter((o) => o.readyAt && o.servedAt).map((o) => secondsBetween(o.readyAt!, o.servedAt!));
      const ackTimes = (acksBy.get(w.id) ?? []).map((a) => secondsBetween(a.createdAt, a.acknowledgedAt!));
      return {
        staffId: w.id,
        name: w.name,
        staffCode: w.staffCode,
        photoId: w.photoId,
        active: w.active,
        ordersClaimed: c.length,
        ordersServed: s.length,
        tablesServed: (sessionsBy.get(w.id) ?? []).length,
        salesKobo: (sessionsBy.get(w.id) ?? []).reduce((sum, x) => sum + x.payments.reduce((a, p) => a + p.amountKobo, 0), 0),
        tipsKobo: (paymentsBy.get(w.id) ?? []).reduce((sum, p) => sum + p.tipKobo, 0),
        medianClaimSec: median(claimTimes),
        medianServeSec: median(serveTimes),
        medianRequestAckSec: median(ackTimes),
        ratingCount: r.length,
        ratingAvg: r.length ? r.reduce((a, x) => a + x.serviceRating, 0) / r.length : null,
        foodRatingAvg: r.length ? r.reduce((a, x) => a + x.foodRating, 0) / r.length : null,
        hours,
        shifts: sh.length,
        ordersPerHour: hours >= 0.5 ? s.length / hours : null,
        disputedShifts: sh.filter((x) => x.reconcileStatus === "DISPUTED").length,
        voids: (voidsBy.get(w.id) ?? []).length,
      };
    })
    .filter((w) => w.active || w.ordersClaimed > 0 || w.hours > 0)
    .map(({ active: _a, ...rest }) => rest);
}

export type ScoredWaiter = WaiterStats & {
  eligible: boolean;
  score: number | null;
  components: Record<keyof ScoreWeights, number>;
};

export function scoreWaiters(
  stats: WaiterStats[],
  weights: ScoreWeights,
  thresholds: { minHours: number; minOrders: number },
): ScoredWaiter[] {
  const eligible = stats.filter((s) => s.hours >= thresholds.minHours || s.ordersServed >= thresholds.minOrders);
  const allRatings = eligible.flatMap((s) => (s.ratingAvg != null ? [{ sum: s.ratingAvg * s.ratingCount, n: s.ratingCount }] : []));
  const teamSum = allRatings.reduce((a, r) => a + r.sum, 0);
  const teamN = allRatings.reduce((a, r) => a + r.n, 0);
  const teamMean = teamN ? teamSum / teamN : 4;

  const claimPool = eligible.map((s) => s.medianClaimSec);
  const servePool = eligible.map((s) => s.medianServeSec);
  const prodPool = eligible.map((s) => s.ordersPerHour);
  const ackPool = eligible.map((s) => s.medianRequestAckSec);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return stats
    .map((s) => {
      const isEligible = eligible.includes(s);
      const bayes = bayesianAverage((s.ratingAvg ?? 0) * s.ratingCount, s.ratingCount, teamMean);
      const components = {
        rating: Math.round(((bayes - 1) / 4) * 100),
        speed: Math.round(
          (percentileRank(s.medianClaimSec, claimPool, true) + percentileRank(s.medianServeSec, servePool, true)) / 2,
        ),
        productivity: percentileRank(s.ordersPerHour, prodPool, false),
        responsiveness: percentileRank(s.medianRequestAckSec, ackPool, true),
        reliability: Math.max(0, 100 - s.disputedShifts * 20 - s.voids * 2),
      };
      const score = isEligible
        ? Math.round(
            ((Object.keys(weights) as (keyof ScoreWeights)[]).reduce((sum, k) => sum + components[k] * weights[k], 0) /
              totalWeight) *
              10,
          ) / 10
        : null;
      return { ...s, eligible: isEligible, score, components };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.ordersServed - a.ordersServed);
}

export async function waiterLeaderboard(monthKey: string) {
  const { start, end } = lagosMonthRange(monthKey);
  const settings = await getSettings();
  const stats = await waiterStats(start, end);
  return scoreWaiters(stats, scoreWeights(settings.scoreWeights), {
    minHours: settings.minHoursForAward,
    minOrders: settings.minOrdersForAward,
  });
}

export type KitchenStats = {
  staffId: string;
  name: string;
  staffCode: string;
  station: string | null;
  photoId: string | null;
  ticketsCompleted: number;
  itemsCompleted: number;
  medianPrepSec: number | null;
  onTimePct: number | null;
  hours: number;
  eligible: boolean;
  score: number | null;
};

/** Kitchen/bar: items completed, median prep time, share finished within the item's target. */
export async function kitchenLeaderboard(monthKey: string): Promise<KitchenStats[]> {
  const { start, end } = lagosMonthRange(monthKey);
  const settings = await getSettings();
  const cooks = await prisma.staff.findMany({
    where: { role: "KITCHEN" },
    select: { id: true, name: true, staffCode: true, station: true, photoId: true, active: true },
  });
  const ids = cooks.map((c) => c.id);
  const [items, shifts] = await Promise.all([
    prisma.orderItem.findMany({
      where: { preparedById: { in: ids }, readyAt: { gte: start, lt: end }, status: { not: "VOIDED" } },
      select: { preparedById: true, orderId: true, prepMinutes: true, readyAt: true, order: { select: { acceptedAt: true, paidAt: true } } },
    }),
    prisma.shift.findMany({
      where: { staffId: { in: ids }, clockInAt: { lt: end }, OR: [{ clockOutAt: null }, { clockOutAt: { gt: start } }] },
      select: { staffId: true, clockInAt: true, clockOutAt: true },
    }),
  ]);
  const rows = cooks.map((c) => {
    const mine = items.filter((i) => i.preparedById === c.id);
    // The kitchen's clock starts when the order reaches it (paid); older orders went at acceptance.
    const prep = mine
      .map((i) => ({ sentAt: i.order.paidAt ?? i.order.acceptedAt, readyAt: i.readyAt, prepMinutes: i.prepMinutes }))
      .filter((i) => i.sentAt && i.readyAt)
      .map((i) => ({ sec: secondsBetween(i.sentAt!, i.readyAt!), target: i.prepMinutes * 60 }));
    const hours = hoursWorked(shifts.filter((s) => s.staffId === c.id), start, end);
    return {
      staffId: c.id,
      name: c.name,
      staffCode: c.staffCode,
      station: c.station,
      photoId: c.photoId,
      active: c.active,
      ticketsCompleted: new Set(mine.map((i) => i.orderId)).size,
      itemsCompleted: mine.length,
      medianPrepSec: median(prep.map((p) => p.sec)),
      onTimePct: prep.length ? Math.round((prep.filter((p) => p.sec <= p.target).length / prep.length) * 100) : null,
      hours,
    };
  });
  const eligible = rows.filter((r) => r.hours >= settings.minHoursForAward || r.ticketsCompleted >= settings.minOrdersForAward);
  const volumePool = eligible.map((r) => (r.hours >= 0.5 ? r.ticketsCompleted / r.hours : null));
  return rows
    .filter((r) => r.active || r.itemsCompleted > 0 || r.hours > 0)
    .map(({ active: _a, ...r }) => {
      const isEligible = eligible.some((e) => e.staffId === r.staffId);
      const perHour = r.hours >= 0.5 ? r.ticketsCompleted / r.hours : null;
      const score = isEligible
        ? Math.round(((r.onTimePct ?? 50) * 0.6 + percentileRank(perHour, volumePool, false) * 0.4) * 10) / 10
        : null;
      return { ...r, eligible: isEligible, score };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.itemsCompleted - a.itemsCompleted);
}

/** Today's numbers for the waiter's own "My stats" tab. */
export async function myStatsToday(staffId: string, start: Date, end: Date) {
  const all = await waiterStats(start, end);
  const me = all.find((s) => s.staffId === staffId) ?? null;
  const ranked = [...all].sort((a, b) => b.ordersServed - a.ordersServed);
  const rank = me ? ranked.findIndex((s) => s.staffId === staffId) + 1 : null;
  return { me, rank, of: all.filter((s) => s.hours > 0 || s.ordersServed > 0).length };
}
