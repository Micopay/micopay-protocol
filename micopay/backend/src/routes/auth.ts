import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import db from '../db/schema.js';
import { config } from '../config.js';
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
import { AuthError, NotFoundError } from '../utils/errors.js';

const authRateLimit = createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
});

// In-memory challenge store (for MVP; use Redis in production)
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /auth/challenge
   * Generate a challenge for a Stellar address to sign (simplified SEP-10).
   */
  app.post('/auth/challenge', {
    preHandler: [authRateLimit],
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
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    challenges.set(stellar_address, { challenge, expiresAt });

    request.log.info({ stellar_address, category: 'auth' }, '[auth] Challenge issued');
    return { challenge, expires_at: new Date(expiresAt).toISOString() };
  });

  /**
   * POST /auth/token
   * Verify the signed challenge and issue a JWT.
   *
   * In MVP mode: we skip actual Stellar signature verification and just issue the token.
   * In production: verify using Stellar SDK's Keypair.verify().
   */
  app.post('/auth/token', {
    preHandler: [authRateLimit],
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

    // Verify challenge exists and hasn't expired
    const stored = challenges.get(stellar_address);
    if (!stored || stored.challenge !== challenge) {
      throw new AuthError(
        'AUTH_INVALID_CHALLENGE',
        'El código de verificación no es válido o ha expirado. Por favor, intenta de nuevo.',
        'Invalid or mismatched challenge provided'
      );
    }
    if (Date.now() > stored.expiresAt) {
      challenges.delete(stellar_address);
      throw new AuthError(
        'AUTH_CHALLENGE_EXPIRED',
        'El código de verificación ha expirado. Por favor, solicita uno nuevo.',
        'Challenge expired'
      );
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
          throw new AuthError(
            'AUTH_INVALID_CREDENTIALS',
            'La firma no es válida. Por favor, intenta de nuevo.',
            'Invalid signature'
          );
        }
      } catch (err: any) {
        throw new AuthError(
          'AUTH_INVALID_CREDENTIALS',
          'La firma no es válida. Por favor, intenta de nuevo.',
          `Signature verification failed: ${err.message}`
        );
      }
    }

    // Clean up challenge
    challenges.delete(stellar_address);

    // Find or create user
    let user = await db.getOne(
      'SELECT id, stellar_address, username FROM users WHERE stellar_address = $1',
      [stellar_address],
    );

    if (!user) {
      throw new NotFoundError(
        'USER_NOT_FOUND',
        'Usuario no encontrado. Por favor, regístrate primero.',
        'User not found. Register first via POST /users/register'
      );
    }

    // Issue JWT
    const token = app.jwt.sign(
      { id: user.id, stellar_address: user.stellar_address },
      { expiresIn: config.jwtExpiry },
    );

    request.log.info({ stellar_address, user_id: user.id, category: 'auth' }, '[auth] Token issued');
    return { token, user };
  });
}
