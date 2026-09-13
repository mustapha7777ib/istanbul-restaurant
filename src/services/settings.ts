import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, forbidden } from "@/lib/errors";
import { Outbox, rooms } from "@/lib/realtime";
import { getSettings, type ScoreWeights } from "@/lib/settings";

export type SettingsInput = {
  restaurantName: string;
  tagline: string;
  phone: string;
  address: string;
  instagram: string;
  vatBps: number;
  serviceChargeBps: number;
  claimTimeoutSec: number;
  requestEscalateSec: number;
  readyAlertSec: number;
  openingTime: string;
  closingTime: string;
  orderingEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  scoreWeights: ScoreWeights;
  minHoursForAward: number;
  minOrdersForAward: number;
  logoId?: string | null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function updateSettings(staff: StaffUser, input: SettingsInput) {
  if (staff.role !== "ADMIN") throw forbidden("Only an admin can change settings");
  if (!HHMM.test(input.openingTime) || !HHMM.test(input.closingTime)) throw badRequest("Use 24-hour times like 08:00");
  if (input.vatBps < 0 || input.vatBps > 5000 || input.serviceChargeBps < 0 || input.serviceChargeBps > 5000) {
    throw badRequest("VAT and service charge must be between 0% and 50%");
  }
  if (input.claimTimeoutSec < 30 || input.requestEscalateSec < 30 || input.readyAlertSec < 60) {
    throw badRequest("Timeouts are too short");
  }
  const weightTotal = Object.values(input.scoreWeights).reduce((a, b) => a + b, 0);
  if (weightTotal <= 0) throw badRequest("Score weights must add up to more than 0");
  const saved = await prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const saved = await tx.settings.update({ where: { id: 1 }, data: { ...input, scoreWeights: input.scoreWeights } });
    const changed = Object.fromEntries(
      Object.entries(input).filter(([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v)),
    );
    await logEvent(tx, staffActor(staff.id), "SETTINGS_UPDATED", { type: "Settings", id: "1" }, { data: JSON.parse(JSON.stringify(changed)) });
    return saved;
  });
  new Outbox().add([rooms.everyone], "menu", {}).flush();
  return saved;
}

/** The quick "pause phone ordering" switch. Managers can use it too (power cut, private event). */
export async function setOrderingEnabled(staff: StaffUser, enabled: boolean) {
  if (staff.role !== "ADMIN" && staff.role !== "MANAGER") throw forbidden();
  await prisma.$transaction(async (tx) => {
    await getSettings(tx);
    await tx.settings.update({ where: { id: 1 }, data: { orderingEnabled: enabled } });
    await logEvent(tx, staffActor(staff.id), "SETTINGS_UPDATED", { type: "Settings", id: "1" }, { data: { orderingEnabled: enabled } });
  });
  new Outbox().add([rooms.everyone], "menu", {}).add([rooms.managers], "floor", {}).flush();
}
