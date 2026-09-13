import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { Card, Input, Select } from "@/components/ui";
import { ACTIONS } from "@/lib/audit";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, lagosDateKey, lagosDateRange } from "@/lib/time";
import { PageBody, PageHeader } from "../page-header";
import { describeEvent } from "./describe";

export const metadata: Metadata = { title: "Activity log" };

const PAGE = 100;

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireStaff(MANAGER_ROLES);
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const staffId = get("staff");
  const action = get("action");
  const tableId = get("table");
  const date = get("date");
  const before = get("before");

  const where: Prisma.ActivityEventWhereInput = {
    ...(staffId ? { staffId: staffId === "guests" ? null : staffId, ...(staffId === "guests" ? { actorType: "CUSTOMER" as const } : {}) } : {}),
    ...(action ? { action } : {}),
    ...(tableId ? { tableId } : {}),
    ...(date || before
      ? {
          at: {
            ...(date ? { gte: lagosDateRange(date, date).start, lt: lagosDateRange(date, date).end } : {}),
            ...(before ? { lt: new Date(before) } : {}),
          },
        }
      : {}),
  };
  const [events, staff, tables] = await Promise.all([
    prisma.activityEvent.findMany({ where, orderBy: { at: "desc" }, take: PAGE + 1, include: { staff: { select: { name: true } } } }),
    prisma.staff.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.table.findMany({ select: { id: true, label: true }, orderBy: [{ sortOrder: "asc" }] }),
  ]);
  const labels = new Map(tables.map((t) => [t.id, t.label]));
  const more = events.length > PAGE;
  const shown = events.slice(0, PAGE);
  const nextQuery = new URLSearchParams({ ...(staffId && { staff: staffId }), ...(action && { action }), ...(tableId && { table: tableId }), ...(date && { date }) });
  if (more) nextQuery.set("before", shown[shown.length - 1].at.toISOString());

  return (
    <>
      <PageHeader title="Activity log" description="Every order, claim, payment, void and login — who did it and when. Entries can't be edited or deleted." />
      <PageBody>
        <form className="grid gap-2 sm:grid-cols-5">
          <Select name="staff" defaultValue={staffId}>
            <option value="">Everyone</option>
            <option value="guests">Guests</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="action" defaultValue={action}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a.toLowerCase().replace(/_/g, " ")}
              </option>
            ))}
          </Select>
          <Select name="table" defaultValue={tableId}>
            <option value="">All tables</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
          <Input type="date" name="date" defaultValue={date} max={lagosDateKey()} />
          <button className="h-11 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">Filter</button>
        </form>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">What happened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linen-200">
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-ink-500">{formatDateTime(e.at)}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{e.staff?.name ?? (e.actorType === "CUSTOMER" ? "Guest" : "System")}</td>
                  <td className="px-4 py-2">{e.tableId ? labels.get(e.tableId) : "—"}</td>
                  <td className="px-4 py-2">{describeEvent(e.action, e.data)}</td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-500">
                    Nothing matches these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        {more ? (
          <Link href={`/admin/activity?${nextQuery}`} className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold ring-1 ring-linen-300">
            Older entries →
          </Link>
        ) : null}
      </PageBody>
    </>
  );
}
