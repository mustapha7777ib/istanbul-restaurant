"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { AppError, forbidden } from "@/lib/errors";
import { nairaToKobo } from "@/lib/money";
import { role, station } from "@/lib/validators";
import { giveAward } from "@/services/awards";
import { saveCategory, saveMenuItem } from "@/services/menu";
import { setOrderingEnabled, updateSettings } from "@/services/settings";
import { reconcileShift } from "@/services/shifts";
import { resetSecret, saveStaff } from "@/services/staff";
import { rotateTableToken, saveTable } from "@/services/tables";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>, paths: string[]): Promise<ActionResult> {
  try {
    await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    console.error("[admin action]", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const categoryInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
});

export async function saveCategoryAction(input: z.input<typeof categoryInput>) {
  return run(async () => saveCategory(await requireStaff(MANAGER_ROLES), categoryInput.parse(input)), ["/admin/menu"]);
}

const itemInput = z.object({
  id: z.string().optional(),
  categoryId: z.string().min(1, "Choose a category"),
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().max(300).default(""),
  priceNaira: z.coerce.number().positive("Price must be more than ₦0").max(10_000_000),
  station,
  prepMinutes: z.coerce.number().int().min(1).max(120),
  tags: z.array(z.string()).default([]),
  sortOrder: z.coerce.number().int().default(0),
  isAvailable: z.boolean(),
  active: z.boolean(),
  featured: z.boolean().default(false),
  optionGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Every choice group needs a name").max(60),
        required: z.boolean(),
        options: z
          .array(z.object({ name: z.string().trim().min(1).max(80), priceNaira: z.coerce.number().min(0).max(1_000_000) }))
          .min(1, "Add at least one option to each choice group")
          .max(20),
      }),
    )
    .max(6)
    .default([]),
  imageId: z.string().nullable().optional(),
});

export async function saveMenuItemAction(input: z.input<typeof itemInput>) {
  return run(async () => {
    const { priceNaira, optionGroups, ...rest } = itemInput.parse(input);
    return saveMenuItem(await requireStaff(MANAGER_ROLES), {
      ...rest,
      priceKobo: nairaToKobo(priceNaira),
      optionGroups: optionGroups.map((g) => ({
        name: g.name,
        required: g.required,
        options: g.options.map((o) => ({ name: o.name, priceKobo: nairaToKobo(o.priceNaira) })),
      })),
    });
  }, ["/admin/menu"]);
}

const tableInput = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(12),
  area: z.string().trim().min(1).max(40),
  seats: z.coerce.number().int().min(1).max(50),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function saveTableAction(input: z.input<typeof tableInput>) {
  return run(async () => saveTable(await requireStaff(MANAGER_ROLES), tableInput.parse(input)), ["/admin/tables"]);
}

export async function rotateTableTokenAction(tableId: string) {
  return run(async () => rotateTableToken(await requireStaff(MANAGER_ROLES), tableId), ["/admin/tables"]);
}

const staffInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  staffCode: z.string().trim().min(2).max(20),
  role,
  station: station.nullable(),
  phone: z.string().max(30).nullable(),
  active: z.boolean(),
  secret: z.string().optional(),
  photoId: z.string().nullable().optional(),
});

export async function saveStaffAction(input: z.input<typeof staffInput>) {
  return run(async () => {
    const data = staffInput.parse(input);
    return saveStaff(await requireStaff(MANAGER_ROLES), { ...data, secret: data.secret || undefined });
  }, ["/admin/staff"]);
}

export async function resetSecretAction(staffId: string, secret: string) {
  return run(async () => resetSecret(await requireStaff(MANAGER_ROLES), staffId, secret), ["/admin/staff"]);
}

export async function reconcileShiftAction(shiftId: string, status: "CONFIRMED" | "DISPUTED", note?: string) {
  return run(async () => reconcileShift(await requireStaff(MANAGER_ROLES), shiftId, status, note?.trim() || undefined), ["/admin/shifts"]);
}

export async function giveAwardAction(input: { month: string; category: "WAITER" | "KITCHEN"; staffId: string; note?: string }) {
  return run(async () => giveAward(await requireStaff(MANAGER_ROLES), input), ["/admin/awards", "/fame"]);
}

const settingsInput = z.object({
  restaurantName: z.string().trim().min(1, "The restaurant needs a name").max(80),
  tagline: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(160),
  instagram: z.string().trim().max(60).transform((v) => v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")),
  vatPercent: z.coerce.number().min(0).max(50),
  serviceChargePercent: z.coerce.number().min(0).max(50),
  claimTimeoutSec: z.coerce.number().int().min(30).max(3600),
  requestEscalateSec: z.coerce.number().int().min(30).max(3600),
  readyAlertSec: z.coerce.number().int().min(60).max(3600),
  openingTime: z.string(),
  closingTime: z.string(),
  orderingEnabled: z.boolean(),
  bankName: z.string().trim().max(80),
  bankAccountName: z.string().trim().max(80),
  bankAccountNumber: z.string().trim().max(20),
  scoreWeights: z.object({
    rating: z.coerce.number().min(0).max(100),
    speed: z.coerce.number().min(0).max(100),
    productivity: z.coerce.number().min(0).max(100),
    responsiveness: z.coerce.number().min(0).max(100),
    reliability: z.coerce.number().min(0).max(100),
  }),
  minHoursForAward: z.coerce.number().int().min(0).max(300),
  minOrdersForAward: z.coerce.number().int().min(0).max(5000),
  logoId: z.string().nullable().optional(),
});

export async function updateSettingsAction(input: z.input<typeof settingsInput>) {
  return run(async () => {
    const staff = await requireStaff(MANAGER_ROLES);
    if (staff.role !== "ADMIN") throw forbidden("Only an admin can change settings");
    const { vatPercent, serviceChargePercent, ...rest } = settingsInput.parse(input);
    return updateSettings(staff, {
      ...rest,
      vatBps: Math.round(vatPercent * 100),
      serviceChargeBps: Math.round(serviceChargePercent * 100),
    });
  }, ["/admin/settings", "/admin"]);
}

export async function setOrderingEnabledAction(enabled: boolean) {
  return run(async () => setOrderingEnabled(await requireStaff(MANAGER_ROLES), enabled), ["/admin/settings", "/admin"]);
}
