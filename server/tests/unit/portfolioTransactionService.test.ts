import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/errors/AppError.js";
import type { MarketDataService } from "../../src/services/marketDataService.js";
import type { StockDetail } from "../../src/services/marketDataTypes.js";
import {
  PortfolioTransactionService,
  type CreateTransactionInput,
  type PortfolioTransaction,
} from "../../src/services/portfolioTransactionService.js";

const idempotencyKey = "d3754f5e-d60d-4a38-9d9d-fcfdb9453d89";
const input: CreateTransactionInput = {
  symbol: "RELIANCE",
  exchange: "NSE",
  type: "BUY",
  quantity: "10.0000",
  price: "123.4567",
  txnDate: "2026-08-26",
};

function stockDetail(): StockDetail {
  return {
    symbol: "RELIANCE",
    exchange: "NSE",
    companyName: "Reliance Industries",
    sector: "Energy",
    industry: "Oil & Gas",
    description: null,
    quote: {
      ltp: "200",
      change: "10",
      changePct: "5",
      open: null,
      previousClose: "190",
      volume: null,
      dayLow: null,
      dayHigh: null,
      week52Low: null,
      week52High: null,
      asOf: null,
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

interface FakeDatabaseOptions {
  ledgerRows?: Array<{ type: "BUY" | "SELL"; quantity: string; txn_date: string }>;
}

function createFakeDatabase(options: FakeDatabaseOptions = {}) {
  let stored: { request_hash: string; response_body: PortfolioTransaction } | null = null;
  let transactionInsertCount = 0;
  const client = {
    query: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) return { rows: [], rowCount: null };
      if (normalized.includes("FROM portfolios WHERE user_id")) return { rows: [{ id: "9" }], rowCount: 1 };
      if (normalized.includes("FROM idempotency_keys") && normalized.includes("FOR UPDATE")) {
        return { rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 };
      }
      if (normalized.startsWith("INSERT INTO instruments")) return { rows: [{ id: "4" }], rowCount: 1 };
      if (normalized.startsWith("SELECT type, quantity::text")) {
        const rows = options.ledgerRows ?? [];
        return { rows, rowCount: rows.length };
      }
      if (normalized.startsWith("INSERT INTO transactions")) {
        transactionInsertCount += 1;
        return {
          rows: [{
            id: "101",
            symbol: "RELIANCE",
            exchange: "NSE",
            company_name: "Reliance Industries",
            type: parameters[2],
            quantity: parameters[3],
            price: parameters[4],
            txn_date: parameters[5],
            created_at: "2026-08-26T10:00:00.000Z",
          }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith("INSERT INTO idempotency_keys")) {
        stored = {
          request_hash: String(parameters[2]),
          response_body: JSON.parse(String(parameters[3])) as PortfolioTransaction,
        };
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${normalized}`);
    }),
    release: vi.fn(),
  };
  const database = {
    query: vi.fn(async () => ({ rows: stored ? [stored] : [], rowCount: stored ? 1 : 0 })),
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { database, client, getTransactionInsertCount: () => transactionInsertCount };
}

function createService(database: Pool) {
  const getStockDetail = vi.fn().mockResolvedValue({
    value: stockDetail(),
    stale: false,
    asOf: "2026-08-26T10:00:00.000Z",
  });
  const marketData = { getStockDetail } as unknown as MarketDataService;
  return { service: new PortfolioTransactionService(database, marketData), getStockDetail };
}

describe("PortfolioTransactionService", () => {
  it("creates one transaction when the same idempotent request is submitted twice", async () => {
    const fake = createFakeDatabase();
    const { service, getStockDetail } = createService(fake.database);

    const first = await service.create("1", input, idempotencyKey);
    const second = await service.create("1", input, idempotencyKey);

    expect(first.replayed).toBe(false);
    expect(first.transaction.price).toBe("123.4567");
    expect(second).toEqual({ transaction: first.transaction, replayed: true });
    expect(fake.getTransactionInsertCount()).toBe(1);
    expect(getStockDetail).toHaveBeenCalledTimes(1);
    expect(fake.client.release).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of an idempotency key with a different request body", async () => {
    const fake = createFakeDatabase();
    const { service } = createService(fake.database);
    await service.create("1", input, idempotencyKey);

    const failure = await service.create("1", { ...input, quantity: "11.0000" }, idempotencyKey)
      .then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });
    expect(fake.getTransactionInsertCount()).toBe(1);
  });

  it("rejects a SELL that exceeds the available quantity", async () => {
    const fake = createFakeDatabase({
      ledgerRows: [{ type: "BUY", quantity: "3.0000", txn_date: "2026-08-20" }],
    });
    const { service } = createService(fake.database);

    const failure = await service.create("1", {
      ...input,
      type: "SELL",
      quantity: "4.0000",
    }, idempotencyKey).then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: "INSUFFICIENT_QUANTITY", status: 400 });
    expect(fake.getTransactionInsertCount()).toBe(0);
    expect(fake.client.release).toHaveBeenCalledTimes(1);
  });

  it("rejects a SELL dated before the first BUY", async () => {
    const fake = createFakeDatabase({
      ledgerRows: [{ type: "BUY", quantity: "10.0000", txn_date: "2026-08-27" }],
    });
    const { service } = createService(fake.database);

    const failure = await service.create("1", {
      ...input,
      type: "SELL",
      quantity: "1.0000",
    }, idempotencyKey).then(() => undefined, (error: unknown) => error);

    expect(failure).toMatchObject({ code: "INSUFFICIENT_QUANTITY", status: 400 });
    expect(fake.getTransactionInsertCount()).toBe(0);
  });

  it("rejects a backdated SELL that would make a later balance negative", async () => {
    const fake = createFakeDatabase({
      ledgerRows: [
        { type: "BUY", quantity: "10.0000", txn_date: "2026-08-20" },
        { type: "SELL", quantity: "10.0000", txn_date: "2026-08-26" },
      ],
    });
    const { service } = createService(fake.database);

    const failure = await service.create("1", {
      ...input,
      type: "SELL",
      quantity: "1.0000",
      txnDate: "2026-08-25",
    }, idempotencyKey).then(() => undefined, (error: unknown) => error);

    expect(failure).toMatchObject({ code: "INSUFFICIENT_QUANTITY", status: 400 });
    expect(fake.getTransactionInsertCount()).toBe(0);
  });
});
