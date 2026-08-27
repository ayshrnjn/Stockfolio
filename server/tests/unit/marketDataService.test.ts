import { describe, expect, it, vi } from "vitest";
import { InMemoryCache } from "../../src/lib/cache.js";
import { MarketDataService } from "../../src/services/marketDataService.js";

type MarketClient = ConstructorParameters<typeof MarketDataService>[0];
type IndexClient = ConstructorParameters<typeof MarketDataService>[2];

function createMarketClient(overrides: Partial<MarketClient> = {}): MarketClient {
  return {
    searchCompanies: vi.fn<MarketClient["searchCompanies"]>().mockResolvedValue({
      providerRows: [],
      results: [],
    }),
    getStockDetail: vi.fn<MarketClient["getStockDetail"]>(),
    getHistoricalData: vi.fn<MarketClient["getHistoricalData"]>(),
    getHistoricalDataByName: vi.fn<MarketClient["getHistoricalDataByName"]>(),
    getNseMostActive: vi.fn<MarketClient["getNseMostActive"]>().mockResolvedValue([]),
    ...overrides,
  };
}

describe("market data orchestration", () => {
  it("maps the M&M ticker to the provider's searchable company name", async () => {
    const searchCompanies = vi.fn<MarketClient["searchCompanies"]>().mockResolvedValue({
      providerRows: [],
      results: [{
        providerId: "provider-1",
        symbol: "M&M",
        exchange: "NSE",
        companyName: "Mahindra & Mahindra Ltd",
        sector: "Automobile",
        industry: "Auto & Truck Manufacturers",
      }],
    });
    const service = new MarketDataService(
      createMarketClient({ searchCompanies }),
      new InMemoryCache(),
      { getIndexQuote: vi.fn<IndexClient["getIndexQuote"]>() },
    );

    const result = await service.searchStocks("M&M");

    expect(searchCompanies).toHaveBeenCalledWith("Mahindra & Mahindra");
    expect(result.value[0]).toMatchObject({ symbol: "M&M", exchange: "NSE" });
  });

  it("uses IndianAPI history when both Yahoo endpoints are unavailable", async () => {
    const getHistoricalDataByName = vi.fn<MarketClient["getHistoricalDataByName"]>()
      .mockResolvedValue({
        datasets: [{
          metric: "Price",
          label: "Price on NSE",
          values: [["2026-08-25", "100"], ["2026-08-26", "110"]],
          meta: null,
        }],
      });
    const service = new MarketDataService(
      createMarketClient({ getHistoricalDataByName }),
      new InMemoryCache(),
      { getIndexQuote: vi.fn<IndexClient["getIndexQuote"]>().mockRejectedValue(new Error("blocked")) },
    );

    const result = await service.getMarketOverview();

    expect(getHistoricalDataByName.mock.calls.map(([name]) => name)).toEqual([
      "NIFTY",
      "BSE SENSEX",
      "NIFTY BANK",
      "CNXIT",
    ]);
    expect(result.value.indices).toHaveLength(4);
    expect(result.value.indices.every((index) => index.status === "delayed")).toBe(true);
    expect(result.value.indices[0]).toMatchObject({
      value: "110",
      change: "10.00",
      changePct: "10.00",
    });
  });
});
