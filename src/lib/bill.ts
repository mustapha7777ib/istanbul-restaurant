import { applyBps } from "./money";

export type BillLine = { unitPriceKobo: number; qty: number; status: string };

export type Bill = {
  subtotal: number;
  serviceCharge: number;
  vat: number;
  total: number;
  paid: number;
  tips: number;
  balance: number;
};

/**
 * What the bill adds on top of menu prices, for guest and staff wording:
 * "VAT and service charge", "VAT", "service charge", or null when prices are final.
 */
export function billExtras(vatBps: number, serviceChargeBps: number) {
  if (vatBps > 0 && serviceChargeBps > 0) return "VAT and service charge";
  if (vatBps > 0) return "VAT";
  if (serviceChargeBps > 0) return "service charge";
  return null;
}

/**
 * What one order costs. Each order is paid before it goes to the kitchen, so
 * service charge and VAT (on subtotal + service charge) are worked out per order.
 */
export function orderTotals(lines: BillLine[], vatBps: number, serviceChargeBps: number) {
  const subtotal = lines.filter((l) => l.status !== "VOIDED").reduce((sum, l) => sum + l.unitPriceKobo * l.qty, 0);
  const serviceCharge = applyBps(subtotal, serviceChargeBps);
  const vat = applyBps(subtotal + serviceCharge, vatBps);
  return { subtotal, serviceCharge, vat, total: subtotal + serviceCharge + vat };
}

/**
 * The table's bill: the sum of its orders, so paying every order exactly
 * leaves a zero balance. Rejected/cancelled orders must be excluded by the
 * caller (their items are VOIDED anyway).
 */
export function computeBill(input: {
  orders: { items: BillLine[] }[];
  vatBps: number;
  serviceChargeBps: number;
  payments: { amountKobo: number; tipKobo: number }[];
}): Bill {
  const sum = { subtotal: 0, serviceCharge: 0, vat: 0, total: 0 };
  for (const o of input.orders) {
    const t = orderTotals(o.items, input.vatBps, input.serviceChargeBps);
    sum.subtotal += t.subtotal;
    sum.serviceCharge += t.serviceCharge;
    sum.vat += t.vat;
    sum.total += t.total;
  }
  const paid = input.payments.reduce((s, p) => s + p.amountKobo, 0);
  const tips = input.payments.reduce((s, p) => s + p.tipKobo, 0);
  return { ...sum, paid, tips, balance: sum.total - paid };
}
