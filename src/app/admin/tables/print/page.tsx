import type { Metadata } from "next";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { qrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/settings";
import { tableUrl } from "@/services/tables";
import { Wordmark } from "@/components/brand";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Print table cards" };

// A4 sheet, 2 × 2 cards per page. Cut along the dashed lines and place in table stands.
// `?tables=T1,T2` prints just those cards (e.g. reprinting one after "New code").
export default async function PrintCards({ searchParams }: PageProps<"/admin/tables/print">) {
  await requireStaff(MANAGER_ROLES);
  const { tables: only } = await searchParams;
  const labels = typeof only === "string" && only.trim() ? only.split(",").map((l) => l.trim().toUpperCase()).filter(Boolean) : null;
  const [tables, settings] = await Promise.all([
    prisma.table.findMany({
      where: { active: true, ...(labels ? { label: { in: labels } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    getSettings(),
  ]);
  const cards = await Promise.all(tables.map(async (t) => ({ ...t, svg: await qrSvg(tableUrl(t.qrToken)) })));
  return (
    <div className="bg-linen-200 print:bg-white">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-6 py-3 shadow">
        <p className="text-sm text-ink-600">
          {cards.length} cards · QR codes open <b>{(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/t/…</b>
        </p>
        <PrintButton />
      </div>
      <div className="mx-auto grid max-w-[190mm] grid-cols-2 gap-0 py-6 print:py-0">
        {cards.map((t) => (
          <div key={t.id} className="relative flex h-[135mm] break-inside-avoid flex-col items-center justify-between border border-dashed border-linen-400 bg-linen-50 p-[9mm] text-center">
            <div className="absolute inset-[4mm] rounded-[3mm] border border-gold-500/45" aria-hidden />
            <div className="relative">
              <Wordmark tone="dark" className="text-[10pt]" />
              <p className="mt-[5mm] font-display text-[19pt] leading-tight text-ink-900">
                Scan to <span className="text-brand-600">order</span>
              </p>
              <p className="mt-[1mm] text-[8.5pt] text-ink-600">Menu · call your waiter · ask for the bill</p>
            </div>
            <div className="relative w-[58mm] rounded-[3mm] bg-white p-[2.5mm] ring-1 ring-linen-300 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <div className="relative">
              <p className="eyebrow text-[7pt] text-brand-700">{t.area}</p>
              <p className="font-display text-[30pt] leading-none text-ink-900">{t.label}</p>
              {settings.instagram ? <p className="mt-[2mm] text-[7.5pt] text-ink-500">@{settings.instagram}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
