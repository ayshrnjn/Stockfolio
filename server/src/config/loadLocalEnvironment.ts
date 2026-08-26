import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnvironment(directory = process.cwd()): void {
  const environmentPath = resolve(directory, ".env");
  if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
}

