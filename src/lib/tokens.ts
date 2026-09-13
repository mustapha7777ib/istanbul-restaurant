// Signed cookie tokens. Kept free of Next.js and Prisma imports because
// server.ts uses it to authenticate Socket.io connections.
import { SignJWT, jwtVerify } from "jose";

export const STAFF_COOKIE = "cec_staff";
export const GUEST_COOKIE = "cec_guest";

export const STAFF_TTL_SECONDS = 16 * 60 * 60;
export const GUEST_TTL_SECONDS = 12 * 60 * 60;

export type StaffRole = "ADMIN" | "MANAGER" | "WAITER" | "KITCHEN";
export type StationName = "KITCHEN" | "BAR";

export type StaffClaims = {
  staffId: string;
  role: StaffRole;
  name: string;
  station: StationName | null;
};

export type GuestClaims = { sessionId: string; tableId: string };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signStaffToken(claims: StaffClaims) {
  return new SignJWT({ typ: "staff", role: claims.role, name: claims.name, station: claims.station })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.staffId)
    .setIssuedAt()
    .setExpirationTime(`${STAFF_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifyStaffToken(token: string | undefined): Promise<StaffClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.typ !== "staff" || !payload.sub) return null;
    return {
      staffId: payload.sub,
      role: payload.role as StaffRole,
      name: String(payload.name ?? ""),
      station: (payload.station as StationName | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function signGuestToken(claims: GuestClaims) {
  return new SignJWT({ typ: "guest", tid: claims.tableId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sessionId)
    .setIssuedAt()
    .setExpirationTime(`${GUEST_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifyGuestToken(token: string | undefined): Promise<GuestClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.typ !== "guest" || !payload.sub) return null;
    return { sessionId: payload.sub, tableId: String(payload.tid) };
  } catch {
    return null;
  }
}

/** Minimal cookie-header parser (server.ts has no framework helpers). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
