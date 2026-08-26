import { Pool, type PoolClient } from "pg";
import type { Environment } from "../config/environment.js";

export type DatabaseConfig = Environment["database"];
export type TransactionWork<T> = (client: PoolClient) => Promise<T>;

export interface DatabasePoolOptions {
  connectionTimeoutMillis?: number;
}

export function createDatabasePool(
  config: DatabaseConfig,
  options: DatabasePoolOptions = {},
): Pool {
  return new Pool({
    connectionString: config.connectionString,
    application_name: "stockfolio-api",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? config.connectionTimeoutMillis,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    enableChannelBinding: true,
    ssl: config.ssl ? { rejectUnauthorized: config.rejectUnauthorized } : false,
  });
}

export async function withTransaction<T>(pool: Pool, work: TransactionWork<T>): Promise<T> {
  const client = await pool.connect();
  let began = false;

  try {
    await client.query("BEGIN");
    began = true;
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Database transaction failed and rollback was unsuccessful",
        );
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
