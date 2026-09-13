"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button, Input, Toggle } from "@/components/ui";

export type GroupDraft = { name: string; required: boolean; options: { name: string; priceNaira: string }[] };

const TEMPLATES: { label: string; group: GroupDraft }[] = [
  {
    label: "Side dish",
    group: {
      name: "Side dish",
      required: true,
      options: ["Jollof rice", "Fried rice", "Mashed potato", "French fries", "Fried sweet potato", "Crispy baked potato", "Baked potato", "Plantain", "Spicy potatoes", "Potato wedges"].map((n) => ({ name: n, priceNaira: "" })),
    },
  },
  { label: "Steak doneness", group: { name: "Cooked", required: true, options: ["Medium rare", "Medium", "Medium well", "Well done"].map((n) => ({ name: n, priceNaira: "" })) } },
  { label: "Chicken or prawns", group: { name: "With", required: true, options: [{ name: "Chicken", priceNaira: "" }, { name: "Prawns", priceNaira: "" }] } },
  { label: "Size", group: { name: "Size", required: true, options: [{ name: "Regular", priceNaira: "" }, { name: "Large", priceNaira: "1000" }] } },
];

/** "Served with a side dish of choice" and friends. Each group is one choice for the guest. */
export function ChoicesEditor({ groups, onChange }: { groups: GroupDraft[]; onChange: (g: GroupDraft[]) => void }) {
  const update = (i: number, g: GroupDraft) => onChange(groups.map((x, j) => (j === i ? g : x)));
  return (
    <div className="rounded-2xl bg-linen-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-lg text-ink-900">Guest choices</p>
          <p className="text-xs text-ink-500">e.g. side dish, flavour, how the steak is cooked. Prices are extra on top of the dish.</p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {groups.map((g, i) => (
          <GroupCard key={i} group={g} onChange={(ng) => update(i, ng)} onRemove={() => onChange(groups.filter((_, j) => j !== i))} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => onChange([...groups, { name: "", required: true, options: [] }])}>
          <Plus className="size-3.5" /> New choice
        </Button>
        {TEMPLATES.filter((t) => !groups.some((g) => g.name === t.group.name)).map((t) => (
          <Button key={t.label} size="sm" variant="ghost" onClick={() => onChange([...groups, structuredClone(t.group)])}>
            + {t.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function GroupCard({ group, onChange, onRemove }: { group: GroupDraft; onChange: (g: GroupDraft) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState("");
  const addOption = () => {
    const name = draft.trim();
    if (!name || group.options.some((o) => o.name.toLowerCase() === name.toLowerCase())) return;
    onChange({ ...group, options: [...group.options, { name, priceNaira: "" }] });
    setDraft("");
  };
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-linen-300">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={group.name} onChange={(e) => onChange({ ...group, name: e.target.value })} placeholder="Choice name, e.g. Side dish" className="h-9 min-w-0 flex-1 text-sm font-medium" />
        <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
          <Toggle checked={group.required} onChange={(v) => onChange({ ...group, required: v })} label="Required" />
          {group.required ? "Must choose" : "Optional"}
        </label>
        <button onClick={onRemove} className="rounded-lg p-2 text-ink-500 hover:bg-red-50 hover:text-red-700" aria-label="Remove choice">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {group.options.map((o, oi) => (
          <span key={oi} className="inline-flex items-center gap-1 rounded-full bg-linen-100 py-1 pl-3 pr-1 text-sm ring-1 ring-linen-300">
            {o.name}
            <span className="flex items-center text-xs text-ink-500">
              +₦
              <input
                value={o.priceNaira}
                onChange={(e) => onChange({ ...group, options: group.options.map((x, j) => (j === oi ? { ...x, priceNaira: e.target.value.replace(/[^\d.]/g, "") } : x)) })}
                placeholder="0"
                inputMode="decimal"
                className="w-12 bg-transparent text-xs text-ink-800 outline-none"
                aria-label={`Extra price for ${o.name}`}
              />
            </span>
            <button onClick={() => onChange({ ...group, options: group.options.filter((_, j) => j !== oi) })} className="rounded-full p-0.5 text-ink-500 hover:bg-linen-300" aria-label={`Remove ${o.name}`}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          onBlur={addOption}
          placeholder="Add option and press Enter"
          className="h-8 min-w-[12rem] flex-1 rounded-full bg-transparent px-3 text-sm outline-none ring-1 ring-dashed ring-linen-400 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}
