import { getAuthToken } from "../auth/tokenStorage";

type ErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: unknown;

  public constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function endpoint(path: string): string {
  if (!path.startsWith("/")) throw new TypeError("API path must start with /");
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  return `${baseUrl}${path}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) return null;
  return response.json() as Promise<unknown>;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  const token = getAuthToken();
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(endpoint(path), {
    ...options,
    headers,
    credentials: "include",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    const errorPayload = isRecord(payload) && isRecord(payload.error)
      ? payload.error as ErrorPayload
      : {};
    throw new ApiError(
      typeof errorPayload.code === "string" ? errorPayload.code : "INTERNAL",
      typeof errorPayload.message === "string" ? errorPayload.message : "Request failed",
      response.status,
      errorPayload.details,
    );
  }

  if (!isRecord(payload) || !("data" in payload)) {
    throw new ApiError("INTERNAL", "Invalid server response", response.status);
  }

  return payload.data as T;
}
