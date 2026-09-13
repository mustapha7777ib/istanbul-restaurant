import type { Metadata } from "next";
import Link from "next/link";
import { Ornament, Wordmark } from "@/components/brand";
import credits from "@/content/photo-credits.json";

export const metadata: Metadata = { title: "Photo credits" };

// Default menu photography comes from openly licensed libraries (via Openverse).
// CC BY photos require attribution (and a note when we cropped them); CC0 photos
// don't, but we thank them anyway.
export default function CreditsPage() {
  const attributed = credits.filter((c) => !c.license.startsWith("CC0"));
  const cc0 = credits.filter((c) => c.license.startsWith("CC0"));
  return (
    <main className="paper mx-auto min-h-dvh max-w-lg px-6 py-10">
      <Wordmark tone="dark" className="text-[13px]" />
      <h1 className="mt-8 font-display text-3xl text-ink-900">Photo credits</h1>
      <p className="mt-2 text-sm text-ink-600">Some photos on our menu are used under open licences. Thank you to the photographers.</p>
      <Ornament className="my-6" />
      <ul className="space-y-3 text-sm">
        {attributed.map((c) => (
          <li key={c.file}>
            <a href={c.source ?? "#"} target="_blank" rel="noreferrer" className="font-medium text-ink-900 underline decoration-linen-400 underline-offset-2">
              {c.title || c.file}
            </a>{" "}
            <span className="text-ink-600">
              by {c.creator || "unknown"} — {c.license}
              {"changes" in c && c.changes ? ` (${c.changes})` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink-600">
        Other photos ({cc0.length}) are public-domain (CC0) images from StockSnap, Rawpixel and the WordPress Photo Directory.
      </p>
      <Link href="/order" className="mt-8 inline-block text-sm font-medium text-brand-700">
        ← Back to the menu
      </Link>
    </main>
  );
}
