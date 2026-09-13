"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, BellRing, Clock, Receipt, Timer, UserRound, Wifi, WifiOff } from "lucide-react";
import { useCallback, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Select, Sheet, Spinner, Textarea } from "@/components/ui";
import { useLive } from "@/hooks/useLive";
import { elapsed, useNow } from "@/hooks/useNow";
import { api, post } from "@/lib/client/api";
import { playTone, unlockAudio } from "@/lib/client/sound";
import type { Json } from "@/lib/client/types";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import type { Ping } from "@/lib/realtime";
import { formatDuration, formatTime } from "@/lib/time";
import type { FloorView as Floor, TableState } from "@/services/floor";
import type { WaiterTable } from "@/services/orders";
import { PageBody, PageHeader } from "./page-header";

type FloorData = Json<Floor>;
type Table = FloorData["tables"][number];

const STATE: Record<TableState, { label: string; card: string; dot: string }> = {
  free: { label: "Free", card: "bg-white text-ink-500/70 ring-linen-300", dot: "bg-linen-300" },
  seated: { label: "Seated", card: "bg-white ring-linen-300", dot: "bg-ink-500" },
  waiting: { label: "Order waiting", card: "bg-red-50 ring-red-400", dot: "bg-red-500" },
  paying: { label: "Taking payment", card: "bg-orange-50 ring-orange-400", dot: "bg-orange-500" },
  preparing: { label: "Preparing", card: "bg-amber-50 ring-amber-300", dot: "bg-amber-500" },
  ready: { label: "Food ready", card: "bg-moss-50 ring-moss-500", dot: "bg-moss-500" },
  served: { label: "Eating", card: "bg-sky-50 ring-sky-300", dot: "bg-sky-500" },
  bill: { label: "Bill requested", card: "bg-brand-50 ring-brand-400", dot: "bg-brand-500" },
  paid: { label: "Paid", card: "bg-violet-50 ring-violet-300", dot: "bg-violet-500" },
};

const ACTION_TEXT: Record<string, string> = {
  SESSION_OPENED: "scanned in",
  ORDER_PLACED: "placed an order",
  ORDER_CLAIMED: "accepted an order",
  ORDER_SENT_TO_KITCHEN: "took payment, sent to kitchen",
  ORDER_REJECTED: "declined an order",
  ORDER_CANCELLED: "cancelled an order",
  ORDER_READY: "order ready",
  ORDER_SERVED: "served",
  ORDER_ESCALATED: "unclaimed order escalated",
  ORDER_READY_ALERT: "food waiting at the pass",
  ITEMS_STARTED: "started cooking",
  ITEMS_READY: "marked ready",
  ITEMS_RECALLED: "recalled a ticket",
  ITEM_VOIDED: "voided an item",
  REQUEST_CREATED: "asked for service",
  REQUEST_ACKNOWLEDGED: "responded to a request",
  REQUEST_RESOLVED: "completed a request",
  REQUEST_ESCALATED: "request escalated",
  PAYMENT_RECORDED: "recorded a payment",
  SESSION_PAID: "bill fully paid",
  SESSION_CLOSED: "cleared the table",
  SESSION_TRANSFERRED: "handed over a table",
  SHIFT_CLOCK_IN: "clocked in",
  SHIFT_CLOCK_OUT: "clocked out",
  RATING_SUBMITTED: "rated their visit",
  MENU_ITEM_AVAILABILITY: "changed item availability",
  STAFF_LOGIN: "logged in",
  STAFF_LOGIN_FAILED: "entered a wrong PIN",
  SHIFT_RECONCILED: "checked a shift's cash",
  AWARD_GIVEN: "gave Staff of the Month",
};

export function FloorView() {
  const now = useNow(1000);
  const toast = useToast();
  const [openTable, setOpenTable] = useState<Table | null>(null);
  const floor = useQuery({ queryKey: ["floor"], queryFn: () => api<FloorData>("/api/admin/floor"), refetchInterval: 30_000 });
  const onPing = useCallback(
    (p: Ping) => {
      if (p.kind === "alert") playTone("alert");
      toast({ tone: "ping", title: p.title, body: p.body });
    },
    [toast],
  );
  const { connected } = useLive({
    as: "staff",
    invalidate: { floor: [["floor"], ["manager-tables"]], queue: [["floor"]], tables: [["floor"], ["manager-tables"]], kds: [["floor"]] },
    onPing,
  });

  if (floor.isPending) return <Spinner className="mx-auto mt-24" />;
  if (floor.error) return <p className="p-8 text-red-600">{floor.error.message}</p>;
  const f = floor.data;
  const areas = [...new Set(f.tables.map((t) => t.area))];
  const current = openTable ? f.tables.find((t) => t.id === openTable.id) ?? null : null;

  return (
    <div onClick={unlockAudio}>
      <PageHeader
        title="Live floor"
        description={
          <span className="flex items-center gap-1.5">
            {connected ? <Wifi className="size-4 text-moss-600" /> : <WifiOff className="size-4 text-amber-600" />}
            {connected ? "Live — updates as it happens" : "Reconnecting…"}
          </span>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Sales today" value={formatNaira(f.today.revenueKobo)} />
          <Kpi label="Orders today" value={String(f.today.orders)} />
          <Kpi label="Open tables" value={`${f.today.openTables} / ${f.tables.length}`} />
          <Kpi label="Median time to accept" value={formatDuration(f.today.medianClaimSec)} />
          <Kpi label="Tips recorded" value={formatNaira(f.today.tipsKobo)} />
        </div>

        {f.alerts.length ? (
          <Card className="border-l-4 border-red-500 p-4">
            <p className="flex items-center gap-2 font-bold text-red-700">
              <AlertTriangle className="size-5" /> Needs attention
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {f.alerts.map((a, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="font-bold">{a.tableLabel}</span>
                  <span>{a.message}</span>
                  <span className="text-ink-500">· {elapsed(a.since, now)} ago</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-ink-600">
              {(Object.keys(STATE) as TableState[]).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-full", STATE[s].dot)} /> {STATE[s].label}
                </span>
              ))}
            </div>
            {areas.map((area) => (
              <section key={area}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">{area}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-6">
                  {f.tables
                    .filter((t) => t.area === area)
                    .map((t) => (
                      <button
                        key={t.id}
                        disabled={!t.session}
                        onClick={() => setOpenTable(t)}
                        className={cn("rounded-2xl p-3 text-left ring-2 transition-transform enabled:hover:-translate-y-0.5", STATE[t.state].card)}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-display text-2xl leading-none">{t.label}</span>
                          <span className={cn("mt-1.5 size-2.5 rounded-full", STATE[t.state].dot)} />
                        </div>
                        <p className="text-xs font-semibold">{STATE[t.state].label}</p>
                        {t.session ? (
                          <div className="mt-2 space-y-0.5 text-xs text-ink-600">
                            <p className="flex items-center gap-1">
                              <UserRound className="size-3" /> {t.session.waiter?.name.split(" ")[0] ?? <span className="font-semibold text-red-600">No waiter</span>}
                            </p>
                            <p className="flex items-center gap-1">
                              <Clock className="size-3" /> {elapsed(t.session.openedAt, now).replace(/ \d+s$/, "")}
                            </p>
                            {t.session.waitingSince ? (
                              <p className="flex items-center gap-1 font-semibold text-red-600">
                                <Timer className="size-3" /> waiting {elapsed(t.session.waitingSince, now)}
                              </p>
                            ) : null}
                            {t.session.openRequests.length ? (
                              <p className="flex items-center gap-1 font-semibold text-amber-700">
                                <BellRing className="size-3" /> {t.session.openRequests.length} request{t.session.openRequests.length > 1 ? "s" : ""}
                              </p>
                            ) : null}
                            {t.session.totalKobo ? (
                              <p className="flex items-center gap-1">
                                <Receipt className="size-3" /> {formatNaira(t.session.totalKobo)}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs">{t.seats} seats</p>
                        )}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="font-bold">On shift now</h2>
              {f.onShift.length === 0 ? <p className="mt-2 text-sm text-ink-500">Nobody is clocked in.</p> : null}
              <ul className="mt-2 divide-y divide-linen-200 text-sm">
                {f.onShift.map((s) => (
                  <li key={s.staffId} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-xs text-ink-500">
                        {s.role === "KITCHEN" ? (s.station === "BAR" ? "Bar" : "Kitchen") : s.role.charAt(0) + s.role.slice(1).toLowerCase()} · since {formatTime(s.since)}
                      </p>
                    </div>
                    {s.role === "WAITER" ? <Badge tone={s.tables ? "brand" : "stone"}>{s.tables} table{s.tables === 1 ? "" : "s"}</Badge> : null}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <h2 className="font-bold">Latest activity</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {f.events.slice(0, 15).map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="w-11 shrink-0 tabular-nums text-ink-500/70">{formatTime(e.at)}</span>
                    <span>
                      <span className="font-semibold">{e.actor}</span> {ACTION_TEXT[e.action] ?? e.action.toLowerCase().replace(/_/g, " ")}
                      {e.table ? <span className="text-ink-500"> · {e.table}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </PageBody>
      {current?.session ? <TableSheet table={current} waiters={f.onShift.filter((s) => s.role === "WAITER")} onClose={() => setOpenTable(null)} /> : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

type ManagerTable = Json<WaiterTable>;

/** Manager actions on a live table: assign, cancel, void/comp, hand over, force-clear. */
function TableSheet({ table, waiters, onClose }: { table: Table; waiters: FloorData["onShift"]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reasonFor, setReasonFor] = useState<null | { kind: "void" | "cancel" | "close"; id: string; title: string }>(null);
  const [reason, setReason] = useState("");
  const all = useQuery({ queryKey: ["manager-tables"], queryFn: () => api<{ tables: ManagerTable[] }>("/api/staff/tables?all=1") });
  const s = all.data?.tables.find((t) => t.id === table.session!.id);
  const act = useMutation({
    mutationFn: (a: { url: string; body?: unknown; done: string }) => post(a.url, a.body ?? {}),
    onSuccess: (_d, a) => {
      toast({ tone: "success", title: a.done });
      setReasonFor(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["manager-tables"] });
      void qc.invalidateQueries({ queryKey: ["floor"] });
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't do that", body: e.message }),
  });
  const submitReason = (r: string) => {
    if (!reasonFor) return;
    if (reasonFor.kind === "void") act.mutate({ url: `/api/items/${reasonFor.id}/void`, body: { reason: r }, done: "Item voided" });
    if (reasonFor.kind === "cancel") act.mutate({ url: `/api/orders/${reasonFor.id}/cancel`, body: { reason: r }, done: "Order cancelled" });
    if (reasonFor.kind === "close") act.mutate({ url: `/api/sessions/${reasonFor.id}/close`, body: { reason: r }, done: `${table.label} cleared` });
  };

  return (
    <Sheet open onClose={onClose} wide title={`${table.label} · ${table.area}`}>
      {!s ? (
        <Spinner className="mx-auto my-8" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="dark">{STATE[table.state].label}</Badge>
            <span className="text-ink-600">Waiter: {s.waiter?.name ?? "none yet"}</span>
            <span className="text-ink-600">· seated {formatTime(s.openedAt)}</span>
          </div>

          {s.orders.map((o) => (
            <div key={o.id} className="rounded-2xl ring-1 ring-linen-300">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linen-200 px-3 py-2">
                <span className="text-sm font-semibold">
                  #{o.seq} · {formatTime(o.placedAt)} · <span className="text-ink-500">{o.status.toLowerCase().replace("_", " ")}</span>
                  {o.payment ? (
                    <span className="font-normal text-moss-700">
                      {" "}
                      · paid {formatNaira(o.payment.amountKobo)} {o.payment.method.toLowerCase()} to {o.payment.collectedBy}
                    </span>
                  ) : null}
                </span>
                <div className="flex flex-wrap gap-2">
                  {o.status === "PLACED" && waiters.length ? (
                    <Select
                      className="h-8 w-auto text-sm"
                      defaultValue=""
                      onChange={(e) => e.target.value && act.mutate({ url: `/api/orders/${o.id}/claim`, body: { asWaiterId: e.target.value }, done: "Order assigned" })}
                    >
                      <option value="">Assign to…</option>
                      {waiters.map((w) => (
                        <option key={w.staffId} value={w.staffId}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  {o.status !== "SERVED" && o.status !== "REJECTED" && o.status !== "CANCELLED" && !o.items.some((i) => i.status === "SERVED") ? (
                    <Button size="sm" variant="secondary" onClick={() => setReasonFor({ kind: "cancel", id: o.id, title: `Cancel order #${o.seq}` })}>
                      <Ban className="size-4" /> Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
              <ul className="divide-y divide-linen-200 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className={cn(i.status === "VOIDED" && "text-ink-500/70 line-through")}>
                      {i.qty}× {i.name} <span className="text-ink-500/70">· {formatNaira(i.unitPriceKobo * i.qty)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-500">{i.status.toLowerCase()}</span>
                      {i.status !== "VOIDED" && o.status !== "REJECTED" && o.status !== "CANCELLED" ? (
                        <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setReasonFor({ kind: "void", id: i.id, title: `Void ${i.qty}× ${i.name}` })}>
                          Void / comp
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rounded-2xl bg-linen-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>Total</span>
              <b>{formatNaira(s.bill.total)}</b>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>Paid</span>
              <span>{formatNaira(s.bill.paid)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{s.bill.balance < 0 ? "Refund due to guest" : "Balance"}</span>
              <span>{formatNaira(Math.abs(s.bill.balance))}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hand table to">
              <Select
                defaultValue=""
                onChange={(e) => e.target.value && act.mutate({ url: `/api/sessions/${s.id}/transfer`, body: { toStaffId: e.target.value }, done: "Table handed over" })}
              >
                <option value="">Choose waiter…</option>
                {waiters
                  .filter((w) => w.staffId !== s.waiter?.id)
                  .map((w) => (
                    <option key={w.staffId} value={w.staffId}>
                      {w.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="danger" className="w-full" onClick={() => setReasonFor({ kind: "close", id: s.id, title: `Clear ${table.label}` })}>
                Clear table…
              </Button>
            </div>
          </div>

          {reasonFor ? (
            <div className="space-y-2 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
              <p className="font-semibold text-red-900">{reasonFor.title}</p>
              <div className="flex flex-wrap gap-2">
                {(reasonFor.kind === "void"
                  ? ["COMP", "Kitchen mistake", "Guest complaint", "Entered by mistake"]
                  : reasonFor.kind === "cancel"
                    ? ["Guest cancelled", "Out of stock", "Duplicate order"]
                    : ["Guests left without paying", "Paid outside the system", "Opened by mistake"]
                ).map((r) => (
                  <Button key={r} size="sm" variant="secondary" loading={act.isPending} onClick={() => submitReason(r)}>
                    {r}
                  </Button>
                ))}
              </div>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type a reason (logged with your name)" />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={reason.trim().length < 2} loading={act.isPending} onClick={() => submitReason(reason.trim())}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReasonFor(null)}>
                  Never mind
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
