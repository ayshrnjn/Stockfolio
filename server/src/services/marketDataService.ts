import { Decimal } from "decimal.js";
import type { MarketDataConfig } from "../config/marketDataConfig.js";
import { AppError } from "../errors/AppError.js";
import { InMemoryCache, type CacheResult, type CacheStats, type CacheStore } from "../lib/cache.js";
import { RetryingJsonHttpClient, UpstreamRequestError } from "../lib/http/jsonHttpClient.js";
import { defaultMarketDataTtl } from "../lib/marketHours.js";
import { IndianApiClient, type ProviderHistoryPeriod } from "../providers/indianApi/client.js";
import { ProviderContractError, ProviderNotFoundError, type ProviderHistory, type ProviderStockDetail } from "../providers/indianApi/schemas.js";
import type { StockSearchResult } from "../providers/indianApi/types.js";
import { YahooFinanceClient, type YahooIndexSymbol } from "../providers/yahooFinance/client.js";
import type { ChartRange, IndianExchange, MarketIndex, MarketOverview, PricePoint, StockDetail, StockHistory } from "./marketDataTypes.js";

const SEARCH_TTL_MS = 5 * 60 * 1_000;
const HISTORY_TTL_MS = 15 * 60 * 1_000;
// IndianAPI's detail endpoint does not resolve a few exchange symbols even
// though its search endpoint returns them. Keep those provider quirks isolated
// in the adapter layer instead of leaking aliases into URLs or persisted data.
const PROVIDER_NAME_ALIASES: Readonly<Record<string, string>> = {
  "NSE:M&M": "Mahindra & Mahindra",
  "NSE:TCS": "TCS",
};

type MarketDataClient = Pick<IndianApiClient, "searchCompanies" | "getStockDetail" | "getHistoricalData" | "getNseMostActive">;
type IndexDataClient = Pick<YahooFinanceClient, "getIndexQuote">;

const INDEX_DEFINITIONS: ReadonlyArray<{
  symbol: MarketIndex["symbol"];
  providerSymbol: YahooIndexSymbol;
  name: string;
}> = [
  { symbol: "NIFTY50", providerSymbol: "^NSEI", name: "NIFTY 50" },
  { symbol: "SENSEX", providerSymbol: "^BSESN", name: "SENSEX" },
  { symbol: "NIFTYBANK", providerSymbol: "^NSEBANK", name: "NIFTY BANK" },
  { symbol: "NIFTYIT", providerSymbol: "^CNXIT", name: "NIFTY IT" },
];

const rangeConfiguration: Record<ChartRange, { period: ProviderHistoryPeriod; take?: number }> = {
  "1D": { period: "1m", take: 2 },
  "1W": { period: "1m", take: 5 },
  "1M": { period: "1m" },
  "3M": { period: "6m" },
  "1Y": { period: "1yr" },
};

function numericText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replaceAll(",", "");
  if (!text) return null;
  try {
    return new Decimal(text).toString();
  } catch {
    return null;
  }
}

function metricValue(detail: ProviderStockDetail, key: string): string | null {
  for (const group of Object.values(detail.keyMetrics ?? {})) {
    const metric = group.find((candidate) => candidate.key === key);
    if (metric) return numericText(metric.value);
  }
  return null;
}

function quoteTimestamp(detail: ProviderStockDetail): string | null {
  const date = detail.stockDetailsReusableData?.date;
  if (!date) return null;
  const timePart = detail.stockDetailsReusableData?.time?.slice(0, 8) ?? "15:30:00";
  const datePart = /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : date;
  const parsed = new Date(`${datePart} ${timePart} GMT+0530`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapHistory(providerHistory: ProviderHistory): PricePoint[] {
  const priceValues = providerHistory.datasets.find(
    (dataset) => dataset.metric?.toLowerCase() === "price",
  )?.values ?? [];
  const volumeValues = providerHistory.datasets.find(
    (dataset) => dataset.metric?.toLowerCase() === "volume",
  )?.values ?? [];
  const volumeByDate = new Map<string, string>();

  for (const row of volumeValues) {
    const date = typeof row[0] === "string" ? row[0] : null;
    const volume = numericText(row[1]);
    if (date && volume) volumeByDate.set(date, volume);
  }

  return priceValues.flatMap((row): PricePoint[] => {
    const date = typeof row[0] === "string" ? row[0] : null;
    const close = numericText(row[1]);
    if (!date || !close || Number.isNaN(Date.parse(date))) return [];
    return [{ date, close, volume: volumeByDate.get(date) ?? null }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function calculateChange(ltp: string | null, previousClose: string | null): string | null {
  return ltp && previousClose ? new Decimal(ltp).minus(previousClose).toFixed(2) : null;
}

function calculateChangePercent(ltp: string | null, previousClose: string | null): string | null {
  if (!ltp || !previousClose || new Decimal(previousClose).isZero()) return null;
  return new Decimal(ltp).minus(previousClose).dividedBy(previousClose).times(100).toFixed(2);
}

function instrumentMatch(candidates: StockSearchResult[], symbol: string, exchange: IndianExchange) {
  return candidates.find((candidate) => (
    candidate.exchange === exchange && candidate.symbol.toUpperCase() === symbol
  ));
}

export class MarketDataService {
  public constructor(
    private readonly client: MarketDataClient,
    private readonly cache: CacheStore,
    private readonly indexClient: IndexDataClient,
  ) {}

  public async getMarketOverview(): Promise<CacheResult<MarketOverview>> {
    return this.withProviderErrors(() => this.cache.getOrFetch(
      "market-overview:v1",
      async () => {
        const [activeResult, ...indexResults] = await Promise.allSettled([
          this.client.getNseMostActive(),
          ...INDEX_DEFINITIONS.map((definition) => this.indexClient.getIndexQuote(definition.providerSymbol)),
        ]);
        const indices = INDEX_DEFINITIONS.map((definition, index): MarketIndex => {
          const result = indexResults[index];
          if (!result || result.status === "rejected") {
            return { symbol: definition.symbol, name: definition.name, value: null, change: null, changePct: null, asOf: null, status: "unavailable" };
          }
          const { value, previousClose, asOf } = result.value;
          return {
            symbol: definition.symbol,
            name: definition.name,
            value,
            change: calculateChange(value, previousClose),
            changePct: calculateChangePercent(value, previousClose),
            asOf,
            status: value ? "live" : "unavailable",
          };
        });
        const activeCompanies = activeResult.status === "fulfilled"
          ? activeResult.value.slice(0, 10).map((row) => ({
              ticker: row.ticker.replace(/\.(?:NS|BO)$/i, ""),
              companyName: row.company,
              price: numericText(row.price),
              change: numericText(row.net_change),
              changePct: numericText(row.percent_change),
              volume: numericText(row.volume),
            }))
          : [];
        if (indices.every((index) => index.status === "unavailable") && activeCompanies.length === 0) {
          throw AppError.upstreamUnavailable("Market overview is temporarily unavailable");
        }
        return { indices, activeCompanies, source: "IndianAPI and Yahoo Finance" };
      },
      defaultMarketDataTtl(),
    ));
  }

  public async searchStocks(query: string): Promise<CacheResult<StockSearchResult[]>> {
    const normalizedQuery = query.trim();
    return this.withProviderErrors(() => this.cache.getOrFetch(
      `search:${normalizedQuery.toLocaleLowerCase("en-IN")}`,
      async () => (await this.client.searchCompanies(normalizedQuery)).results.slice(0, 10),
      SEARCH_TTL_MS,
    ));
  }

  public async getStockDetail(exchange: IndianExchange, symbol: string): Promise<CacheResult<StockDetail>> {
    const normalizedSymbol = symbol.toUpperCase();
    return this.withProviderErrors(() => this.cache.getOrFetch(
      `detail:${exchange}:${normalizedSymbol}`,
      async () => {
        const { instrument, detail: providerDetail } = await this.resolveDetailInstrument(exchange, normalizedSymbol);
        const history = await this.getHistorySource(normalizedSymbol, "1m");
        return this.mapDetail(instrument, providerDetail, history.value.at(-1)?.volume ?? null);
      },
      defaultMarketDataTtl(),
    ));
  }

  public async getStockHistory(
    exchange: IndianExchange,
    symbol: string,
    range: ChartRange,
  ): Promise<CacheResult<StockHistory>> {
    const normalizedSymbol = symbol.toUpperCase();
    const configuration = rangeConfiguration[range];
    return this.withProviderErrors(() => this.cache.getOrFetch(
      `history:${exchange}:${normalizedSymbol}:${range}`,
      async () => {
        await this.resolveInstrument(exchange, normalizedSymbol);
        const source = await this.getHistorySource(normalizedSymbol, configuration.period);
        let points = source.value;

        if (range === "3M" && points.length > 0) {
          const cutoff = new Date(`${points.at(-1)!.date}T00:00:00Z`);
          cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
          points = points.filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff);
        }
        if (configuration.take) points = points.slice(-configuration.take);

        return { symbol: normalizedSymbol, exchange, range, granularity: "daily", points };
      },
      HISTORY_TTL_MS,
    ));
  }

  public cacheStats(): CacheStats {
    return this.cache.stats();
  }

  private async resolveInstrument(exchange: IndianExchange, symbol: string): Promise<StockSearchResult> {
    const search = await this.searchStocks(symbol);
    const instrument = instrumentMatch(search.value, symbol, exchange);
    if (!instrument) throw AppError.notFound(`No ${exchange} stock was found for ${symbol}`);
    return instrument;
  }

  private async resolveDetailInstrument(
    exchange: IndianExchange,
    symbol: string,
  ): Promise<{ instrument: StockSearchResult; detail: ProviderStockDetail }> {
    const search = await this.searchStocks(symbol);
    const searchMatch = instrumentMatch(search.value, symbol, exchange);
    const providerName = PROVIDER_NAME_ALIASES[`${exchange}:${symbol}`]
      ?? searchMatch?.companyName
      ?? symbol;
    const detail = await this.client.getStockDetail(providerName);
    if (searchMatch) return { instrument: searchMatch, detail };

    const providerSymbol = exchange === "NSE"
      ? detail.companyProfile?.exchangeCodeNse
      : detail.companyProfile?.exchangeCodeBse;
    if (providerSymbol?.toUpperCase() !== symbol) {
      throw AppError.notFound(`No ${exchange} stock was found for ${symbol}`);
    }
    return {
      detail,
      instrument: {
        providerId: detail.tickerId,
        symbol,
        exchange,
        companyName: detail.companyName ?? symbol,
        sector: null,
        industry: detail.companyProfile?.mgIndustry ?? detail.industry,
      },
    };
  }

  private async getHistorySource(symbol: string, period: ProviderHistoryPeriod): Promise<CacheResult<PricePoint[]>> {
    return this.cache.getOrFetch(
      `history-source:${symbol}:${period}`,
      async () => mapHistory((await this.client.getHistoricalData(symbol, period)).data),
      HISTORY_TTL_MS,
    );
  }

  private mapDetail(
    instrument: StockSearchResult,
    detail: ProviderStockDetail,
    latestVolume: string | null,
  ): StockDetail {
    const reusable = detail.stockDetailsReusableData;
    const ltp = numericText(detail.currentPrice?.[instrument.exchange] ?? reusable?.price);
    const previousClose = numericText(reusable?.close);

    return {
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      companyName: detail.companyName ?? instrument.companyName,
      sector: instrument.sector,
      industry: detail.companyProfile?.mgIndustry ?? detail.industry ?? instrument.industry,
      description: detail.companyProfile?.companyDescription ?? null,
      quote: {
        ltp,
        change: calculateChange(ltp, previousClose),
        changePct: calculateChangePercent(ltp, previousClose)
          ?? numericText(reusable?.percentChange ?? detail.percentChange),
        open: null,
        previousClose,
        volume: latestVolume,
        dayLow: numericText(reusable?.low),
        dayHigh: numericText(reusable?.high),
        week52Low: numericText(reusable?.ylow ?? detail.yearLow),
        week52High: numericText(reusable?.yhigh ?? detail.yearHigh),
        asOf: quoteTimestamp(detail),
      },
      fundamentals: {
        marketCap: numericText(reusable?.marketCap) ?? metricValue(detail, "marketCap"),
        pe: metricValue(detail, "pPerEBasicExcludingExtraordinaryItemsTTM"),
        eps: metricValue(detail, "earningsPerShareNormalizedExcludingExtraordinaryItemsAvgDilutedSharesOutstandingTTM"),
        bookValue: metricValue(detail, "bookValuePerShare MostRecentFiscalYear"),
        dividendYield: metricValue(detail, "currentDividendYieldCommonStockPrimaryIssueLTM"),
        faceValue: null,
      },
    };
  }

  private async withProviderErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof UpstreamRequestError && error.status === 404) {
        throw AppError.notFound("Stock not found");
      }
      if (error instanceof ProviderNotFoundError) throw AppError.notFound("Stock not found");
      if (error instanceof UpstreamRequestError || error instanceof ProviderContractError) {
        throw AppError.upstreamUnavailable("Market data provider is temporarily unavailable");
      }
      throw error;
    }
  }
}

export function createMarketDataService(config: MarketDataConfig): MarketDataService {
  const httpClient = new RetryingJsonHttpClient();
  const client = new IndianApiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    httpClient,
  });
  return new MarketDataService(client, new InMemoryCache(), new YahooFinanceClient(httpClient));
}
