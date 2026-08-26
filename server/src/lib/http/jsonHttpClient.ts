const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 1;
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

export type FetchFunction = (url: URL, init: RequestInit) => Promise<Response>;
export type SleepFunction = (milliseconds: number) => Promise<void>;

export interface JsonGetRequest {
  url: URL;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  retries?: number;
}

export interface JsonHttpClient {
  get(request: JsonGetRequest): Promise<unknown>;
}

export type UpstreamFailureKind = "http" | "network" | "timeout" | "invalid_json";

export class UpstreamRequestError extends Error {
  public readonly kind: UpstreamFailureKind;
  public readonly status: number | undefined;

  public constructor(
    kind: UpstreamFailureKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "UpstreamRequestError";
    this.kind = kind;
    this.status = options.status;
  }
}

interface JsonHttpClientDependencies {
  fetch: FetchFunction;
  sleep: SleepFunction;
  random: () => number;
}

const defaultDependencies: JsonHttpClientDependencies = {
  fetch: (url, init) => fetch(url, init),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
};

function nonNegativeInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return resolved;
}

function retryDelay(random: () => number): number {
  return 300 + Math.floor(random() * 200);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class RetryingJsonHttpClient implements JsonHttpClient {
  private readonly dependencies: JsonHttpClientDependencies;

  public constructor(dependencies: Partial<JsonHttpClientDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  public async get(request: JsonGetRequest): Promise<unknown> {
    const timeoutMs = nonNegativeInteger(request.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
    const retries = nonNegativeInteger(request.retries, DEFAULT_RETRIES, "retries");

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.executeAttempt(request, timeoutMs);
      } catch (error) {
        const normalized = this.normalizeFailure(error);
        if (attempt >= retries || !this.isRetryable(normalized)) {
          throw normalized;
        }
        await this.dependencies.sleep(retryDelay(this.dependencies.random));
      }
    }

    throw new UpstreamRequestError("network", "Market data request failed");
  }

  private async executeAttempt(request: JsonGetRequest, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.dependencies.fetch(request.url, {
        method: "GET",
        ...(request.headers ? { headers: { ...request.headers } } : {}),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new UpstreamRequestError(
          "http",
          `Market data provider returned HTTP ${response.status}`,
          { status: response.status },
        );
      }

      try {
        return await response.json() as unknown;
      } catch (error) {
        throw new UpstreamRequestError(
          "invalid_json",
          "Market data provider returned invalid JSON",
          { cause: error },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeFailure(error: unknown): UpstreamRequestError {
    if (error instanceof UpstreamRequestError) return error;
    if (isAbortError(error)) {
      return new UpstreamRequestError("timeout", "Market data request timed out", { cause: error });
    }
    return new UpstreamRequestError("network", "Market data provider is unavailable", {
      cause: error,
    });
  }

  private isRetryable(error: UpstreamRequestError): boolean {
    if (error.kind === "http") {
      return error.status !== undefined && RETRYABLE_HTTP_STATUSES.has(error.status);
    }
    return error.kind === "network" || error.kind === "timeout";
  }
}
