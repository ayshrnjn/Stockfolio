import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";
import type { LogLevel } from "../config/environment.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    base: {
      service: "stockfolio-api",
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-api-key",
        "request.headers.authorization",
        "request.headers.cookie",
        "request.headers.x-api-key",
        "apiKey",
        "password",
        "passwordHash",
      ],
      censor: "[REDACTED]",
    },
  });
}

export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId(request, response) {
      const incoming = request.headers["x-request-id"];
      const requestId = typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    },
    autoLogging: {
      ignore: (request) => request.url === "/live",
    },
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) return "error";
      if (response.statusCode >= 400) return "warn";
      return "info";
    },
  });
}
