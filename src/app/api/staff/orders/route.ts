import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { staffOrderInput } from "@/lib/validators";
import { placeStaffOrder } from "@/services/orders";

/** Waiter keys in an order for guests who can't scan (no smartphone, phone dead…). */
export const POST = handler(async (req) => {
  const staff = await requireStaff(["WAITER", "MANAGER", "ADMIN"]);
  const { sessionId, tableId, ...input } = await readJson(req, staffOrderInput);
  const order = await placeStaffOrder(staff, { sessionId, tableId }, input);
  return { orderId: order.id, seq: order.seq };
});
