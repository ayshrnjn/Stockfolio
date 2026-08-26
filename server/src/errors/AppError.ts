import type { ErrorCode } from "./errorCodes.js";

interface AppErrorOptions {
  status: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details: unknown;
  public readonly isOperational = true;

  public constructor(code: ErrorCode, message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }

  public static validation(message = "Invalid request", details?: unknown): AppError {
    return new AppError("VALIDATION_ERROR", message, { status: 400, details });
  }

  public static unauthorized(message = "Authentication required"): AppError {
    return new AppError("UNAUTHORIZED", message, { status: 401 });
  }

  public static notFound(message = "Resource not found"): AppError {
    return new AppError("NOT_FOUND", message, { status: 404 });
  }

  public static conflict(
    code: Extract<ErrorCode, "VALIDATION_ERROR" | "EMAIL_ALREADY_EXISTS" | "IDEMPOTENCY_KEY_REUSED">,
    message: string,
    details?: unknown,
  ): AppError {
    return new AppError(code, message, { status: 409, details });
  }

  public static upstreamUnavailable(message = "External service unavailable"): AppError {
    return new AppError("UPSTREAM_UNAVAILABLE", message, { status: 503 });
  }
}
