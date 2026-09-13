import { formatNaira } from "@/lib/money";
import { formatDuration } from "@/lib/time";

type D = Record<string, unknown> | null | undefined;

const n = (v: unknown) => (typeof v === "number" ? v : 0);
const s = (v: unknown) => (v == null ? "" : String(v));
const order = (d: D) => (d?.seq ? `order #${d.seq}` : "an order");

/** Human-readable sentence for an audit event. */
export function describeEvent(action: string, raw: unknown): string {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (action) {
    case "SESSION_OPENED":
      return "Guests scanned the table QR code";
    case "SESSION_PAID":
      return `Bill fully paid (${formatNaira(n(d.totalKobo))})`;
    case "SESSION_CLOSED":
      return d.forced ? `Table cleared by manager — ${s(d.reason)}` : d.reason ? `Visit closed — ${s(d.reason)}` : `Table cleared (${formatNaira(n(d.totalKobo))})`;
    case "SESSION_TRANSFERRED":
      return "Table handed over to another waiter";
    case "ORDER_PLACED":
      return `${d.staffEntered ? "Waiter keyed in" : "Guest placed"} ${order(d)} · ${d.items} item${n(d.items) === 1 ? "" : "s"} · ${formatNaira(n(d.totalKobo))}`;
    case "ORDER_CLAIMED":
      return d.staffEntered
        ? `Accepted ${order(d)} (keyed in by waiter)`
        : `${d.assignedBy ? "Assigned" : "Accepted"} ${order(d)} after ${formatDuration(n(d.claimSeconds))}${d.escalated ? " (escalated)" : ""}`;
    case "ORDER_SENT_TO_KITCHEN":
      return `${d.alreadyPaidKobo ? `Sent ${order(d)} to the kitchen (${formatNaira(n(d.alreadyPaidKobo))} already paid at the table)` : `Took payment and sent ${order(d)} to the kitchen`} · ready in about ${n(d.estimateMinutes)} min`;
    case "ORDER_REJECTED":
      return `Declined ${order(d)} — ${s(d.reason)}`;
    case "ORDER_CANCELLED":
      return `Cancelled ${order(d)} — ${s(d.reason)}`;
    case "ORDER_READY":
      return `${order(d)} ready${d.prepSeconds ? ` in ${formatDuration(n(d.prepSeconds))}` : ""}`.replace(/^o/, "O");
    case "ORDER_SERVED":
      return d.partial ? `Served part of ${order(d)}` : `Served ${order(d)}${d.readyToServedSeconds != null ? ` (${formatDuration(n(d.readyToServedSeconds))} after ready)` : ""}`;
    case "ORDER_ESCALATED":
      return `${order(d)} unclaimed for ${formatDuration(n(d.waitedSeconds))} — opened to all waiters`.replace(/^o/, "O");
    case "ORDER_READY_ALERT":
      return `${order(d)} waiting at the pass too long`.replace(/^o/, "O");
    case "ITEMS_STARTED":
      return `Started cooking ${order(d)} (${s(d.station).toLowerCase()})`;
    case "ITEMS_READY":
      return `Marked ${order(d)} ready ${d.byWaiter ? "from the waiter app" : `at the ${s(d.station).toLowerCase()}`}${d.prepSeconds ? ` · ${formatDuration(n(d.prepSeconds))}` : ""}`;
    case "ITEMS_RECALLED":
      return `Recalled ${order(d)} at the ${s(d.station).toLowerCase()}`;
    case "ITEM_VOIDED":
      return `Voided ${s(d.qty)}× ${s(d.name)} (${formatNaira(n(d.amountKobo))}) — ${s(d.reason)}`;
    case "REQUEST_CREATED":
      return `Guest request: ${s(d.type).replace("_", " ").toLowerCase()}${d.note ? ` — “${s(d.note)}”` : ""}`;
    case "REQUEST_ACKNOWLEDGED":
      return `Responded to ${s(d.type).replace("_", " ").toLowerCase()} after ${formatDuration(n(d.responseSeconds))}`;
    case "REQUEST_RESOLVED":
      return `Completed ${s(d.type).replace("_", " ").toLowerCase()} request`;
    case "REQUEST_ESCALATED":
      return `${s(d.type).replace("_", " ").toLowerCase()} request not answered — escalated`;
    case "PAYMENT_RECORDED":
      return `Recorded ${formatNaira(n(d.amountKobo))} ${s(d.method).toLowerCase()}${d.seq ? ` for ${order(d)}` : ""}${n(d.tipKobo) ? ` + ${formatNaira(n(d.tipKobo))} tip` : ""}${d.reference ? ` (ref ${s(d.reference)})` : ""}`;
    case "SHIFT_CLOCK_IN":
      return "Clocked in";
    case "SHIFT_CLOCK_OUT":
      return `Clocked out${d.cashDeclaredKobo != null ? ` · declared ${formatNaira(n(d.cashDeclaredKobo))} cash (expected ${formatNaira(n(d.expectedCashKobo))})` : ""}`;
    case "SHIFT_RECONCILED":
      return `Shift ${s(d.status).toLowerCase()}${d.note ? ` — ${s(d.note)}` : ""}`;
    case "RATING_SUBMITTED":
      return `Guest rated food ${s(d.food)}★ · service ${s(d.service)}★`;
    case "MENU_ITEM_AVAILABILITY":
      return `${s(d.name)} marked ${d.isAvailable ? "available" : "sold out"}`;
    case "MENU_ITEM_SAVED":
      return `${d.created ? "Added" : "Edited"} menu item ${s(d.name)}${d.priceToKobo ? ` · price ${formatNaira(n(d.priceFromKobo))} → ${formatNaira(n(d.priceToKobo))}` : ""}`;
    case "MENU_CATEGORY_SAVED":
      return `${d.created ? "Added" : "Edited"} category ${s(d.name)}`;
    case "STAFF_SAVED":
      return `${d.created ? "Created" : "Updated"} staff ${s(d.name)} (${s(d.staffCode)})${d.secretChanged ? " · PIN/password set" : ""}`;
    case "STAFF_SECRET_RESET":
      return `Reset PIN for ${s(d.staffCode)}`;
    case "STAFF_LOGIN":
      return "Logged in";
    case "STAFF_LOGIN_FAILED":
      return `Failed login attempt${d.locked ? " — account locked" : ""}`;
    case "TABLE_SAVED":
      return `${d.created ? "Added" : "Edited"} table ${s(d.label)}`;
    case "TABLE_TOKEN_ROTATED":
      return "Generated a new QR code";
    case "SETTINGS_UPDATED":
      return `Changed settings: ${Object.keys(d).join(", ") || "no changes"}`;
    case "AWARD_GIVEN":
      return `Named ${s(d.name)} ${s(d.category).toLowerCase()} of the month (${s(d.month)})`;
    default:
      return action.toLowerCase().replace(/_/g, " ");
  }
}
