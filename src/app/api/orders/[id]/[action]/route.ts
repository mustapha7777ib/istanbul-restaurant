import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { payOrderInput } from "@/lib/validators";
import { cancelOrder, claimOrder, markOrderReady, payOrder, rejectOrder, serveOrder } from "@/services/orders";

const claimBody = z.object({ asWaiterId: z.string().optional() }).optional();
const reasonBody = z.object({ reason: z.string().trim().min(2).max(200) });

export const POST = handler(async (req, ctx: RouteContext<"/api/orders/[id]/[action]">) => {
  const { id, action } = await ctx.params;
  const staff = await requireStaff();
  switch (action) {
    case "claim": {
      // Body is optional: managers send { asWaiterId } to assign.
      const body = await readJson(req, claimBody).catch(() => undefined);
      return claimOrder(staff, id, { asWaiterId: body?.asWaiterId });
    }
    case "pay":
      return payOrder(staff, id, await readJson(req, payOrderInput));
    case "reject":
      return rejectOrder(staff, id, (await readJson(req, reasonBody)).reason);
    case "ready":
      return markOrderReady(staff, id);
    case "serve":
      return serveOrder(staff, id);
    case "cancel":
      return cancelOrder(staff, id, (await readJson(req, reasonBody)).reason);
    default:
      throw notFound();
  }
});
