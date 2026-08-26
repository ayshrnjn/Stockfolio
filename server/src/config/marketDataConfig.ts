import { z } from "zod";

const marketDataEnvironmentSchema = z.object({
  STOCK_API_KEY: z.string().trim().min(1, "STOCK_API_KEY is required"),
  INDIAN_API_BASE_URL: z
    .url("INDIAN_API_BASE_URL must be a valid URL")
    .default("https://stock.indianapi.in"),
});

export interface MarketDataConfig {
  apiKey: string;
  baseUrl: URL;
}

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function readMarketDataConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MarketDataConfig {
  const parsed = marketDataEnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
      .filter(Boolean)
      .join(", ");
    throw new ConfigurationError(
      `Invalid market-data configuration${fields ? `: ${fields}` : ""}`,
    );
  }

  const baseUrl = new URL(parsed.data.INDIAN_API_BASE_URL);
  if (baseUrl.protocol !== "https:") {
    throw new ConfigurationError("INDIAN_API_BASE_URL must use HTTPS");
  }

  return { apiKey: parsed.data.STOCK_API_KEY, baseUrl };
}

