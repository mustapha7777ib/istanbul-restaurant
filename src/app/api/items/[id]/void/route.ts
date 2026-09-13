import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { reasonInput } from "@/lib/validators";
import { voidItem } from "@/services/orders";

export const POST = handler(async (req, ctx: RouteContext<"/api/items/[id]/void">) => {
  const { id } = await ctx.params;
  const staff = await requireStaff();
  const { reason } = await readJson(req, reasonInput);
  await voidItem(staff, id, reason);
  return { ok: true };
});
