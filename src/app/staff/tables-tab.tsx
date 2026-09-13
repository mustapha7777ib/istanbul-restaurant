"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Banknote, Check, CheckCheck, ChefHat, CreditCard, HandPlatter, Landmark, LayoutGrid, Plus, Receipt, Send, Sparkles, Timer, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CartLines, MenuBrowser, type MenuCategory } from "@/components/menu-browser";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, Field, Input, Segmented, Select, Sheet, Spinner, Textarea } from "@/components/ui";
import { cartItems, useCart } from "@/hooks/useCart";
import { elapsed, useNow } from "@/hooks/useNow";
import { api, post } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { REJECT_REASONS_UNPAID, RejectSheet } from "./queue-tab";
import { METHOD_TEXT, REQUEST_TEXT, type Me, type TableItem } from "./types";

type Method = "CASH" | "POS" | "TRANSFER";
type TableOrder = TableItem["orders"][number];

const ORDER_TEXT: Partial<Record<string, string>> = {
  PLACED: "Waiting for you in New orders",
  AWAITING_PAYMENT: "Take payment",
  REJECTED: "Declined",
  CANCELLED: "Cancelled",
};

const ITEM_TEXT: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Waiting", cls: "text-ink-500" },
  PREPARING: { label: "Cooking", cls: "text-amber-600" },
  READY: { label: "READY", cls: "text-moss-600 font-bold" },
  SERVED: { label: "Served", cls: "text-ink-500/70" },
  VOIDED: { label: "Removed", cls: "text-ink-500/70 line-through" },
};

export function TablesTab({ data, loading, me }: { data?: TableItem[]; loading: boolean; me: Me }) {
  const [adding, setAdding] = useState<{ sessionId?: string; label?: string } | null>(null);
  const now = useNow(15_000);
  if (loading) return <Spinner className="mx-auto mt-16" />;
  return (
    <div className="space-y-3">
      <Button variant="dark" size="lg" className="w-full" onClick={() => setAdding({})}>
        <Plus className="size-5" /> Take an order for a table
      </Button>
      {!data?.length ? (
        <Empty icon={<LayoutGrid className="size-12" />} title="No tables yet">
          Accept an order from “New orders” and the table becomes yours until the guests leave.
        </Empty>
      ) : (
        data.map((t) => <TableCard key={t.id} table={t} me={me} now={now} onAdd={() => setAdding({ sessionId: t.id, label: t.table.label })} />)
      )}
      {adding ? <AddOrderSheet target={adding} onClose={() => setAdding(null)} /> : null}
    </div>
  );
}

function TableCard({ table: t, me, now, onAdd }: { table: TableItem; me: Me; now: number; onAdd: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const [collecting, setCollecting] = useState<TableOrder | null>(null);
  const [declining, setDeclining] = useState<TableOrder | null>(null);
  const [handing, setHanding] = useState(false);
  const [voiding, setVoiding] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tables"] });
  const action = useMutation({
    mutationFn: (a: { url: string; body?: unknown; done: string }) => post(a.url, a.body ?? {}),
    onSuccess: (_d, a) => {
      toast({ tone: "success", title: a.done });
      refresh();
      void qc.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't do that", body: e.message }),
  });

  const live = t.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
  const billReq = t.requests.find((r) => r.type === "BILL");
  const hasReady = live.some((o) => o.items.some((i) => i.status === "READY"));
  const paid = t.bill.total > 0 && t.bill.balance <= 0;
  const inProgress = live.some((o) => o.status === "PLACED" || o.status === "AWAITING_PAYMENT" || o.status === "ACCEPTED" || o.status === "READY");

  return (
    <Card className={cn("overflow-hidden", hasReady && "ring-2 ring-moss-500", billReq && !hasReady && "ring-2 ring-brand-400")}>
      <div className="flex items-center justify-between gap-2 border-b border-linen-200 px-4 py-3">
        <div>
          <p className="font-display text-3xl leading-none">{t.table.label}</p>
          <p className="mt-1 text-xs text-ink-500">
            {t.table.area} · seated {formatTime(t.openedAt)} ({elapsed(t.openedAt, now).replace(/ \d+s$/, "")})
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {hasReady ? <Badge tone="green">Food ready</Badge> : null}
          {billReq ? <Badge tone="brand">Bill · {billReq.preferredMethod ? METHOD_TEXT[billReq.preferredMethod] : "any"}</Badge> : null}
          {paid ? <Badge tone="green">Paid</Badge> : null}
        </div>
      </div>

      {t.requests.filter((r) => r.type !== "BILL").map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2 text-sm">
          <span className="font-semibold text-amber-900">
            {REQUEST_TEXT[r.type]}
            {r.note ? `: ${r.note}` : ""} <span className="font-normal text-amber-700">· {elapsed(r.createdAt, now)}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => action.mutate({ url: `/api/requests/${r.id}/resolve`, done: "Request done" })}>
            Done
          </Button>
        </div>
      ))}

      <div className="divide-y divide-linen-200">
        {t.orders.map((o) => (
          <div key={o.id} className="px-4 py-2.5">
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span className="font-semibold">
                #{o.seq} · {formatTime(o.placedAt)}
              </span>
              <span className={cn(o.status === "AWAITING_PAYMENT" && "font-semibold text-orange-700")}>{ORDER_TEXT[o.status] ?? ""}</span>
            </div>
            <ul className="mt-1 space-y-1">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    className={cn("text-left", i.status === "VOIDED" && "text-ink-500/70 line-through")}
                    disabled={i.status !== "PENDING" || o.status !== "AWAITING_PAYMENT"}
                    onClick={() => setVoiding({ id: i.id, name: `${i.qty}× ${i.name}` })}
                  >
                    {i.qty}× {i.name}
                    {i.options ? <span className="text-ink-600"> · {i.options}</span> : null}
                    {i.note ? <span className="italic text-ink-500"> — {i.note}</span> : null}
                  </button>
                  {o.status === "AWAITING_PAYMENT" ? null : <span className={cn("shrink-0 text-xs", ITEM_TEXT[i.status].cls)}>{ITEM_TEXT[i.status].label}</span>}
                </li>
              ))}
            </ul>
            {o.status === "AWAITING_PAYMENT" ? (
              <div className="mt-2 rounded-xl bg-orange-50 p-3 ring-1 ring-orange-200">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-orange-900">
                    {o.dueKobo > 0 ? "Collect before it goes to the kitchen" : "Already paid at the table"}
                  </span>
                  <span className="text-lg font-bold">{formatNaira(o.dueKobo)}</span>
                </div>
                {o.dueKobo < o.totalKobo ? (
                  <p className="text-xs text-orange-800">{formatNaira(o.totalKobo - o.dueKobo)} of this order was already paid at the table.</p>
                ) : null}
                <p className="mt-0.5 flex items-center gap-1 text-xs text-orange-800">
                  <Timer className="size-3.5" /> Ready about {o.estimateMinutes} min after it goes to the kitchen
                </p>
                <div className="mt-2.5 grid grid-cols-[1fr_2fr] gap-2">
                  <Button variant="secondary" onClick={() => setDeclining(o)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setCollecting(o)}>
                    {o.dueKobo > 0 ? (
                      <>
                        <Banknote className="size-4" /> Take payment
                      </>
                    ) : (
                      <>
                        <Send className="size-4" /> Send to kitchen
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : o.payment ? (
              <p className="mt-1 text-xs text-moss-700">
                Paid {formatNaira(o.payment.amountKobo)} · {METHOD_TEXT[o.payment.method]}
                {o.status === "ACCEPTED" && o.paidAt ? ` · in the kitchen, ready ~${formatTime(new Date(new Date(o.paidAt).getTime() + o.estimateMinutes * 60_000))}` : ""}
              </p>
            ) : null}
            <OrderProgress order={o} table={t.table.label} onAction={(url, done) => action.mutate({ url, done })} busy={action.isPending && action.variables?.url.includes(o.id)} />
          </div>
        ))}
      </div>

      <div className="bg-linen-50 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-500">Total</span>
          <span className="font-bold">{formatNaira(t.bill.total)}</span>
        </div>
        {t.bill.paid ? (
          <div className="flex justify-between text-ink-500">
            <span>Paid ({t.payments.map((p) => METHOD_TEXT[p.method]).join(" + ")})</span>
            <span>− {formatNaira(t.bill.paid)}</span>
          </div>
        ) : null}
        {t.bill.paid && t.bill.balance > 0 ? (
          <div className="flex justify-between font-bold">
            <span>Balance</span>
            <span>{formatNaira(t.bill.balance)}</span>
          </div>
        ) : null}
        {t.bill.balance < 0 ? (
          <div className="flex justify-between font-bold text-red-700">
            <span>Refund due to guest</span>
            <span>{formatNaira(-t.bill.balance)}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-linen-200 p-3">
        <Button variant="secondary" onClick={onAdd}>
          <Plus className="size-4" /> Items
        </Button>
        <Button variant="secondary" onClick={() => setHanding(true)}>
          <ArrowRightLeft className="size-4" /> Hand over
        </Button>
        {t.tableDueKobo > 0 ? (
          <Button onClick={() => setPaying(true)}>
            <Receipt className="size-4" /> Payment
          </Button>
        ) : (
          <Button
            variant={paid && !inProgress ? "success" : "secondary"}
            disabled={inProgress}
            loading={action.isPending && action.variables?.url.endsWith("/close")}
            onClick={() => {
              if (confirm(`Clear ${t.table.label}? The guests' visit will end.`)) {
                action.mutate({ url: `/api/sessions/${t.id}/close`, done: `${t.table.label} cleared` });
              }
            }}
          >
            <CheckCheck className="size-4" /> Clear
          </Button>
        )}
      </div>

      {collecting ? <CollectSheet table={t} order={collecting} onClose={() => setCollecting(null)} /> : null}
      <RejectSheet order={declining ? { id: declining.id, table: t.table } : null} onClose={() => setDeclining(null)} reasons={REJECT_REASONS_UNPAID} />
      {paying ? <PaymentSheet table={t} dueKobo={t.tableDueKobo} onClose={() => setPaying(false)} /> : null}
      <HandOverSheet open={handing} onClose={() => setHanding(false)} table={t} me={me} />
      <VoidSheet item={voiding} onClose={() => setVoiding(null)} />
    </Card>
  );
}

/**
 * Once an order is paid and in the kitchen, the waiter moves it on: Mark ready
 * (if the kitchen hasn't from its screen), then Served. The guest's phone follows.
 */
function OrderProgress({ order: o, table, onAction, busy }: { order: TableOrder; table: string; onAction: (url: string, done: string) => void; busy?: boolean }) {
  const cooking = o.status === "ACCEPTED" && o.items.some((i) => i.status === "PENDING" || i.status === "PREPARING");
  const ready = o.items.some((i) => i.status === "READY");
  if (!cooking && !ready) return null;
  return (
    <div className={cn("mt-2 grid gap-2", cooking && ready && "grid-cols-2")}>
      {cooking ? (
        <Button variant="secondary" size="lg" disabled={busy} onClick={() => onAction(`/api/orders/${o.id}/ready`, `#${o.seq} ready — ${table} can see it`)}>
          <ChefHat className="size-5" /> {ready ? "Rest is ready" : "Mark ready"}
        </Button>
      ) : null}
      {ready ? (
        <Button variant="success" size="lg" loading={busy} onClick={() => onAction(`/api/orders/${o.id}/serve`, `Served at ${table}`)}>
          <HandPlatter className="size-5" /> {cooking ? "Served" : "Served — mark delivered"}
        </Button>
      ) : null}
    </div>
  );
}

const METHOD_OPTIONS: { value: Method; label: ReactNode }[] = [
  { value: "CASH", label: <><Banknote className="size-4" /> Cash</> },
  { value: "POS", label: <><CreditCard className="size-4" /> POS</> },
  { value: "TRANSFER", label: <><Landmark className="size-4" /> Transfer</> },
];

/** Waiter collects payment for one order at the table; that sends it to the kitchen/bar. */
function CollectSheet({ table: t, order: o, onClose }: { table: TableItem; order: TableOrder; onClose: () => void }) {
  const [method, setMethod] = useState<Method>("CASH");
  const [tip, setTip] = useState("");
  const [reference, setReference] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const tipKobo = Math.round(Number(tip || 0) * 100);
  const pay = useMutation({
    mutationFn: () => post<{ estimateMinutes: number }>(`/api/orders/${o.id}/pay`, { method, tipKobo, reference: reference.trim() || undefined }),
    onSuccess: (r) => {
      toast({ tone: "success", title: `Order #${o.seq} sent to the kitchen`, body: `Tell ${t.table.label} it'll be ready in about ${r.estimateMinutes} min.` });
      void qc.invalidateQueries({ queryKey: ["tables"] });
      onClose();
    },
    onError: (e) => {
      toast({ tone: "error", title: "Couldn't record payment", body: e.message });
      void qc.invalidateQueries({ queryKey: ["tables"] });
    },
  });
  const now = useNow(30_000);
  const readyAround = formatTime(new Date(now + o.estimateMinutes * 60_000));
  const count = o.items.filter((i) => i.status !== "VOIDED").reduce((n, i) => n + i.qty, 0);
  const collect = o.dueKobo > 0;
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${collect ? "Take payment" : "Send to kitchen"} · ${t.table.label} #${o.seq}`}
      footer={
        <Button size="xl" variant="success" className="w-full" loading={pay.isPending} onClick={() => pay.mutate()}>
          <Check className="size-5" /> {collect ? `Paid ${formatNaira(o.dueKobo)} · send to kitchen` : "Send to kitchen"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink-900 p-4 text-white">
          <p className="text-sm text-linen-300">{collect ? "Collect from the guests" : "Nothing to collect"}</p>
          <p className="text-3xl font-black">{formatNaira(o.dueKobo)}</p>
          <p className="text-sm text-linen-300">
            {count} {count === 1 ? "item" : "items"} · VAT & service charge included
            {o.dueKobo < o.totalKobo ? ` · ${formatNaira(o.totalKobo - o.dueKobo)} already paid at the table` : ""}
          </p>
        </div>
        {collect ? (
          <>
            <Segmented value={method} onChange={setMethod} options={METHOD_OPTIONS} />
            {method !== "CASH" ? (
              <Field label={method === "POS" ? "POS slip / RRN (recommended)" : "Transfer reference / sender name"}>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
              </Field>
            ) : null}
            <Field label="Tip for you (₦, optional)">
              <Input type="number" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0" />
            </Field>
          </>
        ) : null}
        <div className="flex items-center gap-3 rounded-2xl bg-moss-50 p-3 text-moss-900 ring-1 ring-moss-200">
          <Timer className="size-6 shrink-0" />
          <p className="text-sm">
            Tell the guests: <b>ready in about {o.estimateMinutes} min</b> (around {readyAround}).
          </p>
        </div>
      </div>
    </Sheet>
  );
}

/** Money owed that isn't on an order awaiting payment (tables from before pay-first ordering). */
function PaymentSheet({ table: t, dueKobo, onClose }: { table: TableItem; dueKobo: number; onClose: () => void }) {
  const preferred = (t.requests.find((r) => r.type === "BILL")?.preferredMethod as Method | null) ?? "CASH";
  const [method, setMethod] = useState<Method>(preferred);
  const [amount, setAmount] = useState(String(dueKobo / 100));
  const [tip, setTip] = useState("");
  const [reference, setReference] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const amountKobo = Math.round(Number(amount || 0) * 100);
  const tipKobo = Math.round(Number(tip || 0) * 100);
  const record = useMutation({
    mutationFn: () => post<{ balanceAfter: number }>(`/api/sessions/${t.id}/payments`, { amountKobo, tipKobo, method, reference: reference.trim() || undefined }),
    onSuccess: (r) => {
      toast({
        tone: "success",
        title: r.balanceAfter === 0 ? `${t.table.label} fully paid` : `${formatNaira(amountKobo)} recorded`,
        body: r.balanceAfter === 0 ? "The guests can now rate their visit. Clear the table when they leave." : `Balance ${formatNaira(r.balanceAfter)}`,
      });
      void qc.invalidateQueries({ queryKey: ["tables"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't record payment", body: e.message }),
  });
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Payment · ${t.table.label}`}
      footer={
        <Button size="xl" className="w-full" disabled={amountKobo <= 0 || amountKobo > dueKobo} loading={record.isPending} onClick={() => record.mutate()}>
          Record {formatNaira(amountKobo)} {METHOD_TEXT[method].toLowerCase()}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink-900 p-4 text-white">
          <p className="text-sm text-ink-500/70">Balance to collect</p>
          <p className="text-3xl font-black">{formatNaira(dueKobo)}</p>
          {t.bill.paid ? <p className="text-sm text-ink-500/70">of {formatNaira(t.bill.total)} · {formatNaira(t.bill.paid)} already paid</p> : null}
        </div>
        <Segmented value={method} onChange={setMethod} options={METHOD_OPTIONS} />
        <Field label="Amount received (₦)" hint="Splitting the bill? Enter this person's share and record again for the next.">
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-bold" />
        </Field>
        {method !== "CASH" ? (
          <Field label={method === "POS" ? "POS slip / RRN (recommended)" : "Transfer reference / sender name"}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
          </Field>
        ) : null}
        <Field label="Tip for you (₦, optional)">
          <Input type="number" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Sheet>
  );
}

function HandOverSheet({ open, onClose, table: t, me }: { open: boolean; onClose: () => void; table: TableItem; me: Me }) {
  const qc = useQueryClient();
  const toast = useToast();
  const transfer = useMutation({
    mutationFn: (toStaffId: string) => post(`/api/sessions/${t.id}/transfer`, { toStaffId }),
    onSuccess: () => {
      toast({ tone: "success", title: `${t.table.label} handed over` });
      void qc.invalidateQueries({ queryKey: ["tables"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't hand over", body: e.message }),
  });
  return (
    <Sheet open={open} onClose={onClose} title={`Hand over ${t.table.label}`}>
      {me.waitersOnShift.length === 0 ? (
        <p className="text-ink-500">No other waiter is clocked in right now.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-600">The new waiter gets all future orders and pings for this table.</p>
          {me.waitersOnShift.map((w) => (
            <Button key={w.id} variant="secondary" size="lg" className="w-full justify-between" loading={transfer.isPending && transfer.variables === w.id} onClick={() => transfer.mutate(w.id)}>
              {w.name} <span className="text-ink-500/70">{w.staffCode}</span>
            </Button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function VoidSheet({ item, onClose }: { item: { id: string; name: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [other, setOther] = useState("");
  const voidIt = useMutation({
    mutationFn: (reason: string) => post(`/api/items/${item!.id}/void`, { reason }),
    onSuccess: () => {
      toast({ tone: "success", title: "Item removed" });
      setOther("");
      void qc.invalidateQueries({ queryKey: ["tables"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't remove", body: e.message }),
  });
  return (
    <Sheet open={Boolean(item)} onClose={onClose} title={<span className="flex items-center gap-2"><Trash2 className="size-5 text-red-500" /> Remove {item?.name}</span>}>
      <div className="space-y-2">
        <p className="text-sm text-ink-600">Only possible before payment. Logged with your name.</p>
        {["Guest changed their mind", "Wrong item entered"].map((r) => (
          <Button key={r} variant="secondary" size="lg" className="w-full justify-start" onClick={() => voidIt.mutate(r)} loading={voidIt.isPending && voidIt.variables === r}>
            {r}
          </Button>
        ))}
        <Textarea rows={2} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other reason" />
        <Button variant="danger" size="lg" className="w-full" disabled={other.trim().length < 2} onClick={() => voidIt.mutate(other.trim())}>
          Remove item
        </Button>
      </div>
    </Sheet>
  );
}

type TableOption = { id: string; label: string; area: string; sessionId: string | null; waiterId: string | null; waiterName: string | null };

/** Waiter keys in an order (guest has no smartphone, or is ordering by voice). */
function AddOrderSheet({ target, onClose }: { target: { sessionId?: string; label?: string }; onClose: () => void }) {
  const [tableId, setTableId] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<{ categories: MenuCategory[] }>("/api/menu") });
  const tables = useQuery({
    queryKey: ["table-list"],
    queryFn: () => api<{ tables: TableOption[] }>("/api/staff/table-list"),
    enabled: !target.sessionId,
  });
  const cart = useCart(`staff-cart:${target.sessionId ?? "new"}`);
  const send = useMutation({
    mutationFn: () =>
      post<{ seq: number }>("/api/staff/orders", {
        sessionId: target.sessionId,
        tableId: target.sessionId ? undefined : tableId,
        items: cartItems(cart),
        note: note.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast({ tone: "success", title: `Order #${r.seq} added`, body: "Take payment on the table card to send it to the kitchen/bar." });
      cart.clear();
      void qc.invalidateQueries({ queryKey: ["tables"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't send order", body: e.message }),
  });
  const chosen = tables.data?.tables.find((t) => t.id === tableId);
  const ready = cart.count > 0 && (target.sessionId || tableId);

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={target.label ? `Add items · ${target.label}` : "Take an order"}
      footer={
        review ? (
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="secondary" size="lg" onClick={() => setReview(false)}>
              Back
            </Button>
            <Button size="lg" disabled={!ready} loading={send.isPending} onClick={() => send.mutate()}>
              Send · {formatNaira(cart.totalKobo)}
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" variant="dark" disabled={cart.count === 0} onClick={() => setReview(true)}>
            Review {cart.count} item{cart.count === 1 ? "" : "s"} · {formatNaira(cart.totalKobo)}
          </Button>
        )
      }
    >
      {!target.sessionId ? (
        <Field label="Table" className="mb-2">
          <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">Choose a table…</option>
            {tables.data?.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.area}
                {t.waiterName ? ` (${t.waiterName})` : t.sessionId ? " (seated)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {chosen?.waiterName ? <p className="mb-2 text-sm text-amber-700">This table belongs to {chosen.waiterName}.</p> : null}
      {review ? (
        <div>
          <CartLines cart={cart} />
          <Textarea className="mt-3" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the kitchen (optional)" />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
            <Sparkles className="size-3.5" /> Take payment on the table card and it goes straight to the kitchen/bar.
          </p>
        </div>
      ) : menu.data ? (
        <MenuBrowser categories={menu.data.categories} cart={cart} compact />
      ) : (
        <Spinner className="mx-auto my-10" />
      )}
    </Sheet>
  );
}
