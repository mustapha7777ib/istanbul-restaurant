import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { paymentInput } from "@/lib/validators";
import { recordPayment } from "@/services/payments";

export const POST = handler(async (req, ctx: RouteContext<"/api/sessions/[id]/payments">) => {
  const { id } = await ctx.params;
  const staff = await requireStaff();
  const input = await readJson(req, paymentInput);
  const { balanceAfter } = await recordPayment(staff, id, input);
  return { balanceAfter };
});
