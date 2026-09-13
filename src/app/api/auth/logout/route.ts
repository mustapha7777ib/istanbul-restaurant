import { handler } from "@/lib/api";
import { clearStaffCookie } from "@/lib/auth";

export const POST = handler(async () => {
  await clearStaffCookie();
  return { ok: true };
});
