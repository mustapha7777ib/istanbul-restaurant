import { handler, readJson } from "@/lib/api";
import { requireGuest } from "@/lib/auth";
import { placeOrderInput } from "@/lib/validators";
import { placeGuestOrder } from "@/services/orders";

export const POST = handler(async (req) => {
  const guest = await requireGuest();
  const input = await readJson(req, placeOrderInput);
  const order = await placeGuestOrder(guest.sessionId, input);
  return { orderId: order.id, seq: order.seq };
});
