import { handler } from "@/lib/api";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { lagosDateKey, lagosDateRange } from "@/lib/time";
import { orderLinesCsv } from "@/services/reports";

export const GET = handler(async (req) => {
  await requireStaff(MANAGER_ROLES);
  const params = new URL(req.url).searchParams;
  const today = lagosDateKey();
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? today;
  const { start, end } = lagosDateRange(from, to);
  const csv = await orderLinesCsv(start, end);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders_${from}_to_${to}.csv"`,
    },
  });
});
