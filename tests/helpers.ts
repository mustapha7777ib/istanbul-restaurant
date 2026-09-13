import type { Role, Station } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const TABLES = [
  "ActivityEvent",
  "Rating",
  "Payment",
  "ServiceRequest",
  "OrderItem",
  "Order",
  "TableSession",
  "MenuItem",
  "MenuCategory",
  "Shift",
  "PushSubscription",
  "StaffAward",
  "Staff",
  "Table",
  "Settings",
  "Image",
];

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeStaff(role: Role, opts: { station?: Station; onShift?: boolean; name?: string } = {}): Promise<StaffUser> {
  n++;
  const s = await prisma.staff.create({
    data: {
      name: opts.name ?? `${role} ${n}`,
      staffCode: `${role.charAt(0)}${String(n).padStart(3, "0")}`,
      role,
      station: opts.station ?? null,
      secretHash: "x",
    },
  });
  if (opts.onShift !== false) await prisma.shift.create({ data: { staffId: s.id } });
  return { id: s.id, name: s.name, role: s.role, station: s.station, staffCode: s.staffCode, photoId: null };
}

/** A restaurant with one table, a dish (kitchen) and a drink (bar), VAT 7.5%. */
export async function makeWorld() {
  await prisma.settings.create({ data: { id: 1, vatBps: 750, serviceChargeBps: 0, openingTime: "00:00", closingTime: "00:00" } });
  const table = await prisma.table.create({ data: { label: "T1", area: "Main Hall", qrToken: `tok${Date.now()}${Math.random()}` } });
  const cat = await prisma.menuCategory.create({ data: { name: "Mains" } });
  const jollof = await prisma.menuItem.create({
    data: { categoryId: cat.id, name: "Jollof Rice", priceKobo: 650000, station: "KITCHEN", prepMinutes: 15 },
  });
  const chapman = await prisma.menuItem.create({
    data: { categoryId: cat.id, name: "Chapman", priceKobo: 350000, station: "BAR", prepMinutes: 5 },
  });
  return { table, jollof, chapman };
}

export async function actionsFor(sessionId: string) {
  const events = await prisma.activityEvent.findMany({ where: { sessionId }, orderBy: { at: "asc" } });
  return events.map((e) => e.action);
}
