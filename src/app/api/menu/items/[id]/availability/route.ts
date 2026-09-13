import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { setItemAvailability } from "@/services/kitchen";

export const POST = handler(async (req, ctx: RouteContext<"/api/menu/items/[id]/availability">) => {
  const { id } = await ctx.params;
  const staff = await requireStaff(["KITCHEN", "MANAGER", "ADMIN"]);
  const { isAvailable } = await readJson(req, z.object({ isAvailable: z.boolean() }));
  const item = await setItemAvailability(staff, id, isAvailable);
  return { id: item.id, isAvailable: item.isAvailable };
});
