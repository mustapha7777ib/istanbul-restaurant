import { Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { qrSvg } from "@/lib/qr";
import { tableUrl } from "@/services/tables";
import { PageBody, PageHeader } from "../page-header";
import { TableActions, TableForm } from "./table-forms";

export const metadata: Metadata = { title: "Tables & QR codes" };

export default async function TablesPage() {
  await requireStaff(MANAGER_ROLES);
  const tables = await prisma.table.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { sessions: { where: { status: { not: "CLOSED" } }, select: { id: true } } },
  });
  const withQr = await Promise.all(tables.map(async (t) => ({ ...t, url: tableUrl(t.qrToken), svg: await qrSvg(tableUrl(t.qrToken)) })));
  const areas = [...new Set(tables.map((t) => t.area))];
  const localhost = /localhost|127\.0\.0\.1/.test(process.env.APP_URL ?? "http://localhost");
  return (
    <>
      <PageHeader
        title="Tables & QR codes"
        description="Each table has its own QR code. Guests scan it to open the menu for that table."
        actions={
          <>
            <TableForm areas={areas} nextSort={tables.length} />
            <Link href="/admin/tables/print" className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">
              <Printer className="size-4" /> Print table cards
            </Link>
          </>
        }
      />
      <PageBody>
        {localhost ? (
          <Card className="border-l-4 border-amber-400 p-4 text-sm text-amber-900">
            QR codes currently point to <b>{process.env.APP_URL ?? "http://localhost:3000"}</b>, which phones can&apos;t reach. Set <code>APP_URL</code> to the
            live address (e.g. https://order.istanbulrestaurantcafe.com) before printing.
          </Card>
        ) : null}
        {areas.map((area) => (
          <section key={area}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">{area}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {withQr
                .filter((t) => t.area === area)
                .map((t) => (
                  <Card key={t.id} className={`flex gap-3 p-3 ${t.active ? "" : "opacity-50"}`}>
                    <div className="size-24 shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="text-xl font-black">{t.label}</p>
                      <p className="text-xs text-ink-500">
                        {t.seats} seats {t.active ? "" : "· inactive"} {t.sessions.length ? "· guests seated" : ""}
                      </p>
                      <a href={t.url} target="_blank" rel="noreferrer" className="mt-1 truncate text-xs text-sky-700 hover:underline">
                        {t.url}
                      </a>
                      <div className="mt-auto pt-2">
                        <TableActions table={{ id: t.id, label: t.label, area: t.area, seats: t.seats, active: t.active, sortOrder: t.sortOrder }} areas={areas} />
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </PageBody>
    </>
  );
}
