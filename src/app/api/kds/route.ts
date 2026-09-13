import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { station } from "@/lib/validators";
import { stationTickets } from "@/services/kitchen";

export const GET = handler(async (req) => {
  await requireStaff(["KITCHEN", "MANAGER", "ADMIN"]);
  const s = station.parse(new URL(req.url).searchParams.get("station") ?? "KITCHEN");
  return stationTickets(s);
});
