"use client";

import { AlarmClock, Building2, Landmark, ReceiptText, RotateCcw, Smartphone, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Toggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { applyBps, formatNaira } from "@/lib/money";
import { DEFAULT_WEIGHTS, type ScoreWeights } from "@/lib/score-weights";
import { isWithinOpeningHours } from "@/lib/time";
import { setOrderingEnabledAction, updateSettingsAction } from "../actions";
import { useAction } from "../use-action";

type Form = {
  restaurantName: string;
  tagline: string;
  phone: string;
  address: string;
  instagram: string;
  vatPercent: number;
  serviceChargePercent: number;
  claimTimeoutSec: number;
  requestEscalateSec: number;
  readyAlertSec: number;
  openingTime: string;
  closingTime: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  scoreWeights: ScoreWeights;
  minHoursForAward: number;
  minOrdersForAward: number;
};

const WEIGHTS: { key: keyof ScoreWeights; label: string; hint: string }[] = [
  { key: "rating", label: "Guest ratings", hint: "Stars guests give for service" },
  { key: "speed", label: "Speed", hint: "Accepting orders and bringing food out" },
  { key: "productivity", label: "Orders per hour", hint: "Fair to part-timers" },
  { key: "responsiveness", label: "Answering guests", hint: "Call waiter, water, bill" },
  { key: "reliability", label: "Reliability", hint: "Cash handover and few mistakes" },
];

export function SettingsForm({ initial, orderingEnabled }: { initial: Form; orderingEnabled: boolean }) {
  const [baseline, setBaseline] = useState(initial);
  const [f, setF] = useState(initial);
  const [ordering, setOrdering] = useState(orderingEnabled);
  const toast = useToast();
  const { pending, run } = useAction();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(baseline);

  const save = useCallback(() => {
    run(
      () => updateSettingsAction({ ...f, orderingEnabled: ordering }),
      "Settings saved",
      () => setBaseline(f),
    );
  }, [f, ordering, run]);

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !pending) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, pending, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const allDay = f.openingTime === f.closingTime;
  const openNow = isWithinOpeningHours(new Date(), f.openingTime, f.closingTime);

  const preview = useMemo(() => {
    const meal = 2_000_000;
    const svc = applyBps(meal, Math.round(f.serviceChargePercent * 100));
    const vat = applyBps(meal + svc, Math.round(f.vatPercent * 100));
    return { meal, svc, vat, total: meal + svc + vat };
  }, [f.serviceChargePercent, f.vatPercent]);

  const weightTotal = Object.values(f.scoreWeights).reduce((a, b) => a + Number(b || 0), 0) || 1;

  return (
    <div className="max-w-4xl space-y-5 pb-24">
      {/* Instant switch */}
      <section className={cn("flex items-center gap-4 rounded-2xl p-5 ring-1 transition-colors", ordering ? "bg-moss-50 ring-moss-100" : "bg-brand-50 ring-brand-200")}>
        <Smartphone className={cn("size-8 shrink-0", ordering ? "text-moss-600" : "text-brand-700")} strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl text-ink-900">{ordering ? "Guests can order from their phones" : "Phone ordering is paused"}</p>
          <p className="text-sm text-ink-600">
            {ordering
              ? "Switch off for a private event or a power cut — guests can still call a waiter. Takes effect instantly."
              : "Guests see the menu and can call a waiter, but can't send orders. Switch on to resume."}
          </p>
        </div>
        <Toggle
          checked={ordering}
          label="Phone ordering"
          onChange={async (v) => {
            setOrdering(v);
            const r = await setOrderingEnabledAction(v);
            if (!r.ok) {
              setOrdering(!v);
              toast({ tone: "error", title: "Couldn't change ordering", body: r.error });
            } else toast({ tone: "success", title: v ? "Phone ordering is on" : "Phone ordering paused" });
          }}
        />
      </section>

      <Section icon={<AlarmClock />} title="Kitchen hours" description="Outside these hours guests can browse and call a waiter, but can't send orders.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Opens">
            <Input type="time" value={f.openingTime} disabled={allDay} onChange={(e) => set("openingTime", e.target.value)} className="w-36" />
          </Field>
          <Field label="Last orders">
            <Input type="time" value={f.closingTime} disabled={allDay} onChange={(e) => set("closingTime", e.target.value)} className="w-36" />
          </Field>
          <label className="flex h-11 items-center gap-3 text-sm font-medium text-ink-700">
            <Toggle checked={allDay} onChange={(v) => (v ? setF((s) => ({ ...s, openingTime: "00:00", closingTime: "00:00" })) : setF((s) => ({ ...s, openingTime: "10:00", closingTime: "23:00" })))} label="Open all day" />
            Open all day
          </label>
        </div>
        <p className={cn("mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", openNow ? "bg-moss-100 text-moss-700" : "bg-linen-200 text-ink-600")}>
          <span className={cn("size-1.5 rounded-full", openNow ? "bg-moss-500" : "bg-ink-500")} />
          {allDay ? "Open around the clock" : openNow ? `Open now · last orders ${f.closingTime}` : `Closed now · opens ${f.openingTime}`}
        </p>
      </Section>

      <Section icon={<ReceiptText />} title="On the bill" description="Your menu prices exclude these; they're added at the bottom of every bill.">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
          <Field label="Service charge">
            <PercentInput value={f.serviceChargePercent} onChange={(v) => set("serviceChargePercent", v)} />
          </Field>
          <Field label="VAT">
            <PercentInput value={f.vatPercent} onChange={(v) => set("vatPercent", v)} />
          </Field>
          <div className="rounded-xl bg-linen-100 p-3 text-sm">
            <p className="eyebrow text-[10px] text-ink-500">Example bill</p>
            <dl className="mt-1.5 space-y-0.5 tabular">
              <PreviewRow label="Food & drinks" value={formatNaira(preview.meal)} />
              <PreviewRow label={`Service ${f.serviceChargePercent}%`} value={formatNaira(preview.svc)} />
              <PreviewRow label={`VAT ${f.vatPercent}%`} value={formatNaira(preview.vat)} />
              <PreviewRow label="Guest pays" value={formatNaira(preview.total)} strong />
            </dl>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-500">New rates apply to tables seated after you save; tables already seated keep the rate they started with.</p>
      </Section>

      <Section icon={<Landmark />} title="Bank transfer details" description="Shown to guests who choose to pay by transfer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label="Bank">
              <Input value={f.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="e.g. Zenith Bank" />
            </Field>
            <Field label="Account name">
              <Input value={f.bankAccountName} onChange={(e) => set("bankAccountName", e.target.value)} placeholder="e.g. Istanbul Cafe & Restaurant Ltd" />
            </Field>
            <Field label="Account number">
              <Input inputMode="numeric" maxLength={10} value={f.bankAccountNumber} onChange={(e) => set("bankAccountNumber", e.target.value.replace(/\D/g, ""))} placeholder="10 digits" />
            </Field>
          </div>
          <div className="rounded-2xl bg-ink-900 p-4 text-linen-50">
            <p className="eyebrow text-[10px] text-gold-300">What guests see</p>
            {f.bankAccountNumber ? (
              <>
                <p className="mt-3 font-medium">{f.bankAccountName || "Account name"}</p>
                <p className="text-sm text-linen-400">{f.bankName || "Bank"}</p>
                <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 font-mono text-lg tracking-[0.15em]">{f.bankAccountNumber}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-linen-400">No account yet — guests will be told “your waiter will give you our account details”.</p>
            )}
            {f.bankAccountNumber && f.bankAccountNumber.length !== 10 ? <p className="mt-2 text-xs text-amber-300">Nigerian account numbers are 10 digits.</p> : null}
          </div>
        </div>
      </Section>

      <Section icon={<Building2 />} title="Restaurant details" description="Shown on the guest menu, receipts and table cards.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={f.restaurantName} onChange={(e) => set("restaurantName", e.target.value)} />
          </Field>
          <Field label="Tagline">
            <Input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field label="Phone for reservations">
            <Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Instagram" hint="Just the handle">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">@</span>
              <Input value={f.instagram} onChange={(e) => set("instagram", e.target.value.replace(/^@/, ""))} className="pl-7" />
            </div>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={<AlarmClock />} title="When to raise the alarm" description="If nobody acts in time, every waiter on shift and the manager on duty are alerted.">
        <div className="space-y-4">
          <Preset label="Order not accepted" value={f.claimTimeoutSec} options={[60, 120, 180, 300]} onChange={(v) => set("claimTimeoutSec", v)} />
          <Preset label="Guest request not answered" value={f.requestEscalateSec} options={[60, 120, 180, 300]} onChange={(v) => set("requestEscalateSec", v)} />
          <Preset label="Food waiting at the pass" value={f.readyAlertSec} options={[120, 180, 300, 600]} onChange={(v) => set("readyAlertSec", v)} />
        </div>
      </Section>

      <Section
        icon={<Trophy />}
        title="Staff of the Month"
        description="How much each part counts in a waiter's monthly score."
        action={
          <Button size="sm" variant="ghost" onClick={() => set("scoreWeights", DEFAULT_WEIGHTS)}>
            <RotateCcw className="size-3.5" /> Recommended
          </Button>
        }
      >
        <div className="space-y-4">
          {WEIGHTS.map((w) => {
            const pct = Math.round((Number(f.scoreWeights[w.key]) / weightTotal) * 100);
            return (
              <div key={w.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[14rem_1fr_3rem]">
                <div>
                  <p className="text-sm font-medium text-ink-800">{w.label}</p>
                  <p className="text-xs text-ink-500">{w.hint}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={f.scoreWeights[w.key]}
                  onChange={(e) => set("scoreWeights", { ...f.scoreWeights, [w.key]: Number(e.target.value) })}
                  className="order-3 col-span-2 w-full accent-brand-600 sm:order-0 sm:col-span-1"
                  aria-label={w.label}
                />
                <span className="text-right font-display text-lg tabular text-ink-900">{pct}%</span>
              </div>
            );
          })}
          <div className="grid gap-4 border-t border-linen-200 pt-4 sm:grid-cols-2">
            <Field label="Ranked after at least (hours this month)">
              <Input type="number" min={0} value={f.minHoursForAward} onChange={(e) => set("minHoursForAward", Number(e.target.value))} />
            </Field>
            <Field label="…or at least (orders served)">
              <Input type="number" min={0} value={f.minOrdersForAward} onChange={(e) => set("minOrdersForAward", Number(e.target.value))} />
            </Field>
          </div>
        </div>
      </Section>

      {/* Save bar: only when something changed */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-200 lg:left-64",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
        )}
      >
        <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-linen-50 shadow-2xl">
          <span className="flex-1 text-sm">You have unsaved changes</span>
          <Button variant="ghost" size="sm" className="text-linen-200 hover:bg-white/10" onClick={() => setF(baseline)} disabled={pending}>
            Discard
          </Button>
          <Button size="sm" loading={pending} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, description, action, children }: { icon: ReactNode; title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-linen-300/80 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 text-brand-600 [&>svg]:size-5">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl text-ink-900">{title}</h2>
          <p className="text-sm text-ink-500">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative">
      <Input type="number" inputMode="decimal" min={0} max={50} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="pr-8" />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-500">%</span>
    </div>
  );
}

function PreviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong ? "border-t border-linen-300 pt-1 font-semibold text-ink-900" : "text-ink-600")}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Preset({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium text-ink-800">{label}</span>
      <div className="flex rounded-xl bg-linen-200/80 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cn("h-9 rounded-lg px-3 text-sm font-medium transition-colors", value === o ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800")}
          >
            {o < 60 ? `${o}s` : `${o / 60} min`}
          </button>
        ))}
      </div>
    </div>
  );
}
