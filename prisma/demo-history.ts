// OPTIONAL: fills the database with ~30 days of simulated service so Reports and
// Staff of the Month have something to show in a demo. Never run this on the live
// restaurant database — it creates fake orders, payments and ratings.
//
//   pnpm db:demo -- --yes
import "dotenv/config";
import { prisma } from "../src/lib/db";

if (!process.argv.includes("--yes")) {
  console.error("This adds FAKE history (orders, payments, ratings) for demos. Re-run with --yes to continue.");
  process.exit(1);
}

const DAY = 86_400_000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const weighted = <T,>(xs: [T, number][]) => {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[0][0];
};

async function main() {
  const [waiters, cooks, tables, menu, settings] = await Promise.all([
    prisma.staff.findMany({ where: { role: "WAITER", active: true } }),
    prisma.staff.findMany({ where: { role: "KITCHEN", active: true } }),
    prisma.table.findMany({ where: { active: true } }),
    prisma.menuItem.findMany({ where: { active: true } }),
    prisma.settings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);
  if (!waiters.length || !tables.length || !menu.length) throw new Error("Run `pnpm db:seed` first");
  const kitchenCook = cooks.find((c) => c.station !== "BAR") ?? cooks[0];
  const barCook = cooks.find((c) => c.station === "BAR") ?? cooks[0];

  // Each waiter gets a "personality" so the leaderboard has a story.
  const profile = new Map(
    waiters.map((w, i) => [w.id, { speed: [0.7, 1, 1.4, 1.1][i % 4], rating: [4.7, 4.3, 3.9, 4.5][i % 4], daysOff: [1, 2, 1, 3][i % 4] }]),
  );
  const food = menu.filter((m) => m.station === "KITCHEN");
  const drinks = menu.filter((m) => m.station === "BAR");
  const now = Date.now();
  let visits = 0;

  for (let d = 30; d >= 1; d--) {
    const dayStart = Math.floor((now - d * DAY) / DAY) * DAY - 3600_000; // Lagos midnight (UTC+1)
    const weekday = new Date(dayStart + 3600_000).getUTCDay();
    const working = waiters.filter((w) => (weekday + waiters.indexOf(w)) % 7 >= profile.get(w.id)!.daysOff);
    const shifts = new Map<string, string>();
    for (const w of [...working, ...(cooks.length ? cooks : [])]) {
      const s = await prisma.shift.create({
        data: {
          staffId: w.id,
          clockInAt: new Date(dayStart + 10 * 3600_000 + rand(-900_000, 900_000)),
          clockOutAt: new Date(dayStart + 22 * 3600_000 + rand(0, 1800_000)),
          reconcileStatus: Math.random() < 0.04 ? "DISPUTED" : "CONFIRMED",
        },
      });
      shifts.set(w.id, s.id);
    }
    const busy = weekday === 5 || weekday === 6 ? 1.6 : weekday === 0 ? 1.3 : 1;
    const count = Math.round(rand(14, 22) * busy);
    for (let v = 0; v < count; v++) {
      const hour = weighted<number>([[12, 2], [13, 4], [14, 3], [15, 1], [16, 1], [17, 2], [18, 4], [19, 6], [20, 6], [21, 3], [22, 1]]);
      const opened = dayStart + hour * 3600_000 + rand(0, 3600_000);
      const table = pick(tables);
      const waiter = pick(working.length ? working : waiters);
      const p = profile.get(waiter.id)!;
      const claimSec = Math.max(8, rand(20, 110) * p.speed);
      const placed = opened + rand(120_000, 480_000);
      const accepted = placed + claimSec * 1000;
      const lines = [
        ...Array.from({ length: Math.ceil(rand(1, 4)) }, () => pick(food)),
        ...Array.from({ length: Math.ceil(rand(1, 3)) }, () => pick(drinks)),
      ];
      const items = lines.map((m) => {
        const prepMs = (m.prepMinutes * rand(0.6, 1.35) + rand(0, 3)) * 60_000;
        const ready = accepted + prepMs;
        const served = ready + Math.max(20, rand(30, 200) * p.speed) * 1000;
        return { m, ready, served, qty: Math.random() < 0.25 ? 2 : 1, voided: Math.random() < 0.02 };
      });
      const servedAt = Math.max(...items.map((i) => i.served));
      const readyAt = Math.max(...items.map((i) => i.ready));
      const subtotal = items.filter((i) => !i.voided).reduce((s, i) => s + i.m.priceKobo * i.qty, 0);
      const svc = Math.round((subtotal * settings.serviceChargeBps) / 10000);
      const total = subtotal + svc + Math.round(((subtotal + svc) * settings.vatBps) / 10000);
      const paidAt = servedAt + rand(20, 60) * 60_000;
      const closedAt = paidAt + rand(5, 20) * 60_000;

      const session = await prisma.tableSession.create({
        data: {
          tableId: table.id,
          waiterId: waiter.id,
          status: "CLOSED",
          vatBps: settings.vatBps,
          serviceChargeBps: settings.serviceChargeBps,
          openedAt: new Date(opened),
          billRequestedAt: new Date(paidAt - 300_000),
          paidAt: new Date(paidAt),
          closedAt: new Date(closedAt),
          closedById: waiter.id,
        },
      });
      await prisma.order.create({
        data: {
          sessionId: session.id,
          tableId: table.id,
          status: "SERVED",
          waiterId: waiter.id,
          servedById: waiter.id,
          placedAt: new Date(placed),
          acceptedAt: new Date(accepted),
          readyAt: new Date(readyAt),
          servedAt: new Date(servedAt),
          items: {
            create: items.map((i) => ({
              menuItemId: i.m.id,
              name: i.m.name,
              unitPriceKobo: i.m.priceKobo,
              qty: i.qty,
              station: i.m.station,
              prepMinutes: i.m.prepMinutes,
              status: i.voided ? "VOIDED" : "SERVED",
              startedAt: new Date(accepted + 60_000),
              readyAt: new Date(i.ready),
              servedAt: i.voided ? null : new Date(i.served),
              preparedById: i.m.station === "BAR" ? barCook?.id : kitchenCook?.id,
              ...(i.voided ? { voidReason: "COMP", voidedAt: new Date(i.ready), voidedById: waiter.id } : {}),
            })),
          },
        },
      });
      const method = weighted<"POS" | "CASH" | "TRANSFER">([["POS", 55], ["CASH", 28], ["TRANSFER", 17]]);
      await prisma.payment.create({
        data: {
          sessionId: session.id,
          amountKobo: total,
          tipKobo: Math.random() < 0.3 ? Math.round(rand(5, 20)) * 10000 : 0,
          method,
          reference: method === "CASH" ? null : `DEMO${Math.floor(rand(1000, 9999))}`,
          collectedById: waiter.id,
          shiftId: shifts.get(waiter.id) ?? null,
          status: "CONFIRMED",
          createdAt: new Date(paidAt),
        },
      });
      if (Math.random() < 0.45) {
        const service = Math.max(1, Math.min(5, Math.round(p.rating + rand(-1.2, 0.8))));
        await prisma.rating.create({
          data: {
            sessionId: session.id,
            waiterId: waiter.id,
            foodRating: Math.max(2, Math.min(5, Math.round(rand(3.4, 5.4)))),
            serviceRating: service,
            comment: service <= 2 ? pick(["Waited too long for the bill", "Order came out wrong"]) : Math.random() < 0.3 ? pick(["Lovely service!", "Jollof was top-notch", "Very attentive waiter", "Great ambience"]) : null,
            createdAt: new Date(paidAt + 120_000),
          },
        });
      }
      await prisma.activityEvent.createMany({
        data: [
          { at: new Date(placed), actorType: "CUSTOMER", action: "ORDER_PLACED", entityType: "TableSession", entityId: session.id, tableId: table.id, sessionId: session.id, data: { demo: true, totalKobo: subtotal, items: items.length } },
          { at: new Date(accepted), actorType: "STAFF", staffId: waiter.id, action: "ORDER_CLAIMED", entityType: "TableSession", entityId: session.id, tableId: table.id, sessionId: session.id, data: { demo: true, claimSeconds: Math.round(claimSec) } },
          { at: new Date(paidAt), actorType: "STAFF", staffId: waiter.id, action: "PAYMENT_RECORDED", entityType: "TableSession", entityId: session.id, tableId: table.id, sessionId: session.id, data: { demo: true, amountKobo: total, method } },
        ],
      });
      visits++;
    }
  }
  console.log(`Added ${visits} simulated visits over the last 30 days (demo data).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
