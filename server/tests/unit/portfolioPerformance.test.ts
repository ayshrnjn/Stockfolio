import { describe, expect, it } from "vitest";
import { d } from "../../src/lib/money.js";
import {
  calculateFifoPosition,
  calculateXirrPercent,
} from "../../src/services/portfolioPerformance.js";

describe("portfolio performance calculations", () => {
  it("matches sales against the oldest purchase lots", () => {
    const position = calculateFifoPosition([
      { type: "BUY", quantity: "10", price: "100", date: "2026-01-10" },
      { type: "BUY", quantity: "5", price: "120", date: "2026-02-10" },
      { type: "SELL", quantity: "8", price: "150", date: "2026-03-10" },
    ]);

    expect(position.quantity.toFixed(4)).toBe("7.0000");
    expect(position.remainingCost.toFixed(4)).toBe("800.0000");
    expect(position.totalBuyCost.toFixed(4)).toBe("1600.0000");
    expect(position.realizedPnl.toFixed(4)).toBe("400.0000");
    expect(position.latestBuyDate).toBe("2026-02-10");
    expect(position.latestSellDate).toBe("2026-03-10");
  });

  it("rejects a corrupt ledger whose sales exceed its purchases", () => {
    expect(() => calculateFifoPosition([
      { type: "BUY", quantity: "1", price: "100", date: "2026-01-10" },
      { type: "SELL", quantity: "2", price: "120", date: "2026-01-11" },
    ])).toThrow("A sale is dated before sufficient purchases");
  });

  it("calculates a money-weighted annual return from dated cash flows", () => {
    const result = calculateXirrPercent([
      { date: "2025-01-01", amount: d(-1000) },
      { date: "2026-01-01", amount: d(1100) },
    ]);

    expect(result.toNumber()).toBeCloseTo(10, 1);
  });

  it("returns zero when cash flows do not define a return", () => {
    expect(calculateXirrPercent([
      { date: "2026-01-01", amount: d(-1000) },
    ]).toFixed(4)).toBe("0.0000");
  });
});
