import { describe, expect, it } from "vitest";
import { defaultMarketDataTtl, isMarketOpen } from "../../src/lib/marketHours.js";

describe("Indian market cache timing", () => {
  it("uses a short TTL while the market is open", () => {
    const tenAmIst = new Date("2026-08-27T04:30:00.000Z");

    expect(isMarketOpen(tenAmIst)).toBe(true);
    expect(defaultMarketDataTtl(tenAmIst)).toBe(60_000);
  });

  it("expires a pre-market entry when the same-day session opens", () => {
    const eightAmIst = new Date("2026-08-27T02:30:00.000Z");

    expect(isMarketOpen(eightAmIst)).toBe(false);
    expect(defaultMarketDataTtl(eightAmIst)).toBe(75 * 60_000);
  });

  it("keeps the overnight TTL bounded on weekends", () => {
    const fridayFourPmIst = new Date("2026-08-28T10:30:00.000Z");

    expect(isMarketOpen(fridayFourPmIst)).toBe(false);
    expect(defaultMarketDataTtl(fridayFourPmIst)).toBe(12 * 60 * 60_000);
  });
});
