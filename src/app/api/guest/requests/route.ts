import { handler, readJson } from "@/lib/api";
import { requireGuest } from "@/lib/auth";
import { serviceRequestInput } from "@/lib/validators";
import { createRequest } from "@/services/requests";

export const POST = handler(async (req) => {
  const guest = await requireGuest();
  const input = await readJson(req, serviceRequestInput);
  const request = await createRequest(guest.sessionId, input);
  return { id: request.id, status: request.status };
});
