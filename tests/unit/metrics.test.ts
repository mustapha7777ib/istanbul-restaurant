import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS } from "@/lib/settings";
import { bayesianAverage, median, percentileRank, scoreWaiters, type WaiterStats } from "@/services/metrics";

const base: WaiterStats = {
  staffId: "",
  name: "",
  staffCode: "",
  photoId: null,
  ordersClaimed: 0,
  ordersServed: 0,
  tablesServed: 0,
  salesKobo: 0,
  tipsKobo: 0,
  medianClaimSec: null,
  medianServeSec: null,
  medianRequestAckSec: null,
  ratingCount: 0,
  ratingAvg: null,
  foodRatingAvg: null,
  hours: 0,
  shifts: 0,
  ordersPerHour: null,
  disputedShifts: 0,
  voids: 0,
};

describe("helpers", () => {
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("percentile rank rewards faster times when lower is better", () => {
    const pool = [30, 60, 90];
    expect(percentileRank(30, pool, true)).toBe(100);
    expect(percentileRank(90, pool, true)).toBe(0);
    expect(percentileRank(60, pool, true)).toBe(50);
    expect(percentileRank(null, pool, true)).toBe(50);
  });

  it("Bayesian average keeps one 5★ rating from beating a long 4.8★ record", () => {
    const single = bayesianAverage(5, 1, 4);
    const steady = bayesianAverage(4.8 * 60, 60, 4);
    expect(steady).toBeGreaterThan(single);
  });
});

describe("scoreWaiters", () => {
  const thresholds = { minHours: 20, minOrders: 20 };
  const fast = { ...base, staffId: "a", name: "Fast", hours: 40, ordersServed: 120, ordersPerHour: 3, medianClaimSec: 30, medianServeSec: 60, medianRequestAckSec: 40, ratingCount: 50, ratingAvg: 4.7 };
  const slow = { ...base, staffId: "b", name: "Slow", hours: 40, ordersServed: 80, ordersPerHour: 2, medianClaimSec: 120, medianServeSec: 240, medianRequestAckSec: 150, ratingCount: 50, ratingAvg: 3.9, disputedShifts: 1 };
  const newbie = { ...base, staffId: "c", name: "New", hours: 5, ordersServed: 6, ordersPerHour: 1.2, ratingCount: 1, ratingAvg: 5 };

  it("ranks the stronger all-rounder first and leaves ineligible staff unscored", () => {
    const scored = scoreWaiters([slow, newbie, fast], DEFAULT_WEIGHTS, thresholds);
    expect(scored.map((s) => s.name)).toEqual(["Fast", "Slow", "New"]);
    expect(scored[0].score).toBeGreaterThan(scored[1].score!);
    expect(scored[2].eligible).toBe(false);
    expect(scored[2].score).toBeNull();
    expect(scored[1].components.reliability).toBe(80); // one disputed shift
  });

  it("respects custom weights", () => {
    // Only productivity counts: order by orders/hour.
    const w = { rating: 0, speed: 0, productivity: 100, responsiveness: 0, reliability: 0 };
    const a = { ...fast, ordersPerHour: 1 };
    const b = { ...slow, ordersPerHour: 4 };
    expect(scoreWaiters([a, b], w, thresholds)[0].name).toBe("Slow");
  });
});
