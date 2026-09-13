import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatMonth, lagosMonthKey, lagosMonthRange } from "@/lib/time";
import { PageBody, PageHeader } from "../page-header";

export const metadata: Metadata = { title: "Guest feedback" };

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default async function FeedbackPage({ searchParams }: PageProps<"/admin/feedback">) {
  await requireStaff(MANAGER_ROLES);
  const { low } = await searchParams;
  const lowOnly = low === "1";
  const month = lagosMonthKey();
  const { start, end } = lagosMonthRange(month);
  const [ratings, monthAgg, byWaiter] = await Promise.all([
    prisma.rating.findMany({
      where: lowOnly ? { OR: [{ foodRating: { lte: 2 } }, { serviceRating: { lte: 2 } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { waiter: { select: { name: true } }, session: { select: { table: { select: { label: true } } } } },
    }),
    prisma.rating.aggregate({ where: { createdAt: { gte: start, lt: end } }, _avg: { foodRating: true, serviceRating: true }, _count: true }),
    prisma.rating.groupBy({
      by: ["waiterId"],
      where: { createdAt: { gte: start, lt: end }, waiterId: { not: null } },
      _avg: { serviceRating: true },
      _count: true,
    }),
  ]);
  const names = new Map((await prisma.staff.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title="Guest feedback" description="Ratings guests give after paying. Low ratings alert managers the moment they're sent." />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Food · {formatMonth(month)}</p>
            <p className="text-2xl font-bold">{monthAgg._avg.foodRating ? `${monthAgg._avg.foodRating.toFixed(2)}★` : "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Service · {formatMonth(month)}</p>
            <p className="text-2xl font-bold">{monthAgg._avg.serviceRating ? `${monthAgg._avg.serviceRating.toFixed(2)}★` : "—"}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Ratings this month</p>
            <p className="text-2xl font-bold">{monthAgg._count}</p>
          </Card>
        </div>
        {byWaiter.length ? (
          <Card className="p-4">
            <h2 className="font-bold">Service rating by waiter · {formatMonth(month)}</h2>
            <ul className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {byWaiter
                .sort((a, b) => (b._avg.serviceRating ?? 0) - (a._avg.serviceRating ?? 0))
                .map((w) => (
                  <li key={w.waiterId} className="flex justify-between">
                    <span>{names.get(w.waiterId!)}</span>
                    <span className="tabular-nums">
                      {w._avg.serviceRating?.toFixed(2)}★ <span className="text-ink-500/70">({w._count})</span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ) : null}
        <div className="flex gap-2 text-sm">
          <Link href="/admin/feedback" className={`rounded-full px-3 py-1 font-semibold ${!lowOnly ? "bg-ink-900 text-white" : "bg-white ring-1 ring-linen-300"}`}>
            All
          </Link>
          <Link href="/admin/feedback?low=1" className={`rounded-full px-3 py-1 font-semibold ${lowOnly ? "bg-ink-900 text-white" : "bg-white ring-1 ring-linen-300"}`}>
            Low ratings (2★ or less)
          </Link>
        </div>
        <Card className="divide-y divide-linen-200">
          {ratings.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm">
                  <span className="font-semibold">{r.session.table.label}</span>
                  <span className="text-ink-500"> · {formatDateTime(r.createdAt)} · {r.waiter?.name ?? "no waiter"}</span>
                </p>
                {r.comment ? <p className="mt-1 italic text-ink-700">“{r.comment}”</p> : null}
              </div>
              <div className="text-right text-sm">
                <p className={r.foodRating <= 2 ? "text-red-600" : "text-brand-600"}>Food {stars(r.foodRating)}</p>
                <p className={r.serviceRating <= 2 ? "text-red-600" : "text-brand-600"}>Service {stars(r.serviceRating)}</p>
              </div>
            </div>
          ))}
          {ratings.length === 0 ? <p className="px-4 py-8 text-center text-ink-500">No ratings yet.</p> : null}
        </Card>
      </PageBody>
    </>
  );
}
