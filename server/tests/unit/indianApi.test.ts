import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JsonHttpClient, JsonGetRequest } from "../../src/lib/http/jsonHttpClient.js";
import { IndianApiClient } from "../../src/providers/indianApi/client.js";
import { mapSearchResults } from "../../src/providers/indianApi/mapper.js";
import {
  parseHistoryResponse,
  parseSearchResponse,
  parseStockDetailResponse,
  ProviderContractError,
  type ProviderSearchRow,
} from "../../src/providers/indianApi/schemas.js";
import { verifyIndianApi } from "../../src/providers/indianApi/verification.js";

const fixturesDirectory = resolve(process.cwd(), "tests", "fixtures");

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(fixturesDirectory, name), "utf8")) as unknown;
}

describe("IndianAPI provider contract", () => {
  it("parses the sanitized live fixtures", async () => {
    const search = parseSearchResponse(await fixture("indianapi-search.json"));
    const detail = parseStockDetailResponse(await fixture("indianapi-detail.json"));
    const history = parseHistoryResponse(await fixture("indianapi-history.json"));

    expect(search.length).toBeGreaterThan(0);
    expect(detail.companyName).toBe("Reliance Industries");
    expect(history.datasets.length).toBeGreaterThan(0);
  });

  it("expands one company into distinct NSE and BSE instruments", () => {
    const row: ProviderSearchRow = {
      id: "provider-1",
      commonName: "Example Limited",
      mgIndustry: "Software",
      mgSector: "Technology",
      stockType: "Equity",
      exchangeCodeBse: "500001",
      exchangeCodeNsi: "EXAMPLE",
      bseRic: "EXAMPLE.BO",
      nseRic: "EXAMPLE.NS",
    };

    expect(mapSearchResults([row])).toEqual([
      expect.objectContaining({ symbol: "EXAMPLE", exchange: "NSE" }),
      expect.objectContaining({ symbol: "500001", exchange: "BSE" }),
    ]);
  });

  it("deduplicates repeated provider rows by exchange and symbol", () => {
    const row = parseSearchResponse([{
      commonName: "Example Limited",
      exchangeCodeNsi: "EXAMPLE",
    }])[0];

    expect(row).toBeDefined();
    expect(mapSearchResults([row!, row!])).toHaveLength(1);
  });

  it("rejects an invalid provider contract with a safe typed error", () => {
    expect(() => parseSearchResponse([{ unexpected: "shape" }]))
      .toThrow(ProviderContractError);
  });

  it("validates a search query before making an upstream call", async () => {
    const get = vi.fn<JsonHttpClient["get"]>();
    const client = new IndianApiClient({
      baseUrl: new URL("https://stock.indianapi.in"),
      apiKey: "test-key",
      httpClient: { get },
    });

    await expect(client.searchCompanies("<script>alert(1)</script>"))
      .rejects.toThrow("unsupported characters");
    expect(get).not.toHaveBeenCalled();
  });

  it("uses URLSearchParams and sends the API key only as a header", async () => {
    const searchFixture = await fixture("indianapi-search.json");
    const get = vi.fn<JsonHttpClient["get"]>().mockResolvedValue(searchFixture);
    const client = new IndianApiClient({
      baseUrl: new URL("https://stock.indianapi.in"),
      apiKey: "test-key",
      httpClient: { get },
    });

    await client.searchCompanies("Reliance & Power");
    const request = get.mock.calls[0]?.[0] as JsonGetRequest | undefined;

    expect(request?.url.pathname).toBe("/industry_search");
    expect(request?.url.searchParams.get("query")).toBe("Reliance & Power");
    expect(request?.url.toString()).not.toContain("test-key");
    expect(request?.headers?.["x-api-key"]).toBe("test-key");
  });

  it("runs the complete verification workflow against contract fixtures", async () => {
    const responses = {
      search: await fixture("indianapi-search.json"),
      detail: await fixture("indianapi-detail.json"),
      history: await fixture("indianapi-history.json"),
    };
    const httpClient: JsonHttpClient = {
      get: vi.fn(async ({ url }: JsonGetRequest) => {
        if (url.pathname === "/industry_search") return responses.search;
        if (url.pathname === "/stock") return responses.detail;
        if (url.pathname === "/historical_data") return responses.history;
        throw new Error("Unexpected endpoint");
      }),
    };
    const client = new IndianApiClient({
      baseUrl: new URL("https://stock.indianapi.in"),
      apiKey: "test-key",
      httpClient,
    });

    const result = await verifyIndianApi(client, "reliance");

    expect(result.report.ok).toBe(true);
    expect(result.report.detail.symbol).toBe("RELIANCE");
    expect(result.report.history.parameterUsed).toBe("stock_name");
  });
});

