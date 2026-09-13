import { randomBytes } from "node:crypto";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { isManager, isUniqueViolation } from "./common";

export const newQrToken = () => randomBytes(9).toString("base64url");

export function tableUrl(qrToken: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/t/${qrToken}`;
}

export async function saveTable(
  staff: StaffUser,
  input: { id?: string; label: string; area: string; seats: number; active: boolean; sortOrder: number },
) {
  if (!isManager(staff)) throw forbidden();
  const label = input.label.trim().toUpperCase();
  if (!label) throw badRequest("Table label is required");
  if (!input.area.trim()) throw badRequest("Area is required");
  try {
    return await prisma.$transaction(async (tx) => {
      const data = {
        label,
        area: input.area.trim(),
        seats: Math.max(1, Math.min(50, Math.round(input.seats))),
        active: input.active,
        sortOrder: input.sortOrder,
      };
      if (input.id && !input.active) {
        const live = await tx.tableSession.findUnique({ where: { activeTableId: input.id } });
        if (live) throw conflict("Clear the guests on this table before deactivating it");
      }
      const saved = input.id
        ? await tx.table.update({ where: { id: input.id }, data })
        : await tx.table.create({ data: { ...data, qrToken: newQrToken() } });
      await logEvent(tx, staffActor(staff.id), "TABLE_SAVED", { type: "Table", id: saved.id }, {
        tableId: saved.id,
        data: { ...data, created: !input.id },
      });
      return saved;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`There is already a table called ${label}`);
    throw err;
  }
}

/** Invalidates the printed QR code (e.g. a card was stolen/photographed). Reprint after. */
export async function rotateTableToken(staff: StaffUser, tableId: string) {
  if (!isManager(staff)) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const table = await tx.table.findUnique({ where: { id: tableId } });
    if (!table) throw notFound("Table not found");
    const updated = await tx.table.update({ where: { id: tableId }, data: { qrToken: newQrToken() } });
    await logEvent(tx, staffActor(staff.id), "TABLE_TOKEN_ROTATED", { type: "Table", id: tableId }, { tableId });
    return updated;
  });
}
