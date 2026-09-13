import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { transferSession } from "@/services/sessions";

export const POST = handler(async (req, ctx: RouteContext<"/api/sessions/[id]/transfer">) => {
  const { id } = await ctx.params;
  const staff = await requireStaff();
  const { toStaffId } = await readJson(req, z.object({ toStaffId: z.string().min(1) }));
  await transferSession(staff, id, toStaffId);
  return { ok: true };
});
