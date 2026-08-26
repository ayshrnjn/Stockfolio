import jwt from "jsonwebtoken";
import pino from "pino";
import type { Pool } from "pg";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { Environment } from "../../src/config/environment.js";
import type { MarketDataService } from "../../src/services/marketDataService.js";

const jwtSecret = "test-secret-that-is-at-least-thirty-two-characters";
const environment: Environment = {
  nodeEnvironment: "test",
  port: 8080,
  logLevel: "silent",
  corsOrigins: new Set(["http://localhost:5173"]),
  trustProxy: 0,
  auth: { jwtSecret },
  database: {
    connectionString: "postgresql://test:test@localhost/test",
    connectionTimeoutMillis: 5_000,
    ssl: false,
    rejectUnauthorized: true,
  },
};
const app = createApp({
  environment,
  database: {} as Pool,
  logger: pino({ enabled: false }),
  marketData: {} as MarketDataService,
});
const validBody = {
  symbol: "RELIANCE",
  exchange: "NSE",
  type: "BUY",
  quantity: "10.0000",
  price: "100.0000",
  txnDate: "2026-08-26",
};

describe("portfolio transaction route contracts", () => {
  it("rejects an unauthenticated money write with the standard envelope", async () => {
    const response = await request(app).post("/api/portfolio/transactions").send(validBody);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("rejects future transaction dates before reaching the database", async () => {
    const token = jwt.sign({ userId: "1" }, jwtSecret, { algorithm: "HS256" });
    const response = await request(app)
      .post("/api/portfolio/transactions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "d3754f5e-d60d-4a38-9d9d-fcfdb9453d89")
      .send({ ...validBody, txnDate: "2099-01-01" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(response.body.error.details.txnDate).toContain("Transaction date cannot be in the future");
  });

  it("rejects malformed decimal input before reaching the database", async () => {
    const token = jwt.sign({ userId: "1" }, jwtSecret, { algorithm: "HS256" });
    const response = await request(app)
      .post("/api/portfolio/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, quantity: "1.12345" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("requires a positive manually entered execution price", async () => {
    const token = jwt.sign({ userId: "1" }, jwtSecret, { algorithm: "HS256" });
    const response = await request(app)
      .post("/api/portfolio/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, price: "0" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(response.body.error.details.price).toContain("Value must be greater than zero");
  });
});
