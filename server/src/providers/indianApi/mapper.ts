import type { ProviderSearchRow } from "./schemas.js";
import type { IndianExchange, StockSearchResult } from "./types.js";

function normalizeSymbol(value: string | null): string | null {
  const symbol = value?.trim().toUpperCase();
  return symbol || null;
}

export function mapSearchResults(
  rows: readonly ProviderSearchRow[],
  limit = 10,
): StockSearchResult[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("Search result limit must be a positive integer");
  }

  const results: StockSearchResult[] = [];
  const seen = new Set<string>();

  const addResult = (
    row: ProviderSearchRow,
    exchange: IndianExchange,
    rawSymbol: string | null,
  ): void => {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol || results.length >= limit) return;

    const identity = `${exchange}:${symbol}`;
    if (seen.has(identity)) return;

    seen.add(identity);
    results.push({
      providerId: row.id,
      symbol,
      exchange,
      companyName: row.commonName,
      sector: row.mgSector,
      industry: row.mgIndustry,
    });
  };

  for (const row of rows) {
    addResult(row, "NSE", row.exchangeCodeNsi);
    addResult(row, "BSE", row.exchangeCodeBse);
    if (results.length >= limit) break;
  }

  return results;
}

