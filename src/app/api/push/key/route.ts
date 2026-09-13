import { handler } from "@/lib/api";

export const GET = handler(async () => ({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null }));
