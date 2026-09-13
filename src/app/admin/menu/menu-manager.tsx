"use client";

import { ImagePlus, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Segmented, Select, Sheet, Textarea, Toggle } from "@/components/ui";
import { post } from "@/lib/client/api";
import { uploadResizedImage } from "@/lib/client/image";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import type { OptionGroup } from "@/lib/options";
import { ChoicesEditor, type GroupDraft } from "./choices-editor";
import { saveCategoryAction, saveMenuItemAction } from "../actions";
import { useAction } from "../use-action";

type Item = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceKobo: number;
  station: "KITCHEN" | "BAR";
  prepMinutes: number;
  tags: string[];
  sortOrder: number;
  isAvailable: boolean;
  active: boolean;
  featured: boolean;
  optionGroups: OptionGroup[];
  imageId: string | null;
};
type Category = { id: string; name: string; sortOrder: number; active: boolean; items: Item[] };

const TAGS = ["signature", "popular", "spicy", "vegetarian"];

export function MenuManager({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function toggleAvailable(item: Item, value: boolean) {
    try {
      await post(`/api/menu/items/${item.id}/availability`, { isAvailable: value });
      router.refresh();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't update", body: (e as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing({ station: "KITCHEN", prepMinutes: 15, tags: [], isAvailable: true, active: true, featured: false, optionGroups: [], sortOrder: 0, categoryId: categories[0]?.id })}>
          <Plus className="size-4" /> Add dish or drink
        </Button>
        <Button variant="secondary" onClick={() => setEditingCat({ active: true, sortOrder: categories.length })}>
          <Plus className="size-4" /> Add category
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-600">
          <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived" /> Show archived
        </label>
      </div>

      {categories.filter((c) => showArchived || c.active || c.items.some((i) => i.active)).map((c) => {
        const items = c.items.filter((i) => showArchived || i.active);
        return (
          <Card key={c.id} className={cn("overflow-hidden", !c.active && "opacity-60")}>
            <div className="flex items-center justify-between border-b border-linen-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl">{c.name}</h2>
                {!c.active ? <Badge>Hidden</Badge> : null}
                <span className="text-sm text-ink-500/70">{c.items.filter((i) => i.active).length} items</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditingCat(c)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </div>
            <ul className="divide-y divide-linen-200">
              {items.map((i) => (
                <li key={i.id} className={cn("flex items-center gap-3 px-4 py-2.5", !i.active && "opacity-50")}>
                  {i.imageId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/images/${i.imageId}`} alt="" className="size-12 rounded-lg object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-lg bg-linen-100 text-ink-500/70">
                      <ImagePlus className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {i.name} {!i.active ? <Badge>Archived</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-500">
                      {i.station === "BAR" ? "Bar" : "Kitchen"} · ~{i.prepMinutes} min {i.tags.length ? `· ${i.tags.join(", ")}` : ""}
                      {i.optionGroups.length ? ` · choose ${i.optionGroups.map((g) => g.name.toLowerCase()).join(", ")}` : ""}
                      {i.featured ? " · Chef's pick" : ""}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums">{formatNaira(i.priceKobo)}</span>
                  <label className="hidden items-center gap-2 text-xs text-ink-500 sm:flex">
                    {i.isAvailable ? "Available" : <span className="font-semibold text-red-600">Sold out</span>}
                    <Toggle checked={i.isAvailable} onChange={(v) => toggleAvailable(i, v)} label={`${i.name} available`} />
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                </li>
              ))}
              {items.length === 0 ? <li className="px-4 py-4 text-sm text-ink-500">No items yet.</li> : null}
            </ul>
          </Card>
        );
      })}

      {editing ? <ItemForm item={editing} categories={categories} onClose={() => setEditing(null)} /> : null}
      {editingCat ? <CategoryForm category={editingCat} onClose={() => setEditingCat(null)} /> : null}
    </div>
  );
}

function ItemForm({ item, categories, onClose }: { item: Partial<Item>; categories: Category[]; onClose: () => void }) {
  const [form, setForm] = useState({
    id: item.id,
    categoryId: item.categoryId ?? "",
    name: item.name ?? "",
    description: item.description ?? "",
    priceNaira: item.priceKobo ? String(item.priceKobo / 100) : "",
    station: item.station ?? "KITCHEN",
    prepMinutes: String(item.prepMinutes ?? 15),
    tags: item.tags ?? [],
    sortOrder: String(item.sortOrder ?? 0),
    isAvailable: item.isAvailable ?? true,
    active: item.active ?? true,
    featured: item.featured ?? false,
    imageId: item.imageId ?? null,
  });
  const [groups, setGroups] = useState<GroupDraft[]>(
    (item.optionGroups ?? []).map((g) => ({ name: g.name, required: g.required, options: g.options.map((o) => ({ name: o.name, priceNaira: o.priceKobo ? String(o.priceKobo / 100) : "" })) })),
  );
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const { pending, run } = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={item.id ? `Edit ${item.name}` : "New menu item"}
      footer={
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={() =>
            run(
              () =>
                saveMenuItemAction({
                  ...form,
                  priceNaira: form.priceNaira,
                  prepMinutes: form.prepMinutes,
                  sortOrder: form.sortOrder,
                  optionGroups: groups.map((g) => ({ ...g, options: g.options.map((o) => ({ name: o.name, priceNaira: o.priceNaira || "0" })) })),
                }),
              "Menu item saved",
              onClose,
            )
          }
        >
          Save
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={300} />
        </Field>
        <Field label="Price (₦)">
          <Input type="number" inputMode="decimal" value={form.priceNaira} onChange={(e) => set("priceNaira", e.target.value)} />
        </Field>
        <Field label="Category">
          <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prepared at" hint="Decides which screen the ticket goes to">
          <Segmented
            value={form.station}
            onChange={(v) => set("station", v)}
            options={[
              { value: "KITCHEN", label: "Kitchen" },
              { value: "BAR", label: "Bar" },
            ]}
          />
        </Field>
        <Field label="Target prep time (minutes)" hint="Tickets turn amber then red after this">
          <Input type="number" value={form.prepMinutes} onChange={(e) => set("prepMinutes", e.target.value)} />
        </Field>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-ink-700">Tags</span>
          <div className="flex flex-wrap gap-2">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tags", form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t])}
                className={cn("rounded-full px-3 py-1 text-sm font-medium capitalize ring-1", form.tags.includes(t) ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-600 ring-linen-300")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <ChoicesEditor groups={groups} onChange={setGroups} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-ink-700">Photo</span>
          <div className="flex items-center gap-3">
            {form.imageId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/images/${form.imageId}`} alt="" className="size-20 rounded-xl object-cover" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-xl bg-linen-100 text-ink-500/70">
                <ImagePlus className="size-6" />
              </div>
            )}
            <label className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-semibold ring-1 ring-linen-300 hover:bg-linen-50">
              {uploading ? "Uploading…" : form.imageId ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    set("imageId", await uploadResizedImage(file));
                  } catch (err) {
                    toast({ tone: "error", title: "Upload failed", body: (err as Error).message });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            {form.imageId ? (
              <Button size="sm" variant="ghost" onClick={() => set("imageId", null)}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <Field label="Sort order" hint="Lower numbers show first">
          <Input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </Field>
        <div className="flex flex-col justify-end gap-3">
          <label className="flex items-center justify-between text-sm font-medium">
            Available now <Toggle checked={form.isAvailable} onChange={(v) => set("isAvailable", v)} />
          </label>
          <label className="flex items-center justify-between text-sm font-medium">
            On the menu (untick to archive) <Toggle checked={form.active} onChange={(v) => set("active", v)} />
          </label>
          <label className="flex items-center justify-between text-sm font-medium">
            Chef&apos;s pick (top of the guest menu) <Toggle checked={form.featured} onChange={(v) => set("featured", v)} />
          </label>
        </div>
      </div>
    </Sheet>
  );
}

function CategoryForm({ category, onClose }: { category: Partial<Category>; onClose: () => void }) {
  const [name, setName] = useState(category.name ?? "");
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder ?? 0));
  const [active, setActive] = useState(category.active ?? true);
  const { pending, run } = useAction();
  return (
    <Sheet
      open
      onClose={onClose}
      title={category.id ? "Edit category" : "New category"}
      footer={
        <Button size="lg" className="w-full" loading={pending} onClick={() => run(() => saveCategoryAction({ id: category.id, name, sortOrder, active }), "Category saved", onClose)}>
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Sort order" hint="Lower numbers show first on the menu">
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between text-sm font-medium">
          Show on the menu <Toggle checked={active} onChange={setActive} />
        </label>
      </div>
    </Sheet>
  );
}
