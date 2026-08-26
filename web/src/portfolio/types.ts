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
  instrumentId: string;
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string;
  quantity: string;
  avgBuyPrice: string;
  investment: string;
  ltp: string | null;
  previousClose: string | null;
  currentValue: string | null;
  overallPnl: string | null;
  overallPnlPct: string | null;
  dayPnl: string | null;
  dayPnlPct: string | null;
  weightPct: string;
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

export interface PortfolioDashboardResponse {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
}
