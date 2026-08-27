import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadLocalEnvironment } from "./config/loadLocalEnvironment.js";
import { readEnvironment } from "./config/environment.js";
import { readMarketDataConfig } from "./config/marketDataConfig.js";
import { createDatabasePool } from "./database/pool.js";
import { createLogger } from "./logging/logger.js";
import { createMarketDataService } from "./services/marketDataService.js";

loadLocalEnvironment();

const environment = readEnvironment();
const logger = createLogger(environment.logLevel);
const database = createDatabasePool(environment.database);
const marketData = createMarketDataService(readMarketDataConfig(), logger);
const app = createApp({ environment, database, logger, marketData });
const server = createServer(app);

server.requestTimeout = 15_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 5_000;

database.on("error", (error) => {
  logger.error({ err: error }, "Unexpected idle PostgreSQL client error");
});

let shuttingDown = false;

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down StockFolio API");

  const forcedExit = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);
  forcedExit.unref();

  server.close(async (serverError) => {
    if (serverError) logger.error({ err: serverError }, "HTTP server shutdown failed");
    try {
      await database.end();
    } catch (databaseError) {
      logger.error({ err: databaseError }, "Database pool shutdown failed");
      exitCode = 1;
    } finally {
      clearTimeout(forcedExit);
      process.exitCode = serverError ? 1 : exitCode;
    }
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
process.once("SIGINT", () => void shutdown("SIGINT", 0));
process.once("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  void shutdown("unhandledRejection", 1);
});

server.listen(environment.port, () => {
  logger.info({ port: environment.port }, "StockFolio API listening");
});
