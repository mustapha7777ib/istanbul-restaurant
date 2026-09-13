import { timingSafeEqual } from "node:crypto";
import { runEscalations } from "@/services/escalations";

// Called every 15s by server.ts. Not reachable without the shared secret.
export async function POST(req: Request) {
  const secret = process.env.INTERNAL_SECRET ?? "";
  const given = req.headers.get("x-internal-secret") ?? "";
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });
  try {
    const escalated = await runEscalations();
    return Response.json({ escalated });
  } catch (err) {
    console.error("[tick]", err);
    return Response.json({ error: "tick failed" }, { status: 500 });
  }
}
