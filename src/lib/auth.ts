import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Station } from "@/generated/prisma/client";
import { prisma } from "./db";
import { forbidden, unauthorized } from "./errors";
import {
  GUEST_COOKIE,
  GUEST_TTL_SECONDS,
  STAFF_COOKIE,
  STAFF_TTL_SECONDS,
  signGuestToken,
  signStaffToken,
  verifyGuestToken,
  verifyStaffToken,
  type GuestClaims,
} from "./tokens";

export type StaffUser = {
  id: string;
  name: string;
  role: Role;
  station: Station | null;
  staffCode: string;
  photoId: string | null;
};

export const MANAGER_ROLES: Role[] = ["ADMIN", "MANAGER"];

const secureCookies = () => (process.env.APP_URL ?? "").startsWith("https://");

export function homeFor(role: Role) {
  if (role === "WAITER") return "/staff";
  if (role === "KITCHEN") return "/kds";
  return "/admin";
}

export async function currentStaff(): Promise<StaffUser | null> {
  const jar = await cookies();
  const claims = await verifyStaffToken(jar.get(STAFF_COOKIE)?.value);
  if (!claims) return null;
  const staff = await prisma.staff.findUnique({
    where: { id: claims.staffId },
    select: { id: true, name: true, role: true, station: true, staffCode: true, photoId: true, active: true },
  });
  if (!staff || !staff.active) return null;
  const { active: _active, ...user } = staff;
  return user;
}

/** For API routes: throws 401/403. */
export async function requireStaff(roles?: Role[]) {
  const staff = await currentStaff();
  if (!staff) throw unauthorized();
  if (roles && !roles.includes(staff.role)) throw forbidden();
  return staff;
}

/** For pages: redirects to login, or to the user's own home if the role doesn't fit. */
export async function staffPage(roles?: Role[]) {
  const staff = await currentStaff();
  if (!staff) redirect("/staff/login");
  if (roles && !roles.includes(staff.role)) redirect(homeFor(staff.role));
  return staff;
}

export async function setStaffCookie(staff: { id: string; role: Role; name: string; station: Station | null }) {
  const token = await signStaffToken({ staffId: staff.id, role: staff.role, name: staff.name, station: staff.station });
  const jar = await cookies();
  jar.set(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: STAFF_TTL_SECONDS,
  });
}

export async function clearStaffCookie() {
  (await cookies()).delete(STAFF_COOKIE);
}

export async function currentGuest(): Promise<GuestClaims | null> {
  const jar = await cookies();
  return verifyGuestToken(jar.get(GUEST_COOKIE)?.value);
}

export async function requireGuest() {
  const guest = await currentGuest();
  if (!guest) throw unauthorized("Scan the QR code on your table to start ordering");
  return guest;
}

export async function setGuestCookie(claims: GuestClaims) {
  const token = await signGuestToken(claims);
  const jar = await cookies();
  jar.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: GUEST_TTL_SECONDS,
  });
}
