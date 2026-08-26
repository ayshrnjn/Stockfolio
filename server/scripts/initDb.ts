import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readEnvironment } from "../src/config/environment.js";
import { loadLocalEnvironment } from "../src/config/loadLocalEnvironment.js";
import { createDatabasePool, withTransaction } from "../src/database/pool.js";
import { createLogger } from "../src/logging/logger.js";

async function main(): Promise<void> {
  loadLocalEnvironment();
  const environment = readEnvironment();
  const logger = createLogger(environment.logLevel);
  // A newly provisioned or suspended Neon compute can take longer to wake than
  // the API's fail-fast connection budget. Schema setup is an offline command,
  // so it can safely allow a longer initial connection window.
  const database = createDatabasePool(environment.database, {
    connectionTimeoutMillis: 30_000,
  });
  const schemaPath = fileURLToPath(new URL("../src/database/schema.sql", import.meta.url));

  try {
    const schema = await readFile(schemaPath, "utf8");
    await withTransaction(database, async (client) => {
      await client.query(schema);
    });
    logger.info("Database schema initialized successfully");
  } finally {
    await database.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write("Database initialization failed. Check DATABASE_URL and SSL settings.\n");
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
