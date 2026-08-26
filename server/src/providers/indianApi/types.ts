export type IndianExchange = "NSE" | "BSE";

export interface StockSearchResult {
  providerId: string | null;
  symbol: string;
  exchange: IndianExchange;
  companyName: string;
  sector: string | null;
  industry: string | null;
}

export interface VerificationReport {
  ok: true;
  provider: "indianapi";
  query: string;
  search: {
    providerRows: number;
    normalizedResults: number;
    sample: StockSearchResult[];
  };
  detail: {
    symbol: string;
    exchange: IndianExchange;
    companyName: string | null;
    hasCurrentPrice: boolean;
    hasProfile: boolean;
    hasKeyMetrics: boolean;
  };
  history: {
    parameterUsed: "stock_name" | "symbol";
    datasets: number;
    fixturePointsInFirstDataset: number;
  };
}

