import { z } from "zod";
import type { JsonHttpClient } from "../../lib/http/jsonHttpClient.js";

const indexSymbolSchema = z.enum(["^NSEI", "^BSESN", "^NSEBANK", "^CNXIT"]);
export type YahooIndexSymbol = z.infer<typeof indexSymbolSchema>;

const nullableNumber = z.number().finite().nullable().optional().transform((value) => value ?? null);
const responseSchema = z.object({
  chart: z.object({
    result: z.array(z.object({
      meta: z.object({
        symbol: z.string(),
        currency: z.string().nullable().optional(),
        regularMarketPrice: nullableNumber,
        chartPreviousClose: nullableNumber,
        previousClose: nullableNumber,
        regularMarketTime: nullableNumber,
      }),
    })).min(1),
  }),
});

export interface YahooIndexQuote {
  value: string | null;
  previousClose: string | null;
  asOf: string | null;
}

export class YahooFinanceClient {
  public constructor(
    private readonly httpClient: JsonHttpClient,
    private readonly baseUrls: ReadonlyArray<URL> = [
      new URL("https://query1.finance.yahoo.com"),
      new URL("https://query2.finance.yahoo.com"),
    ],
  ) {}

  public async getIndexQuote(symbol: YahooIndexSymbol): Promise<YahooIndexQuote> {
    const normalizedSymbol = indexSymbolSchema.parse(symbol);
    let lastError: unknown;

    for (const baseUrl of this.baseUrls) {
      try {
        return await this.fetchIndexQuote(baseUrl, normalizedSymbol);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("No Yahoo Finance endpoint is configured");
  }

  private async fetchIndexQuote(baseUrl: URL, symbol: YahooIndexSymbol): Promise<YahooIndexQuote> {
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, baseUrl);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    const parsed = responseSchema.safeParse(await this.httpClient.get({
      url,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; StockFolio/1.0; +https://github.com/ayshrnjn/Stockfolio)",
      },
    }));
    const meta = parsed.success ? parsed.data.chart.result[0]?.meta : undefined;
    if (!meta) throw new Error("Yahoo Finance index response did not match the expected contract");

    const timestamp = meta.regularMarketTime;
    return {
      value: meta.regularMarketPrice === null ? null : String(meta.regularMarketPrice),
      previousClose: (meta.chartPreviousClose ?? meta.previousClose) === null
        ? null
        : String(meta.chartPreviousClose ?? meta.previousClose),
      asOf: timestamp === null ? null : new Date(timestamp * 1_000).toISOString(),
    };
  }
}
