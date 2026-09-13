import { handler, readJson } from "@/lib/api";
import { requireGuest } from "@/lib/auth";
import { ratingInput } from "@/lib/validators";
import { submitRating } from "@/services/ratings";

export const POST = handler(async (req) => {
  const guest = await requireGuest();
  const input = await readJson(req, ratingInput);
  await submitRating(guest.sessionId, input);
  return { ok: true };
});
