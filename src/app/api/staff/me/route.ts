import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { currentShift } from "@/services/shifts";
import { onShiftWaiters } from "@/services/staff";

export const GET = handler(async () => {
  const staff = await requireStaff();
  const [shift, waiters] = await Promise.all([currentShift(staff.id), onShiftWaiters()]);
  return { staff, shift, waitersOnShift: waiters.filter((w) => w.id !== staff.id) };
});
