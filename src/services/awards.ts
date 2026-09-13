import type { AwardCategory } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { isManager } from "./common";
import { kitchenLeaderboard, waiterLeaderboard } from "./metrics";

export async function giveAward(
  staff: StaffUser,
  input: { month: string; category: AwardCategory; staffId: string; note?: string },
) {
  if (!isManager(staff)) throw forbidden("Only managers can give awards");
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw badRequest("Invalid month");
  const board = input.category === "WAITER" ? await waiterLeaderboard(input.month) : await kitchenLeaderboard(input.month);
  const row = board.find((r) => r.staffId === input.staffId);
  if (!row) throw notFound("That staff member has no activity this month");
  const breakdown = JSON.parse(JSON.stringify(row));
  return prisma.$transaction(async (tx) => {
    const award = await tx.staffAward.upsert({
      where: { month_category: { month: input.month, category: input.category } },
      create: {
        month: input.month,
        category: input.category,
        staffId: input.staffId,
        score: row.score ?? 0,
        breakdown,
        note: input.note || null,
        awardedById: staff.id,
      },
      update: { staffId: input.staffId, score: row.score ?? 0, breakdown, note: input.note || null, awardedById: staff.id },
    });
    await logEvent(tx, staffActor(staff.id), "AWARD_GIVEN", { type: "StaffAward", id: award.id }, {
      data: { month: input.month, category: input.category, staffId: input.staffId, name: row.name, score: row.score },
    });
    return award;
  });
}

export function awardHistory(limit = 24) {
  return prisma.staffAward.findMany({
    orderBy: [{ month: "desc" }, { category: "asc" }],
    take: limit,
    include: { staff: { select: { name: true, photoId: true, role: true, station: true } }, awardedBy: { select: { name: true } } },
  });
}
