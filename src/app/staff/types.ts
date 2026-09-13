import type { Json } from "@/lib/client/types";
import type { QueueOrder, WaiterTable } from "@/services/orders";
import type { WaiterRequest } from "@/services/requests";

export type QueueItem = Json<QueueOrder>;
export type TableItem = Json<WaiterTable>;
export type RequestItem = Json<WaiterRequest>;

export type Me = {
  staff: { id: string; name: string; role: string; staffCode: string };
  shift: { id: string; clockInAt: string } | null;
  waitersOnShift: { id: string; name: string; staffCode: string }[];
};

export const REQUEST_TEXT: Record<string, string> = {
  CALL_WAITER: "Called for waiter",
  BILL: "Wants the bill",
  WATER: "Wants water",
  CUTLERY: "Cutlery / napkins",
  OTHER: "Request",
};

export const METHOD_TEXT: Record<string, string> = { CASH: "Cash", POS: "Card (POS)", TRANSFER: "Transfer" };
