import type { RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";

function readUserId(payload: string | JwtPayload): string | null {
  if (typeof payload === "string") return null;
  return typeof payload.userId === "string" && /^\d+$/.test(payload.userId)
    ? payload.userId
    : null;
}

export function createAuthenticate(jwtSecret: string): RequestHandler {
  return (request, _response, next) => {
    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    const token = match?.[1];
    if (!token) {
      next(AppError.unauthorized());
      return;
    }

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
      const userId = readUserId(payload);
      if (!userId) throw AppError.unauthorized("Invalid authentication token");
      request.userId = userId;
      next();
    } catch {
      next(AppError.unauthorized("Invalid or expired authentication token"));
    }
  };
}
