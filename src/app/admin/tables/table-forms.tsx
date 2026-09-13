"use client";

import { Pencil, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Sheet, Toggle } from "@/components/ui";
import { rotateTableTokenAction, saveTableAction } from "../actions";
import { useAction } from "../use-action";

type TableData = { id?: string; label: string; area: string; seats: number; active: boolean; sortOrder: number };

export function TableForm({ areas, nextSort, table }: { areas: string[]; nextSort?: number; table?: TableData }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TableData>(table ?? { label: "", area: areas[0] ?? "Main Hall", seats: 4, active: true, sortOrder: nextSort ?? 0 });
  const { pending, run } = useAction();
  return (
    <>
      {table ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add table
        </Button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={table ? `Edit ${table.label}` : "New table"}
        footer={
          <Button size="lg" className="w-full" loading={pending} onClick={() => run(() => saveTableAction(form), "Table saved", () => setOpen(false))}>
            Save
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Label" hint="Printed on the card, e.g. T21 or VIP5">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value.toUpperCase() })} maxLength={12} />
          </Field>
          <Field label="Area">
            <Input list="areas" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} maxLength={40} />
            <datalist id="areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seats">
              <Input type="number" value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
            </Field>
            <Field label="Sort order">
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center justify-between text-sm font-medium">
            Active (guests can order) <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </label>
        </div>
      </Sheet>
    </>
  );
}

export function TableActions({ table, areas }: { table: TableData & { id: string }; areas: string[] }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <TableForm table={table} areas={areas} />
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={() => {
          if (confirm(`Make a new QR code for ${table.label}? The old printed card will stop working — reprint it after.`)) {
            run(() => rotateTableTokenAction(table.id), `New QR code for ${table.label}`);
          }
        }}
      >
        <RefreshCw className="size-3.5" /> New code
      </Button>
    </div>
  );
}
