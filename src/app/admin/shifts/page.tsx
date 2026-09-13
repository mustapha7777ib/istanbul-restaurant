import type { Metadata } from "next";
import { Badge, Card, Input } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { daysAgo, formatDateTime, lagosDateKey, lagosDateRange } from "@/lib/time";
import { PageBody, PageHeader } from "../page-header";
import { ReconcileButtons } from "./reconcile-buttons";

export const metadata: Metadata = { title: "Shifts & cash" };

export default async function ShiftsPage({ searchParams }: PageProps<"/admin/shifts">) {
  await requireStaff(MANAGER_ROLES);
  const sp = await searchParams;
  const today = lagosDateKey();
  const weekAgo = lagosDateKey(daysAgo(6));
  const from = typeof sp.from === "string" ? sp.from : weekAgo;
  const to = typeof sp.to === "string" ? sp.to : today;
  const { start, end } = lagosDateRange(from, to);

  const [pending, shifts] = await Promise.all([
    prisma.shift.findMany({
      where: { clockOutAt: { not: null }, reconcileStatus: "PENDING", payments: { some: {} } },
      include: { staff: { select: { name: true, staffCode: true } }, payments: { select: { amountKobo: true, tipKobo: true, method: true } } },
      orderBy: { clockOutAt: "asc" },
    }),
    prisma.shift.findMany({
      where: { clockInAt: { gte: start, lt: end } },
      include: { staff: { select: { name: true, role: true } }, reconciledBy: { select: { name: true } }, payments: { select: { amountKobo: true, method: true } } },
      orderBy: { clockInAt: "desc" },
    }),
  ]);

  const hoursByStaff = new Map<string, { name: string; role: string; hours: number; shifts: number }>();
  for (const s of shifts) {
    const h = ((s.clockOutAt ?? new Date()).getTime() - s.clockInAt.getTime()) / 3_600_000;
    const cur = hoursByStaff.get(s.staffId) ?? { name: s.staff.name, role: s.staff.role, hours: 0, shifts: 0 };
    cur.hours += h;
    cur.shifts += 1;
    hoursByStaff.set(s.staffId, cur);
  }
  const cashOf = (p: { amountKobo: number; method: string }[]) => p.filter((x) => x.method === "CASH").reduce((a, x) => a + x.amountKobo, 0);

  return (
    <>
      <PageHeader title="Shifts & cash" description="Check each waiter's cash against the payments they recorded, and see who worked when." />
      <PageBody>
        <Card className="p-4">
          <h2 className="font-bold">Waiting for cash check ({pending.length})</h2>
          {pending.length === 0 ? <p className="mt-2 text-sm text-ink-500">All shifts with payments are reconciled. 👍</p> : null}
          <div className="mt-3 space-y-3">
            {pending.map((s) => {
              const expected = cashOf(s.payments);
              const pos = s.payments.filter((p) => p.method === "POS").reduce((a, p) => a + p.amountKobo, 0);
              const transfer = s.payments.filter((p) => p.method === "TRANSFER").reduce((a, p) => a + p.amountKobo, 0);
              const diff = s.cashDeclaredKobo == null ? null : s.cashDeclaredKobo - expected;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-linen-50 p-3 ring-1 ring-linen-300">
                  <div>
                    <p className="font-semibold">
                      {s.staff.name} <span className="font-mono text-xs text-ink-500">{s.staff.staffCode}</span>
                    </p>
                    <p className="text-xs text-ink-500">
                      {formatDateTime(s.clockInAt)} → {formatDateTime(s.clockOutAt!)}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-ink-500">Cash expected</dt>
                      <dd className="font-bold">{formatNaira(expected)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Cash declared</dt>
                      <dd className="font-bold">{s.cashDeclaredKobo == null ? "—" : formatNaira(s.cashDeclaredKobo)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">Difference</dt>
                      <dd className={`font-bold ${diff == null ? "" : diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-600" : "text-moss-600"}`}>
                        {diff == null ? "—" : diff === 0 ? "Exact" : `${diff > 0 ? "+" : "−"}${formatNaira(Math.abs(diff))}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-500">POS / transfer</dt>
                      <dd>
                        {formatNaira(pos)} / {formatNaira(transfer)}
                      </dd>
                    </div>
                  </dl>
                  <ReconcileButtons shiftId={s.id} />
                </div>
              );
            })}
          </div>
        </Card>

        <form className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-ink-600">From</span>
            <Input type="date" name="from" defaultValue={from} max={today} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-ink-600">To</span>
            <Input type="date" name="to" defaultValue={to} max={today} />
          </label>
          <button className="h-11 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">Show</button>
        </form>

        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <Card className="p-4">
            <h2 className="font-bold">Hours worked</h2>
            <ul className="mt-2 divide-y divide-linen-200 text-sm">
              {[...hoursByStaff.values()]
                .sort((a, b) => b.hours - a.hours)
                .map((h) => (
                  <li key={h.name} className="flex justify-between py-2">
                    <span>
                      {h.name} <span className="text-xs text-ink-500/70">{h.role.toLowerCase()}</span>
                    </span>
                    <span className="tabular-nums">
                      {h.hours.toFixed(1)}h · {h.shifts} shift{h.shifts === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              {hoursByStaff.size === 0 ? <li className="py-2 text-ink-500">No shifts in this period.</li> : null}
            </ul>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">In</th>
                  <th className="px-4 py-3">Out</th>
                  <th className="px-4 py-3">Cash collected</th>
                  <th className="px-4 py-3">Declared</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linen-200">
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium">{s.staff.name}</td>
                    <td className="px-4 py-2 text-ink-600">{formatDateTime(s.clockInAt)}</td>
                    <td className="px-4 py-2 text-ink-600">{s.clockOutAt ? formatDateTime(s.clockOutAt) : <Badge tone="green">on shift</Badge>}</td>
                    <td className="px-4 py-2">{s.payments.length ? formatNaira(cashOf(s.payments)) : "—"}</td>
                    <td className="px-4 py-2">{s.cashDeclaredKobo != null ? formatNaira(s.cashDeclaredKobo) : "—"}</td>
                    <td className="px-4 py-2">
                      {!s.clockOutAt || !s.payments.length ? (
                        <span className="text-ink-500/70">—</span>
                      ) : (
                        <Badge tone={s.reconcileStatus === "CONFIRMED" ? "green" : s.reconcileStatus === "DISPUTED" ? "red" : "amber"}>
                          {s.reconcileStatus.toLowerCase()}
                          {s.reconciledBy ? ` · ${s.reconciledBy.name.split(" ")[0]}` : ""}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
