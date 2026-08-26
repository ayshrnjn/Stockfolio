export type IndianExchange = "NSE" | "BSE";

export interface StockSearchResult {
  providerId: string | null;
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string | null;
  industry: string | null;
}

export interface StockSearchResponse {
  results: StockSearchResult[];
  stale: boolean;
  asOf: string;
}

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y";

export interface StockDetail {
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  quote: {
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
  };
  fundamentals: {
    marketCap: string | null;
    pe: string | null;
    eps: string | null;
    bookValue: string | null;
    dividendYield: string | null;
    faceValue: string | null;
  };
}

export interface StockDetailResponse {
  stock: StockDetail;
  stale: boolean;
  asOf: string;
}

export interface PricePoint {
  date: string;
  close: string;
  volume: string | null;
}

export interface StockHistoryResponse {
  history: {
    symbol: string;
    exchange: IndianExchange;
    range: ChartRange;
    granularity: "daily";
    points: PricePoint[];
  };
  stale: boolean;
  asOf: string;
}
