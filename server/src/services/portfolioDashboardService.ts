import pLimit from "p-limit";
import type { Pool } from "pg";
import { currentIndiaDate } from "../lib/marketHours.js";
import { d, div, mul, pct, str, sub } from "../lib/money.js";
import type { IndianExchange } from "./marketDataTypes.js";
import type { MarketDataService } from "./marketDataService.js";
import {
  calculateFifoPosition,
  calculateXirrPercent,
  type DatedCashFlow,
  type FifoPosition,
  InvalidPortfolioLedgerError,
} from "./portfolioPerformance.js";

interface LedgerRow {
  symbol: string;
  exchange: IndianExchange;
  company_name: string;
  type: "BUY" | "SELL";
  quantity: string;
  price: string;
  txn_date: string;
}

interface BaseHolding {
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  quantity: string;
  avgBuyPrice: string;
  investment: string;
  realizedPnl: string;
  totalBuyCost: string;
  latestBuyDate: string | null;
  latestSellDate: string | null;
}

interface LedgerPerformance {
  holdings: BaseHolding[];
  issues: PortfolioLedgerIssue[];
  realizedPnl: string;
  totalBuyCost: string;
  cashFlows: DatedCashFlow[];
  returnSince: string | null;
}

export interface PortfolioHolding extends Omit<BaseHolding, "totalBuyCost"> {
  ltp: string | null;
  currentValue: string | null;
  unrealizedPnl: string | null;
  totalPnl: string | null;
  totalPnlPct: string | null;
  dayPnl: string | null;
  dayPnlPct: string | null;
  quoteStatus: "live" | "stale" | "unavailable";
  asOf: string | null;
}

export interface PortfolioSummary {
  totalInvestment: string;
  currentValue: string | null;
  realizedPnl: string;
  unrealizedPnl: string | null;
  totalPnl: string | null;
  absoluteReturnPct: string | null;
  annualizedReturnPct: string | null;
  returnSince: string | null;
  dayPnl: string | null;
  dayPnlPct: string | null;
  holdingsCount: number;
  asOf: string;
  stale: boolean;
}

export interface PortfolioLedgerIssue {
  symbol: string;
  exchange: IndianExchange;
  code: "INVALID_TRANSACTION_ORDER";
  message: string;
}

export interface PortfolioDashboard {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
  issues: PortfolioLedgerIssue[];
}

function deriveLedgerPerformance(rows: readonly LedgerRow[]): LedgerPerformance {
  const grouped = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = `${row.exchange}:${row.symbol}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const holdings: BaseHolding[] = [];
  const issues: PortfolioLedgerIssue[] = [];
  const validRows: LedgerRow[] = [];
  let realizedPnl = d(0);
  let totalBuyCost = d(0);

  for (const group of grouped.values()) {
    const instrument = group[0];
    if (!instrument) continue;
    let position: FifoPosition;
    try {
      position = calculateFifoPosition(group.map((row) => ({
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        date: row.txn_date,
      })));
    } catch (error) {
      if (!(error instanceof InvalidPortfolioLedgerError)) throw error;
      issues.push({
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        code: "INVALID_TRANSACTION_ORDER",
        message: "A sale is dated before sufficient purchases. This position is excluded from portfolio totals.",
      });
      continue;
    }

    validRows.push(...group);
    realizedPnl = realizedPnl.plus(position.realizedPnl);
    totalBuyCost = totalBuyCost.plus(position.totalBuyCost);

    if (position.quantity.isZero()) continue;
    holdings.push({
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      companyName: instrument.company_name,
      quantity: str(position.quantity),
      avgBuyPrice: str(div(position.remainingCost, position.quantity)),
      investment: str(position.remainingCost),
      realizedPnl: str(position.realizedPnl),
      totalBuyCost: str(position.totalBuyCost),
      latestBuyDate: position.latestBuyDate,
      latestSellDate: position.latestSellDate,
    });
  }

  const buyDates = validRows.filter((row) => row.type === "BUY").map((row) => row.txn_date).sort();
  return {
    holdings: holdings.sort((left, right) => left.companyName.localeCompare(right.companyName)),
    issues,
    realizedPnl: str(realizedPnl),
    totalBuyCost: str(totalBuyCost),
    cashFlows: validRows.map((row) => ({
      date: row.txn_date,
      amount: mul(row.quantity, row.price).times(row.type === "BUY" ? -1 : 1),
    })),
    returnSince: buyDates[0] ?? null,
  };
}

export class PortfolioDashboardService {
  public constructor(
    private readonly database: Pool,
    private readonly marketData: MarketDataService,
  ) {}

  public async getDashboard(userId: string): Promise<PortfolioDashboard> {
    const rows = await this.loadLedger(userId);
    const ledger = deriveLedgerPerformance(rows);
    const quoteLimit = pLimit(5);
    const settledQuotes = await Promise.allSettled(ledger.holdings.map((holding) => quoteLimit(
      () => this.marketData.getStockDetail(holding.exchange, holding.symbol),
    )));

    const holdings: PortfolioHolding[] = ledger.holdings.map((holding, index) => {
      const settled = settledQuotes[index];
      const { totalBuyCost, ...publicHolding } = holding;
      const ltp = settled?.status === "fulfilled" ? settled.value.value.quote.ltp : null;
      if (!settled || settled.status === "rejected" || !ltp) {
        return {
          ...publicHolding,
          ltp: null,
          currentValue: null,
          unrealizedPnl: null,
          totalPnl: null,
          totalPnlPct: null,
          dayPnl: null,
          dayPnlPct: null,
          quoteStatus: "unavailable",
          asOf: null,
        };
      }

      const quote = settled.value.value.quote;
      const currentValue = mul(holding.quantity, ltp);
      const unrealizedPnl = sub(currentValue, holding.investment);
      const totalPnl = unrealizedPnl.plus(holding.realizedPnl);
      const dayPnl = quote.previousClose
        ? mul(holding.quantity, sub(ltp, quote.previousClose))
        : null;
      return {
        ...publicHolding,
        ltp: str(ltp),
        currentValue: str(currentValue),
        unrealizedPnl: str(unrealizedPnl),
        totalPnl: str(totalPnl),
        totalPnlPct: str(pct(totalPnl, totalBuyCost)),
        dayPnl: dayPnl ? str(dayPnl) : null,
        dayPnlPct: quote.previousClose ? str(pct(sub(ltp, quote.previousClose), quote.previousClose)) : null,
        quoteStatus: settled.value.stale ? "stale" : "live",
        asOf: settled.value.asOf,
      };
    });

    return { holdings, summary: this.buildSummary(ledger, holdings), issues: ledger.issues };
  }

  private buildSummary(ledger: LedgerPerformance, holdings: readonly PortfolioHolding[]): PortfolioSummary {
    const valuationComplete = holdings.every((holding) => holding.currentValue !== null);
    const dayValuationComplete = valuationComplete && holdings.every((holding) => holding.dayPnl !== null);
    const totalInvestment = holdings.reduce((total, holding) => total.plus(holding.investment), d(0));
    const availableCurrentValue = holdings.reduce(
      (total, holding) => total.plus(holding.currentValue ?? 0),
      d(0),
    );
    const availableUnrealizedPnl = holdings.reduce(
      (total, holding) => total.plus(holding.unrealizedPnl ?? 0),
      d(0),
    );
    const availableDayPnl = holdings.reduce((total, holding) => total.plus(holding.dayPnl ?? 0), d(0));
    const calculatedTotalPnl = d(ledger.realizedPnl).plus(availableUnrealizedPnl);
    const currentValue = valuationComplete ? availableCurrentValue : null;
    const unrealizedPnl = valuationComplete ? availableUnrealizedPnl : null;
    const totalPnl = valuationComplete ? calculatedTotalPnl : null;
    const dayPnl = dayValuationComplete ? availableDayPnl : null;
    const previousPortfolioValue = currentValue !== null && dayPnl !== null
      ? currentValue.minus(dayPnl)
      : null;
    const cashFlows = currentValue !== null && currentValue.greaterThan(0)
      ? [...ledger.cashFlows, { date: currentIndiaDate(), amount: currentValue }]
      : ledger.cashFlows;
    const asOf = holdings
      .map((holding) => holding.asOf)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? new Date().toISOString();

    return {
      totalInvestment: str(totalInvestment),
      currentValue: currentValue !== null ? str(currentValue) : null,
      realizedPnl: ledger.realizedPnl,
      unrealizedPnl: unrealizedPnl !== null ? str(unrealizedPnl) : null,
      totalPnl: totalPnl !== null ? str(totalPnl) : null,
      absoluteReturnPct: totalPnl !== null ? str(pct(totalPnl, ledger.totalBuyCost)) : null,
      annualizedReturnPct: valuationComplete ? str(calculateXirrPercent(cashFlows)) : null,
      returnSince: ledger.returnSince,
      dayPnl: dayPnl !== null ? str(dayPnl) : null,
      dayPnlPct: dayPnl !== null && previousPortfolioValue !== null
        ? str(pct(dayPnl, previousPortfolioValue))
        : null,
      holdingsCount: holdings.length,
      asOf,
      stale: holdings.some((holding) => holding.quoteStatus !== "live"),
    };
  }

  private async loadLedger(userId: string): Promise<LedgerRow[]> {
    const result = await this.database.query<LedgerRow>(
      `SELECT i.symbol, i.exchange, i.company_name, t.type,
              t.quantity::text, t.price::text,
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
}
