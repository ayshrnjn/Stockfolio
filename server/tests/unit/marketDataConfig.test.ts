import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  readMarketDataConfig,
} from "../../src/config/marketDataConfig.js";

describe("readMarketDataConfig", () => {
  it("returns validated configuration", () => {
    const config = readMarketDataConfig({
      STOCK_API_KEY: "test-key",
      INDIAN_API_BASE_URL: "https://stock.indianapi.in",
    });

    expect(config.apiKey).toBe("test-key");
    expect(config.baseUrl.origin).toBe("https://stock.indianapi.in");
  });

  it("rejects missing secrets without including secret values", () => {
    expect(() => readMarketDataConfig({})).toThrow(ConfigurationError);
    expect(() => readMarketDataConfig({})).toThrow("STOCK_API_KEY");
  });

  it("rejects non-HTTPS provider URLs", () => {
    expect(() => readMarketDataConfig({
      STOCK_API_KEY: "test-key",
      INDIAN_API_BASE_URL: "http://stock.indianapi.in",
    })).toThrow("must use HTTPS");
  });
});

