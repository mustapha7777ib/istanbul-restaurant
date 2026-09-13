import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { closeSession } from "@/services/sessions";

export const POST = handler(async (req, ctx: RouteContext<"/api/sessions/[id]/close">) => {
  const { id } = await ctx.params;
  const staff = await requireStaff();
  const body = await readJson(req, z.object({ reason: z.string().trim().max(200).optional() }));
  return closeSession(staff, id, { reason: body.reason || undefined });
});
