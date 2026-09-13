import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { acknowledgeRequest, resolveRequest } from "@/services/requests";

export const POST = handler(async (_req, ctx: RouteContext<"/api/requests/[id]/[action]">) => {
  const { id, action } = await ctx.params;
  const staff = await requireStaff();
  if (action === "ack") await acknowledgeRequest(staff, id);
  else if (action === "resolve") await resolveRequest(staff, id);
  else throw notFound();
  return { ok: true };
});
