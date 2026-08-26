import pLimit from "p-limit";
import type { Pool } from "pg";
import { d, div, mul, pct, str, sub } from "../lib/money.js";
import type { IndianExchange } from "./marketDataTypes.js";
import type { MarketDataService } from "./marketDataService.js";

interface LedgerRow {
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

interface BaseHolding {
  instrumentId: string;
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string;
  quantity: string;
  avgBuyPrice: string;
  investment: string;
  latestBuyDate: string | null;
  latestSellDate: string | null;
}

export interface PortfolioHolding extends BaseHolding {
  ltp: string | null;
  previousClose: string | null;
  currentValue: string | null;
  overallPnl: string | null;
  overallPnlPct: string | null;
  dayPnl: string | null;
  dayPnlPct: string | null;
  quoteStatus: "live" | "stale" | "unavailable";
  asOf: string | null;
}

export interface PortfolioSummary {
  totalInvestment: string;
  currentValue: string;
  overallPnl: string;
  overallPnlPct: string;
  absoluteReturnPct: string;
  annualizedReturnPct: string;
  returnSince: string | null;
  dayPnl: string;
  dayPnlPct: string;
  holdingsCount: number;
  asOf: string;
  stale: boolean;
}

export interface PortfolioDashboard {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
}

function deriveBaseHoldings(rows: LedgerRow[]): BaseHolding[] {
  const grouped = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = `${row.exchange}:${row.symbol}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const holdings: BaseHolding[] = [];
  for (const group of grouped.values()) {
    const first = group[0];
    if (!first) continue;
    let buyQuantity = d(0);
    let buyCost = d(0);
    let sellQuantity = d(0);
    let latestBuyDate: string | null = null;
    let latestSellDate: string | null = null;
    for (const transaction of group) {
      if (transaction.type === "BUY") {
        buyQuantity = buyQuantity.plus(transaction.quantity);
        buyCost = buyCost.plus(mul(transaction.quantity, transaction.price));
        if (!latestBuyDate || transaction.txn_date > latestBuyDate) latestBuyDate = transaction.txn_date;
      } else {
        sellQuantity = sellQuantity.plus(transaction.quantity);
        if (!latestSellDate || transaction.txn_date > latestSellDate) latestSellDate = transaction.txn_date;
      }
    }
    const quantity = buyQuantity.minus(sellQuantity);
    if (quantity.lessThanOrEqualTo(0)) continue;
    const avgBuyPrice = div(buyCost, buyQuantity);
    holdings.push({
      instrumentId: first.instrument_id,
      symbol: first.symbol,
      exchange: first.exchange,
      companyName: first.company_name,
      sector: first.sector ?? first.industry ?? "Other",
      quantity: str(quantity),
      avgBuyPrice: str(avgBuyPrice),
      investment: str(mul(quantity, avgBuyPrice)),
      latestBuyDate,
      latestSellDate,
    });
  }
  return holdings.sort((left, right) => left.companyName.localeCompare(right.companyName));
}

export class PortfolioDashboardService {
  public constructor(
    private readonly database: Pool,
    private readonly marketData: MarketDataService,
  ) {}

  public async getDashboard(userId: string): Promise<PortfolioDashboard> {
    const rows = await this.loadLedger(userId);
    const baseHoldings = deriveBaseHoldings(rows);
    const limit = pLimit(5);
    const settledQuotes = await Promise.allSettled(baseHoldings.map((holding) => limit(
      () => this.marketData.getStockDetail(holding.exchange, holding.symbol),
    )));

    const holdings: PortfolioHolding[] = baseHoldings.map((holding, index) => {
      const settled = settledQuotes[index];
      if (!settled || settled.status === "rejected" || !settled.value.value.quote.ltp) {
        return {
          ...holding,
          ltp: null,
          previousClose: null,
          currentValue: null,
          overallPnl: null,
          overallPnlPct: null,
          dayPnl: null,
          dayPnlPct: null,
          quoteStatus: "unavailable",
          asOf: null,
        };
      }

      const quote = settled.value.value.quote;
      const ltp = quote.ltp!;
      const currentValue = mul(holding.quantity, ltp);
      const overallPnl = sub(currentValue, holding.investment);
      const previousClose = quote.previousClose;
      const dayPnl = previousClose
        ? mul(holding.quantity, sub(ltp, previousClose))
        : null;
      return {
        ...holding,
        ltp: str(ltp),
        previousClose: previousClose ? str(previousClose) : null,
        currentValue: str(currentValue),
        overallPnl: str(overallPnl),
        overallPnlPct: str(pct(overallPnl, holding.investment)),
        dayPnl: dayPnl ? str(dayPnl) : null,
        dayPnlPct: previousClose ? str(pct(sub(ltp, previousClose), previousClose)) : null,
        quoteStatus: settled.value.stale ? "stale" : "live",
        asOf: settled.value.asOf,
      };
    });

    const availableHoldings = holdings.filter((holding) => holding.currentValue !== null);
    const portfolioCurrentValue = availableHoldings.reduce(
      (total, holding) => total.plus(holding.currentValue!),
      d(0),
    );
    const comparableInvestment = availableHoldings.reduce(
      (total, holding) => total.plus(holding.investment),
      d(0),
    );
    const overallPnl = portfolioCurrentValue.minus(comparableInvestment);
    const dayPnl = availableHoldings.reduce(
      (total, holding) => total.plus(holding.dayPnl ?? 0),
      d(0),
    );
    const previousPortfolioValue = portfolioCurrentValue.minus(dayPnl);
    const asOf = holdings.map((holding) => holding.asOf).filter((value): value is string => Boolean(value)).sort().at(-1)
      ?? new Date().toISOString();
    const stale = holdings.some((holding) => holding.quoteStatus !== "live");
    const activeInstrumentIds = new Set(baseHoldings.map((holding) => holding.instrumentId));
    const returnSince = rows
      .filter((row) => row.type === "BUY" && activeInstrumentIds.has(row.instrument_id))
      .map((row) => row.txn_date)
      .sort()
      .at(0) ?? null;
    const absoluteReturnPct = pct(overallPnl, comparableInvestment);
    const annualizedReturnPct = this.calculateAnnualizedReturn(
      comparableInvestment,
      portfolioCurrentValue,
      returnSince,
    );

    return {
      holdings,
      summary: {
        totalInvestment: str(comparableInvestment),
        currentValue: str(portfolioCurrentValue),
        overallPnl: str(overallPnl),
        overallPnlPct: str(absoluteReturnPct),
        absoluteReturnPct: str(absoluteReturnPct),
        annualizedReturnPct: str(annualizedReturnPct),
        returnSince,
        dayPnl: str(dayPnl),
        dayPnlPct: str(pct(dayPnl, previousPortfolioValue)),
        holdingsCount: holdings.length,
        asOf,
        stale,
      },
    };
  }

  private async loadLedger(userId: string): Promise<LedgerRow[]> {
    const result = await this.database.query<LedgerRow>(
      `SELECT i.id::text AS instrument_id, i.symbol, i.exchange, i.company_name,
              i.sector, i.industry, t.type, t.quantity::text, t.price::text,
              to_char(t.txn_date, 'YYYY-MM-DD') AS txn_date
         FROM transactions t
         JOIN portfolios p ON p.id = t.portfolio_id
         JOIN instruments i ON i.id = t.instrument_id
        WHERE p.user_id = $1
        ORDER BY t.txn_date, t.created_at, t.id`,
      [userId],
    );
    return result.rows;
  }

  private calculateAnnualizedReturn(
    investment: ReturnType<typeof d>,
    currentValue: ReturnType<typeof d>,
    returnSince: string | null,
  ): ReturnType<typeof d> {
    if (!returnSince || investment.lessThanOrEqualTo(0) || currentValue.lessThanOrEqualTo(0)) return d(0);
    const start = Date.parse(`${returnSince}T00:00:00Z`);
    if (!Number.isFinite(start)) return d(0);
    const elapsedDays = Math.max(1, (Date.now() - start) / 86_400_000);
    const years = d(elapsedDays).dividedBy("365.25");
    return currentValue.dividedBy(investment).pow(d(1).dividedBy(years)).minus(1).times(100);
  }

}
