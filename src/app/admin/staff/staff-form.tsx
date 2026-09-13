"use client";

import { ImagePlus, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Segmented, Select, Sheet, Toggle } from "@/components/ui";
import { uploadResizedImage } from "@/lib/client/image";
import { saveStaffAction } from "../actions";
import { useAction } from "../use-action";

type Role = "ADMIN" | "MANAGER" | "WAITER" | "KITCHEN";
type StaffData = {
  id?: string;
  name: string;
  staffCode: string;
  role: Role;
  station: "KITCHEN" | "BAR" | null;
  phone: string | null;
  active: boolean;
  photoId: string | null;
};

export function StaffForm({ staff, actorRole }: { staff?: StaffData; actorRole: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StaffData>(
    staff ?? { name: "", staffCode: "", role: "WAITER", station: null, phone: null, active: true, photoId: null },
  );
  const [secret, setSecret] = useState("");
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const { pending, run } = useAction();
  const managerAccount = form.role === "ADMIN" || form.role === "MANAGER";
  const canEdit = actorRole === "ADMIN" || !staff || (staff.role !== "ADMIN" && staff.role !== "MANAGER");
  const roles: Role[] = actorRole === "ADMIN" ? ["WAITER", "KITCHEN", "MANAGER", "ADMIN"] : ["WAITER", "KITCHEN"];

  if (!canEdit) return null;
  return (
    <>
      {staff ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Pencil className="size-4" /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="size-4" /> Add staff
        </Button>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={staff ? `Edit ${staff.name}` : "New staff member"}
        footer={
          <Button
            size="lg"
            className="w-full"
            loading={pending}
            onClick={() =>
              run(() => saveStaffAction({ ...form, secret: secret || undefined }), staff ? "Staff saved" : `${form.name} added`, () => {
                setOpen(false);
                setSecret("");
              })
            }
          >
            Save
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {form.photoId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/images/${form.photoId}`} alt="" className="size-16 rounded-full object-cover" />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-full bg-linen-100 text-ink-500/70">
                <ImagePlus className="size-6" />
              </div>
            )}
            <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-semibold ring-1 ring-linen-300">
              {uploading ? "Uploading…" : "Photo (shown to guests)"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    setForm((s) => ({ ...s, photoId: null }));
                    const id = await uploadResizedImage(f, 400);
                    setForm((s) => ({ ...s, photoId: id }));
                  } catch (err) {
                    toast({ tone: "error", title: "Upload failed", body: (err as Error).message });
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </div>
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Staff code" hint="Used to log in, e.g. W005">
              <Input value={form.staffCode} onChange={(e) => setForm({ ...form, staffCode: e.target.value.toUpperCase() })} maxLength={20} className="font-mono" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} />
            </Field>
          </div>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role, station: e.target.value === "KITCHEN" ? (form.station ?? "KITCHEN") : null })}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r === "KITCHEN" ? "Kitchen / bar" : r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          {form.role === "KITCHEN" ? (
            <Field label="Works at">
              <Segmented
                value={form.station ?? "KITCHEN"}
                onChange={(v) => setForm({ ...form, station: v })}
                options={[
                  { value: "KITCHEN", label: "Kitchen" },
                  { value: "BAR", label: "Bar" },
                ]}
              />
            </Field>
          ) : null}
          <Field
            label={staff ? (managerAccount ? "New password (leave blank to keep)" : "New PIN (leave blank to keep)") : managerAccount ? "Password" : "PIN"}
            hint={managerAccount ? "At least 8 characters" : "4–6 digits. Tell the staff member privately."}
          >
            <Input type={managerAccount ? "password" : "text"} inputMode={managerAccount ? "text" : "numeric"} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
          </Field>
          <label className="flex items-center justify-between text-sm font-medium">
            Active (can log in) <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </label>
        </div>
      </Sheet>
    </>
  );
}
