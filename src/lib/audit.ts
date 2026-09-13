import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

export type Actor =
  | { type: "STAFF"; staffId: string }
  | { type: "CUSTOMER" }
  | { type: "SYSTEM" };

export const CUSTOMER: Actor = { type: "CUSTOMER" };
export const SYSTEM: Actor = { type: "SYSTEM" };
export const staffActor = (staffId: string): Actor => ({ type: "STAFF", staffId });

export const ACTIONS = [
  "SESSION_OPENED",
  "SESSION_PAID",
  "SESSION_CLOSED",
  "SESSION_TRANSFERRED",
  "ORDER_PLACED",
  "ORDER_CLAIMED",
  "ORDER_SENT_TO_KITCHEN",
  "ORDER_REJECTED",
  "ORDER_CANCELLED",
  "ORDER_READY",
  "ORDER_SERVED",
  "ORDER_ESCALATED",
  "ORDER_READY_ALERT",
  "ITEMS_STARTED",
  "ITEMS_READY",
  "ITEMS_RECALLED",
  "ITEM_VOIDED",
  "REQUEST_CREATED",
  "REQUEST_ACKNOWLEDGED",
  "REQUEST_RESOLVED",
  "REQUEST_ESCALATED",
  "PAYMENT_RECORDED",
  "SHIFT_CLOCK_IN",
  "SHIFT_CLOCK_OUT",
  "SHIFT_RECONCILED",
  "RATING_SUBMITTED",
  "MENU_CATEGORY_SAVED",
  "MENU_ITEM_SAVED",
  "MENU_ITEM_AVAILABILITY",
  "STAFF_SAVED",
  "STAFF_SECRET_RESET",
  "STAFF_LOGIN",
  "STAFF_LOGIN_FAILED",
  "TABLE_SAVED",
  "TABLE_TOKEN_ROTATED",
  "SETTINGS_UPDATED",
  "AWARD_GIVEN",
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Append an audit event. Always call with the same transaction client as the
 * change being described so the log can never disagree with the data.
 */
export async function logEvent(
  tx: Tx,
  actor: Actor,
  action: Action,
  entity: { type: string; id: string },
  extra: { tableId?: string | null; sessionId?: string | null; data?: Prisma.InputJsonValue } = {},
) {
  await tx.activityEvent.create({
    data: {
      actorType: actor.type,
      staffId: actor.type === "STAFF" ? actor.staffId : null,
      action,
      entityType: entity.type,
      entityId: entity.id,
      tableId: extra.tableId ?? null,
      sessionId: extra.sessionId ?? null,
      data: extra.data,
    },
  });
}
