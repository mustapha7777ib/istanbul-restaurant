import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { formatDateTime, formatDuration, formatMonth, lagosMonthKey } from "@/lib/time";
import { kitchenLeaderboard, waiterLeaderboard } from "@/services/metrics";
import { PageBody, PageHeader } from "../../page-header";
import { describeEvent } from "../../activity/describe";

export const metadata: Metadata = { title: "Staff profile" };

export default async function StaffProfile({ params }: PageProps<"/admin/staff/[id]">) {
  await requireStaff(MANAGER_ROLES);
  const { id } = await params;
  const staff = await prisma.staff.findUnique({ where: { id } });
  if (!staff) notFound();
  const month = lagosMonthKey();
  const [shifts, events, board] = await Promise.all([
    prisma.shift.findMany({ where: { staffId: id }, orderBy: { clockInAt: "desc" }, take: 15 }),
    prisma.activityEvent.findMany({ where: { staffId: id }, orderBy: { at: "desc" }, take: 40 }),
    staff.role === "WAITER" ? waiterLeaderboard(month) : staff.role === "KITCHEN" ? kitchenLeaderboard(month) : Promise.resolve([]),
  ]);
  const tables = await prisma.table.findMany({ select: { id: true, label: true } });
  const labels = new Map(tables.map((t) => [t.id, t.label]));
  const row = board.find((r) => r.staffId === id) as Record<string, unknown> | undefined;
  const hours = shifts.reduce((h, s) => h + ((s.clockOutAt ?? new Date()).getTime() - s.clockInAt.getTime()) / 3_600_000, 0);

  return (
    <>
      <div className="px-4 pt-6 lg:px-8">
        <Link href="/admin/staff" className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="size-4" /> All staff
        </Link>
      </div>
      <PageHeader title={staff.name} description={`${staff.staffCode} · ${staff.role.toLowerCase()}${staff.station ? ` (${staff.station.toLowerCase()})` : ""}${staff.active ? "" : " · inactive"}`} />
      <PageBody>
        {row ? (
          <Card className="p-4">
            <h2 className="font-bold">{formatMonth(month)} so far</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {staff.role === "WAITER" ? (
                <>
                  <Stat label="Score" value={row.score != null ? String(row.score) : "Not yet eligible"} />
                  <Stat label="Orders served" value={String(row.ordersServed)} />
                  <Stat label="Median accept time" value={formatDuration(row.medianClaimSec as number | null)} />
                  <Stat label="Median ready→served" value={formatDuration(row.medianServeSec as number | null)} />
                  <Stat label="Service rating" value={row.ratingAvg ? `${(row.ratingAvg as number).toFixed(2)}★ (${row.ratingCount})` : "—"} />
                  <Stat label="Tips" value={formatNaira(row.tipsKobo as number)} />
                  <Stat label="Sales on tables" value={formatNaira(row.salesKobo as number)} />
                  <Stat label="Hours" value={(row.hours as number).toFixed(1)} />
                  <Stat label="Request response" value={formatDuration(row.medianRequestAckSec as number | null)} />
                  <Stat label="Voids on orders" value={String(row.voids)} />
                  <Stat label="Disputed shifts" value={String(row.disputedShifts)} />
                </>
              ) : (
                <>
                  <Stat label="Score" value={row.score != null ? String(row.score) : "Not yet eligible"} />
                  <Stat label="Tickets completed" value={String(row.ticketsCompleted)} />
                  <Stat label="Items completed" value={String(row.itemsCompleted)} />
                  <Stat label="Median prep time" value={formatDuration(row.medianPrepSec as number | null)} />
                  <Stat label="On time" value={row.onTimePct != null ? `${row.onTimePct}%` : "—"} />
                  <Stat label="Hours" value={(row.hours as number).toFixed(1)} />
                </>
              )}
            </div>
          </Card>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="font-bold">Recent shifts</h2>
            <p className="text-xs text-ink-500">{hours.toFixed(1)} hours across the last {shifts.length} shifts</p>
            <ul className="mt-3 divide-y divide-linen-200 text-sm">
              {shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>
                    {formatDateTime(s.clockInAt)} → {s.clockOutAt ? formatDateTime(s.clockOutAt) : <Badge tone="green">on shift</Badge>}
                  </span>
                  {s.clockOutAt ? <Badge tone={s.reconcileStatus === "CONFIRMED" ? "green" : s.reconcileStatus === "DISPUTED" ? "red" : "amber"}>{s.reconcileStatus.toLowerCase()}</Badge> : null}
                </li>
              ))}
              {shifts.length === 0 ? <li className="py-2 text-ink-500">No shifts yet.</li> : null}
            </ul>
          </Card>
          <Card className="p-4">
            <h2 className="font-bold">Recent activity</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-24 shrink-0 text-ink-500/70">{formatDateTime(e.at)}</span>
                  <span>
                    {describeEvent(e.action, e.data)}
                    {e.tableId ? <span className="text-ink-500"> · {labels.get(e.tableId)}</span> : null}
                  </span>
                </li>
              ))}
              {events.length === 0 ? <li className="text-ink-500">Nothing yet.</li> : null}
            </ul>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-linen-50 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 font-bold">{value}</p>
    </div>
  );
}
