import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import db from '../db/schema.js';
import { config } from '../config.js';
import {
  upsertChallenge,
  getPendingChallenge,
  consumeChallenge,
  cleanupExpiredChallenges,
} from '../db/auth.js';

const authRateLimitConfig = {
  max: 5,
  timeWindow: '1 minute',
  keyGenerator: (request: { ip: string }) => request.ip,
};

export async function authRoutes(app: FastifyInstance & { jwt: any }) {
  /**
   * POST /auth/challenge
   * Generate a challenge for a Stellar address to sign (simplified SEP-10).
   * Persisted to DB so it survives restarts and works across multiple instances.
   */
  app.post('/auth/challenge', {
    config: {
      rateLimit: authRateLimitConfig,
    },
    schema: {
      body: {
        type: 'object',
        required: ['stellar_address'],
        properties: {
          stellar_address: { type: 'string', minLength: 56, maxLength: 56 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { stellar_address } = request.body as { stellar_address: string };

    const challenge = `micopay-auth-${randomBytes(16).toString('hex')}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Opportunistic cleanup — keeps the table lean without a separate cron job
    cleanupExpiredChallenges().catch(() => {});

    await upsertChallenge(stellar_address, challenge, expiresAt);

    return { challenge, expires_at: expiresAt.toISOString() };
  });

  /**
   * POST /auth/token
   * Verify the signed challenge and issue a JWT.
   *
   * In MVP mode: we skip actual Stellar signature verification and just issue the token.
   * In production: verify using Stellar SDK's Keypair.verify().
   */
  app.post('/auth/token', {
    config: {
      rateLimit: authRateLimitConfig,
    },
    schema: {
      body: {
        type: 'object',
        required: ['stellar_address', 'challenge', 'signature'],
        properties: {
          stellar_address: { type: 'string', minLength: 56, maxLength: 56 },
          challenge: { type: 'string' },
          signature: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { stellar_address, challenge, signature } = request.body as {
      stellar_address: string;
      challenge: string;
      signature: string;
    };

    // Verify challenge exists, belongs to this address, and hasn't expired or been used
    const stored = await getPendingChallenge(stellar_address, challenge);
    if (!stored) {
      return reply.status(401).send({ error: 'Invalid or expired challenge' });
    }

    // Atomically mark as used — guards against concurrent replay attempts
    const consumed = await consumeChallenge(stored.id);
    if (!consumed) {
      return reply.status(401).send({ error: 'Challenge already used' });
    }

    // In MVP: skip real signature verification
    // In production: use Keypair.fromPublicKey(stellar_address).verify(challenge, signature)
    if (!config.mockStellar) {
      try {
        const { Keypair } = await import('@stellar/stellar-sdk');
        const keypair = Keypair.fromPublicKey(stellar_address);
        const verified = keypair.verify(
          Buffer.from(challenge, 'utf8'),
          Buffer.from(signature, 'base64'),
        );
        if (!verified) {
          return reply.status(401).send({ error: 'Invalid signature' });
        }
      } catch {
        return reply.status(401).send({ error: 'Signature verification failed' });
      }
    }

    // Find or create user
    const user = await db.getOne(
      'SELECT id, stellar_address, username FROM users WHERE stellar_address = $1',
      [stellar_address],
    );

    if (!user) {
      return reply.status(404).send({
        error: 'User not found. Register first via POST /users/register',
      });
    }

    // Issue JWT
    const token = app.jwt.sign(
      { id: user.id, stellar_address: user.stellar_address },
      { expiresIn: config.jwtExpiry },
    );

    return { token, user };
  });
}
