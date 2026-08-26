import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

interface BodyParserError extends Error {
  status?: number;
  type?: string;
}

function isBodyParserSyntaxError(error: unknown): error is BodyParserError {
  return error instanceof SyntaxError
    && "status" in error
    && (error as BodyParserError).status === 400
    && (error as BodyParserError).type === "entity.parse.failed";
}

function normalizeError(error: unknown): AppError | unknown {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return AppError.validation("Invalid request", error.flatten().fieldErrors);
  }
  if (isBodyParserSyntaxError(error)) return AppError.validation("Malformed JSON body");
  return error;
}

export function notFoundHandler(): RequestHandler {
  return (_request, _response, next) => next(AppError.notFound("Route not found"));
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    const normalized = normalizeError(error);

    if (normalized instanceof AppError) {
      if (normalized.status >= 500) {
        logger.error({ err: normalized, requestId: request.id }, normalized.message);
      }
      response.status(normalized.status).json({
        error: {
          code: normalized.code,
          message: normalized.message,
          ...(normalized.details === undefined ? {} : { details: normalized.details }),
        },
      });
      return;
    }

    logger.error({ err: normalized, requestId: request.id }, "Unhandled request error");
    response.status(500).json({
      error: {
        code: "INTERNAL",
        message: "Something went wrong",
      },
    });
  };
}

