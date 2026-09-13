import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

const subscription = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const POST = handler(async (req) => {
  const staff = await requireStaff();
  const sub = await readJson(req, subscription);
  // A device belongs to whoever logged in on it last.
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { staffId: staff.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { staffId: staff.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return { ok: true };
});

export const DELETE = handler(async (req) => {
  await requireStaff();
  const { endpoint } = await readJson(req, z.object({ endpoint: z.string() }));
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return { ok: true };
});
