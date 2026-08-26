import { Router } from "express";
import type { Logger } from "pino";
import type { Pool } from "pg";
import { asyncHandler } from "../middleware/asyncHandler.js";

export function createHealthRouter(database: Pool, logger: Logger): Router {
  const router = Router();

  router.get("/live", (_request, response) => {
    response.setHeader("cache-control", "no-store");
    response.json({
      data: {
        ok: true,
        service: "stockfolio-api",
      },
    });
  });

  router.get("/health", asyncHandler(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    try {
      await database.query("SELECT 1");
      response.json({
        data: {
          ok: true,
          database: "up",
        },
      });
    } catch (error) {
      logger.warn({ err: error, requestId: request.id }, "Database readiness check failed");
      response.status(503).json({
        error: {
          code: "INTERNAL",
          message: "Database unavailable",
        },
      });
    }
  }));

  return router;
}
