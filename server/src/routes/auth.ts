import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Pool } from "pg";
import { z } from "zod";
import { AppError } from "../errors/AppError.js";
import { createAuthenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { AuthService } from "../services/authService.js";

const passwordSchema = z.string()
  .min(8, "Password must contain at least 8 characters")
  .max(72, "Password must contain at most 72 characters")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must contain at most 72 bytes",
  });

const emailSchema = z.string().trim().email("Enter a valid email address").max(254)
  .transform((value) => value.toLowerCase());
const nameSchema = z.string().trim().min(2, "Name must contain at least 2 characters").max(80)
  .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, "Enter a valid name");
const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
}).strict();
const registrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
}).strict();

export function createAuthRouter(database: Pool, jwtSecret: string): Router {
  const router = Router();
  const authService = new AuthService(database, jwtSecret);
  const authenticate = createAuthenticate(jwtSecret);
  const authenticationRateLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler(_request, _response, next) {
      next(new AppError("RATE_LIMITED", "Too many authentication attempts. Please try again later.", {
        status: 429,
      }));
    },
  });

  router.post("/register", authenticationRateLimit, asyncHandler(async (request, response) => {
    const credentials = registrationSchema.parse(request.body);
    const result = await authService.register(credentials.name, credentials.email, credentials.password);
    response.status(201).json({ data: result });
  }));

  router.post("/login", authenticationRateLimit, asyncHandler(async (request, response) => {
    const credentials = loginSchema.parse(request.body);
    const result = await authService.login(credentials.email, credentials.password);
    response.json({ data: result });
  }));

  router.get("/me", authenticate, asyncHandler(async (request, response) => {
    if (!request.userId) throw AppError.unauthorized();
    const user = await authService.getCurrentUser(request.userId);
    response.json({ data: { user } });
  }));

  return router;
}
