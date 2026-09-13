"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Hand, Landmark, MapPin, Phone, QrCode, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ornament, Wordmark } from "@/components/brand";
import { CartLines, MenuBrowser, type MenuCategory } from "@/components/menu-browser";
import { useToast } from "@/components/toast";
import { Button, Sheet, Spinner, Stars, Textarea } from "@/components/ui";
import { cartItems, useCart } from "@/hooks/useCart";
import { useLive } from "@/hooks/useLive";
import { billExtras } from "@/lib/bill";
import { api, ApiError, post } from "@/lib/client/api";
import type { Json } from "@/lib/client/types";
import { cn } from "@/lib/cn";
import { formatBps, formatNaira } from "@/lib/money";
import { formatDate, formatTime, lagosHour } from "@/lib/time";
import type { GuestView } from "@/services/sessions";

type View = Json<GuestView>;
type Order = View["orders"][number];
type MenuResponse = {
  categories: MenuCategory[];
  ordering: { enabled: boolean; open: boolean; openingTime: string; closingTime: string };
};
type Tab = "menu" | "orders" | "bill";

const HERO = "/brand/header-lamp.jpg";

function greeting() {
  const h = lagosHour(new Date());
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function GuestApp({ error }: { error?: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("menu");
  const tabsRef = useRef<HTMLDivElement>(null);
  const view = useQuery({ queryKey: ["guest"], queryFn: () => api<View>("/api/guest/session"), refetchInterval: 15_000, enabled: !error });
  const menu = useQuery({ queryKey: ["menu"], queryFn: () => api<MenuResponse>("/api/menu"), refetchInterval: 60_000, enabled: !error });
  const { connected } = useLive({ as: "guest", invalidate: { session: [["guest"]], menu: [["menu"]] } });
  const cart = useCart(view.data ? `cart:${view.data.session.id}` : null);

  // Remove sold-out items from the cart when the menu changes.
  const { prune } = cart;
  useEffect(() => {
    if (!menu.data) return;
    const available = new Set(menu.data.categories.flatMap((c) => c.items.filter((i) => i.isAvailable).map((i) => i.id)));
    const removed = prune(available);
    if (removed.length) toast({ tone: "info", title: "Just sold out", body: `${removed.join(", ")} was removed from your order` });
  }, [menu.data, prune, toast]);

  const go = (t: Tab) => {
    setTab(t);
    const el = tabsRef.current;
    if (el && el.getBoundingClientRect().top < 0) window.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  };

  if (error) return <FullScreen icon={<QrCode className="size-10" />} title="We couldn't open your table" body={error} />;
  if (view.isPending) return <LoadingHero />;
  if (view.error) {
    if (view.error instanceof ApiError && view.error.status === 401) {
      return <FullScreen icon={<QrCode className="size-10" />} title="Scan the card on your table" body="Point your phone camera at the QR code on your table to see the menu, order and call your waiter." />;
    }
    return <FullScreen icon={<WifiOff className="size-10" />} title="We can't reach the restaurant" body={view.error.message} action={<Button onClick={() => view.refetch()}>Try again</Button>} />;
  }

  const v = view.data;
  if (v.session.status === "CLOSED") {
    return (
      <FullScreen
        title="Thank you for dining with us"
        body={`Your visit at table ${v.table.label} has ended. We hope to welcome you back to Istanbul soon.`}
        action={v.restaurant.instagram ? <InstagramLink handle={v.restaurant.instagram} light /> : undefined}
      />
    );
  }

  const liveOrders = v.orders.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
  const activeOrders = liveOrders.filter((o) => o.status !== "SERVED").length;
  // Orders are paid up front: once everything has been served, ask how it was.
  const canRate = !v.session.rated && (v.session.status === "PAID" || (liveOrders.length > 0 && activeOrders === 0 && v.bill.balance <= 0));
  const ordering = menu.data?.ordering;
  const closedReason = !ordering
    ? null
    : !ordering.enabled
      ? "Ordering from your phone is paused right now — tap Call waiter and we'll take your order at the table."
      : !ordering.open
        ? `The kitchen is closed right now — we take orders from ${ordering.openingTime} to ${ordering.closingTime}.`
        : null;
  const firstName = v.waiter?.name.split(" ")[0];

  return (
    <div className="paper mx-auto min-h-dvh max-w-lg">
      {/* Welcome */}
      <header className="relative h-64 overflow-hidden bg-ink-900 text-linen-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/60 to-ink-950/25" />
        <div className="relative flex h-full flex-col justify-between px-5 pb-12 pt-[max(1.1rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between">
            <Wordmark className="text-[15px]" />
            <div className="rounded-2xl bg-white/10 px-3.5 py-2 text-right ring-1 ring-white/15 backdrop-blur-md">
              <p className="eyebrow text-[9px] text-linen-200/80">Table</p>
              <p className="font-display text-2xl leading-none">{v.table.label}</p>
            </div>
          </div>
          <div>
            <p className="eyebrow text-gold-300">{v.table.area}</p>
            <h1 className="mt-1.5 font-display text-[2rem] leading-[1.1]">
              {greeting()},
              <br />
              <span className="text-gold-200">welcome to Istanbul.</span>
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-linen-200/85">
              {v.waiter ? (
                <>
                  <Avatar name={v.waiter.name} photoId={v.waiter.photoId} className="size-6 text-[11px]" />
                  {firstName} is looking after your table
                </>
              ) : (
                "Order below and a waiter will be with you in a moment."
              )}
            </p>
            {!connected ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-300">
                <WifiOff className="size-3.5" /> Reconnecting… updates may be a little behind.
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <CallWaiter view={v} orderingPaused={ordering?.enabled === false} />

      <div ref={tabsRef} className="mt-4 flex gap-6 border-b border-linen-300 px-5">
        {(
          [
            ["menu", "Menu", null],
            ["orders", "Your orders", activeOrders || null],
            ["bill", "Bill", v.bill.total ? formatNaira(v.bill.total) : null],
          ] as const
        ).map(([key, label, extra]) => (
          <button
            key={key}
            onClick={() => go(key)}
            className={cn("relative flex items-center gap-1.5 pb-2.5 pt-1 text-[15px] font-medium transition-colors", tab === key ? "text-ink-900" : "text-ink-500")}
          >
            {label}
            {extra != null ? (
              <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular", key === "orders" ? "bg-brand-600 text-white" : "text-ink-500")}>{extra}</span>
            ) : null}
            <span className={cn("absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-600 transition-opacity", tab === key ? "opacity-100" : "opacity-0")} />
          </button>
        ))}
      </div>

      <main className="px-4 pb-40">
        {canRate && tab !== "bill" ? (
          <button onClick={() => go("bill")} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-moss-600 px-4 py-3.5 text-left text-white">
            <span>
              <span className="block font-medium">Enjoying your meal?</span>
              <span className="text-sm text-moss-100">Tell us how everything was →</span>
            </span>
          </button>
        ) : null}

        {tab === "menu" ? (
          menu.data ? (
            <>
              {closedReason ? <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{closedReason}</div> : null}
              <MenuBrowser categories={menu.data.categories} cart={cart} closedReason={closedReason} />
            </>
          ) : (
            <MenuSkeleton />
          )
        ) : tab === "orders" ? (
          <OrdersTab view={v} onMenu={() => go("menu")} />
        ) : (
          <BillTab view={v} canRate={canRate} />
        )}
        <Footer view={v} />
      </main>

      {tab === "menu" && cart.count > 0 && !closedReason ? <CartBar cart={cart} extras={billExtras(v.session.vatBps, v.session.serviceChargeBps)} onSent={() => go("orders")} /> : null}
    </div>
  );
}

function Avatar({ name, photoId, className }: { name: string; photoId?: string | null; className?: string }) {
  if (photoId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/images/${photoId}`} alt="" className={cn("size-8 rounded-full object-cover ring-1 ring-white/30", className)} />;
  }
  return <span className={cn("flex size-8 items-center justify-center rounded-full bg-brand-600 font-display text-sm text-white", className)}>{name.charAt(0)}</span>;
}

/** The one thing guests can ask for from the phone: their waiter. */
function CallWaiter({ view, orderingPaused }: { view: View; orderingPaused: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const firstName = view.waiter?.name.split(" ")[0];
  const send = useMutation({
    mutationFn: () => post("/api/guest/requests", { type: "CALL_WAITER" }),
    onSuccess: () => {
      toast({ tone: "success", title: "We've let your waiter know", body: firstName ? `${firstName} will be with you shortly.` : "Someone will be with you shortly." });
      void qc.invalidateQueries({ queryKey: ["guest"] });
    },
    onError: (e) => toast({ tone: "error", title: "That didn't go through", body: e.message }),
  });
  const call = view.requests.find((r) => r.type === "CALL_WAITER");
  // Same rule as the server: opens up once the table has ordered (or when the waiter must take the order).
  const locked = view.orders.length === 0 && !orderingPaused;

  return (
    <div className="relative z-10 -mt-8 px-4">
      <button
        disabled={locked || send.isPending}
        onClick={() => send.mutate()}
        className="flex w-full items-center gap-3.5 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[0_8px_30px_rgba(12,22,44,0.12)] ring-1 ring-linen-300/70 transition-colors enabled:active:bg-linen-50"
      >
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", call ? "bg-brand-600 text-white" : "bg-linen-100 text-ink-800", locked && "opacity-50")}>
          <Hand className="size-5" strokeWidth={1.8} />
        </span>
        <span className={cn("min-w-0 flex-1", locked && "opacity-60")}>
          <span className="block font-medium text-ink-900">
            {call ? (call.status === "ACKNOWLEDGED" ? `${firstName ?? "Your waiter"} is on the way` : "Waiter called") : "Call waiter"}
          </span>
          <span className="block text-sm text-ink-500">
            {locked ? "Available once you've placed an order" : call ? "We've let them know — they'll be right with you" : "Need anything? We'll come to your table"}
          </span>
        </span>
      </button>
    </div>
  );
}

function CartBar({ cart, extras, onSent }: { cart: ReturnType<typeof useCart>; extras: string | null; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const send = useMutation({
    mutationFn: () => post<{ seq: number }>("/api/guest/orders", { items: cartItems(cart), note: note.trim() || undefined }),
    onSuccess: (r) => {
      cart.clear();
      setNote("");
      setOpen(false);
      toast({ tone: "success", title: `Order Nº ${r.seq} sent`, body: "Your waiter will come to take payment, then it goes to the kitchen." });
      void qc.invalidateQueries({ queryKey: ["guest"] });
      onSent();
    },
    onError: (e) => {
      toast({ tone: "error", title: "Your order wasn't sent", body: e.message });
      void qc.invalidateQueries({ queryKey: ["menu"] });
    },
  });

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={() => setOpen(true)} className="flex h-[3.75rem] w-full items-center justify-between rounded-2xl bg-ink-900 px-5 text-linen-50 shadow-[0_10px_30px_rgba(20,14,11,0.35)] animate-rise">
          <span className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold tabular">{cart.count}</span>
            <span className="font-medium">Review your order</span>
          </span>
          <span className="font-display text-lg tabular">{formatNaira(cart.totalKobo)}</span>
        </button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Your order"
        footer={
          <div className="space-y-2">
            <Button size="xl" className="w-full" loading={send.isPending} disabled={cart.count === 0} onClick={() => send.mutate()}>
              Send to waiter · {formatNaira(cart.totalKobo)}
            </Button>
            <p className="text-center text-xs text-ink-500">
              Your waiter comes to take payment (cash, card or transfer), then your order goes straight to the kitchen.
              {extras ? ` Plus ${extras}.` : ""}
            </p>
          </div>
        }
      >
        {cart.count === 0 ? (
          <p className="py-8 text-center text-ink-500">Nothing here yet.</p>
        ) : (
          <>
            <CartLines cart={cart} />
            <Textarea className="mt-3" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for your waiter (e.g. bring the drinks first)" />
          </>
        )}
      </Sheet>
    </>
  );
}

function orderStages(o: Order) {
  const live = o.items.filter((i) => i.status !== "VOIDED");
  const anyReady = live.some((i) => i.status === "READY" || i.status === "SERVED");
  const waiter = o.waiterName?.split(" ")[0];
  const inKitchen = o.status === "ACCEPTED" || o.status === "READY" || o.status === "SERVED";
  const ready = o.status === "READY" || o.status === "SERVED" || anyReady;
  const readyAround = o.paidAt ? formatTime(new Date(new Date(o.paidAt).getTime() + o.estimateMinutes * 60_000)) : null;
  return [
    { label: "Order sent", done: true, at: o.placedAt },
    { label: waiter ? `Accepted by ${waiter}` : "Waiting for your waiter", done: Boolean(o.acceptedAt), at: o.acceptedAt },
    {
      label: inKitchen ? (o.paidAt ? "Paid — sent to the kitchen" : "In the kitchen") : o.acceptedAt ? `${waiter ?? "Your waiter"} is coming to take payment` : "Pay your waiter",
      done: inKitchen,
      at: o.paidAt,
    },
    { label: readyAround && !ready ? `Ready around ${readyAround} (about ${o.estimateMinutes} min)` : "Ready", done: ready, at: o.readyAt },
    { label: "Served — enjoy", done: o.status === "SERVED", at: o.servedAt },
  ];
}

/** Shown until the waiter has taken payment for an order. */
function PayBox({ order: o, view }: { order: Order; view: View }) {
  const [transfer, setTransfer] = useState(false);
  const extras = billExtras(view.session.vatBps, view.session.serviceChargeBps);
  if (o.dueKobo === 0) {
    return (
      <p className="mt-3 rounded-xl bg-moss-50 px-3 py-2.5 text-sm text-moss-900 ring-1 ring-moss-200">
        Already paid — your waiter will send it to the kitchen. Ready in about {o.estimateMinutes} min.
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-brand-900">To pay your waiter</span>
        <span className="font-display text-xl text-ink-900 tabular">{formatNaira(o.dueKobo)}</span>
      </div>
      <p className="mt-0.5 text-xs text-brand-900/80">
        Cash, card or transfer{extras ? `, ${extras} included` : ""}
        {o.dueKobo < o.totalKobo ? ` (${formatNaira(o.totalKobo - o.dueKobo)} already paid)` : ""}. It goes to the kitchen as soon as you&apos;ve paid — ready in
        about {o.estimateMinutes} min.
      </p>
      {view.restaurant.bankAccountNumber ? (
        transfer ? (
          <BankDetails view={view} className="mt-3" />
        ) : (
          <button onClick={() => setTransfer(true)} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <Landmark className="size-4" /> Paying by transfer? See our account
          </button>
        )
      ) : null}
    </div>
  );
}

function OrdersTab({ view, onMenu }: { view: View; onMenu: () => void }) {
  const orders = view.orders;
  if (orders.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-2xl text-ink-900">Nothing ordered yet</p>
        <p className="mt-1 text-sm text-ink-500">Your orders and their progress appear here.</p>
        <Button variant="secondary" className="mt-5" onClick={onMenu}>
          See the menu
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4 pt-5">
      {[...orders].reverse().map((o) => {
        const closed = o.status === "REJECTED" || o.status === "CANCELLED";
        const stages = orderStages(o);
        const current = stages.findIndex((s) => !s.done);
        return (
          <article key={o.id} className="rounded-2xl bg-white p-4 ring-1 ring-linen-300/80">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-xl text-ink-900">Order Nº {o.seq}</h3>
              <span className="text-sm text-ink-500 tabular">{formatTime(o.placedAt)}</span>
            </div>
            {closed ? (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-900">
                {o.status === "REJECTED" ? "Your waiter couldn't accept this order" : "This order was cancelled"}
                {o.cancelReason ? ` — ${o.cancelReason}` : ""}. Tap Call waiter if you have any questions.
              </p>
            ) : (
              <ol className="mt-3 space-y-0">
                {stages.map((s, i) => {
                  const isCurrent = i === current;
                  return (
                    <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < stages.length - 1 ? <span className={cn("absolute left-[7px] top-4 h-full w-px", s.done ? "bg-moss-500" : "bg-linen-300")} /> : null}
                      <span
                        className={cn(
                          "relative mt-1 size-[15px] shrink-0 rounded-full border-2",
                          s.done ? "border-moss-500 bg-moss-500" : isCurrent ? "border-brand-600 bg-white animate-pulse-ring" : "border-linen-400 bg-white",
                        )}
                      />
                      <span className={cn("flex flex-1 justify-between text-sm", s.done ? "text-ink-900" : isCurrent ? "font-medium text-brand-800" : "text-ink-500")}>
                        {s.label}
                        {s.at && s.done ? <span className="text-ink-500 tabular">{formatTime(s.at)}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {o.status === "PLACED" || o.status === "AWAITING_PAYMENT" ? <PayBox order={o} view={view} /> : null}
            <ul className="mt-3 space-y-1.5 border-t border-dashed border-linen-300 pt-3 text-sm">
              {o.items.map((i) => (
                <li key={i.id} className={cn("flex justify-between gap-3", i.status === "VOIDED" && "text-ink-500 line-through")}>
                  <span>
                    <span className="tabular text-ink-500">{i.qty}×</span> {i.name}
                    {i.options ? <span className="block pl-5 text-xs text-ink-500">{i.options}</span> : null}
                    {i.note ? <span className="block pl-5 text-xs italic text-ink-500">“{i.note}”</span> : null}
                  </span>
                  {!closed && i.status === "READY" ? <span className="shrink-0 text-xs font-semibold text-moss-600">Ready</span> : null}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function BankDetails({ view, className }: { view: View; className?: string }) {
  const toast = useToast();
  const r = view.restaurant;
  if (!r.bankAccountNumber) return <p className="text-sm text-ink-600">Your waiter will give you our account details.</p>;
  return (
    <div className={cn("rounded-2xl bg-ink-900 p-4 text-linen-50", className)}>
      <p className="eyebrow text-gold-300">Transfer to</p>
      <p className="mt-2 font-medium">{r.bankAccountName}</p>
      <p className="text-sm text-linen-200/80">{r.bankName}</p>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2.5">
        <span className="font-mono text-xl tracking-[0.12em]">{r.bankAccountNumber}</span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(r.bankAccountNumber);
            toast({ tone: "success", title: "Account number copied" });
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gold-300 hover:bg-white/10"
        >
          <Copy className="size-4" /> Copy
        </button>
      </div>
      <p className="mt-2.5 text-xs text-linen-200/70">Show your waiter the confirmation and they&apos;ll send your order to the kitchen.</p>
    </div>
  );
}

function BillTab({ view, canRate }: { view: View; canRate: boolean }) {
  const b = view.bill;
  const lines = new Map<string, { name: string; options: string; qty: number; kobo: number }>();
  for (const o of view.orders) {
    if (o.status === "REJECTED" || o.status === "CANCELLED") continue;
    for (const i of o.items) {
      if (i.status === "VOIDED") continue;
      const k = `${i.name}|${i.options}|${i.unitPriceKobo}`;
      const cur = lines.get(k) ?? { name: i.name, options: i.options, qty: 0, kobo: 0 };
      cur.qty += i.qty;
      cur.kobo += i.qty * i.unitPriceKobo;
      lines.set(k, cur);
    }
  }
  const paid = b.total > 0 && b.balance <= 0;
  return (
    <div className="space-y-4 pt-5">
      {canRate || view.session.rated ? <RatingCard view={view} /> : null}
      <div className="receipt-edge bg-white px-5 pb-8 pt-6 shadow-[0_1px_3px_rgba(12,22,44,0.08)]">
        <div className="text-center">
          <Wordmark tone="dark" sub={false} className="text-[13px]" />
          <p className="mt-2 text-xs text-ink-500">
            Table {view.table.label} · {formatDate(view.session.openedAt)}
          </p>
        </div>
        <Ornament className="my-4" />
        {lines.size === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">Your bill is empty.</p>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {[...lines.values()].map((l) => (
                <li key={`${l.name}${l.options}`} className="flex items-baseline">
                  <span>
                    <span className="text-ink-500 tabular">{l.qty} ×</span> {l.name}
                    {l.options ? <span className="block pl-6 text-xs text-ink-500">{l.options}</span> : null}
                  </span>
                  <span className="leader" />
                  <span className="tabular">{formatNaira(l.kobo)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-dashed border-linen-400 pt-4 text-sm">
              <Row label="Subtotal" value={formatNaira(b.subtotal)} />
              {b.serviceCharge ? <Row label={`Service charge ${formatBps(view.session.serviceChargeBps)}`} value={formatNaira(b.serviceCharge)} /> : null}
              {b.vat ? <Row label={`VAT ${formatBps(view.session.vatBps)}`} value={formatNaira(b.vat)} /> : null}
              <div className="flex items-baseline justify-between pt-2">
                <dt className="font-display text-lg">Total</dt>
                <dd className="font-display text-2xl tabular">{formatNaira(b.total)}</dd>
              </div>
              {b.paid ? <Row label="Paid" value={`− ${formatNaira(b.paid)}`} /> : null}
              {b.balance > 0 ? <Row label="Left to pay" value={formatNaira(b.balance)} strong /> : null}
            </dl>
            {paid ? <p className="mt-4 text-center font-display text-lg text-moss-600">Paid with thanks</p> : null}
            {view.payments.length ? (
              <p className="mt-2 text-center text-xs text-ink-500">
                {view.payments.map((p) => `${formatNaira(p.amountKobo)} by ${p.method === "POS" ? "card" : p.method.toLowerCase()} · ${formatTime(p.createdAt)}`).join("   ")}
              </p>
            ) : null}
          </>
        )}
      </div>
      {!paid && b.total > 0 ? <p className="px-2 text-center text-sm text-ink-500">Your waiter takes payment for each order before it goes to the kitchen.</p> : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong ? "font-semibold text-ink-900" : "text-ink-600")}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function RatingCard({ view }: { view: View }) {
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const firstName = view.waiter?.name.split(" ")[0];
  const submit = useMutation({
    mutationFn: () => post("/api/guest/rating", { foodRating: food, serviceRating: service, comment: comment.trim() || undefined }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["guest"] }),
    onError: (e) => toast({ tone: "error", title: "Couldn't send your rating", body: e.message }),
  });
  if (view.session.rated) {
    return (
      <div className="rounded-2xl bg-ink-900 px-5 py-6 text-center text-linen-50">
        <p className="font-display text-2xl">Thank you!</p>
        <p className="mt-1 text-sm text-linen-200/80">Your words go straight to our manager{firstName ? ` — and help ${firstName} get recognised` : ""}.</p>
        {view.restaurant.instagram ? <InstagramLink handle={view.restaurant.instagram} light className="mt-4" /> : null}
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-linen-300/80">
      <h2 className="font-display text-2xl text-ink-900">How was everything?</h2>
      <p className="text-sm text-ink-500">Thirty seconds, and it helps us a lot.</p>
      <div className="mt-5 space-y-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-700">The food</p>
          <Stars value={food} onChange={setFood} size="lg" />
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-700">
            {view.waiter ? <Avatar name={view.waiter.name} photoId={view.waiter.photoId} className="size-6 text-[11px]" /> : null}
            Your service{firstName ? ` from ${firstName}` : ""}
          </p>
          <Stars value={service} onChange={setService} size="lg" />
        </div>
        <Textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything we should know? (optional)" />
        <Button size="lg" className="w-full" disabled={!food || !service} loading={submit.isPending} onClick={() => submit.mutate()}>
          Send
        </Button>
      </div>
    </div>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InstagramLink({ handle, light, className }: { handle: string; light?: boolean; className?: string }) {
  return (
    <a
      href={`https://instagram.com/${handle}`}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-2 text-sm font-medium", light ? "text-gold-300" : "text-brand-700", className)}
    >
      <InstagramGlyph className="size-4" /> @{handle}
    </a>
  );
}

function Footer({ view }: { view: View }) {
  const r = view.restaurant;
  const extras = billExtras(view.session.vatBps, view.session.serviceChargeBps);
  return (
    <footer className="mt-14 text-center">
      <Ornament className="mx-auto max-w-[12rem]" />
      <Wordmark tone="dark" className="mt-5 text-[12px]" />
      <p className="mt-2 font-display text-sm text-ink-600">{r.tagline}</p>
      <div className="mt-4 space-y-1.5 text-sm text-ink-600">
        {r.address ? (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(r.address)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5">
            <MapPin className="size-3.5 text-brand-600" /> {r.address}
          </a>
        ) : null}
        {r.phone ? (
          <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="flex items-center justify-center gap-1.5">
            <Phone className="size-3.5 text-brand-600" /> {r.phone}
          </a>
        ) : null}
        {r.instagram ? <InstagramLink handle={r.instagram} /> : null}
      </div>
      <p className="mt-6 text-[11px] text-ink-500/80">
        {extras ? `Prices exclude ${extras} · ` : null}
        <a href="/credits" className="underline underline-offset-2">
          Photo credits
        </a>
      </p>
    </footer>
  );
}

function FullScreen({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-end overflow-hidden bg-ink-900 text-linen-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HERO} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/75 to-ink-950/30" />
      <div className="relative px-7 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <Wordmark className="text-[15px]" />
        <div className="mt-10 space-y-3">
          {icon ? <div className="text-gold-300">{icon}</div> : null}
          <h1 className="font-display text-[2rem] leading-tight">{title}</h1>
          <p className="text-linen-200/85">{body}</p>
          {action ? <div className="pt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function LoadingHero() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <div className="relative flex h-64 items-end bg-ink-900 px-5 pb-12">
        <Wordmark className="text-[15px]" />
      </div>
      <div className="flex justify-center py-16">
        <Spinner className="size-7" />
      </div>
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="animate-pulse space-y-5 pt-8">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-linen-300" />
            <div className="h-3 w-full rounded bg-linen-200" />
            <div className="h-3 w-1/3 rounded bg-linen-200" />
          </div>
          <div className="size-[5.5rem] rounded-xl bg-linen-200" />
        </div>
      ))}
    </div>
  );
}
