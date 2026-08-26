import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { readEnvironment } from "../src/config/environment.js";
import { loadLocalEnvironment } from "../src/config/loadLocalEnvironment.js";
import { createDatabasePool, withTransaction } from "../src/database/pool.js";
import { createLogger } from "../src/logging/logger.js";

const DEMO_EMAIL = "demo@stockfolio.app";
const DEMO_NAME = "Demo Investor";
const DEMO_PASSWORD = "Demo@1234";
const BCRYPT_ROUNDS = 10;

interface SeedHolding {
  symbol: string;
  exchange: "NSE" | "BSE";
  companyName: string;
  sector: string;
  industry: string;
  lots: ReadonlyArray<{ quantity: string; price: string; daysAgo: number }>;
}

const holdings: ReadonlyArray<SeedHolding> = [
  {
    symbol: "RELIANCE",
    exchange: "NSE",
    companyName: "Reliance Industries",
    sector: "Energy",
    industry: "Oil & Gas Operations",
    lots: [
      { quantity: "5.0000", price: "950.0000", daysAgo: 110 },
      { quantity: "5.0000", price: "1050.0000", daysAgo: 70 },
    ],
  },
  {
    symbol: "INFY",
    exchange: "NSE",
    companyName: "Infosys",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    lots: [{ quantity: "12.0000", price: "1100.0000", daysAgo: 95 }],
  },
  {
    symbol: "HDFCBANK",
    exchange: "NSE",
    companyName: "HDFC Bank",
    sector: "Financial Services",
    industry: "Banks",
    lots: [{ quantity: "18.0000", price: "700.0000", daysAgo: 85 }],
  },
  {
    symbol: "ITC",
    exchange: "NSE",
    companyName: "ITC",
    sector: "Consumer Staples",
    industry: "Tobacco & Consumer Products",
    lots: [{ quantity: "30.0000", price: "250.0000", daysAgo: 75 }],
  },
  {
    symbol: "TCS",
    exchange: "NSE",
    companyName: "Tata Consultancy Services",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    lots: [{ quantity: "6.0000", price: "4200.0000", daysAgo: 65 }],
  },
  {
    symbol: "ICICIBANK",
    exchange: "NSE",
    companyName: "ICICI Bank",
    sector: "Financial Services",
    industry: "Banks",
    lots: [{ quantity: "10.0000", price: "1800.0000", daysAgo: 55 }],
  },
  {
    symbol: "M&M",
    exchange: "NSE",
    companyName: "Mahindra & Mahindra Ltd",
    sector: "Automobile",
    industry: "Auto & Truck Manufacturers",
    lots: [{ quantity: "4.0000", price: "4000.0000", daysAgo: 45 }],
  },
];

function dateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function deterministicUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function requestHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const environment = readEnvironment();
  const logger = createLogger(environment.logLevel);
  const database = createDatabasePool(environment.database, { connectionTimeoutMillis: 30_000 });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  try {
    await withTransaction(database, async (client) => {
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, updated_at = now()
         RETURNING id::text`,
        [DEMO_NAME, DEMO_EMAIL, passwordHash],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error("Demo user upsert returned no row");

      const portfolioResult = await client.query<{ id: string }>(
        `INSERT INTO portfolios (user_id, name)
         VALUES ($1, 'My Portfolio')
         ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
         RETURNING id::text`,
        [userId],
      );
      const portfolioId = portfolioResult.rows[0]?.id;
      if (!portfolioId) throw new Error("Demo portfolio upsert returned no row");

      // The seed owns only this well-known demo account. Rebuilding its ledger
      // makes the command repeatable while leaving every real user untouched.
      await client.query("DELETE FROM idempotency_keys WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM transactions WHERE portfolio_id = $1", [portfolioId]);

      let lotIndex = 0;
      for (const holding of holdings) {
        const instrumentResult = await client.query<{ id: string }>(
          `INSERT INTO instruments (symbol, exchange, provider_symbol, company_name, sector, industry)
           VALUES ($1, $2, $1, $3, $4, $5)
           ON CONFLICT (symbol, exchange) DO UPDATE SET
             company_name = EXCLUDED.company_name,
             sector = EXCLUDED.sector,
             industry = EXCLUDED.industry,
             updated_at = now()
           RETURNING id::text`,
          [holding.symbol, holding.exchange, holding.companyName, holding.sector, holding.industry],
        );
        const instrumentId = instrumentResult.rows[0]?.id;
        if (!instrumentId) throw new Error(`Instrument upsert failed for ${holding.symbol}`);

        for (const lot of holding.lots) {
          const payload = {
            symbol: holding.symbol,
            exchange: holding.exchange,
            type: "BUY",
            quantity: lot.quantity,
            price: lot.price,
            txnDate: dateDaysAgo(lot.daysAgo),
          };
          await client.query(
            `INSERT INTO transactions (
               portfolio_id, instrument_id, type, quantity, price, txn_date,
               notes, client_request_id, request_hash
             ) VALUES ($1, $2, 'BUY', $3::numeric, $4::numeric, $5::date, $6, $7::uuid, $8)`,
            [
              portfolioId,
              instrumentId,
              lot.quantity,
              lot.price,
              payload.txnDate,
              "Demo seed data",
              deterministicUuid(lotIndex),
              requestHash(payload),
            ],
          );
          lotIndex += 1;
        }
      }
    });
    logger.info({ holdings: holdings.length }, "Demo portfolio seeded successfully");
  } finally {
    await database.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write("Demo seed failed. Check the database configuration.\n");
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
