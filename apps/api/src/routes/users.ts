import type { FastifyInstance } from 'fastify';
import db from '../db/schema.js';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { ConflictError } from '../utils/errors.js';

export async function userRoutes(app: FastifyInstance & { jwt: any }) {
  /**
   * POST /users/register
   * Create a new user + wallet. Returns a JWT so the user is immediately authenticated.
   */
  app.post('/users/register', {
    schema: {
      body: {
        type: 'object',
        required: ['stellar_address', 'username'],
        properties: {
          stellar_address: { type: 'string', minLength: 56, maxLength: 56 },
          username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
          phone_hash: { type: 'string', maxLength: 64 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { stellar_address, username, phone_hash } = request.body as {
      stellar_address: string;
      username: string;
      phone_hash?: string;
    };

    // Check if username already exists (device keypair may have changed).
    const byUsername = await db.getOne(
      'SELECT id, stellar_address, username FROM users WHERE username = $1',
      [username],
    );
    if (byUsername) {
      // Update the stellar_address to the current device keypair and re-issue JWT.
      await db.execute(
        'UPDATE users SET stellar_address = $1 WHERE id = $2',
        [stellar_address, byUsername.id],
      );
      await db.execute(
        'UPDATE wallets SET stellar_address = $1 WHERE user_id = $2',
        [stellar_address, byUsername.id],
      );
      const updatedUser = await db.getOne(
        'SELECT id, stellar_address, username FROM users WHERE id = $1',
        [byUsername.id],
      );
      const token = app.jwt.sign(
        { id: updatedUser.id, stellar_address: updatedUser.stellar_address },
        { expiresIn: config.jwtExpiry },
      );
      reply.status(200);
      return { user: updatedUser, token };
    }

    // Check for conflicting stellar_address under a different username.
    const byAddress = await db.getOne(
      'SELECT id FROM users WHERE stellar_address = $1',
      [stellar_address],
    );
    if (byAddress) {
      throw new ConflictError('That Stellar address is already linked to another account');
    }

    // Create user
    const user = await db.getOne(
      `INSERT INTO users (stellar_address, username, phone_hash)
       VALUES ($1, $2, $3)
       RETURNING id, stellar_address, username, created_at`,
      [stellar_address, username, phone_hash || null],
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

    reply.status(201);
    return { user, token };
  });

  /**
   * GET /users/me
   * Get the authenticated user's profile.
   */
  app.get('/users/me', {
    preHandler: [authMiddleware],
  }, async (request: any) => {
    const userId = request.user.id;

    const user = await db.getOne(
      `SELECT u.*, w.wallet_type
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );

    return { user };
  });
}
