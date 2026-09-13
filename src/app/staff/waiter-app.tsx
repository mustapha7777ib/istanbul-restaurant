"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, BellRing, ClipboardList, Hand, LayoutGrid, LogOut, Menu, Power, Volume2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useToast } from "@/components/toast";
import { Badge, Button, Sheet, Spinner } from "@/components/ui";
import { useLive } from "@/hooks/useLive";
import { api, logout, post } from "@/lib/client/api";
import { enablePush, keepAwake, pushStatusText, registerServiceWorker, type PushState } from "@/lib/client/push";
import { playTone, unlockAudio } from "@/lib/client/sound";
import { cn } from "@/lib/cn";
import type { Ping } from "@/lib/realtime";
import { formatTime, lagosHour } from "@/lib/time";
import { Wordmark } from "@/components/brand";
import { ClockOutSheet } from "./clock-out";
import { QueueTab } from "./queue-tab";
import { RequestsTab } from "./requests-tab";
import { StatsTab } from "./stats-tab";
import { TablesTab } from "./tables-tab";
import type { Me, QueueItem, RequestItem, TableItem } from "./types";

type Tab = "queue" | "tables" | "requests" | "stats";
const TABS: Tab[] = ["queue", "tables", "requests", "stats"];

export function WaiterApp({ me: initialMe, initialTab }: { me: { id: string; name: string }; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "queue");
  const [menuOpen, setMenuOpen] = useState(false);
  const [clockOut, setClockOut] = useState(false);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/staff/me"), refetchInterval: 60_000 });
  const onShift = Boolean(me.data?.shift);
  const queue = useQuery({
    queryKey: ["queue"],
    queryFn: () => api<{ orders: QueueItem[] }>("/api/staff/queue"),
    enabled: onShift,
    refetchInterval: 20_000,
  });
  const tables = useQuery({
    queryKey: ["tables"],
    queryFn: () => api<{ tables: TableItem[] }>("/api/staff/tables"),
    enabled: onShift,
    refetchInterval: 20_000,
  });
  const requests = useQuery({
    queryKey: ["requests"],
    queryFn: () => api<{ requests: RequestItem[] }>("/api/staff/requests"),
    enabled: onShift,
    refetchInterval: 20_000,
  });

  const onPing = useCallback(
    (p: Ping) => {
      if (!onShift) return;
      playTone(p.kind);
      const target = p.url ? new URL(p.url, window.location.origin).searchParams.get("tab") : null;
      toast({ tone: "ping", title: p.title, body: p.body, onClick: target && TABS.includes(target as Tab) ? () => setTab(target as Tab) : undefined });
    },
    [onShift, toast],
  );
  const { connected } = useLive({
    as: "staff",
    invalidate: { queue: [["queue"]], tables: [["tables"], ["requests"]], session: [["tables"]], menu: [["menu"]] },
    onPing,
  });

  useEffect(() => {
    void registerServiceWorker();
  }, []);
  useEffect(() => {
    if (!onShift) return;
    let lock: unknown = null;
    void keepAwake().then((l) => (lock = l));
    return () => void (lock as { release?: () => void } | null)?.release?.();
  }, [onShift]);

  const clockIn = useMutation({
    mutationFn: async () => {
      unlockAudio();
      await post("/api/staff/shift", { action: "in" });
      setPushState(await enablePush().catch(() => "unsupported" as const));
    },
    onSuccess: () => {
      playTone("info");
      void qc.invalidateQueries();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't clock in", body: e.message }),
  });

  const queueCount = queue.data?.orders.length ?? 0;
  // Orders needing the waiter at the table: payment to take, or food to carry out.
  const readyCount =
    tables.data?.tables.reduce((n, t) => n + t.orders.filter((o) => o.status === "AWAITING_PAYMENT" || o.items.some((i) => i.status === "READY")).length, 0) ?? 0;
  const requestCount = requests.data?.requests.filter((r) => r.status === "OPEN").length ?? 0;

  return (
    <div className="paper mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="min-w-0">
          <Wordmark className="text-[9px]" sub={false} />
          <p className="mt-1.5 truncate text-sm font-medium text-linen-100">{initialMe.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-linen-400">
            {connected ? <Wifi className="size-3 text-emerald-400" /> : <WifiOff className="size-3 text-amber-400" />}
            {onShift ? `On shift since ${formatTime(me.data!.shift!.clockInAt)}` : "Off shift"}
            {!connected ? " · reconnecting…" : ""}
          </p>
        </div>
        <button onClick={() => setMenuOpen(true)} className="rounded-xl p-2 hover:bg-white/10" aria-label="Menu">
          <Menu className="size-6" />
        </button>
      </header>

      {me.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : !onShift ? (
        <div className="relative flex flex-1 flex-col justify-end overflow-hidden bg-ink-900 text-linen-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/staff-chandelier.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/80 to-ink-950/20" />
          <div className="relative space-y-4 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <Hand className="size-9 text-gold-400" strokeWidth={1.5} />
            <h1 className="font-display text-[2.1rem] leading-tight">
              {lagosHour(new Date()) < 12 ? "Good morning" : lagosHour(new Date()) < 17 ? "Good afternoon" : "Good evening"}, {initialMe.name.split(" ")[0]}.
            </h1>
            <p className="text-linen-200/85">Clock in to start receiving tables. Keep this app open — it rings and vibrates the moment a guest needs you.</p>
            <Button size="xl" className="w-full" loading={clockIn.isPending} onClick={() => clockIn.mutate()}>
              <Power className="size-5" /> Clock in
            </Button>
          </div>
        </div>
      ) : (
        <>
          <main className="flex-1 px-3 pb-28 pt-3">
            {tab === "queue" ? (
              <QueueTab data={queue.data?.orders} loading={queue.isPending} />
            ) : tab === "tables" ? (
              <TablesTab data={tables.data?.tables} loading={tables.isPending} me={me.data!} />
            ) : tab === "requests" ? (
              <RequestsTab data={requests.data?.requests} loading={requests.isPending} />
            ) : (
              <StatsTab />
            )}
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-4 border-t border-linen-300 bg-white pb-[env(safe-area-inset-bottom)]">
            <TabButton active={tab === "queue"} onClick={() => setTab("queue")} icon={<Bell />} label="New orders" count={queueCount} urgent />
            <TabButton active={tab === "tables"} onClick={() => setTab("tables")} icon={<LayoutGrid />} label="My tables" count={readyCount} />
            <TabButton active={tab === "requests"} onClick={() => setTab("requests")} icon={<ClipboardList />} label="Requests" count={requestCount} urgent />
            <TabButton active={tab === "stats"} onClick={() => setTab("stats")} icon={<BarChart3 />} label="My stats" />
          </nav>
        </>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Settings">
        <div className="space-y-3">
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={async () => {
              unlockAudio();
              setPushState(await enablePush().catch(() => "unsupported" as const));
            }}
          >
            <BellRing className="size-5" /> Turn on lock-screen alerts
          </Button>
          {pushState ? <p className="px-1 text-sm text-ink-600">{pushStatusText(pushState)}</p> : null}
          <Button
            variant="secondary"
            size="lg"
            className="w-full justify-start"
            onClick={() => {
              unlockAudio();
              setTimeout(() => playTone("order"), 50);
            }}
          >
            <Volume2 className="size-5" /> Test sound & vibration
          </Button>
          {onShift ? (
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-start"
              onClick={() => {
                setMenuOpen(false);
                setClockOut(true);
              }}
            >
              <Power className="size-5" /> Clock out
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="lg"
            className="w-full justify-start text-red-600"
            onClick={logout}
          >
            <LogOut className="size-5" /> Log out
          </Button>
        </div>
      </Sheet>
      <ClockOutSheet open={clockOut} onClose={() => setClockOut(false)} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  urgent,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactElement;
  label: string;
  count?: number;
  urgent?: boolean;
}) {
  return (
    <button onClick={onClick} className={cn("relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium tracking-wide", active ? "text-ink-900" : "text-ink-500/70")}>
      <span className={cn("[&>svg]:size-6", active && "[&>svg]:text-brand-600")}>{icon}</span>
      {label}
      {count ? (
        <Badge tone={urgent ? "brand" : "green"} className={cn("absolute right-[18%] top-1 min-w-5 justify-center px-1.5", urgent && "animate-pulse-ring bg-brand-600 text-white")}>
          {count}
        </Badge>
      ) : null}
    </button>
  );
}
