import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { station } from "@/lib/validators";
import { readyTicket, recallTicket, startTicket } from "@/services/kitchen";

export const POST = handler(async (req, ctx: RouteContext<"/api/kds/[orderId]/[action]">) => {
  const { orderId, action } = await ctx.params;
  const staff = await requireStaff(["KITCHEN", "MANAGER", "ADMIN"]);
  const body = await readJson(req, z.object({ station }));
  if (action === "start") await startTicket(staff, orderId, body.station);
  else if (action === "ready") await readyTicket(staff, orderId, body.station);
  else if (action === "recall") await recallTicket(staff, orderId, body.station);
  else throw notFound();
  return { ok: true };
});
