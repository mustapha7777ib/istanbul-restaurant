import { CUSTOMER, logEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { isUniqueViolation, loadBill } from "./common";

const LOW_RATING = 2;

export async function submitRating(
  sessionId: string,
  input: { foodRating: number; serviceRating: number; comment?: string },
) {
  const outbox = new Outbox();
  try {
    const rating = await prisma.$transaction(async (tx) => {
      const session = await tx.tableSession.findUnique({ where: { id: sessionId }, include: { table: true, waiter: true } });
      if (!session) throw notFound("Visit not found");
      // Orders are paid up front, so guests can rate once they've been served and owe nothing.
      const { session: visit, bill } = await loadBill(tx, sessionId);
      const servedAndPaid = visit.orders.some((o) => o.status === "SERVED") && bill.balance <= 0;
      if (session.status !== "PAID" && session.status !== "CLOSED" && !servedAndPaid) {
        throw conflict("You can rate your visit once your food has been served");
      }
      const rating = await tx.rating.create({
        data: {
          sessionId,
          waiterId: session.waiterId,
          foodRating: input.foodRating,
          serviceRating: input.serviceRating,
          comment: input.comment || null,
        },
      });
      await logEvent(tx, CUSTOMER, "RATING_SUBMITTED", { type: "Rating", id: rating.id }, {
        tableId: session.tableId,
        sessionId,
        data: { food: input.foodRating, service: input.serviceRating, waiterId: session.waiterId },
      });
      if (input.foodRating <= LOW_RATING || input.serviceRating <= LOW_RATING) {
        outbox.ping([rooms.managers], [], {
          kind: "alert",
          title: `Low rating · ${session.table.label}`,
          body: `Food ${input.foodRating}★ · Service ${input.serviceRating}★${session.waiter ? ` (${session.waiter.name})` : ""}${
            input.comment ? ` — "${input.comment.slice(0, 80)}"` : ""
          }`,
          url: "/admin/feedback",
        });
      }
      outbox.add([rooms.session(sessionId)], "session", { sessionId });
      outbox.add([rooms.managers], "floor", {});
      return rating;
    });
    outbox.flush();
    return rating;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Thank you — this visit has already been rated");
    throw err;
  }
}
