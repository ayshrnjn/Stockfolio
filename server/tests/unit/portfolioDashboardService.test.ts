import { Decimal } from "decimal.js";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { CacheResult } from "../../src/lib/cache.js";
import { PortfolioDashboardService } from "../../src/services/portfolioDashboardService.js";
import type { MarketDataService } from "../../src/services/marketDataService.js";
import type { IndianExchange, StockDetail } from "../../src/services/marketDataTypes.js";

interface TestLedgerRow {
  instrument_id: string;
  symbol: string;
  exchange: IndianExchange;
  company_name: string;
  sector: string | null;
  industry: string | null;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  txn_date: string;
}

function ledgerRow(overrides: Partial<TestLedgerRow> = {}): TestLedgerRow {
  return {
    instrument_id: "1",
    symbol: "RELIANCE",
    exchange: "NSE",
    company_name: "Reliance Industries",
    sector: "Energy",
    industry: "Oil & Gas",
    type: "BUY",
    quantity: "10.0000",
    price: "100.0000",
    txn_date: "2025-08-26",
    ...overrides,
  };
}

function stockDetail(symbol: string, ltp: string, previousClose = "190"): StockDetail {
  return {
    symbol,
    exchange: "NSE",
    companyName: symbol,
    sector: "Test sector",
    industry: "Test industry",
    description: null,
    quote: {
      ltp,
      change: new Decimal(ltp).minus(previousClose).toString(),
      changePct: null,
      open: null,
      previousClose,
      volume: null,
      dayLow: null,
      dayHigh: null,
      week52Low: null,
      week52High: null,
      asOf: "2026-08-26T10:00:00.000Z",
    },
    fundamentals: {
      marketCap: null,
      pe: null,
      eps: null,
      bookValue: null,
      dividendYield: null,
      faceValue: null,
    },
  };
}

function createService(
  rows: TestLedgerRow[],
  quoteFor: (symbol: string) => Promise<CacheResult<StockDetail>> = async (symbol) => ({
    value: stockDetail(symbol, "200"),
    stale: false,
    asOf: "2026-08-26T10:00:00.000Z",
  }),
): { service: PortfolioDashboardService; getStockDetail: ReturnType<typeof vi.fn> } {
  const database = {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
  const getStockDetail = vi.fn(async (_exchange: IndianExchange, symbol: string) => quoteFor(symbol));
  const marketData = { getStockDetail } as unknown as MarketDataService;
  return { service: new PortfolioDashboardService(database, marketData), getStockDetail };
}

describe("PortfolioDashboardService", () => {
  it("calculates an exact weighted average across multiple BUY lots", async () => {
    const { service } = createService([
      ledgerRow({ quantity: "10.0000", price: "100.0000", txn_date: "2025-08-20" }),
      ledgerRow({ quantity: "20.0000", price: "130.0000", txn_date: "2025-08-26" }),
    ]);

    const dashboard = await service.getDashboard("1");

    expect(dashboard.holdings[0]).toMatchObject({
      quantity: "30.0000",
      avgBuyPrice: "120.0000",
      investment: "3600.0000",
      currentValue: "6000.0000",
      totalPnl: "2400.0000",
      totalPnlPct: "66.6667",
      latestBuyDate: "2025-08-26",
      latestSellDate: null,
    });
  });

  it("reports the latest BUY and SELL dates for each active holding", async () => {
    const { service } = createService([
      ledgerRow({ type: "BUY", quantity: "10.0000", txn_date: "2026-06-01" }),
      ledgerRow({ type: "BUY", quantity: "5.0000", txn_date: "2026-07-01" }),
      ledgerRow({ type: "SELL", quantity: "2.0000", txn_date: "2026-08-01" }),
    ]);

    const dashboard = await service.getDashboard("1");

    expect(dashboard.holdings[0]).toMatchObject({
      latestBuyDate: "2026-07-01",
      latestSellDate: "2026-08-01",
    });
  });

  it("includes FIFO realized profit in holding and portfolio performance", async () => {
    const { service } = createService([
      ledgerRow({ type: "BUY", quantity: "10.0000", price: "100.0000", txn_date: "2026-01-10" }),
      ledgerRow({ type: "BUY", quantity: "5.0000", price: "120.0000", txn_date: "2026-02-10" }),
      ledgerRow({ type: "SELL", quantity: "8.0000", price: "150.0000", txn_date: "2026-03-10" }),
    ]);

    const dashboard = await service.getDashboard("1");

    expect(dashboard.holdings[0]).toMatchObject({
      quantity: "7.0000",
      avgBuyPrice: "114.2857",
      investment: "800.0000",
      realizedPnl: "400.0000",
      unrealizedPnl: "600.0000",
      totalPnl: "1000.0000",
      totalPnlPct: "62.5000",
    });
    expect(dashboard.summary).toMatchObject({
      totalInvestment: "800.0000",
      currentValue: "1400.0000",
      realizedPnl: "400.0000",
      unrealizedPnl: "600.0000",
      totalPnl: "1000.0000",
      absoluteReturnPct: "62.5000",
    });
  });

  it("keeps realized profit from a completely sold position in the summary", async () => {
    const { service, getStockDetail } = createService([
      ledgerRow({ type: "BUY", quantity: "5.0000", price: "100.0000" }),
      ledgerRow({ type: "SELL", quantity: "5.0000", price: "150.0000" }),
    ]);

    const dashboard = await service.getDashboard("1");

    expect(dashboard.holdings).toEqual([]);
    expect(dashboard.summary).toMatchObject({
      holdingsCount: 0,
      totalInvestment: "0.0000",
      currentValue: "0.0000",
      realizedPnl: "250.0000",
      unrealizedPnl: "0.0000",
      totalPnl: "250.0000",
      absoluteReturnPct: "50.0000",
    });
    expect(getStockDetail).not.toHaveBeenCalled();
  });

  it("returns finite zero totals for an empty portfolio", async () => {
    const { service } = createService([]);

    const dashboard = await service.getDashboard("1");

    expect(dashboard.summary).toMatchObject({
      totalInvestment: "0.0000",
      currentValue: "0.0000",
      totalPnl: "0.0000",
      absoluteReturnPct: "0.0000",
      annualizedReturnPct: "0.0000",
      dayPnlPct: "0.0000",
    });
    expect(JSON.stringify(dashboard)).not.toMatch(/NaN|Infinity/);
  });

  it("isolates one failed quote without dropping other holdings", async () => {
    const { service } = createService([
      ledgerRow({ instrument_id: "1", symbol: "GOOD" }),
      ledgerRow({ instrument_id: "2", symbol: "FAILED", company_name: "Failed Limited" }),
    ], async (symbol) => {
      if (symbol === "FAILED") throw new Error("provider unavailable");
      return { value: stockDetail(symbol, "200"), stale: false, asOf: "2026-08-26T10:00:00.000Z" };
    });

    const dashboard = await service.getDashboard("1");

    expect(dashboard.holdings).toHaveLength(2);
    expect(dashboard.holdings.find((holding) => holding.symbol === "GOOD")?.quoteStatus).toBe("live");
    expect(dashboard.holdings.find((holding) => holding.symbol === "FAILED")).toMatchObject({
      quoteStatus: "unavailable",
      currentValue: null,
    });
    expect(dashboard.summary.stale).toBe(true);
  });

  it("never runs more than five quote requests concurrently", async () => {
    let active = 0;
    let maximumActive = 0;
    const rows = Array.from({ length: 8 }, (_, index) => ledgerRow({
      instrument_id: String(index + 1),
      symbol: `STOCK${index}`,
      company_name: `Stock ${index}`,
    }));
    const { service } = createService(rows, async (symbol) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { value: stockDetail(symbol, "200"), stale: false, asOf: "2026-08-26T10:00:00.000Z" };
    });

    await service.getDashboard("1");

    expect(maximumActive).toBe(5);
  });
});
