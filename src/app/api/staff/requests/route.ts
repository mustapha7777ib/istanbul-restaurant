import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { waiterRequests } from "@/services/requests";

export const GET = handler(async () => {
  const staff = await requireStaff(["WAITER", "MANAGER", "ADMIN"]);
  return { requests: await waiterRequests(staff) };
});
