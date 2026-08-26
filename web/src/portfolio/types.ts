import type { IndianExchange } from "../stocks/types";

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

export interface PortfolioHolding {
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  quantity: string;
  avgBuyPrice: string;
  investment: string;
  realizedPnl: string;
  latestBuyDate: string | null;
  latestSellDate: string | null;
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

export interface PortfolioDashboardResponse {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
  issues: PortfolioLedgerIssue[];
}

export interface PortfolioLedgerIssue {
  symbol: string;
  exchange: IndianExchange;
  code: "INVALID_TRANSACTION_ORDER";
  message: string;
}
