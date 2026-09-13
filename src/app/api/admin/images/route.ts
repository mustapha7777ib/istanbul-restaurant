import { handler } from "@/lib/api";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { saveImage } from "@/services/menu";

/** Raw image upload (the browser resizes to WebP first). Returns the new image id. */
export const POST = handler(async (req) => {
  const staff = await requireStaff(MANAGER_ROLES);
  const mime = req.headers.get("content-type")?.split(";")[0] ?? "";
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) throw badRequest("Empty upload");
  return { id: await saveImage(staff, bytes, mime) };
});
