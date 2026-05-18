import type { FastifyInstance } from "fastify";
import db from "../db/schema.js";
import { config } from "../config.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { deleteAccount } from "../services/account.service.js";
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
import { ConflictError } from "../utils/errors.js";

const authRateLimit = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
});

export async function userRoutes(app: FastifyInstance) {
  /**
   * POST /users/register
   * Create a new user + wallet. Returns a JWT so the user is immediately authenticated.
   */
  app.post(
    "/users/register",
    {
      preHandler: [authRateLimit],
      schema: {
        body: {
          type: "object",
          required: ["stellar_address", "username"],
          properties: {
            stellar_address: { type: "string", minLength: 56, maxLength: 56 },
            username: {
              type: "string",
              minLength: 3,
              maxLength: 30,
              pattern: "^[a-zA-Z0-9_]+$",
            },
            phone_hash: { type: "string", maxLength: 64 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { stellar_address, username, phone_hash } = request.body as {
        stellar_address: string;
        username: string;
        phone_hash?: string;
      };

      // Check for existing user
      const existing = await db.getOne(
        "SELECT id FROM users WHERE stellar_address = $1 OR username = $2",
        [stellar_address, username],
      );
      if (existing) {
        throw new ConflictError(
          "User with this address or username already exists",
        );
      }

      const user = await db.getOne(
        `INSERT INTO users (stellar_address, username, phone_hash, merchant_available)
         VALUES ($1, $2, $3, $4)
         RETURNING id, stellar_address, username, merchant_available, created_at`,
        [stellar_address, username, phone_hash || null, true],
      );

      // Create wallet record
      await db.execute(
        `INSERT INTO wallets (user_id, stellar_address) VALUES ($1, $2)`,
        [user.id, stellar_address],
      );

      // Issue JWT
      const token = app.jwt.sign(
        { id: user.id, stellar_address: user.stellar_address },
        { expiresIn: config.jwtExpiry },
      );

      request.log.info({ user_id: user.id, stellar_address, category: 'auth' }, '[auth] User registered');
      reply.status(201);
      return { user, token };
    },
  );

  /**
   * GET /users/me
   * Get the authenticated user's profile.
   */
  app.get(
    "/users/me",
    {
      preHandler: [authMiddleware],
    },
    async (request) => {
      const userId = request.user.id;

      const user = await db.getOne(
        `SELECT u.*, w.wallet_type
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId],
      );

      request.log.info({ user_id: userId, category: 'auth' }, '[auth] Profile fetched');
      return { user };
    },
  );

  /**
   * POST /users/me/delete
   * Permanently delete the authenticated account after username confirmation.
   */
  app.post(
    "/users/me/delete",
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: "object",
          required: ["username"],
          properties: {
            username: { type: "string", minLength: 3, maxLength: 30 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { username } = request.body as { username: string };
      return deleteAccount(request.user.id, username);
    },
  );
}
