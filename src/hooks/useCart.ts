"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Choice } from "@/lib/options";

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  /** Unit price including any paid choices. */
  priceKobo: number;
  qty: number;
  note?: string;
  choices?: Choice[];
};

const MAX_QTY = 20;

/** Cart kept in sessionStorage so a refresh or accidental back doesn't lose it. */
export function useCart(storageKey: string | null) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted state once
      if (saved) setLines(JSON.parse(saved));
    } catch {
      // storage unavailable (private mode) — cart just won't persist
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // ignore
    }
  }, [lines, storageKey]);

  const add = useCallback(
    (item: { id: string; name: string; priceKobo: number }, qty = 1, note?: string, choices: Choice[] = [], extraKobo = 0) => {
      const cleanNote = note?.trim() || undefined;
      const key = `${item.id}|${choices.map((c) => `${c.group}=${c.option}`).join(";")}|${cleanNote ?? ""}`;
      setLines((ls) => {
        const existing = ls.find((l) => l.key === key);
        if (existing) return ls.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l));
        return [
          ...ls,
          {
            key,
            menuItemId: item.id,
            name: item.name,
            priceKobo: item.priceKobo + extraKobo,
            qty: Math.min(MAX_QTY, qty),
            note: cleanNote,
            choices: choices.length ? choices : undefined,
          },
        ];
      });
    },
    [],
  );

  const setQty = useCallback((key: string, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, qty) } : l))));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  /** Drop items that sold out or left the menu. Returns the names removed. */
  const prune = useCallback((available: Set<string>) => {
    let removed: string[] = [];
    setLines((ls) => {
      removed = ls.filter((l) => !available.has(l.menuItemId)).map((l) => l.name);
      return removed.length ? ls.filter((l) => available.has(l.menuItemId)) : ls;
    });
    return removed;
  }, []);

  const summary = useMemo(
    () => ({
      count: lines.reduce((s, l) => s + l.qty, 0),
      totalKobo: lines.reduce((s, l) => s + l.qty * l.priceKobo, 0),
      qtyByItem: lines.reduce<Record<string, number>>((m, l) => ({ ...m, [l.menuItemId]: (m[l.menuItemId] ?? 0) + l.qty }), {}),
    }),
    [lines],
  );

  return { lines, add, setQty, clear, prune, ...summary };
}

export type Cart = ReturnType<typeof useCart>;

/** Order payload for the API. */
export const cartItems = (cart: Cart) =>
  cart.lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, note: l.note, choices: l.choices }));
