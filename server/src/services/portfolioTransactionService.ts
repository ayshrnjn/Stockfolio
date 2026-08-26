import { createHash, randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../errors/AppError.js";
import { withTransaction } from "../database/pool.js";
import type { IndianExchange, StockDetail } from "./marketDataTypes.js";
import type { MarketDataService } from "./marketDataService.js";

export interface CreateTransactionInput {
  symbol: string;
  exchange: IndianExchange;
  type: "BUY" | "SELL";
  quantity: string;
  txnDate: string;
}

export interface PortfolioTransaction {
  id: string;
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  txnDate: string;
  createdAt: string;
}

interface TransactionRow {
  id: string;
  symbol: string;
  exchange: IndianExchange;
  company_name: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  txn_date: string | Date;
  created_at: string | Date;
}

interface IdempotencyRow {
  request_hash: string;
  response_body: PortfolioTransaction;
}

export interface CreateTransactionResult {
  transaction: PortfolioTransaction;
  replayed: boolean;
}

function canonicalHash(input: CreateTransactionInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function isoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function isoTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapTransaction(row: TransactionRow): PortfolioTransaction {
  return {
    id: row.id,
    symbol: row.symbol,
    exchange: row.exchange,
    companyName: row.company_name,
    type: row.type,
    quantity: new Decimal(row.quantity).toFixed(4),
    price: new Decimal(row.price).toFixed(4),
    txnDate: isoDate(row.txn_date),
    createdAt: isoTimestamp(row.created_at),
  };
}

export class PortfolioTransactionService {
  public constructor(
    private readonly database: Pool,
    private readonly marketData: MarketDataService,
  ) {}

  public async create(
    userId: string,
    input: CreateTransactionInput,
    requestedKey?: string,
  ): Promise<CreateTransactionResult> {
    const idempotencyKey = requestedKey ?? randomUUID();
    const requestHash = canonicalHash(input);
    if (requestedKey) {
      const replay = await this.database.query<IdempotencyRow>(
        `SELECT request_hash, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [userId, requestedKey],
      );
      const previous = replay.rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new AppError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different transaction",
            { status: 409 },
          );
        }
        return { transaction: previous.response_body, replayed: true };
      }
    }
    const [stockResult, priceResult] = await Promise.all([
      this.marketData.getStockDetail(input.exchange, input.symbol),
      this.marketData.getStockPriceOnDate(input.exchange, input.symbol, input.txnDate),
    ]);
    const stock = stockResult.value;
    const transactionPrice = priceResult.value.close;

    return withTransaction(this.database, async (client) => {
      const portfolioId = await this.lockPortfolio(client, userId);
      const existing = await client.query<IdempotencyRow>(
        `SELECT request_hash, response_body
           FROM idempotency_keys
          WHERE user_id = $1 AND key = $2
          FOR UPDATE`,
        [userId, idempotencyKey],
      );
      const previous = existing.rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new AppError(
            "IDEMPOTENCY_KEY_REUSED",
            "This idempotency key was already used for a different transaction",
            { status: 409 },
          );
        }
        return { transaction: previous.response_body, replayed: true };
      }

      const instrumentId = await this.upsertInstrument(client, stock);
      if (input.type === "SELL") {
        await this.assertChronologicalSell(
          client,
          portfolioId,
          instrumentId,
          input.quantity,
          input.txnDate,
        );
      }

      const inserted = await client.query<TransactionRow>(
        `INSERT INTO transactions (
           portfolio_id, instrument_id, type, quantity, price, txn_date,
           client_request_id, request_hash
         )
         VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::date, $7::uuid, $8)
         RETURNING id::text, $9::text AS symbol, $10::text AS exchange,
                   $11::text AS company_name, type, quantity::text, price::text,
                   to_char(txn_date, 'YYYY-MM-DD') AS txn_date, created_at`,
        [
          portfolioId,
          instrumentId,
          input.type,
          input.quantity,
          transactionPrice,
          input.txnDate,
          idempotencyKey,
          requestHash,
          stock.symbol,
          stock.exchange,
          stock.companyName,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Transaction insert returned no row");
      const transaction = mapTransaction(row);
      await client.query(
        `INSERT INTO idempotency_keys (key, user_id, request_hash, response_body)
         VALUES ($1::uuid, $2, $3, $4::jsonb)`,
        [idempotencyKey, userId, requestHash, JSON.stringify(transaction)],
      );
      return { transaction, replayed: false };
    });
  }

  private async lockPortfolio(client: PoolClient, userId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `SELECT id::text FROM portfolios WHERE user_id = $1 ORDER BY id LIMIT 1 FOR UPDATE`,
      [userId],
    );
    const portfolio = result.rows[0];
    if (!portfolio) throw AppError.notFound("Portfolio not found");
    return portfolio.id;
  }

  private async upsertInstrument(client: PoolClient, stock: StockDetail): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO instruments (symbol, exchange, provider_symbol, company_name, sector, industry, description)
       VALUES ($1, $2, $1, $3, $4, $5, $6)
       ON CONFLICT (symbol, exchange) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         sector = COALESCE(EXCLUDED.sector, instruments.sector),
         industry = COALESCE(EXCLUDED.industry, instruments.industry),
         description = COALESCE(EXCLUDED.description, instruments.description),
         updated_at = now()
       RETURNING id::text`,
      [stock.symbol, stock.exchange, stock.companyName, stock.sector, stock.industry, stock.description],
    );
    const instrument = result.rows[0];
    if (!instrument) throw new Error("Instrument upsert returned no row");
    return instrument.id;
  }

  private async assertChronologicalSell(
    client: PoolClient,
    portfolioId: string,
    instrumentId: string,
    requestedQuantity: string,
    transactionDate: string,
  ): Promise<void> {
    const result = await client.query<{ type: "BUY" | "SELL"; quantity: string; txn_date: string }>(
      `SELECT type, quantity::text, to_char(txn_date, 'YYYY-MM-DD') AS txn_date
         FROM transactions
        WHERE portfolio_id = $1 AND instrument_id = $2`,
      [portfolioId, instrumentId],
    );
    const dailyChanges = new Map<string, Decimal>();
    for (const row of result.rows) {
      const signedQuantity = row.type === "BUY" ? new Decimal(row.quantity) : new Decimal(row.quantity).negated();
      dailyChanges.set(row.txn_date, (dailyChanges.get(row.txn_date) ?? new Decimal(0)).plus(signedQuantity));
    }

    let runningQuantity = new Decimal(0);
    let availableOnDate = new Decimal(0);
    let minimumFromSaleDate: Decimal | null = null;
    for (const [date, dailyChange] of [...dailyChanges.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      runningQuantity = runningQuantity.plus(dailyChange);
      if (date <= transactionDate) availableOnDate = runningQuantity;
      if (date >= transactionDate) {
        minimumFromSaleDate = minimumFromSaleDate === null
          ? runningQuantity
          : Decimal.min(minimumFromSaleDate, runningQuantity);
      }
    }
    minimumFromSaleDate ??= availableOnDate;
    const sellableQuantity = Decimal.min(availableOnDate, minimumFromSaleDate);
    if (sellableQuantity.lessThan(requestedQuantity)) {
      const available = Decimal.max(sellableQuantity, 0);
      throw new AppError(
        "INSUFFICIENT_QUANTITY",
        available.isZero()
          ? "This stock cannot be sold before it was purchased"
          : `Only ${available.toFixed(4)} shares can be sold on ${transactionDate}`,
        {
          status: 400,
          details: {
            availableQuantity: available.toFixed(4),
            txnDate: ["Choose a date on or after a purchase with sufficient available quantity"],
          },
        },
      );
    }
  }
}
