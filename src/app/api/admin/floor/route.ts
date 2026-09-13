import { handler } from "@/lib/api";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { floorView } from "@/services/floor";

export const GET = handler(async () => {
  await requireStaff(MANAGER_ROLES);
  return floorView();
});
