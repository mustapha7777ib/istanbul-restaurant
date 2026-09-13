import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { PageBody, PageHeader } from "../page-header";
import { StaffForm } from "./staff-form";

export const metadata: Metadata = { title: "Staff" };

const ROLE_LABEL = { ADMIN: "Admin", MANAGER: "Manager", WAITER: "Waiter", KITCHEN: "Kitchen / bar" } as const;

export default async function StaffListPage() {
  const me = await requireStaff(MANAGER_ROLES);
  const staff = await prisma.staff.findMany({
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    include: { shifts: { where: { clockOutAt: null }, select: { clockInAt: true } } },
  });
  const lastLogin = await prisma.activityEvent.groupBy({ by: ["staffId"], where: { action: "STAFF_LOGIN" }, _max: { at: true } });
  const lastBy = new Map(lastLogin.map((l) => [l.staffId, l._max.at]));
  return (
    <>
      <PageHeader title="Staff" description="Accounts, roles and PINs. Every action in the system is logged against these accounts." actions={<StaffForm actorRole={me.role} />} />
      <PageBody>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-linen-300 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linen-200">
              {staff.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/staff/${s.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                      {s.photoId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/images/${s.photoId}`} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{s.name.charAt(0)}</span>
                      )}
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{s.staffCode}</td>
                  <td className="px-4 py-3">
                    {ROLE_LABEL[s.role]}
                    {s.station ? <span className="text-ink-500"> · {s.station === "BAR" ? "Bar" : "Kitchen"}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {!s.active ? (
                      <Badge>Inactive</Badge>
                    ) : s.shifts.length ? (
                      <Badge tone="green">On shift</Badge>
                    ) : s.lockedUntil && s.lockedUntil > new Date() ? (
                      <Badge tone="red">Locked</Badge>
                    ) : (
                      <Badge tone="stone">Off shift</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{lastBy.get(s.id) ? formatDateTime(lastBy.get(s.id)!) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <StaffForm
                      actorRole={me.role}
                      staff={{ id: s.id, name: s.name, staffCode: s.staffCode, role: s.role, station: s.station, phone: s.phone, active: s.active, photoId: s.photoId }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </PageBody>
    </>
  );
}
