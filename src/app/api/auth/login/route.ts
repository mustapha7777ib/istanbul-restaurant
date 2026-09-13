import { handler, readJson } from "@/lib/api";
import { homeFor, setStaffCookie } from "@/lib/auth";
import { loginInput } from "@/lib/validators";
import { authenticate } from "@/services/auth";

export const POST = handler(async (req) => {
  const { staffCode, secret } = await readJson(req, loginInput);
  const staff = await authenticate(staffCode, secret);
  await setStaffCookie(staff);
  return { home: homeFor(staff.role), name: staff.name };
});
