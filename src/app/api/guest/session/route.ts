import { handler } from "@/lib/api";
import { requireGuest } from "@/lib/auth";
import { getGuestView } from "@/services/sessions";

export const GET = handler(async () => {
  const guest = await requireGuest();
  return getGuestView(guest.sessionId);
});
