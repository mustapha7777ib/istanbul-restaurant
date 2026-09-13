import bcrypt from "bcryptjs";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { tooMany, unauthorized } from "@/lib/errors";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
// Compared against when the staff code doesn't exist, so timing doesn't reveal valid codes.
let dummyHash: Promise<string> | null = null;

export const hashSecret = (secret: string) => bcrypt.hash(secret, 10);

export async function authenticate(staffCode: string, secret: string) {
  const staff = await prisma.staff.findUnique({ where: { staffCode } });
  if (!staff || !staff.active) {
    dummyHash ??= hashSecret("not-a-real-secret");
    await bcrypt.compare(secret, await dummyHash);
    throw unauthorized("Wrong staff code or PIN");
  }
  const now = new Date();
  if (staff.lockedUntil && staff.lockedUntil > now) {
    const mins = Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 60000);
    throw tooMany(`Too many wrong attempts. Try again in ${mins} min or ask a manager to reset your PIN.`);
  }
  const ok = await bcrypt.compare(secret, staff.secretHash);
  if (!ok) {
    const attempts = staff.failedLogins + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staff.id },
        data: lock
          ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) }
          : { failedLogins: attempts },
      });
      await logEvent(tx, staffActor(staff.id), "STAFF_LOGIN_FAILED", { type: "Staff", id: staff.id }, {
        data: { attempts, locked: lock },
      });
    });
    throw unauthorized(lock ? `Too many wrong attempts. Locked for ${LOCK_MINUTES} minutes.` : "Wrong staff code or PIN");
  }
  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: staff.id }, data: { failedLogins: 0, lockedUntil: null } });
    await logEvent(tx, staffActor(staff.id), "STAFF_LOGIN", { type: "Staff", id: staff.id });
  });
  return staff;
}
