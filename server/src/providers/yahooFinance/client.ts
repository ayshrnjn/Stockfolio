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
    private readonly baseUrl = new URL("https://query1.finance.yahoo.com"),
  ) {}

  public async getIndexQuote(symbol: YahooIndexSymbol): Promise<YahooIndexQuote> {
    const normalizedSymbol = indexSymbolSchema.parse(symbol);
    const url = new URL(`/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`, this.baseUrl);
    url.searchParams.set("range", "5d");
    url.searchParams.set("interval", "1d");
    const parsed = responseSchema.safeParse(await this.httpClient.get({
      url,
      headers: { Accept: "application/json", "User-Agent": "StockFolio/1.0" },
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
