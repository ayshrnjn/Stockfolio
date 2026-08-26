import { z } from "zod";

const postgresUrl = z.string().trim().min(1).refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "DATABASE_URL must be a PostgreSQL connection string",
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  DATABASE_URL: postgresUrl,
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000)
    .default(5_000),
  DATABASE_SSL: z.enum(["true", "false"]).default("false")
    .transform((value) => value === "true"),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(["true", "false"]).default("true")
    .transform((value) => value === "true"),
});

export type NodeEnvironment = z.infer<typeof environmentSchema>["NODE_ENV"];
export type LogLevel = z.infer<typeof environmentSchema>["LOG_LEVEL"];

export interface Environment {
  nodeEnvironment: NodeEnvironment;
  port: number;
  logLevel: LogLevel;
  corsOrigins: ReadonlySet<string>;
  trustProxy: number;
  auth: {
    jwtSecret: string;
  };
  database: {
    connectionString: string;
    connectionTimeoutMillis: number;
    ssl: boolean;
    rejectUnauthorized: boolean;
  };
}

export class EnvironmentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EnvironmentError";
  }
}

function parseCorsOrigins(value: string): ReadonlySet<string> {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new EnvironmentError("CORS_ORIGIN must contain an origin");

  const normalized = origins.map((origin) => {
    try {
      const url = new URL(origin);
      if (url.pathname !== "/" || url.search || url.hash) throw new Error("not an origin");
      return url.origin;
    } catch {
      throw new EnvironmentError(`CORS_ORIGIN contains an invalid origin: ${origin}`);
    }
  });
  return new Set(normalized);
}

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
      .filter(Boolean)
      .join(", ");
    throw new EnvironmentError(`Invalid environment configuration${fields ? `: ${fields}` : ""}`);
  }

  return {
    nodeEnvironment: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    corsOrigins: parseCorsOrigins(parsed.data.CORS_ORIGIN),
    trustProxy: parsed.data.TRUST_PROXY,
    auth: {
      jwtSecret: parsed.data.JWT_SECRET,
    },
    database: {
      connectionString: parsed.data.DATABASE_URL,
      connectionTimeoutMillis: parsed.data.DATABASE_CONNECTION_TIMEOUT_MS,
      ssl: parsed.data.DATABASE_SSL,
      rejectUnauthorized: parsed.data.DATABASE_SSL_REJECT_UNAUTHORIZED,
    },
  };
}
