import { z } from "zod";

export const id = z.string().min(1).max(64);

export const paymentMethod = z.enum(["CASH", "POS", "TRANSFER"]);
export const station = z.enum(["KITCHEN", "BAR"]);
export const role = z.enum(["ADMIN", "MANAGER", "WAITER", "KITCHEN"]);
export const requestType = z.enum(["CALL_WAITER", "BILL", "WATER", "CUTLERY", "OTHER"]);

const note = z.string().trim().max(200).optional().transform((v) => (v ? v : undefined));

const choice = z.object({ group: z.string().min(1).max(60), option: z.string().min(1).max(80) });

export const placeOrderInput = z.object({
  items: z
    .array(z.object({ menuItemId: id, qty: z.number().int().min(1).max(20), note, choices: z.array(choice).max(8).optional() }))
    .min(1, "Add at least one item")
    .max(30),
  note,
});
export type PlaceOrderInput = {
  items: { menuItemId: string; qty: number; note?: string; choices?: { group: string; option: string }[] }[];
  note?: string;
};

export const staffOrderInput = placeOrderInput.extend({ sessionId: id.optional(), tableId: id.optional() });

/** Guests can only call their waiter; everything else is handled at the table. */
export const serviceRequestInput = z.object({ type: z.literal("CALL_WAITER") });

export const ratingInput = z.object({
  foodRating: z.number().int().min(1).max(5),
  serviceRating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export const paymentInput = z.object({
  amountKobo: z.number().int().positive(),
  tipKobo: z.number().int().min(0).default(0),
  method: paymentMethod,
  reference: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)),
  note,
});

/** Payment for one order: the amount is the order's total, worked out on the server. */
export const payOrderInput = z.object({
  method: paymentMethod,
  tipKobo: z.number().int().min(0).default(0),
  reference: z.string().trim().max(80).optional().transform((v) => (v ? v : undefined)),
});

export const reasonInput = z.object({ reason: z.string().trim().min(2).max(200) });

export const loginInput = z.object({
  staffCode: z.string().trim().toUpperCase().min(2).max(20),
  secret: z.string().min(4).max(100),
});

export const clockOutInput = z.object({ cashDeclaredKobo: z.number().int().min(0).optional() });

/** Staff PINs: 4–6 digits. Managers/admins use a password of 8+ characters. */
export function validateSecret(roleName: string, secret: string) {
  if (roleName === "ADMIN" || roleName === "MANAGER") {
    return secret.length >= 8 ? null : "Managers and admins need a password of at least 8 characters";
  }
  return /^\d{4,6}$/.test(secret) ? null : "PIN must be 4–6 digits";
}
