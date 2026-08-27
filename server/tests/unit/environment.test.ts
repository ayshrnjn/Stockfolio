import { describe, expect, it } from "vitest";
import { EnvironmentError, readEnvironment } from "../../src/config/environment.js";

const baseEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  JWT_SECRET: "a-production-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://user:password@database.example/stockfolio",
  CORS_ORIGIN: "https://stockfolio.example",
};

describe("application environment", () => {
  it("normalizes configured web origins", () => {
    const environment = readEnvironment({
      ...baseEnvironment,
      CORS_ORIGIN: "https://stockfolio.example/, https://admin.stockfolio.example",
    });

    expect([...environment.corsOrigins]).toEqual([
      "https://stockfolio.example",
      "https://admin.stockfolio.example",
    ]);
  });

  it("rejects insecure production origins", () => {
    expect(() => readEnvironment({
      ...baseEnvironment,
      CORS_ORIGIN: "http://stockfolio.example",
    })).toThrow(EnvironmentError);
  });

  it("allows HTTP localhost during development", () => {
    const environment = readEnvironment({
      ...baseEnvironment,
      NODE_ENV: "development",
      CORS_ORIGIN: "http://localhost:5173",
    });

    expect(environment.corsOrigins.has("http://localhost:5173")).toBe(true);
  });
});
