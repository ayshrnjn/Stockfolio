import type { IndianApiClient } from "./client.js";
import type { ProviderHistory, ProviderSearchRow, ProviderStockDetail } from "./schemas.js";
import type { VerificationReport } from "./types.js";

export interface VerificationFixtures {
  search: ProviderSearchRow[];
  detail: ProviderStockDetail;
  history: ProviderHistory;
}

export interface VerificationResult {
  report: VerificationReport;
  fixtures: VerificationFixtures;
}

type VerificationClient = Pick<
  IndianApiClient,
  "searchCompanies" | "getStockDetail" | "getHistoricalData"
>;

export async function verifyIndianApi(
  client: VerificationClient,
  query: string,
): Promise<VerificationResult> {
  const search = await client.searchCompanies(query);
  const preferred = search.results.find((result) => result.exchange === "NSE")
    ?? search.results[0];
  if (!preferred) throw new Error("IndianAPI search returned no usable NSE or BSE instruments");

  const [detail, history] = await Promise.all([
    client.getStockDetail(preferred.companyName),
    client.getHistoricalData(preferred.symbol),
  ]);
  const firstDataset = history.data.datasets[0];

  return {
    report: {
      ok: true,
      provider: "indianapi",
      query,
      search: {
        providerRows: search.providerRows.length,
        normalizedResults: search.results.length,
        sample: search.results.slice(0, 4),
      },
      detail: {
        symbol: preferred.symbol,
        exchange: preferred.exchange,
        companyName: detail.companyName,
        hasCurrentPrice: detail.currentPrice !== null,
        hasProfile: detail.companyProfile !== null,
        hasKeyMetrics: detail.keyMetrics !== null,
      },
      history: {
        parameterUsed: history.parameterUsed,
        datasets: history.data.datasets.length,
        fixturePointsInFirstDataset: firstDataset?.values.length ?? 0,
      },
    },
    fixtures: { search: search.providerRows, detail, history: history.data },
  };
}

