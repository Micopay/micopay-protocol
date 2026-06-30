import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { registerRateLimit } from '../plugins/rate-limit.js';
import { authRoutes } from '../routes/auth.js';

const {
  upsertChallengeMock,
  getPendingChallengeMock,
  consumeChallengeMock,
  cleanupExpiredChallengesMock,
  dbGetOneMock,
} = vi.hoisted(() => ({
  upsertChallengeMock: vi.fn(),
  getPendingChallengeMock: vi.fn(),
  consumeChallengeMock: vi.fn(),
  cleanupExpiredChallengesMock: vi.fn(),
  dbGetOneMock: vi.fn(),
}));

vi.mock('../db/auth.js', () => ({
  upsertChallenge: upsertChallengeMock,
  getPendingChallenge: getPendingChallengeMock,
  consumeChallenge: consumeChallengeMock,
  cleanupExpiredChallenges: cleanupExpiredChallengesMock,
}));

vi.mock('../db/schema.js', () => ({
  default: {
    getOne: dbGetOneMock,
  },
}));

async function buildApp() {
  const app = Fastify();
  await app.register(fastifyJwt, { secret: 'test-secret' });
  await registerRateLimit(app);
  await app.register(authRoutes);
  return app;
}

describe('auth route rate limiting', () => {
  beforeEach(() => {
    upsertChallengeMock.mockReset();
    getPendingChallengeMock.mockReset();
    consumeChallengeMock.mockReset();
    cleanupExpiredChallengesMock.mockReset();
    dbGetOneMock.mockReset();

    upsertChallengeMock.mockResolvedValue(undefined);
    cleanupExpiredChallengesMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  it('returns 429 for repeated auth challenge requests after the per-route limit is exceeded', async () => {
    const app = await buildApp();

    const payload = { stellar_address: 'G'.repeat(56) };

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/challenge',
        payload,
      });

      expect(response.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/challenge',
      payload,
    });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'Too Many Requests' });

    await app.close();
  });
});
