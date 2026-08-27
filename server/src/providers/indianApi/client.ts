import { z } from "zod";
import type { JsonHttpClient } from "../../lib/http/jsonHttpClient.js";
import { mapSearchResults } from "./mapper.js";
import {
  parseHistoryResponse,
  parseMostActiveResponse,
  parseSearchResponse,
  parseStockDetailResponse,
  ProviderContractError,
  type ProviderHistory,
  type ProviderMostActiveRow,
  type ProviderSearchRow,
  type ProviderStockDetail,
} from "./schemas.js";
import type { StockSearchResult } from "./types.js";

const searchQuerySchema = z.string().trim().min(1).max(40)
  .regex(/^[\p{L}\p{N} .&'-]+$/u, "Search contains unsupported characters");
const companyNameSchema = z.string().trim().min(1).max(160);
const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9.&-]{1,20}$/);
const historyPeriodSchema = z.enum(["1m", "6m", "1yr", "3yr", "5yr", "10yr", "max"]);
export type ProviderHistoryPeriod = z.infer<typeof historyPeriodSchema>;

export interface SearchResponse {
  providerRows: ProviderSearchRow[];
  results: StockSearchResult[];
}

export interface HistoricalResponse {
  data: ProviderHistory;
  parameterUsed: "stock_name" | "symbol";
}

interface IndianApiClientOptions {
  baseUrl: URL;
  apiKey: string;
  httpClient: JsonHttpClient;
}

export class IndianApiClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly httpClient: JsonHttpClient;

  public constructor(options: IndianApiClientOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.apiKey = options.apiKey;
    this.httpClient = options.httpClient;
  }

  public async searchCompanies(query: string): Promise<SearchResponse> {
    const normalizedQuery = searchQuerySchema.parse(query);
    const providerRows = parseSearchResponse(
      await this.get("/industry_search", { query: normalizedQuery }),
    );
    return { providerRows, results: mapSearchResults(providerRows) };
  }

  public async getStockDetail(companyName: string): Promise<ProviderStockDetail> {
    const normalizedName = companyNameSchema.parse(companyName);
    // Stock payloads include financial statements and can be substantially larger
    // than search responses, so they receive a deliberately higher timeout.
    return parseStockDetailResponse(await this.get(
      "/stock",
      { name: normalizedName },
      { timeoutMs: 20_000 },
    ));
  }

  public async getHistoricalData(
    symbol: string,
    period: ProviderHistoryPeriod = "1m",
  ): Promise<HistoricalResponse> {
    const normalizedSymbol = symbolSchema.parse(symbol);
    const normalizedPeriod = historyPeriodSchema.parse(period);
    const parameters: Array<"stock_name" | "symbol"> = ["stock_name", "symbol"];
    let lastContractError: ProviderContractError | undefined;

    for (const parameter of parameters) {
      const raw = await this.get("/historical_data", {
        [parameter]: normalizedSymbol,
        period: normalizedPeriod,
        filter: "price",
      });
      try {
        return { data: parseHistoryResponse(raw), parameterUsed: parameter };
      } catch (error) {
        if (!(error instanceof ProviderContractError)) throw error;
        lastContractError = error;
      }
    }

    throw lastContractError ?? new ProviderContractError("historical data");
  }

  public async getHistoricalDataByName(
    stockName: string,
    period: ProviderHistoryPeriod = "1m",
  ): Promise<ProviderHistory> {
    const normalizedName = companyNameSchema.parse(stockName);
    const normalizedPeriod = historyPeriodSchema.parse(period);
    return parseHistoryResponse(await this.get("/historical_data", {
      stock_name: normalizedName,
      period: normalizedPeriod,
      filter: "price",
    }));
  }

  public async getNseMostActive(): Promise<ProviderMostActiveRow[]> {
    return parseMostActiveResponse(await this.get("/NSE_most_active", {}));
  }

  private async get(
    path: string,
    parameters: Readonly<Record<string, string>>,
    options: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);

    return this.httpClient.get({
      url,
      headers: { Accept: "application/json", "x-api-key": this.apiKey },
      ...options,
    });
  }
}
