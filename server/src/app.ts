import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { Pool } from "pg";
import type { Environment } from "./config/environment.js";
import { createHttpLogger } from "./logging/logger.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createPortfolioRouter } from "./routes/portfolio.js";
import { createStocksRouter } from "./routes/stocks.js";
import type { MarketDataService } from "./services/marketDataService.js";

export interface AppDependencies {
  environment: Environment;
  database: Pool;
  logger: Logger;
  marketData: MarketDataService;
}

export function createApp(dependencies: AppDependencies): Express {
  const { environment, database, logger, marketData } = dependencies;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", environment.trustProxy);

  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || environment.corsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }));
  app.use(express.json({ limit: "100kb" }));

  app.use(createHealthRouter(database, logger));
  app.use("/api/auth", createAuthRouter(database, environment.auth.jwtSecret));
  app.use("/api/stocks", createStocksRouter(marketData));
  app.use("/api/portfolio", createPortfolioRouter(database, environment.auth.jwtSecret, marketData));

  app.use(notFoundHandler());
  app.use(createErrorHandler(logger));

  return app;
}
