import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurationError, readMarketDataConfig } from "../src/config/marketDataConfig.js";
import {
  RetryingJsonHttpClient,
  UpstreamRequestError,
} from "../src/lib/http/jsonHttpClient.js";
import { IndianApiClient } from "../src/providers/indianApi/client.js";
import { ProviderContractError } from "../src/providers/indianApi/schemas.js";
import { verifyIndianApi } from "../src/providers/indianApi/verification.js";

const fixturesDirectory = fileURLToPath(new URL("../tests/fixtures/", import.meta.url));

function loadLocalEnvironment(): void {
  const environmentPath = resolve(process.cwd(), ".env");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

function parseArguments(arguments_: readonly string[]): {
  query: string;
  writeFixtures: boolean;
} {
  return {
    query: arguments_.find((argument) => argument !== "--" && !argument.startsWith("--"))
      ?.trim() || "reliance",
    writeFixtures: arguments_.includes("--write-fixtures"),
  };
}

async function writeJsonAtomically(fileName: string, value: unknown): Promise<void> {
  await mkdir(fixturesDirectory, { recursive: true });
  const targetPath = resolve(fixturesDirectory, fileName);
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, targetPath);
}

function safeErrorMessage(error: unknown): string {
  if (
    error instanceof ConfigurationError
    || error instanceof UpstreamRequestError
    || error instanceof ProviderContractError
  ) {
    return error.message;
  }
  return "Unexpected market-data verification failure";
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const arguments_ = parseArguments(process.argv.slice(2));
  const config = readMarketDataConfig();
  const client = new IndianApiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    httpClient: new RetryingJsonHttpClient(),
  });
  const result = await verifyIndianApi(client, arguments_.query);

  if (arguments_.writeFixtures) {
    await Promise.all([
      writeJsonAtomically("indianapi-search.json", result.fixtures.search),
      writeJsonAtomically("indianapi-detail.json", result.fixtures.detail),
      writeJsonAtomically("indianapi-history.json", result.fixtures.history),
    ]);
  }

  process.stdout.write(`${JSON.stringify({
    ...result.report,
    fixturesWritten: arguments_.writeFixtures,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Market-data verification failed: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});

