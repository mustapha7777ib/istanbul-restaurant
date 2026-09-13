import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { lagosDayRange, lagosMonthKey, lagosMonthRange } from "@/lib/time";
import { myStatsToday, waiterLeaderboard } from "@/services/metrics";

export const GET = handler(async () => {
  const staff = await requireStaff(["WAITER"]);
  const { start, end } = lagosDayRange();
  const month = lagosMonthKey();
  const [today, board] = await Promise.all([myStatsToday(staff.id, start, end), waiterLeaderboard(month)]);
  const monthRow = board.find((r) => r.staffId === staff.id) ?? null;
  const ranked = board.filter((r) => r.score != null);
  return {
    today: today.me,
    todayRank: today.rank,
    todayOf: today.of,
    month: {
      key: month,
      range: lagosMonthRange(month),
      me: monthRow,
      rank: monthRow?.score != null ? ranked.findIndex((r) => r.staffId === staff.id) + 1 : null,
      of: ranked.length,
    },
  };
});
