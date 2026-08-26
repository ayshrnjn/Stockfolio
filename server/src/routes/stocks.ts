import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import { currentIndiaDate } from "../lib/marketHours.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import type { MarketDataService } from "../services/marketDataService.js";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(40)
    .regex(/^[\p{L}\p{N} .&'-]+$/u, "Search contains unsupported characters"),
});
const instrumentSchema = z.object({
  exchange: z.enum(["NSE", "BSE"]),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9.&-]{1,20}$/),
});
const historyQuerySchema = z.object({
  range: z.enum(["1D", "1W", "1M", "3M", "1Y"]).default("1M"),
});
const priceDateQuerySchema = z.object({ date: z.iso.date() }).superRefine((value, context) => {
  const today = currentIndiaDate();
  if (value.date > today) context.addIssue({ code: "custom", path: ["date"], message: "Date cannot be in the future" });
});

export function createStocksRouter(marketData: MarketDataService): Router {
  const router = Router();
  const searchRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(_request, _response, next) {
      next(new AppError("RATE_LIMITED", "Too many stock searches. Please try again shortly.", {
        status: 429,
      }));
    },
  });

  router.get("/search", searchRateLimit, asyncHandler(async (request, response) => {
    const { q } = searchSchema.parse(request.query);
    const result = await marketData.searchStocks(q);
    response.setHeader("cache-control", "private, no-store");
    response.json({
      data: {
        results: result.value,
        stale: result.stale,
        asOf: result.asOf,
      },
    });
  }));

  router.get("/overview", asyncHandler(async (_request, response) => {
    const result = await marketData.getMarketOverview();
    response.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    response.json({ data: { overview: result.value, stale: result.stale, asOf: result.asOf } });
  }));

  router.get("/:exchange/:symbol/history", asyncHandler(async (request, response) => {
    const { exchange, symbol } = instrumentSchema.parse(request.params);
    const { range } = historyQuerySchema.parse(request.query);
    const result = await marketData.getStockHistory(exchange, symbol, range);
    response.setHeader("cache-control", "private, no-store");
    response.json({ data: { history: result.value, stale: result.stale, asOf: result.asOf } });
  }));

  router.get("/:exchange/:symbol/price-on", asyncHandler(async (request, response) => {
    const { exchange, symbol } = instrumentSchema.parse(request.params);
    const { date } = priceDateQuerySchema.parse(request.query);
    const result = await marketData.getStockPriceOnDate(exchange, symbol, date);
    response.setHeader("cache-control", "private, no-store");
    response.json({ data: { price: result.value, stale: result.stale, asOf: result.asOf } });
  }));

  router.get("/:exchange/:symbol", asyncHandler(async (request, response) => {
    const { exchange, symbol } = instrumentSchema.parse(request.params);
    const result = await marketData.getStockDetail(exchange, symbol);
    response.setHeader("cache-control", "private, no-store");
    response.json({ data: { stock: result.value, stale: result.stale, asOf: result.asOf } });
  }));

  return router;
}
