import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, Input, Select, type BadgeTone } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { formatDate, formatDuration, formatTime, lagosDateKey, lagosDateRange } from "@/lib/time";
import { ORDER_FILTERS, orderLog, type OrderFilter } from "@/services/reports";
import { PageBody, PageHeader } from "../page-header";

export const metadata: Metadata = { title: "Orders & payments" };

const FILTER_LABELS: Record<OrderFilter, string> = {
  all: "All",
  unpaid: "Not paid yet",
  kitchen: "In the kitchen",
  served: "Served",
  cancelled: "Declined / cancelled",
};

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PLACED: { label: "Waiting for a waiter", tone: "red" },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "amber" },
  ACCEPTED: { label: "In the kitchen", tone: "blue" },
  READY: { label: "Ready", tone: "green" },
  SERVED: { label: "Served", tone: "stone" },
  REJECTED: { label: "Declined", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

const METHOD: Record<string, string> = { CASH: "Cash", POS: "Card (POS)", TRANSFER: "Transfer" };

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireStaff(MANAGER_ROLES);
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const date = get("date") || lagosDateKey();
  const filter = (get("show") in ORDER_FILTERS ? get("show") : "all") as OrderFilter;
  const waiterId = get("waiter");
  const { start, end } = lagosDateRange(date, date);
  const [{ rows, summary }, waiters] = await Promise.all([
    orderLog(start, end, { filter, waiterId: waiterId || undefined }),
    prisma.staff.findMany({ where: { role: "WAITER" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const link = (show: OrderFilter) => `/admin/orders?${new URLSearchParams({ date, show, ...(waiterId && { waiter: waiterId }) })}`;

  return (
    <>
      <PageHeader
        title="Orders & payments"
        description={`${formatDate(start)} · every order, who took the money and how, and how long each step took`}
        actions={
          <a href={`/api/admin/reports/csv?from=${date}&to=${date}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold ring-1 ring-linen-300">
            <Download className="size-4" /> Export (CSV)
          </a>
        }
      />
      <PageBody>
        <form className="flex flex-wrap items-end gap-2">
          <Input type="date" name="date" defaultValue={date} max={lagosDateKey()} className="h-10 w-auto" />
          <Select name="waiter" defaultValue={waiterId} className="h-10 w-auto">
            <option value="">All waiters</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <input type="hidden" name="show" value={filter} />
          <button className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">Show</button>
        </form>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-4">
            <p className="text-sm text-ink-500">Orders</p>
            <p className="mt-1 text-3xl font-bold">{summary.orders}</p>
            {summary.cancelled ? <p className="text-xs text-ink-500">+ {summary.cancelled} declined or cancelled</p> : null}
          </Card>
          <Card className="p-4">
            <p className="text-sm text-ink-500">Money collected</p>
            <p className="mt-1 text-3xl font-bold">{formatNaira(summary.collectedKobo)}</p>
            {summary.tipsKobo ? <p className="text-xs text-ink-500">plus {formatNaira(summary.tipsKobo)} in tips</p> : null}
          </Card>
          <Card className="p-4">
            <p className="text-sm text-ink-500">By method</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {Object.entries(summary.byMethod).map(([m, kobo]) => (
                <li key={m} className="flex justify-between gap-2">
                  <span className="text-ink-600">{METHOD[m]}</span>
                  <span className="font-semibold tabular-nums">{formatNaira(kobo)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className={summary.unpaidKobo ? "p-4 ring-2 ring-amber-300" : "p-4"}>
            <p className="text-sm text-ink-500">Not paid yet</p>
            <p className="mt-1 text-3xl font-bold">{formatNaira(summary.unpaidKobo)}</p>
            <p className="text-xs text-ink-500">Orders waiting for a waiter or for payment</p>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as OrderFilter[]).map((f) => (
            <Link
              key={f}
              href={link(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${f === filter ? "bg-ink-900 text-white" : "bg-white ring-1 ring-linen-300"}`}
            >
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">How long</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linen-200 align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="font-semibold">
                      #{r.seq} · {r.table}
                    </p>
                    <p className="text-ink-500">{formatTime(r.placedAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="space-y-0.5">
                      {r.items.map((i, n) => (
                        <li key={n}>
                          {i.label}
                          {i.options ? <span className="text-ink-500"> · {i.options}</span> : null}
                        </li>
                      ))}
                    </ul>
                    {r.voidedItems ? <p className="text-xs text-red-700">{r.voidedItems} item(s) voided</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{formatNaira(r.totalKobo)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.payment ? (
                      <>
                        <p className="font-medium text-moss-700">
                          {METHOD[r.payment.method]} · {formatNaira(r.payment.amountKobo)}
                        </p>
                        <p className="text-ink-500">
                          by {r.payment.by} · {formatTime(r.payment.at)}
                        </p>
                        {r.payment.tipKobo ? <p className="text-ink-500">tip {formatNaira(r.payment.tipKobo)}</p> : null}
                        {r.payment.reference ? <p className="text-ink-500">ref {r.payment.reference}</p> : null}
                      </>
                    ) : r.status === "PLACED" || r.status === "AWAITING_PAYMENT" ? (
                      <span className="font-medium text-amber-700">Not paid yet</span>
                    ) : r.status !== "REJECTED" && r.status !== "CANCELLED" ? (
                      <span className="text-ink-500">{r.paidAt ? "Covered by money already paid at the table" : "Paid with the table bill"}</span>
                    ) : (
                      <span className="text-ink-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-700">
                    <p>Ordered by {r.placedBy}</p>
                    {r.waiter ? <p>Accepted by {r.waiter}</p> : null}
                    {r.servedBy ? <p>Served by {r.servedBy}</p> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                    {r.acceptSec != null ? <p>Accepted in {formatDuration(r.acceptSec)}</p> : null}
                    {r.paySec != null ? <p>Paid {formatDuration(r.paySec)} later</p> : null}
                    {r.kitchenSec != null ? (
                      <p className={r.kitchenSec > r.estimateMinutes * 60 ? "font-medium text-red-700" : undefined}>
                        Kitchen {formatDuration(r.kitchenSec)} (target {r.estimateMinutes}m)
                      </p>
                    ) : null}
                    {r.serveSec != null ? <p>Served {formatDuration(r.serveSec)} after ready</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    {r.cancelReason ? <p className="mt-1 max-w-48 text-xs text-ink-500">{r.cancelReason}</p> : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-500">
                    No orders match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </PageBody>
    </>
  );
}
