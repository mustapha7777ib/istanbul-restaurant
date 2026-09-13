import { Crown, Tv } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { formatNaira } from "@/lib/money";
import { formatDuration, formatMonth, lagosMonthKey, previousMonthKey } from "@/lib/time";
import { awardHistory } from "@/services/awards";
import { kitchenLeaderboard, waiterLeaderboard } from "@/services/metrics";
import { PageBody, PageHeader } from "../page-header";
import { AwardButton, MonthPicker } from "./award-controls";

export const metadata: Metadata = { title: "Staff of the Month" };

const COMPONENTS = [
  ["rating", "Ratings"],
  ["speed", "Speed"],
  ["productivity", "Orders/hr"],
  ["responsiveness", "Requests"],
  ["reliability", "Reliability"],
] as const;

export default async function AwardsPage({ searchParams }: PageProps<"/admin/awards">) {
  await requireStaff(MANAGER_ROLES);
  const { month: m } = await searchParams;
  const current = lagosMonthKey();
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : current;
  const [waiters, kitchen, history] = await Promise.all([waiterLeaderboard(month), kitchenLeaderboard(month), awardHistory()]);
  const months = [current, previousMonthKey(current), previousMonthKey(previousMonthKey(current)), previousMonthKey(previousMonthKey(previousMonthKey(current)))];
  const awarded = history.filter((h) => h.month === month);
  const winnerOf = (cat: "WAITER" | "KITCHEN") => awarded.find((a) => a.category === cat);

  return (
    <>
      <PageHeader
        title="Staff of the Month"
        description="Ranked from real data: guest ratings, speed, orders handled, responsiveness and cash accuracy."
        actions={
          <>
            <MonthPicker months={months} value={month} />
            <Link href="/fame" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">
              <Tv className="size-4" /> Wall of Fame
            </Link>
          </>
        }
      />
      <PageBody>
        {month === current ? <p className="text-sm text-ink-500">{formatMonth(month)} is still in progress — scores will change until the month ends.</p> : null}

        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-bold">Waiters · {formatMonth(month)}</h2>
            {winnerOf("WAITER") ? (
              <Badge tone="brand">
                <Crown className="size-3.5" /> Awarded to {winnerOf("WAITER")!.staff.name}
              </Badge>
            ) : null}
          </div>
          <table className="mt-2 w-full min-w-[980px] whitespace-nowrap text-sm">
            <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Waiter</th>
                <th className="px-3 py-2 text-right">Score</th>
                {COMPONENTS.map(([k, l]) => (
                  <th key={k} className="px-2 py-2">
                    {l}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Served</th>
                <th className="px-3 py-2 text-right">Rating</th>
                <th className="px-3 py-2 text-right">Accept</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2 text-right">Tips</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linen-200">
              {waiters.map((w, i) => (
                <tr key={w.staffId} className={w.eligible ? "" : "text-ink-500/70"}>
                  <td className="px-3 py-2 font-bold">{w.eligible ? i + 1 : "–"}</td>
                  <td className="px-3 py-2 font-semibold">
                    <Link href={`/admin/staff/${w.staffId}`} className="hover:underline">
                      {w.name}
                    </Link>
                    {!w.eligible ? <span className="block text-xs font-normal">below minimum hours/orders</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right text-lg font-black tabular-nums">{w.score ?? "—"}</td>
                  {COMPONENTS.map(([k]) => (
                    <td key={k} className="px-2 py-2">
                      <div className="h-1.5 w-12 rounded-full bg-linen-100" title={`${w.components[k]}`}>
                        <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${w.components[k]}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-ink-500">{w.components[k]}</span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{w.ordersServed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{w.ratingAvg ? `${w.ratingAvg.toFixed(1)}★ (${w.ratingCount})` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(w.medianClaimSec)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{w.hours.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNaira(w.tipsKobo)}</td>
                  <td className="px-3 py-2 text-right">{w.eligible ? <AwardButton month={month} category="WAITER" staffId={w.staffId} name={w.name} /> : null}</td>
                </tr>
              ))}
              {waiters.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-6 text-center text-ink-500">
                    No waiter activity this month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-bold">Kitchen & bar · {formatMonth(month)}</h2>
            {winnerOf("KITCHEN") ? (
              <Badge tone="brand">
                <Crown className="size-3.5" /> Awarded to {winnerOf("KITCHEN")!.staff.name}
              </Badge>
            ) : null}
          </div>
          <table className="mt-2 w-full min-w-[640px] whitespace-nowrap text-sm">
            <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Tickets</th>
                <th className="px-3 py-2 text-right">Median prep</th>
                <th className="px-3 py-2 text-right">On time</th>
                <th className="px-3 py-2 text-right">Hours</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linen-200">
              {kitchen.map((k, i) => (
                <tr key={k.staffId} className={k.eligible ? "" : "text-ink-500/70"}>
                  <td className="px-3 py-2 font-bold">{k.eligible ? i + 1 : "–"}</td>
                  <td className="px-3 py-2 font-semibold">
                    {k.name} <span className="text-xs font-normal text-ink-500">{k.station?.toLowerCase()}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-lg font-black tabular-nums">{k.score ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{k.ticketsCompleted}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(k.medianPrepSec)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{k.onTimePct != null ? `${k.onTimePct}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{k.hours.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">{k.eligible ? <AwardButton month={month} category="KITCHEN" staffId={k.staffId} name={k.name} /> : null}</td>
                </tr>
              ))}
              {kitchen.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink-500">
                    No kitchen activity this month yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <h2 className="font-bold">Past winners</h2>
          <ul className="mt-2 divide-y divide-linen-200 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{formatMonth(h.month)}</span> · {h.category === "WAITER" ? "Waiter" : "Kitchen & bar"}:{" "}
                  <span className="font-semibold">{h.staff.name}</span>
                  {h.note ? <span className="italic text-ink-500"> — “{h.note}”</span> : null}
                </span>
                <span className="text-ink-500">
                  score {h.score} · by {h.awardedBy.name}
                </span>
              </li>
            ))}
            {history.length === 0 ? <li className="py-2 text-ink-500">No awards yet.</li> : null}
          </ul>
        </Card>
      </PageBody>
    </>
  );
}
