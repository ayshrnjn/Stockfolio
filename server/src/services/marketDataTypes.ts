export type IndianExchange = "NSE" | "BSE";
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export interface StockQuote {
  ltp: string | null;
  change: string | null;
  changePct: string | null;
  open: string | null;
  previousClose: string | null;
  volume: string | null;
  dayLow: string | null;
  dayHigh: string | null;
  week52Low: string | null;
  week52High: string | null;
  asOf: string | null;
}

export interface StockFundamentals {
  marketCap: string | null;
  pe: string | null;
  eps: string | null;
  bookValue: string | null;
  dividendYield: string | null;
  faceValue: string | null;
}

export interface StockDetail {
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  quote: StockQuote;
  fundamentals: StockFundamentals;
}

export interface PricePoint {
  date: string;
  close: string;
  volume: string | null;
}

export interface StockHistory {
  symbol: string;
  exchange: IndianExchange;
  range: ChartRange;
  granularity: "daily";
  points: PricePoint[];
}

export interface MarketIndex {
  symbol: "NIFTY50" | "SENSEX" | "NIFTYBANK" | "NIFTYIT";
  name: string;
  value: string | null;
  change: string | null;
  changePct: string | null;
  asOf: string | null;
  status: "live" | "delayed" | "unavailable";
}

export interface ActiveCompany {
  ticker: string;
  symbol: string | null;
  exchange: "NSE" | null;
  companyName: string;
  price: string | null;
  change: string | null;
  changePct: string | null;
  volume: string | null;
}

export interface MarketOverview {
  indices: MarketIndex[];
  activeCompanies: ActiveCompany[];
  source: "IndianAPI and Yahoo Finance";
}
