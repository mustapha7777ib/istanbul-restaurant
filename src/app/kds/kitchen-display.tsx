"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Beer, ChefHat, CircleSlash, Flame, LogOut, Power, Undo2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { MenuCategory } from "@/components/menu-browser";
import { useToast } from "@/components/toast";
import { Button, Sheet, Toggle } from "@/components/ui";
import { useLive } from "@/hooks/useLive";
import { elapsed, minutesSince, useNow } from "@/hooks/useNow";
import { api, logout, post } from "@/lib/client/api";
import { keepAwake } from "@/lib/client/push";
import { playTone, unlockAudio } from "@/lib/client/sound";
import type { Json } from "@/lib/client/types";
import { cn } from "@/lib/cn";
import type { Ping } from "@/lib/realtime";
import { formatTime } from "@/lib/time";
import type { StationTickets } from "@/services/kitchen";

type Station = "KITCHEN" | "BAR";
type Tickets = Json<StationTickets>;
type Ticket = Tickets["active"][number];

export function KitchenDisplay({
  staff,
  initialStation,
}: {
  staff: { name: string; role: string; station: Station | null };
  initialStation: Station;
}) {
  const [station, setStation] = useState<Station>(initialStation);
  const [soldOut, setSoldOut] = useState(false);
  const canSwitch = staff.role !== "KITCHEN" || !staff.station;
  const now = useNow(1000);
  const toast = useToast();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ shift: { clockInAt: string } | null }>("/api/staff/me") });
  const needsShift = staff.role === "KITCHEN" && !me.data?.shift;
  const tickets = useQuery({
    queryKey: ["kds", station],
    queryFn: () => api<Tickets>(`/api/kds?station=${station}`),
    refetchInterval: 15_000,
  });
  const onPing = useCallback(
    (p: Ping) => {
      playTone(p.kind === "order" ? "order" : p.kind);
      if (p.kind === "alert") toast({ tone: "ping", title: p.title, body: p.body });
    },
    [toast],
  );
  const { connected } = useLive({ as: "kds", station, invalidate: { kds: [["kds", station]], menu: [["menu"]] }, onPing });

  useEffect(() => {
    let lock: unknown = null;
    void keepAwake().then((l) => (lock = l));
    return () => void (lock as { release?: () => void } | null)?.release?.();
  }, []);

  const clockIn = useMutation({
    mutationFn: () => {
      unlockAudio();
      return post("/api/staff/shift", { action: "in" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => toast({ tone: "error", title: "Couldn't clock in", body: e.message }),
  });

  const act = useMutation({
    mutationFn: (a: { orderId: string; action: "start" | "ready" | "recall" }) => post(`/api/kds/${a.orderId}/${a.action}`, { station }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["kds", station] }),
    onError: (e) => {
      toast({ tone: "error", title: "Couldn't update ticket", body: e.message });
      void qc.invalidateQueries({ queryKey: ["kds", station] });
    },
  });

  const active = tickets.data?.active ?? [];
  const recent = tickets.data?.recent ?? [];
  const late = active.filter((t) => minutesSince(t.sentAt, now) > t.targetMinutes).length;
  const StationIcon = station === "BAR" ? Beer : ChefHat;

  return (
    <div className="flex min-h-dvh flex-col bg-ink-900 text-white" onClick={unlockAudio}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <StationIcon className="size-8 text-gold-400" />
          <div>
            <h1 className="text-xl font-bold">{station === "BAR" ? "Bar" : "Kitchen"}</h1>
            <p className="text-xs text-linen-400">
              {active.length} active · {late ? <span className="font-bold text-red-400">{late} late</span> : "none late"} · {staff.name}
            </p>
          </div>
          {canSwitch ? (
            <div className="ml-2 flex rounded-xl bg-white/10 p-1">
              {(["KITCHEN", "BAR"] as const).map((s) => (
                <button key={s} onClick={() => setStation(s)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", station === s ? "bg-brand-500 text-ink-900" : "text-linen-300")}>
                  {s === "BAR" ? "Bar" : "Kitchen"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("flex items-center gap-1.5 text-sm", connected ? "text-emerald-400" : "text-amber-400")}>
            {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {connected ? "Live" : "Reconnecting…"}
          </span>
          <span className="font-mono text-2xl font-bold tabular-nums">{formatTime(new Date(now))}</span>
          <Button variant="secondary" onClick={() => setSoldOut(true)}>
            <CircleSlash className="size-4" /> Sold out
          </Button>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-linen-400 hover:bg-white/10"
            aria-label="Log out"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      {needsShift ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-2xl font-bold">Clock in to start the {station === "BAR" ? "bar" : "kitchen"} screen</p>
          <p className="text-linen-400">This also turns on the new-ticket sound.</p>
          <Button size="xl" loading={clockIn.isPending} onClick={() => clockIn.mutate()}>
            <Power className="size-5" /> Clock in
          </Button>
        </div>
      ) : (
        <main className="flex-1 p-4">
          {active.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-linen-400/70">
              <StationIcon className="size-16" />
              <p className="text-xl font-semibold">No tickets</p>
              <p className="text-sm">Orders appear here as soon as a waiter accepts them.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {active.map((t) => (
                <TicketCard key={t.orderId} ticket={t} now={now} busy={act.isPending && act.variables?.orderId === t.orderId} onAction={(a) => act.mutate({ orderId: t.orderId, action: a })} />
              ))}
            </div>
          )}

          {recent.length ? (
            <section className="mt-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-linen-400/70">Recently ready — tap to recall a mistake</h2>
              <div className="scrollbar-none flex gap-2 overflow-x-auto">
                {recent.map((t) => (
                  <button
                    key={t.orderId}
                    onClick={() => confirm(`Recall ${t.table} #${t.seq} back to the active screen?`) && act.mutate({ orderId: t.orderId, action: "recall" })}
                    className="flex shrink-0 items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-sm ring-1 ring-white/10 hover:bg-white/10"
                  >
                    <Undo2 className="size-4 text-linen-400" />
                    <span className="font-bold">{t.table}</span>
                    <span className="text-linen-400">#{t.seq}</span>
                    <span className="text-linen-400/70">{t.readyAt ? formatTime(t.readyAt) : ""}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      )}

      {soldOut ? <SoldOutSheet station={station} onClose={() => setSoldOut(false)} /> : null}
    </div>
  );
}

function TicketCard({ ticket: t, now, busy, onAction }: { ticket: Ticket; now: number; busy: boolean; onAction: (a: "start" | "ready") => void }) {
  const mins = minutesSince(t.sentAt, now);
  const tone = mins > t.targetMinutes ? "late" : mins > t.targetMinutes * 0.7 ? "warn" : "ok";
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-ink-800 ring-2",
        tone === "late" ? "ring-red-500" : tone === "warn" ? "ring-amber-400" : t.status === "NEW" ? "ring-brand-500" : "ring-white/10",
      )}
    >
      <div className={cn("flex items-start justify-between px-4 py-3", tone === "late" ? "bg-red-600" : tone === "warn" ? "bg-amber-500 text-ink-900" : "bg-ink-700")}>
        <div>
          <p className="font-display text-4xl leading-none">{t.table}</p>
          <p className="mt-1 text-xs opacity-80">
            #{t.seq} · {t.waiter ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold tabular-nums">{elapsed(t.sentAt, now)}</p>
          <p className="text-xs opacity-80">target {t.targetMinutes}m</p>
        </div>
      </div>
      <ul className="flex-1 space-y-2 px-4 py-3">
        {t.items.map((i) => (
          <li key={i.id} className={cn("text-lg leading-snug", i.status === "READY" && "text-linen-400/70 line-through")}>
            <span className="mr-2 font-black text-gold-400">{i.qty}×</span>
            <span className="font-semibold">{i.name}</span>
            {i.options ? <span className="block pl-7 text-base font-semibold text-gold-300">{i.options}</span> : null}
            {i.note ? <span className="mt-0.5 block rounded-md bg-amber-400/15 px-2 py-0.5 text-base font-bold text-amber-300">⚠ {i.note}</span> : null}
          </li>
        ))}
        {t.note ? <li className="rounded-lg bg-white/5 px-2 py-1 text-sm text-linen-300">Order note: {t.note}</li> : null}
      </ul>
      <div className="p-3">
        {t.status === "NEW" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="xl" variant="secondary" loading={busy} onClick={() => onAction("start")}>
              <Flame className="size-5" /> Start
            </Button>
            <Button size="xl" variant="success" loading={busy} onClick={() => onAction("ready")}>
              Ready
            </Button>
          </div>
        ) : (
          <Button size="xl" variant="success" className="w-full" loading={busy} onClick={() => onAction("ready")}>
            Ready — call waiter
          </Button>
        )}
      </div>
    </div>
  );
}

function SoldOutSheet({ station, onClose }: { station: Station; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<{ categories: MenuCategory[] }>("/api/menu") });
  const toggle = useMutation({
    mutationFn: (a: { id: string; isAvailable: boolean }) => post(`/api/menu/items/${a.id}/availability`, { isAvailable: a.isAvailable }),
    onSuccess: (_d, a) => {
      toast({ tone: "success", title: a.isAvailable ? "Back on the menu" : "Marked sold out", body: "Guests' menus updated." });
      void qc.invalidateQueries({ queryKey: ["menu"] });
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't update", body: e.message }),
  });
  const items = (menu.data?.categories ?? []).flatMap((c) => c.items.filter((i) => i.station === station).map((i) => ({ ...i, category: c.name })));
  return (
    <Sheet open onClose={onClose} title="Sold out items" wide>
      <p className="mb-3 text-sm text-ink-600">Switch off anything you&apos;ve run out of. It disappears from guests&apos; menus immediately and waiters with it pending are warned.</p>
      <ul className="divide-y divide-linen-200 text-ink-900">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className={cn("font-semibold", !i.isAvailable && "text-linen-400 line-through")}>{i.name}</p>
              <p className="text-xs text-linen-400/70">{i.category}</p>
            </div>
            <Toggle checked={i.isAvailable} onChange={(v) => toggle.mutate({ id: i.id, isAvailable: v })} label={`${i.name} available`} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
