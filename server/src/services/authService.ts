import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Pool } from "pg";
import { AppError } from "../errors/AppError.js";
import { withTransaction } from "../database/pool.js";

const PASSWORD_HASH_ROUNDS = 10;
const TOKEN_LIFETIME = "7d";
const dummyPasswordHash = bcrypt.hash("stockfolio-invalid-account", PASSWORD_HASH_ROUNDS);

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
}

interface PublicUserRow {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  token: string;
  user: PublicUserRow;
}

interface PostgresError {
  code?: string;
  constraint?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return typeof error === "object" && error !== null;
}

function createToken(userId: string, jwtSecret: string): string {
  return jwt.sign({ userId }, jwtSecret, {
    algorithm: "HS256",
    expiresIn: TOKEN_LIFETIME,
  });
}

export class AuthService {
  public constructor(
    private readonly database: Pool,
    private readonly jwtSecret: string,
  ) {}

  public async register(name: string, email: string, password: string): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    try {
      const user = await withTransaction(this.database, async (client) => {
        const userResult = await client.query<PublicUserRow>(
          `INSERT INTO users (name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id::text, name, email`,
          [name, email, passwordHash],
        );
        const createdUser = userResult.rows[0];
        if (!createdUser) throw new Error("User insert returned no row");

        await client.query(
          `INSERT INTO portfolios (user_id, name)
           VALUES ($1, $2)`,
          [createdUser.id, "My Portfolio"],
        );
        return createdUser;
      });

      return { token: createToken(user.id, this.jwtSecret), user };
    } catch (error) {
      if (isPostgresError(error) && error.code === "23505") {
        throw AppError.conflict(
          "VALIDATION_ERROR",
          "An account with this email already exists",
          { email: ["Email is already registered"] },
        );
      }
      throw error;
    }
  }

  public async login(email: string, password: string): Promise<AuthResult> {
    const result = await this.database.query<UserRow>(
      `SELECT id::text, name, email, password_hash
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );
    const user = result.rows[0];

    if (!user) {
      await bcrypt.compare(password, await dummyPasswordHash);
      throw AppError.unauthorized("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) throw AppError.unauthorized("Invalid email or password");

    return {
      token: createToken(user.id, this.jwtSecret),
      user: { id: user.id, name: user.name, email: user.email },
    };
  }

  public async getCurrentUser(userId: string): Promise<PublicUserRow> {
    const result = await this.database.query<PublicUserRow>(
      `SELECT id::text, name, email
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw AppError.unauthorized("Account no longer exists");
    return user;
  }
}
