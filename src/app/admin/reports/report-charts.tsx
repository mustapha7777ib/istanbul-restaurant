"use client";

import { Card } from "@/components/ui";
import type { Json } from "@/lib/client/types";
import { formatNaira } from "@/lib/money";
import { formatDuration } from "@/lib/time";
import type { SalesReport } from "@/services/reports";
import { BarList, ColumnChart, Heatmap, StackedBar, VIZ } from "./charts";

const compactNaira = (kobo: number) => {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(n >= 100_000 ? 0 : n >= 10_000 ? 0 : 1)}K`;
  return `₦${n.toFixed(0)}`;
};

export function ReportCharts({ report: r, days }: { report: Json<SalesReport>; days: { key: string; label: string; value: number }[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="p-4 xl:col-span-2">
        <h2 className="font-bold">Revenue by day</h2>
        <p className="text-xs text-ink-500">Payments recorded by waiters, per day</p>
        {days.length > 1 ? (
          <>
            <div className="mt-3">
              <ColumnChart data={days} format={formatNaira} compact={compactNaira} ariaLabel="Revenue by day" />
            </div>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-500">View as table</summary>
              <table className="mt-2 w-full max-w-sm text-sm">
                <tbody className="divide-y divide-linen-200">
                  {days.map((d) => (
                    <tr key={d.key}>
                      <td className="py-1 text-ink-600">{d.label}</td>
                      <td className="py-1 text-right tabular-nums">{formatNaira(d.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <p className="mt-6 text-sm text-ink-500">Pick a range longer than one day to see the daily trend.</p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold">How guests paid</h2>
        <p className="mb-3 text-xs text-ink-500">Share of revenue by payment method</p>
        <StackedBar
          format={formatNaira}
          segments={[
            { label: "Card (POS)", value: r.byMethod.POS, color: VIZ.series1 },
            { label: "Cash", value: r.byMethod.CASH, color: VIZ.series2 },
            { label: "Bank transfer", value: r.byMethod.TRANSFER, color: VIZ.series3 },
          ]}
        />
      </Card>

      <Card className="p-4 xl:col-span-2">
        <h2 className="font-bold">Busiest times</h2>
        <p className="mb-3 text-xs text-ink-500">Orders placed by day of week and hour — plan staff rosters around the dark cells</p>
        <Heatmap grid={r.heat} />
      </Card>

      <Card className="p-4">
        <h2 className="font-bold">Revenue by area</h2>
        <p className="mb-3 text-xs text-ink-500">Where the money is made</p>
        {r.byArea.length ? <BarList rows={r.byArea.map((a) => ({ label: a.area, value: a.kobo }))} format={compactNaira} /> : <p className="text-sm text-ink-500">No payments yet.</p>}
      </Card>

      <Card className="p-4 xl:col-span-2">
        <h2 className="font-bold">Best sellers</h2>
        <p className="mb-3 text-xs text-ink-500">By quantity sold (voided items excluded)</p>
        {r.bestSellers.length ? (
          <BarList rows={r.bestSellers.map((b) => ({ label: b.name, value: b.qty }))} format={(v) => `${v} sold`} extra={(i) => formatNaira(r.bestSellers[i].revenueKobo)} />
        ) : (
          <p className="text-sm text-ink-500">No orders in this period.</p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-bold">Slowest from the kitchen</h2>
        <p className="mb-3 text-xs text-ink-500">Median time from accepted to ready</p>
        {r.slowest.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-linen-200">
              {r.slowest.map((s) => (
                <tr key={s.name}>
                  <td className="py-1.5 text-ink-700">{s.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatDuration(s.medianPrepSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-ink-500">Not enough kitchen data yet.</p>
        )}
      </Card>
    </div>
  );
}
