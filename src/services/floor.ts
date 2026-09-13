import { computeBill } from "@/lib/bill";
import { prisma } from "@/lib/db";
import { lagosDayRange, secondsBetween } from "@/lib/time";
import { median } from "./metrics";

export type TableState = "free" | "seated" | "waiting" | "paying" | "preparing" | "ready" | "served" | "bill" | "paid";

/** Everything on the manager's live floor view. */
export async function floorView() {
  const now = new Date();
  const { start, end } = lagosDayRange(now);
  const [tables, shifts, todayPayments, todayOrders, lowRatings, events] = await Promise.all([
    prisma.table.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      include: {
        sessions: {
          where: { status: { not: "CLOSED" } },
          include: {
            waiter: { select: { id: true, name: true } },
            orders: { include: { items: true } },
            requests: { where: { status: { not: "DONE" } } },
            payments: true,
          },
        },
      },
    }),
    prisma.shift.findMany({
      where: { clockOutAt: null },
      include: { staff: { select: { id: true, name: true, role: true, station: true } } },
      orderBy: { clockInAt: "asc" },
    }),
    prisma.payment.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { amountKobo: true, tipKobo: true } }),
    prisma.order.findMany({
      where: { placedAt: { gte: start, lt: end }, status: { notIn: ["REJECTED", "CANCELLED"] } },
      select: { placedAt: true, acceptedAt: true, placedByStaffId: true },
    }),
    prisma.rating.findMany({
      where: { createdAt: { gte: start, lt: end }, OR: [{ foodRating: { lte: 2 } }, { serviceRating: { lte: 2 } }] },
      include: { session: { select: { table: { select: { label: true } } } }, waiter: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activityEvent.findMany({
      orderBy: { at: "desc" },
      take: 25,
      include: { staff: { select: { name: true } } },
    }),
  ]);

  const tableLabels = new Map(tables.map((t) => [t.id, t.label]));
  const alerts: { kind: string; message: string; since: Date; tableLabel: string }[] = [];

  const floor = tables.map((t) => {
    const s = t.sessions[0];
    if (!s) return { id: t.id, label: t.label, area: t.area, seats: t.seats, state: "free" as TableState, session: null };
    const live = s.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
    const bill = computeBill({ orders: live, vatBps: s.vatBps, serviceChargeBps: s.serviceChargeBps, payments: s.payments });
    const placed = live.filter((o) => o.status === "PLACED");
    const paying = live.filter((o) => o.status === "AWAITING_PAYMENT");
    const ready = live.filter((o) => o.status === "READY" || o.items.some((i) => i.status === "READY"));
    const preparing = live.filter((o) => o.status === "ACCEPTED");
    let state: TableState = "seated";
    if (placed.length) state = "waiting";
    else if (paying.length) state = "paying";
    else if (ready.length) state = "ready";
    else if (s.status === "BILL_REQUESTED") state = "bill";
    else if (preparing.length) state = "preparing";
    else if (s.status === "PAID") state = "paid";
    else if (live.length) state = "served";

    for (const o of placed.filter((o) => o.escalatedAt)) {
      alerts.push({ kind: "unclaimed", message: `Order #${o.seq} not claimed`, since: o.placedAt, tableLabel: t.label });
    }
    for (const o of live.filter((o) => o.readyAlertAt && o.status === "READY")) {
      alerts.push({ kind: "ready", message: `Order #${o.seq} waiting at the pass`, since: o.readyAt ?? now, tableLabel: t.label });
    }
    for (const r of s.requests.filter((r) => r.escalatedAt && r.status === "OPEN")) {
      alerts.push({ kind: "request", message: `${r.type.replace("_", " ").toLowerCase()} not answered`, since: r.createdAt, tableLabel: t.label });
    }

    const oldestPlaced = placed[0]?.placedAt ?? null;
    return {
      id: t.id,
      label: t.label,
      area: t.area,
      seats: t.seats,
      state,
      session: {
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        waiter: s.waiter,
        totalKobo: bill.total,
        balanceKobo: bill.balance,
        orders: live.length,
        waitingSince: oldestPlaced,
        openRequests: s.requests.map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.createdAt })),
      },
    };
  });

  const ownedCount = new Map<string, number>();
  for (const t of floor) if (t.session?.waiter) ownedCount.set(t.session.waiter.id, (ownedCount.get(t.session.waiter.id) ?? 0) + 1);

  const claimTimes = todayOrders.filter((o) => o.acceptedAt && !o.placedByStaffId).map((o) => secondsBetween(o.placedAt, o.acceptedAt!));

  return {
    tables: floor,
    onShift: shifts.map((s) => ({
      staffId: s.staff.id,
      name: s.staff.name,
      role: s.staff.role,
      station: s.staff.station,
      since: s.clockInAt,
      tables: ownedCount.get(s.staff.id) ?? 0,
    })),
    alerts: [
      ...alerts,
      ...lowRatings.map((r) => ({
        kind: "rating",
        message: `Rated food ${r.foodRating}★ · service ${r.serviceRating}★${r.waiter ? ` (${r.waiter.name})` : ""}`,
        since: r.createdAt,
        tableLabel: r.session.table.label,
      })),
    ].sort((a, b) => a.since.getTime() - b.since.getTime()),
    today: {
      revenueKobo: todayPayments.reduce((a, p) => a + p.amountKobo, 0),
      tipsKobo: todayPayments.reduce((a, p) => a + p.tipKobo, 0),
      orders: todayOrders.length,
      medianClaimSec: median(claimTimes),
      openTables: floor.filter((t) => t.session).length,
    },
    events: events.map((e) => ({
      id: e.id,
      at: e.at,
      action: e.action,
      actor: e.staff?.name ?? (e.actorType === "CUSTOMER" ? "Guest" : "System"),
      table: e.tableId ? (tableLabels.get(e.tableId) ?? null) : null,
      data: e.data,
    })),
  };
}

export type FloorView = Awaited<ReturnType<typeof floorView>>;
