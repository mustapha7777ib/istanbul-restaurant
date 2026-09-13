import { QrCode, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Wordmark } from "@/components/brand";
import { getSettings } from "@/lib/settings";

export default async function Home() {
  await connection();
  const settings = await getSettings();
  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-ink-900 text-linen-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/hero-lamps.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/70 to-ink-950/20" />
      <div className="relative mx-auto w-full max-w-5xl px-6 pb-14 pt-10 sm:px-10">
        <Wordmark className="text-[18px]" />
        <h1 className="mt-10 max-w-xl font-display text-4xl leading-tight sm:text-6xl">
          Good food. Great ambience. <span className="text-gold-300">A taste of Turkey, for everyone.</span>
        </h1>
        <p className="mt-4 max-w-md text-linen-200/85">
          Dining with us? Scan the card on your table to see the menu, order, call your waiter and pay — no app, no sign-up.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/15 backdrop-blur">
            <QrCode className="size-5 text-gold-300" /> Scan the QR on your table
          </span>
          <Link href="/staff/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 font-medium text-white hover:bg-brand-700">
            <UserRound className="size-5" /> Staff login
          </Link>
          <Link href="/fame" className="inline-flex h-12 items-center gap-2 rounded-xl px-4 font-medium text-linen-200 hover:text-white">
            <Trophy className="size-5" /> Staff of the Month
          </Link>
        </div>
        <p className="mt-12 text-xs text-linen-400">
          {settings.address}
          {settings.phone ? ` · ${settings.phone}` : ""}
        </p>
      </div>
    </main>
  );
}
