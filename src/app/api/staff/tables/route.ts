import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { waiterTables } from "@/services/orders";

export const GET = handler(async (req) => {
  const staff = await requireStaff(["WAITER", "MANAGER", "ADMIN"]);
  const all = new URL(req.url).searchParams.get("all") === "1";
  return { tables: await waiterTables(staff, { all }) };
});
