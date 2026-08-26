import { z } from "zod";

const nullableText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().min(1).nullable().default(null),
);
const nullableNumeric = z.union([z.string(), z.number(), z.null()]).default(null);
const recordOrNull = z.record(z.string(), z.unknown()).nullable().default(null);
const metricSchema = z.object({
  displayName: nullableText,
  key: z.string().trim().min(1),
  value: nullableNumeric,
});

export const providerSearchRowSchema = z.object({
  id: nullableText,
  commonName: z.string().trim().min(1),
  mgIndustry: nullableText,
  mgSector: nullableText,
  stockType: nullableText,
  exchangeCodeBse: nullableText,
  exchangeCodeNsi: nullableText,
  bseRic: nullableText,
  nseRic: nullableText,
});

export const providerStockDetailSchema = z.object({
  tickerId: nullableText,
  companyName: nullableText,
  industry: nullableText,
  currentPrice: z.object({ BSE: nullableNumeric, NSE: nullableNumeric })
    .nullable().optional().transform((value) => value ?? null),
  percentChange: nullableNumeric,
  yearHigh: nullableNumeric,
  yearLow: nullableNumeric,
  companyProfile: z.object({
    companyDescription: nullableText,
    mgIndustry: nullableText,
    exchangeCodeBse: nullableText,
    exchangeCodeNse: nullableText,
  }).nullable().optional().transform((value) => value ?? null),
  stockTechnicalData: z.unknown().nullable().optional().transform((value) => value ?? null),
  stockDetailsReusableData: z.object({
    close: nullableNumeric,
    date: nullableText,
    time: nullableText,
    price: nullableNumeric,
    percentChange: nullableNumeric,
    marketCap: nullableNumeric,
    yhigh: nullableNumeric,
    ylow: nullableNumeric,
    high: nullableNumeric,
    low: nullableNumeric,
  }).passthrough().nullable().optional().transform((value) => value ?? null),
  keyMetrics: z.record(z.string(), z.array(metricSchema)).nullable().default(null),
}).superRefine((value, context) => {
  if (!value.tickerId && !value.companyName && !value.currentPrice) {
    context.addIssue({
      code: "custom",
      message: "Stock detail response contains no identifying or price data",
    });
  }
});

export const providerHistoryDatasetSchema = z.object({
  metric: nullableText,
  label: nullableText,
  values: z.array(z.array(z.unknown())),
  meta: recordOrNull,
});
export const providerHistorySchema = z.object({
  datasets: z.array(providerHistoryDatasetSchema).min(1),
});

export const providerMostActiveRowSchema = z.object({
  ticker: z.string().trim().min(1),
  company: z.string().trim().min(1),
  price: nullableNumeric,
  percent_change: nullableNumeric,
  net_change: nullableNumeric,
  volume: nullableNumeric,
});

export type ProviderSearchRow = z.infer<typeof providerSearchRowSchema>;
export type ProviderStockDetail = z.infer<typeof providerStockDetailSchema>;
export type ProviderHistory = z.infer<typeof providerHistorySchema>;
export type ProviderMostActiveRow = z.infer<typeof providerMostActiveRowSchema>;

const searchResponseSchema = z.union([
  z.array(providerSearchRowSchema),
  z.object({ data: z.array(providerSearchRowSchema) }).transform((value) => value.data),
  z.object({ results: z.array(providerSearchRowSchema) }).transform((value) => value.results),
]);
const mostActiveResponseSchema = z.union([
  z.array(providerMostActiveRowSchema),
  z.object({ data: z.array(providerMostActiveRowSchema) }).transform((value) => value.data),
]);

function unwrapData(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "data" in value
    ? (value as { data: unknown }).data
    : value;
}

export class ProviderContractError extends Error {
  public constructor(endpoint: string, options: { cause?: unknown } = {}) {
    super(`IndianAPI ${endpoint} response did not match the expected contract`, options);
    this.name = "ProviderContractError";
  }
}

export class ProviderNotFoundError extends Error {
  public constructor() {
    super("IndianAPI could not find the requested stock");
    this.name = "ProviderNotFoundError";
  }
}

export function parseSearchResponse(raw: unknown): ProviderSearchRow[] {
  const result = searchResponseSchema.safeParse(raw);
  if (!result.success) throw new ProviderContractError("search", { cause: result.error });
  return result.data;
}

export function parseStockDetailResponse(raw: unknown): ProviderStockDetail {
  const unwrapped = unwrapData(raw);
  if (
    typeof unwrapped === "object"
    && unwrapped !== null
    && "error" in unwrapped
    && typeof unwrapped.error === "string"
    && unwrapped.error.toLowerCase().includes("not found")
  ) {
    throw new ProviderNotFoundError();
  }
  const result = providerStockDetailSchema.safeParse(unwrapped);
  if (!result.success) throw new ProviderContractError("stock detail", { cause: result.error });
  return result.data;
}

export function parseHistoryResponse(raw: unknown): ProviderHistory {
  const result = providerHistorySchema.safeParse(unwrapData(raw));
  if (!result.success) throw new ProviderContractError("historical data", { cause: result.error });
  return result.data;
}

export function parseMostActiveResponse(raw: unknown): ProviderMostActiveRow[] {
  const result = mostActiveResponseSchema.safeParse(raw);
  if (!result.success) throw new ProviderContractError("NSE most active", { cause: result.error });
  return result.data;
}
