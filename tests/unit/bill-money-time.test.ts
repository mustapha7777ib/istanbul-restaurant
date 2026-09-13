import { describe, expect, it } from "vitest";
import { billExtras, computeBill, orderTotals } from "@/lib/bill";
import { applyBps, formatNaira } from "@/lib/money";
import { isWithinOpeningHours, lagosDateKey, lagosDayRange, lagosMonthKey, lagosMonthRange, previousMonthKey } from "@/lib/time";

describe("billExtras", () => {
  it("names only what the bill adds, so guests aren't told about charges that aren't there", () => {
    expect(billExtras(750, 1000)).toBe("VAT and service charge");
    expect(billExtras(750, 0)).toBe("VAT");
    expect(billExtras(0, 1000)).toBe("service charge");
    // Istanbul's menu prices are final: nothing added, nothing mentioned.
    expect(billExtras(0, 0)).toBeNull();
  });

  it("adds nothing to the total when both are zero", () => {
    const lines = [{ unitPriceKobo: 3_000_000, qty: 1, status: "PLACED" }];
    expect(orderTotals(lines, 0, 0)).toEqual({ subtotal: 3_000_000, serviceCharge: 0, vat: 0, total: 3_000_000 });
  });
});

describe("computeBill", () => {
  it("excludes voided lines and applies VAT on subtotal + service charge", () => {
    const bill = computeBill({
      orders: [
        {
          items: [
            { unitPriceKobo: 650000, qty: 2, status: "SERVED" },
            { unitPriceKobo: 350000, qty: 1, status: "READY" },
            { unitPriceKobo: 999900, qty: 1, status: "VOIDED" },
          ],
        },
      ],
      vatBps: 750,
      serviceChargeBps: 1000,
      payments: [
        { amountKobo: 1000000, tipKobo: 50000 },
        { amountKobo: 500000, tipKobo: 0 },
      ],
    });
    expect(bill.subtotal).toBe(1650000); // ₦16,500
    expect(bill.serviceCharge).toBe(165000); // 10%
    expect(bill.vat).toBe(Math.round((1650000 + 165000) * 0.075)); // 7.5% of ₦18,150
    expect(bill.total).toBe(1650000 + 165000 + 136125);
    expect(bill.paid).toBe(1500000);
    expect(bill.tips).toBe(50000);
    expect(bill.balance).toBe(bill.total - 1500000);
  });

  it("is zero for an empty table", () => {
    expect(computeBill({ orders: [], vatBps: 750, serviceChargeBps: 0, payments: [] })).toMatchObject({ total: 0, balance: 0 });
  });

  it("is the sum of per-order totals, so paying each order exactly clears the table", () => {
    // ₦1.01 orders: VAT on each rounds on its own; a whole-table VAT would round differently.
    const orders = [{ items: [{ unitPriceKobo: 101, qty: 1, status: "READY" }] }, { items: [{ unitPriceKobo: 101, qty: 1, status: "READY" }] }];
    const each = orderTotals(orders[0].items, 750, 1000).total;
    const bill = computeBill({ orders, vatBps: 750, serviceChargeBps: 1000, payments: [{ amountKobo: each, tipKobo: 0 }, { amountKobo: each, tipKobo: 0 }] });
    expect(bill.total).toBe(each * 2);
    expect(bill.balance).toBe(0);
  });
});

describe("money", () => {
  it("formats naira with kobo only when needed", () => {
    expect(formatNaira(650000)).toBe("₦6,500");
    expect(formatNaira(1773750)).toBe("₦17,737.50");
  });
  it("rounds basis points to the nearest kobo", () => {
    expect(applyBps(1001, 750)).toBe(75);
  });
});

describe("Lagos business time", () => {
  it("counts 23:30 UTC on the 31st as the next month in Lagos (UTC+1)", () => {
    const lateNight = new Date("2026-08-31T23:30:00Z"); // 00:30 on 1 Sept in Lagos
    expect(lagosMonthKey(lateNight)).toBe("2026-09");
    expect(lagosDateKey(lateNight)).toBe("2026-09-01");
    const { start, end } = lagosMonthRange("2026-09");
    expect(start.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(lateNight >= start && lateNight < end).toBe(true);
  });

  it("gives the Lagos day around an instant", () => {
    const { start, end } = lagosDayRange(new Date("2026-09-12T22:59:00Z")); // 23:59 Lagos
    expect(start.toISOString()).toBe("2026-09-11T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-12T23:00:00.000Z");
  });

  it("steps back across a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });

  it("handles opening hours, including past midnight", () => {
    const at = (hhmmLagos: string) => new Date(`2026-09-12T${hhmmLagos}:00+01:00`);
    expect(isWithinOpeningHours(at("12:00"), "08:00", "23:30")).toBe(true);
    expect(isWithinOpeningHours(at("23:45"), "08:00", "23:30")).toBe(false);
    expect(isWithinOpeningHours(at("01:00"), "18:00", "02:00")).toBe(true);
    expect(isWithinOpeningHours(at("03:00"), "18:00", "02:00")).toBe(false);
    expect(isWithinOpeningHours(at("03:00"), "00:00", "00:00")).toBe(true);
  });
});
