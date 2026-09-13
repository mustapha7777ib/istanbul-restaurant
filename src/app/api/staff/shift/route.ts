import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { clockIn, clockOut, currentShift, shiftSummary } from "@/services/shifts";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("in") }),
  z.object({ action: z.literal("out"), cashDeclaredKobo: z.number().int().min(0).optional() }),
]);

/** Current shift with money collected so far (for the end-of-shift handover). */
export const GET = handler(async () => {
  const staff = await requireStaff();
  const shift = await currentShift(staff.id);
  return shift ? shiftSummary(shift.id) : { shift: null };
});

export const POST = handler(async (req) => {
  const staff = await requireStaff();
  const body = await readJson(req, input);
  if (body.action === "in") return { shift: await clockIn(staff) };
  return { shift: await clockOut(staff, body.cashDeclaredKobo) };
});
