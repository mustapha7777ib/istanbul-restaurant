import type { OrderStatus } from "@/generated/prisma/client";
import { orderTotals } from "@/lib/bill";
import { prisma } from "@/lib/db";
import { choicesLabel, parseChosen } from "@/lib/options";
import { lagosDateKey, lagosHour, lagosWeekday, secondsBetween } from "@/lib/time";
import { kitchenMinutes } from "./common";
import { median } from "./metrics";

/** Sales and operations summary for [start, end). Aggregated in JS — restaurant-scale volumes. */
export async function salesReport(start: Date, end: Date) {
  const range = { gte: start, lt: end };
  const [payments, orders, sessions, voided] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: range },
      select: { amountKobo: true, tipKobo: true, method: true, createdAt: true, session: { select: { table: { select: { area: true } } } } },
    }),
    prisma.order.findMany({
      where: { placedAt: range },
      select: {
        status: true,
        placedAt: true,
        acceptedAt: true,
        paidAt: true,
        placedByStaffId: true,
        items: { select: { name: true, qty: true, unitPriceKobo: true, status: true, readyAt: true, menuItemId: true } },
      },
    }),
    prisma.tableSession.findMany({
      where: { closedAt: range, paidAt: { not: null } },
      select: { openedAt: true, closedAt: true, payments: { select: { amountKobo: true } } },
    }),
    prisma.orderItem.findMany({
      where: { voidedAt: range, voidReason: { not: "REJECTED" } },
      select: { qty: true, unitPriceKobo: true, voidReason: true },
    }),
  ]);

  const byMethod = { CASH: 0, POS: 0, TRANSFER: 0 };
  const byArea = new Map<string, number>();
  const byDay = new Map<string, number>();
  let revenue = 0;
  let tips = 0;
  for (const p of payments) {
    revenue += p.amountKobo;
    tips += p.tipKobo;
    byMethod[p.method] += p.amountKobo;
    const area = p.session.table.area;
    byArea.set(area, (byArea.get(area) ?? 0) + p.amountKobo);
    const day = lagosDateKey(p.createdAt);
    byDay.set(day, (byDay.get(day) ?? 0) + p.amountKobo);
  }

  const counted = orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const itemAgg = new Map<string, { name: string; qty: number; revenueKobo: number; prep: number[] }>();
  const claimTimes: number[] = [];
  for (const o of counted) {
    heat[lagosWeekday(o.placedAt)][lagosHour(o.placedAt)]++;
    if (o.acceptedAt && !o.placedByStaffId) claimTimes.push(secondsBetween(o.placedAt, o.acceptedAt));
    const sentAt = o.paidAt ?? o.acceptedAt;
    for (const i of o.items) {
      if (i.status === "VOIDED") continue;
      const a = itemAgg.get(i.menuItemId) ?? { name: i.name, qty: 0, revenueKobo: 0, prep: [] };
      a.qty += i.qty;
      a.revenueKobo += i.qty * i.unitPriceKobo;
      if (sentAt && i.readyAt) a.prep.push(secondsBetween(sentAt, i.readyAt));
      itemAgg.set(i.menuItemId, a);
    }
  }
  const items = [...itemAgg.values()].map((a) => ({ name: a.name, qty: a.qty, revenueKobo: a.revenueKobo, medianPrepSec: median(a.prep) }));

  const tableTimes = sessions.filter((s) => s.closedAt).map((s) => secondsBetween(s.openedAt, s.closedAt!));
  const sessionTotals = sessions.map((s) => s.payments.reduce((a, p) => a + p.amountKobo, 0)).filter((t) => t > 0);

  const voids = { COMP: 0, other: 0 };
  for (const v of voided) {
    if (v.voidReason === "COMP") voids.COMP += v.qty * v.unitPriceKobo;
    else voids.other += v.qty * v.unitPriceKobo;
  }

  return {
    revenueKobo: revenue,
    tipsKobo: tips,
    byMethod,
    byArea: [...byArea.entries()].map(([area, kobo]) => ({ area, kobo })).sort((a, b) => b.kobo - a.kobo),
    byDay: [...byDay.entries()].map(([day, kobo]) => ({ day, kobo })).sort((a, b) => a.day.localeCompare(b.day)),
    orders: counted.length,
    rejectedOrCancelled: orders.length - counted.length,
    visits: sessions.length,
    avgVisitKobo: sessionTotals.length ? Math.round(sessionTotals.reduce((a, b) => a + b, 0) / sessionTotals.length) : 0,
    medianTableSec: median(tableTimes),
    medianClaimSec: median(claimTimes),
    bestSellers: [...items].sort((a, b) => b.qty - a.qty).slice(0, 10),
    slowest: items.filter((i) => i.medianPrepSec != null).sort((a, b) => b.medianPrepSec! - a.medianPrepSec!).slice(0, 8),
    heat,
    voidsKobo: voids,
  };
}

export type SalesReport = Awaited<ReturnType<typeof salesReport>>;

/** One row per order line, for spreadsheet export. */
export async function orderLinesCsv(start: Date, end: Date) {
  const lines = await prisma.orderItem.findMany({
    where: { order: { placedAt: { gte: start, lt: end } } },
    include: {
      order: {
        select: {
          seq: true,
          status: true,
          placedAt: true,
          paidAt: true,
          table: { select: { label: true, area: true } },
          waiter: { select: { name: true } },
          payments: { select: { method: true, collectedBy: { select: { name: true } } }, take: 1 },
        },
      },
    },
    orderBy: { order: { placedAt: "asc" } },
  });
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "order", "placed_at", "table", "area", "waiter", "order_status", "paid_at", "payment_method", "payment_taken_by",
    "item", "qty", "unit_price_naira", "line_total_naira", "item_status", "void_reason",
  ];
  const rows = lines.map((l) =>
    [
      l.order.seq,
      l.order.placedAt.toISOString(),
      l.order.table.label,
      l.order.table.area,
      l.order.waiter?.name ?? "",
      l.order.status,
      l.order.paidAt?.toISOString() ?? "",
      l.order.payments[0]?.method ?? "",
      l.order.payments[0]?.collectedBy.name ?? "",
      l.name,
      l.qty,
      (l.unitPriceKobo / 100).toFixed(2),
      ((l.unitPriceKobo * l.qty) / 100).toFixed(2),
      l.status,
      l.voidReason ?? "",
    ].map(esc).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export const ORDER_FILTERS = {
  all: null,
  unpaid: ["PLACED", "AWAITING_PAYMENT"],
  kitchen: ["ACCEPTED", "READY"],
  served: ["SERVED"],
  cancelled: ["REJECTED", "CANCELLED"],
} satisfies Record<string, OrderStatus[] | null>;
export type OrderFilter = keyof typeof ORDER_FILTERS;

/** Every order in [start, end): who handled each step, how it was paid, and how long each step took. */
export async function orderLog(start: Date, end: Date, opts: { waiterId?: string; filter?: OrderFilter } = {}) {
  const statuses = ORDER_FILTERS[opts.filter ?? "all"];
  const orders = await prisma.order.findMany({
    where: {
      placedAt: { gte: start, lt: end },
      ...(opts.waiterId ? { waiterId: opts.waiterId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    include: {
      table: { select: { label: true } },
      waiter: { select: { name: true } },
      servedBy: { select: { name: true } },
      placedByStaff: { select: { name: true } },
      items: { select: { name: true, qty: true, unitPriceKobo: true, status: true, options: true, prepMinutes: true }, orderBy: { name: "asc" } },
      payments: { select: { amountKobo: true, tipKobo: true, method: true, reference: true, createdAt: true, collectedBy: { select: { name: true } } } },
      session: { select: { vatBps: true, serviceChargeBps: true } },
    },
    orderBy: { placedAt: "desc" },
  });

  const rows = orders.map((o) => {
    const pay = o.payments[0] ?? null;
    const sentAt = o.paidAt ?? o.acceptedAt;
    const live = o.items.filter((i) => i.status !== "VOIDED");
    return {
      id: o.id,
      seq: o.seq,
      status: o.status,
      table: o.table.label,
      placedAt: o.placedAt,
      paidAt: o.paidAt,
      placedBy: o.placedByStaff?.name ?? "Guest",
      waiter: o.waiter?.name ?? null,
      servedBy: o.servedBy?.name ?? null,
      items: live.map((i) => ({ label: `${i.qty}× ${i.name}`, options: choicesLabel(parseChosen(i.options)) })),
      voidedItems: o.items.length - live.length,
      totalKobo: orderTotals(o.items, o.session.vatBps, o.session.serviceChargeBps).total,
      payment: pay ? { method: pay.method, amountKobo: pay.amountKobo, tipKobo: pay.tipKobo, reference: pay.reference, at: pay.createdAt, by: pay.collectedBy.name } : null,
      cancelReason: o.cancelReason,
      estimateMinutes: kitchenMinutes(o.items),
      acceptSec: o.acceptedAt && !o.placedByStaffId ? secondsBetween(o.placedAt, o.acceptedAt) : null,
      paySec: o.acceptedAt && o.paidAt ? secondsBetween(o.acceptedAt, o.paidAt) : null,
      kitchenSec: sentAt && o.readyAt ? secondsBetween(sentAt, o.readyAt) : null,
      serveSec: o.readyAt && o.servedAt ? secondsBetween(o.readyAt, o.servedAt) : null,
    };
  });

  const counted = rows.filter((r) => r.status !== "REJECTED" && r.status !== "CANCELLED");
  const byMethod = { CASH: 0, POS: 0, TRANSFER: 0 };
  for (const r of rows) if (r.payment) byMethod[r.payment.method] += r.payment.amountKobo;
  return {
    rows,
    summary: {
      orders: counted.length,
      collectedKobo: rows.reduce((s, r) => s + (r.payment?.amountKobo ?? 0), 0),
      tipsKobo: rows.reduce((s, r) => s + (r.payment?.tipKobo ?? 0), 0),
      unpaidKobo: counted.filter((r) => r.status === "PLACED" || r.status === "AWAITING_PAYMENT").reduce((s, r) => s + r.totalKobo, 0),
      cancelled: rows.length - counted.length,
      byMethod,
    },
  };
}

export type OrderLog = Awaited<ReturnType<typeof orderLog>>;
