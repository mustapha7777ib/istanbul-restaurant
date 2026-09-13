import { Crown, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Ornament, Wordmark } from "@/components/brand";
import { formatMonth } from "@/lib/time";
import { awardHistory } from "@/services/awards";

export const metadata: Metadata = { title: "Wall of Fame" };

// Staff-room TV: this month's (latest) winners big, previous winners below.
export default async function FamePage() {
  await connection();
  const awards = await awardHistory(24);
  const latestMonth = awards[0]?.month;
  const latest = awards.filter((a) => a.month === latestMonth);
  const past = awards.filter((a) => a.month !== latestMonth);
  return (
    <main className="min-h-dvh bg-ink-900 px-6 py-10 text-linen-50">
      <meta httpEquiv="refresh" content="600" />
      <div className="mx-auto max-w-6xl">
        <div className="flex justify-center">
          <Wordmark className="text-[16px]" />
        </div>
        <h1 className="mt-8 flex items-center justify-center gap-4 text-center font-display text-4xl sm:text-6xl">
          <Trophy className="size-9 text-brand-500 sm:size-12" strokeWidth={1.5} /> Staff of the Month
        </h1>
        <Ornament className="mx-auto mt-6 max-w-xs" />
        {latest.length === 0 ? (
          <p className="mt-16 text-center text-xl text-linen-400">The first winners will be announced at the end of the month. Could it be you?</p>
        ) : (
          <>
            <p className="mt-2 text-center text-xl text-linen-400">{formatMonth(latestMonth!)}</p>
            <div className="mt-10 grid gap-8 md:grid-cols-2">
              {latest.map((a) => (
                <div key={a.id} className="flex flex-col items-center rounded-3xl bg-linear-to-b from-brand-500/20 to-transparent p-8 text-center ring-1 ring-brand-500/40">
                  <Crown className="size-12 text-gold-400" />
                  {a.staff.photoId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/images/${a.staff.photoId}`} alt="" className="mt-4 size-40 rounded-full object-cover ring-4 ring-gold-400" />
                  ) : (
                    <div className="mt-4 flex size-40 items-center justify-center rounded-full bg-brand-600 font-display text-6xl text-white ring-4 ring-gold-300">
                      {a.staff.name.charAt(0)}
                    </div>
                  )}
                  <p className="mt-5 font-display text-4xl">{a.staff.name}</p>
                  <p className="mt-1 text-lg font-semibold uppercase tracking-widest text-gold-300">
                    {a.category === "WAITER" ? "Waiter of the Month" : "Kitchen & Bar Star"}
                  </p>
                  {a.note ? <p className="mt-4 max-w-md text-lg italic text-linen-300">“{a.note}”</p> : null}
                  <p className="mt-4 text-sm text-linen-400">Score {a.score} / 100</p>
                </div>
              ))}
            </div>
          </>
        )}
        {past.length ? (
          <section className="mt-14">
            <h2 className="text-center text-sm font-semibold uppercase tracking-[0.25em] text-linen-400/70">Hall of fame</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {past.map((a) => (
                <div key={a.id} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs text-linen-400">{formatMonth(a.month)}</p>
                  <p className="font-display text-xl">{a.staff.name}</p>
                  <p className="text-xs text-gold-300">{a.category === "WAITER" ? "Waiter" : "Kitchen & bar"}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
