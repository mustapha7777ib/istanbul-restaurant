"use client";

import { Check, ChevronLeft, Crown, Flame, Leaf, Minus, Plus, Search, Star, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Cart } from "@/hooks/useCart";
import { cn } from "@/lib/cn";
import type { Json } from "@/lib/client/types";
import { formatNaira } from "@/lib/money";
import type { Choice } from "@/lib/options";
import type { PublicMenu } from "@/services/menu";
import { Button, Sheet, Textarea } from "./ui";

export type MenuCategory = Json<PublicMenu>[number];
export type MenuItem = MenuCategory["items"][number];

const TAGS: Record<string, { icon: typeof Flame; label: string; cls: string }> = {
  signature: { icon: Crown, label: "Signature", cls: "text-brand-700" },
  spicy: { icon: Flame, label: "Spicy", cls: "text-[#b3321f]" },
  vegetarian: { icon: Leaf, label: "Vegetarian", cls: "text-moss-600" },
  popular: { icon: Star, label: "Guest favourite", cls: "text-amber-700" },
};

export function TagList({ tags, className }: { tags: string[]; className?: string }) {
  const known = tags.filter((t) => TAGS[t]);
  if (!known.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      {known.map((t) => {
        const T = TAGS[t];
        return (
          <span key={t} className={cn("inline-flex items-center gap-1 text-[11px] font-medium tracking-wide", T.cls)}>
            <T.icon className="size-3" strokeWidth={2.2} />
            {T.label}
          </span>
        );
      })}
    </span>
  );
}

function Photo({ src, className, alt = "" }: { src: string | null; className?: string; alt?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- served from our own DB with long cache headers
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />;
}

const needsChoice = (item: MenuItem) => item.optionGroups.some((g) => g.required);

export function QtyStepper({ qty, onChange, size = "md", dark }: { qty: number; onChange: (q: number) => void; size?: "md" | "lg"; dark?: boolean }) {
  const btn = size === "lg" ? "size-11" : "size-8";
  return (
    <div className={cn("flex items-center gap-1 rounded-full p-1", dark ? "bg-white/10" : "bg-linen-200")}>
      <button type="button" onClick={() => onChange(qty - 1)} className={cn(btn, "flex items-center justify-center rounded-full bg-white text-ink-800 shadow-sm active:scale-95")} aria-label="Less">
        <Minus className="size-4" />
      </button>
      <span className={cn("min-w-7 text-center font-semibold tabular", size === "lg" && "text-lg", dark && "text-white")}>{qty}</span>
      <button type="button" onClick={() => onChange(qty + 1)} className={cn(btn, "flex items-center justify-center rounded-full bg-brand-600 text-white shadow-sm active:scale-95")} aria-label="More">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const PICKS = "picks";

/**
 * The menu, section first: a grid of sections with photos, then one section's
 * dishes at a time — easy to scan on a phone. Search looks across everything.
 */
export function MenuBrowser({
  categories,
  cart,
  closedReason,
  compact,
}: {
  categories: MenuCategory[];
  cart: Cart;
  /** Ordering is closed: dishes can still be browsed, and this says why they can't be added. */
  closedReason?: string | null;
  /** Staff view: no Chef's picks, smaller tiles and rows. */
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [open, setOpen] = useState<MenuItem | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    const featured = compact ? [] : categories.flatMap((c) => c.items.filter((i) => i.featured && i.isAvailable));
    return [...(featured.length ? [{ id: PICKS, name: "Chef's picks", items: featured }] : []), ...categories];
  }, [categories, compact]);
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? categories
            .map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${i.description} ${i.tags.join(" ")} ${c.name}`.toLowerCase().includes(q)) }))
            .filter((c) => c.items.length)
        : [],
    [categories, q],
  );
  // A section can disappear under us (live menu update): fall back to the grid.
  const section = sections.find((s) => s.id === sectionId) ?? null;

  const show = (id: string | null) => {
    setSectionId(id);
    // Start the new view at its top, not wherever the grid was scrolled to.
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  };

  const tapAdd = (item: MenuItem) => {
    if (closedReason || !item.isAvailable) return;
    if (needsChoice(item)) setOpen(item);
    else cart.add(item);
  };

  const list = (items: MenuItem[]) => (
    <ul className="divide-y divide-linen-300/70">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          inCart={cart.qtyByItem[item.id] ?? 0}
          compact={compact}
          canAdd={!closedReason}
          onOpen={() => setOpen(item)}
          onAdd={() => tapAdd(item)}
        />
      ))}
    </ul>
  );

  return (
    <div ref={topRef}>
      <div className="sticky top-0 z-20 -mx-4 border-b border-linen-300/70 bg-linen-100/95 px-4 py-2.5 backdrop-blur">
        {section && !q ? (
          <div className="flex h-11 items-center gap-2">
            <button
              onClick={() => show(null)}
              className="-ml-2 flex h-11 shrink-0 items-center gap-0.5 rounded-xl pl-1 pr-3 text-[15px] font-medium text-ink-700 hover:bg-linen-200"
            >
              <ChevronLeft className="size-5" /> Menu
            </button>
            <h2 className="min-w-0 flex-1 truncate text-right font-display text-xl text-ink-900">{section.name}</h2>
          </div>
        ) : (
          <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-linen-300 focus-within:ring-2 focus-within:ring-brand-500/40">
            <Search className="size-4 shrink-0 text-ink-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes and drinks"
              aria-label="Search the menu"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-500/60"
            />
            {query ? (
              <button onClick={() => setQuery("")} className="rounded-full p-1 text-ink-500 hover:bg-linen-200" aria-label="Clear search">
                <X className="size-4" />
              </button>
            ) : null}
          </label>
        )}
      </div>

      {q ? (
        results.length ? (
          results.map((c) => (
            <section key={c.id} className="pt-5">
              <h2 className="font-display text-lg text-ink-900">{c.name}</h2>
              {list(c.items)}
            </section>
          ))
        ) : (
          <p className="py-12 text-center text-ink-500">Nothing on the menu matches “{query.trim()}”.</p>
        )
      ) : section ? (
        <div className="pt-1">
          {list(section.items)}
          <Button variant="secondary" className="mt-6 w-full" onClick={() => show(null)}>
            <ChevronLeft className="size-4" /> All sections
          </Button>
        </div>
      ) : (
        <div className={cn("grid gap-3 pt-4", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
          {sections.map((s) => {
            const photo = s.items.find((i) => i.image)?.image ?? null;
            const inCart = s.items.reduce((n, i) => n + (cart.qtyByItem[i.id] ?? 0), 0);
            return (
              <button key={s.id} onClick={() => show(s.id)} className={cn("group relative overflow-hidden rounded-2xl bg-ink-800 text-left", compact ? "h-20" : "h-28")}>
                <Photo src={photo} className="absolute inset-0 h-full w-full transition-transform duration-500 group-active:scale-105" />
                <span className="absolute inset-0 bg-linear-to-t from-ink-950/90 via-ink-950/40 to-ink-950/10" />
                <span className="absolute inset-x-3 bottom-2.5 text-white">
                  <span className={cn("block font-display leading-tight", compact ? "text-base" : "text-lg")}>{s.name}</span>
                  <span className="block text-xs text-linen-200/85">
                    {s.items.length} {s.items.length === 1 ? "item" : "items"}
                  </span>
                </span>
                {inCart ? (
                  <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">{inCart}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <ItemSheet item={open} onClose={() => setOpen(null)} cart={cart} closedReason={closedReason} />
    </div>
  );
}

/** One dish: name, a short description and the price. Tags and choices live in the dish's sheet. */
function ItemRow({
  item,
  inCart,
  compact,
  canAdd,
  onOpen,
  onAdd,
}: {
  item: MenuItem;
  inCart: number;
  compact?: boolean;
  canAdd: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const soldOut = !item.isAvailable;
  return (
    <li className={cn("flex items-center gap-4", compact ? "py-3" : "py-4", soldOut && "opacity-50")}>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen} disabled={soldOut}>
        <h3 className={cn("font-display leading-snug text-ink-900", compact ? "text-base" : "text-[1.1rem]")}>{item.name}</h3>
        {item.description ? <p className={cn("mt-0.5 text-sm leading-snug text-ink-500", compact ? "line-clamp-1" : "line-clamp-2")}>{item.description}</p> : null}
        <p className="mt-1 flex items-center gap-2.5">
          <span className="text-[15px] font-medium text-ink-800 tabular">{formatNaira(item.priceKobo)}</span>
          {soldOut ? <span className="text-[11px] font-semibold uppercase tracking-widest text-[#b3321f]">Sold out today</span> : null}
        </p>
      </button>
      <div className="relative shrink-0">
        {item.image ? <Photo src={item.image} className={cn("rounded-xl", compact ? "size-16" : "size-22")} /> : null}
        {!soldOut && canAdd ? (
          <button
            onClick={onAdd}
            aria-label={`Add ${item.name}`}
            className={cn(
              "flex size-10 items-center justify-center rounded-full font-semibold shadow-md ring-2 ring-linen-100 transition-transform active:scale-90",
              inCart ? "bg-ink-900 text-white" : "bg-brand-600 text-white",
              item.image && "absolute -bottom-2 -right-2",
            )}
          >
            {inCart ? <span className="text-sm tabular">{inCart}</span> : <Plus className="size-5" />}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ItemSheet({ item, onClose, cart, closedReason }: { item: MenuItem | null; onClose: () => void; cart: Cart; closedReason?: string | null }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (item && shownFor !== item.id) {
    setShownFor(item.id);
    setQty(1);
    setNote("");
    setPicked({});
  }
  if (!item) return null;
  const extra = item.optionGroups.reduce((s, g) => s + (g.options.find((o) => o.name === picked[g.name])?.priceKobo ?? 0), 0);
  const missing = item.optionGroups.filter((g) => g.required && !picked[g.name]);
  const choices: Choice[] = Object.entries(picked).map(([group, option]) => ({ group, option }));
  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        closedReason ? (
          <p className="text-center text-sm text-ink-600">{closedReason}</p>
        ) : !item.isAvailable ? null : (
          <div className="flex items-center gap-3">
            <QtyStepper qty={qty} onChange={(q) => setQty(Math.max(1, Math.min(20, q)))} size="lg" />
            <Button
              size="xl"
              className="flex-1"
              disabled={missing.length > 0}
              onClick={() => {
                cart.add(item, qty, note, choices, extra);
                onClose();
              }}
            >
              {missing.length ? `Choose ${missing[0].name.toLowerCase()}` : `Add · ${formatNaira((item.priceKobo + extra) * qty)}`}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {item.image ? <Photo src={item.image} alt={item.name} className="-mx-5 h-56 w-[calc(100%+2.5rem)] max-w-none" /> : null}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <TagList tags={item.tags} />
            <span className="ml-auto text-lg font-medium text-ink-900 tabular">{formatNaira(item.priceKobo)}</span>
          </div>
          {item.description ? <p className="text-[15px] leading-relaxed text-ink-600">{item.description}</p> : null}
          <p className="text-xs text-ink-500">Usually ready in about {item.prepMinutes} min</p>
        </div>

        {item.optionGroups.map((g) => (
          <fieldset key={g.name}>
            <legend className="mb-2 flex w-full items-center justify-between">
              <span className="font-display text-lg text-ink-900">{g.name}</span>
              <span className={cn("text-[11px] font-semibold uppercase tracking-widest", g.required && !picked[g.name] ? "text-brand-700" : "text-ink-500")}>
                {g.required ? (picked[g.name] ? "Chosen" : "Required") : "Optional"}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const on = picked[g.name] === o.name;
                return (
                  <button
                    key={o.name}
                    type="button"
                    onClick={() => setPicked((p) => (on && !g.required ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== g.name)) : { ...p, [g.name]: o.name }))}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition-colors",
                      on ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-800 ring-linen-300 hover:ring-linen-400",
                    )}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full ring-1", on ? "bg-brand-500 ring-brand-500" : "ring-linen-400")}>
                      {on ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">{o.name}</span>
                    {o.priceKobo ? <span className={cn("text-xs tabular", on ? "text-linen-200" : "text-ink-500")}>+{formatNaira(o.priceKobo)}</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        {!closedReason && item.isAvailable ? (
          <div className="space-y-2">
            <span className="font-display text-lg text-ink-900">Anything to add?</span>
            <div className="flex flex-wrap gap-1.5">
              {["Less pepper", "Extra spicy", "No onions", "Sauce on the side", "Well done"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNote((n) => (n ? `${n}, ${s.toLowerCase()}` : s))}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-linen-300 active:bg-linen-200"
                >
                  + {s}
                </button>
              ))}
            </div>
            <Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the kitchen (optional)" />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Cart review: adjust quantities. */
export function CartLines({ cart }: { cart: Cart }) {
  return (
    <ul className="divide-y divide-linen-300/70">
      {cart.lines.map((l) => (
        <li key={l.key} className="flex items-center gap-3 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.05rem] leading-tight text-ink-900">{l.name}</p>
            {l.choices?.length ? <p className="text-sm text-ink-600">{l.choices.map((c) => c.option).join(" · ")}</p> : null}
            {l.note ? <p className="text-sm italic text-ink-500">“{l.note}”</p> : null}
            <p className="mt-0.5 text-sm text-ink-500 tabular">{formatNaira(l.priceKobo * l.qty)}</p>
          </div>
          <QtyStepper qty={l.qty} onChange={(q) => cart.setQty(l.key, q)} />
        </li>
      ))}
    </ul>
  );
}
