"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { Json } from "@/lib/client/types";
import { formatNaira } from "@/lib/money";
import { formatDuration, formatMonth } from "@/lib/time";
import type { ScoredWaiter, WaiterStats } from "@/services/metrics";

type Stats = {
  today: Json<WaiterStats> | null;
  todayRank: number | null;
  todayOf: number;
  month: { key: string; me: Json<ScoredWaiter> | null; rank: number | null; of: number };
};

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th"}`;

const COMPONENTS: { key: keyof ScoredWaiter["components"]; label: string; hint: string }[] = [
  { key: "rating", label: "Guest ratings", hint: "Service stars from guests" },
  { key: "speed", label: "Speed", hint: "Accepting orders and serving ready food" },
  { key: "productivity", label: "Orders per hour", hint: "Orders served per hour on shift" },
  { key: "responsiveness", label: "Answering requests", hint: "How fast you respond to calls" },
  { key: "reliability", label: "Reliability", hint: "Cash handover and fewer mistakes" },
];

export function StatsTab() {
  const q = useQuery({ queryKey: ["my-stats"], queryFn: () => api<Stats>("/api/staff/stats"), refetchInterval: 60_000 });
  if (q.isPending) return <Spinner className="mx-auto mt-16" />;
  if (q.error) return <p className="p-4 text-center text-red-600">{q.error.message}</p>;
  const { today, month } = q.data;
  const m = month.me;
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Today</h2>
          {q.data.todayRank && today?.ordersServed ? (
            <span className="text-sm text-ink-500">
              {ordinal(q.data.todayRank)} most orders of {q.data.todayOf}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Tile label="Orders served" value={String(today?.ordersServed ?? 0)} />
          <Tile label="Tables paid" value={String(today?.tablesServed ?? 0)} />
          <Tile label="Tips" value={formatNaira(today?.tipsKobo ?? 0)} />
          <Tile label="Accept time" value={formatDuration(today?.medianClaimSec)} />
          <Tile label="Ready → served" value={formatDuration(today?.medianServeSec)} />
          <Tile label="Rating" value={today?.ratingAvg ? `${today.ratingAvg.toFixed(1)}★` : "—"} />
        </div>
        <p className="mt-3 text-center text-xs text-ink-500">Sales on your tables today: {formatNaira(today?.salesKobo ?? 0)}</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between bg-ink-900 px-4 py-3 text-white">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold-300">Staff of the Month</p>
            <p className="font-bold">{formatMonth(month.key)}</p>
          </div>
          <Trophy className="size-8 text-gold-400" />
        </div>
        {!m || m.score == null ? (
          <p className="p-4 text-sm text-ink-600">
            You&apos;ll appear on the leaderboard once you reach the minimum hours or orders for the month. Keep going!
          </p>
        ) : (
          <div className="p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-5xl font-black">{m.score.toFixed(0)}</p>
                <p className="text-sm text-ink-500">score out of 100</p>
              </div>
              {month.rank ? (
                <p className="text-right">
                  <span className="text-3xl font-black text-brand-600">{ordinal(month.rank)}</span>
                  <span className="block text-sm text-ink-500">of {month.of} waiters</span>
                </p>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {COMPONENTS.map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-ink-600">{m.components[c.key]}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-linen-100">
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${m.components[c.key]}%` }} />
                  </div>
                  <p className="text-xs text-ink-500/70">{c.hint}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-linen-50 px-2 py-3">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-ink-500">{label}</p>
    </div>
  );
}
