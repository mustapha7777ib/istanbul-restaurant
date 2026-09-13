import type { Role, Station } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { validateSecret } from "@/lib/validators";
import { hashSecret } from "./auth";
import { isManager, isUniqueViolation } from "./common";

/** Admins manage everyone; managers manage waiters and kitchen staff. */
function assertCanManage(actor: StaffUser, role: Role) {
  if (actor.role === "ADMIN") return;
  if (actor.role === "MANAGER" && (role === "WAITER" || role === "KITCHEN")) return;
  throw forbidden(isManager(actor) ? "Only an admin can manage manager and admin accounts" : undefined);
}

export type StaffInput = {
  id?: string;
  name: string;
  staffCode: string;
  role: Role;
  station: Station | null;
  phone: string | null;
  active: boolean;
  secret?: string;
  photoId?: string | null;
};

export async function saveStaff(actor: StaffUser, input: StaffInput) {
  assertCanManage(actor, input.role);
  const name = input.name.trim();
  const staffCode = input.staffCode.trim().toUpperCase();
  if (!name) throw badRequest("Name is required");
  if (!/^[A-Z0-9]{2,20}$/.test(staffCode)) throw badRequest("Staff code must be 2–20 letters/numbers, e.g. W012");
  if (!input.id && !input.secret) throw badRequest("Set a PIN (or password) for the new staff member");
  if (input.secret) {
    const problem = validateSecret(input.role, input.secret);
    if (problem) throw badRequest(problem);
  }
  if (input.id === actor.id && !input.active) throw conflict("You can't deactivate your own account");
  try {
    return await prisma.$transaction(async (tx) => {
      const before = input.id ? await tx.staff.findUnique({ where: { id: input.id } }) : null;
      if (input.id && !before) throw notFound("Staff member not found");
      if (before) assertCanManage(actor, before.role);
      const data = {
        name,
        staffCode,
        role: input.role,
        station: input.role === "KITCHEN" ? input.station : null,
        phone: input.phone?.trim() || null,
        active: input.active,
        ...(input.photoId !== undefined ? { photoId: input.photoId } : {}),
        ...(input.secret ? { secretHash: await hashSecret(input.secret), failedLogins: 0, lockedUntil: null } : {}),
      };
      const saved = before
        ? await tx.staff.update({ where: { id: before.id }, data })
        : await tx.staff.create({ data: { ...data, secretHash: data.secretHash! } });
      await logEvent(tx, staffActor(actor.id), "STAFF_SAVED", { type: "Staff", id: saved.id }, {
        data: {
          created: !before,
          name,
          staffCode,
          role: input.role,
          active: input.active,
          ...(before && before.role !== input.role ? { roleFrom: before.role } : {}),
          secretChanged: Boolean(input.secret),
        },
      });
      return saved;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`Staff code ${staffCode} is already in use`);
    throw err;
  }
}

export async function resetSecret(actor: StaffUser, staffId: string, secret: string) {
  const target = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!target) throw notFound("Staff member not found");
  assertCanManage(actor, target.role);
  const problem = validateSecret(target.role, secret);
  if (problem) throw badRequest(problem);
  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: staffId },
      data: { secretHash: await hashSecret(secret), failedLogins: 0, lockedUntil: null },
    });
    await logEvent(tx, staffActor(actor.id), "STAFF_SECRET_RESET", { type: "Staff", id: staffId }, {
      data: { staffCode: target.staffCode },
    });
  });
}

export async function onShiftWaiters() {
  return prisma.staff.findMany({
    where: { role: "WAITER", active: true, shifts: { some: { clockOutAt: null } } },
    select: { id: true, name: true, staffCode: true },
    orderBy: { name: "asc" },
  });
}
