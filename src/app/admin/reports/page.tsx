import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, Input } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { formatNaira } from "@/lib/money";
import { daysAgo, formatDate, formatDuration, lagosDateKey, lagosDateRange, lagosMonthRange, lagosMonthKey } from "@/lib/time";
import { salesReport } from "@/services/reports";
import { PageBody, PageHeader } from "../page-header";
import { ReportCharts } from "./report-charts";

export const metadata: Metadata = { title: "Reports" };

const naira0 = (kobo: number) => formatNaira(Math.round(kobo / 100) * 100);

function presets() {
  const today = lagosDateKey();
  const ago = (n: number) => lagosDateKey(daysAgo(n));
  const monthStart = lagosDateKey(lagosMonthRange(lagosMonthKey()).start);
  return [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: ago(6), to: today },
    { label: "Last 30 days", from: ago(29), to: today },
    { label: "This month", from: monthStart, to: today },
  ];
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireStaff(MANAGER_ROLES);
  const sp = await searchParams;
  const p = presets();
  const from = typeof sp.from === "string" ? sp.from : p[1].from;
  const to = typeof sp.to === "string" ? sp.to : p[1].to;
  const { start, end } = lagosDateRange(from, to);
  const report = await salesReport(start, end);

  // Fill every day in the range so quiet days show as zero, not as gaps.
  const days: { key: string; label: string; value: number }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += 86400_000) {
    const key = lagosDateKey(new Date(t + 3600_000));
    const found = report.byDay.find((d) => d.day === key);
    days.push({ key, label: formatDate(new Date(t + 3600_000)).replace(/ \d{4}$/, ""), value: found?.kobo ?? 0 });
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatDate(start)} – ${formatDate(new Date(end.getTime() - 1))} · Africa/Lagos time`}
        actions={
          <a href={`/api/admin/reports/csv?from=${from}&to=${to}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold ring-1 ring-linen-300">
            <Download className="size-4" /> Export orders (CSV)
          </a>
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-end gap-2">
          {p.map((x) => (
            <Link
              key={x.label}
              href={`/admin/reports?from=${x.from}&to=${x.to}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${x.from === from && x.to === to ? "bg-ink-900 text-white" : "bg-white ring-1 ring-linen-300"}`}
            >
              {x.label}
            </Link>
          ))}
          <form className="ml-auto flex items-end gap-2">
            <Input type="date" name="from" defaultValue={from} className="h-9 w-auto text-sm" />
            <Input type="date" name="to" defaultValue={to} className="h-9 w-auto text-sm" />
            <button className="h-9 rounded-xl bg-ink-900 px-3 text-sm font-semibold text-white">Apply</button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="col-span-2 p-5">
            <p className="text-sm text-ink-500">Revenue collected</p>
            <p className="mt-1 text-5xl font-bold text-ink-900">{naira0(report.revenueKobo)}</p>
            <p className="mt-1 text-sm text-ink-500">
              plus {naira0(report.tipsKobo)} in tips
            </p>
          </Card>
          <Stat label="Orders" value={report.orders.toLocaleString("en-NG")} sub={report.rejectedOrCancelled ? `${report.rejectedOrCancelled} declined/cancelled` : undefined} />
          <Stat label="Paid visits" value={report.visits.toLocaleString("en-NG")} sub={`avg ${naira0(report.avgVisitKobo)} per table`} />
          <Stat label="Median time at table" value={formatDuration(report.medianTableSec)} />
          <Stat label="Median time to accept an order" value={formatDuration(report.medianClaimSec)} />
          <Stat label="Comps given" value={naira0(report.voidsKobo.COMP)} />
          <Stat label="Other voids" value={naira0(report.voidsKobo.other)} />
        </div>

        <ReportCharts report={JSON.parse(JSON.stringify(report))} days={days} />
      </PageBody>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
      {sub ? <p className="text-xs text-ink-500">{sub}</p> : null}
    </Card>
  );
}
