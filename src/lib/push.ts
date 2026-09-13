import webpush from "web-push";
import { prisma } from "./db";
import type { Ping } from "./realtime";

let configured: boolean | null = null;

function configure() {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (configured) {
    webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }
  return configured;
}

/** Web Push to staff devices. Only reaches staff who are currently clocked in. */
export async function sendPush(target: string[] | "waiters-on-shift", ping: Ping) {
  if (!configure()) return;
  const onShift = { shifts: { some: { clockOutAt: null } } };
  const subs = await prisma.pushSubscription.findMany({
    where:
      target === "waiters-on-shift"
        ? { staff: { role: "WAITER", active: true, ...onShift } }
        : { staffId: { in: target }, staff: { active: true, ...onShift } },
  });
  const payload = JSON.stringify(ping);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 120,
          urgency: "high",
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error("[push] send failed", status ?? err);
        }
      }
    }),
  );
}
