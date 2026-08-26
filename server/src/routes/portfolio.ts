import { Router } from "express";
import { Decimal } from "decimal.js";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import type { MarketDataService } from "../services/marketDataService.js";
import { PortfolioDashboardService } from "../services/portfolioDashboardService.js";
import { PortfolioTransactionService } from "../services/portfolioTransactionService.js";

const positiveDecimal = z.string().trim()
  .regex(/^\d{1,14}(?:\.\d{1,4})?$/, "Use a positive number with at most 4 decimal places")
  .refine((value) => new Decimal(value).greaterThan(0), "Value must be greater than zero");
const transactionSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.&-]{1,20}$/),
  exchange: z.enum(["NSE", "BSE"]),
  type: z.enum(["BUY", "SELL"]),
  quantity: positiveDecimal,
  price: positiveDecimal,
  txnDate: z.iso.date(),
}).strict().superRefine((value, context) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (value.txnDate > today) {
    context.addIssue({ code: "custom", path: ["txnDate"], message: "Transaction date cannot be in the future" });
  }
});
const idempotencyKeySchema = z.uuid();

export function createPortfolioRouter(
  database: Pool,
  jwtSecret: string,
  marketData: MarketDataService,
): Router {
  const router = Router();
  const authenticate = createAuthenticate(jwtSecret);
  const service = new PortfolioTransactionService(database, marketData);
  const dashboardService = new PortfolioDashboardService(database, marketData);
  router.use(authenticate);

  router.get("/holdings", asyncHandler(async (request, response) => {
    if (!request.userId) throw AppError.unauthorized();
    response.json({ data: await dashboardService.getDashboard(request.userId) });
  }));

  router.get("/summary", asyncHandler(async (request, response) => {
    if (!request.userId) throw AppError.unauthorized();
    const dashboard = await dashboardService.getDashboard(request.userId);
    response.json({ data: { summary: dashboard.summary } });
  }));

  router.post("/transactions", asyncHandler(async (request, response) => {
    if (!request.userId) throw AppError.unauthorized();
    const input = transactionSchema.parse(request.body);
    const rawKey = request.get("idempotency-key");
    const key = rawKey ? idempotencyKeySchema.parse(rawKey) : undefined;
    const result = await service.create(request.userId, input, key);
    if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
    response.status(result.replayed ? 200 : 201).json({ data: { transaction: result.transaction } });
  }));

  return router;
}
