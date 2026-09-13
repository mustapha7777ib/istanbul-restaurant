import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { waiterQueue } from "@/services/orders";

export const GET = handler(async () => {
  const staff = await requireStaff(["WAITER", "MANAGER", "ADMIN"]);
  return { orders: await waiterQueue(staff) };
});
