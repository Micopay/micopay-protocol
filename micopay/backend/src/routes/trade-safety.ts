import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
import { config } from '../config.js';
import { recordTradeDispute } from '../services/abuse.service.js';

const disputeRateLimit = createRateLimiter({
  windowMs: config.disputeRateLimitWindowMs,
  max: config.disputeRateLimitMax,
  keyGenerator: (req) => req.user?.id || req.ip,
});

export async function tradeSafetyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /**
   * POST /trades/:id/dispute
   * Open a dispute on a trade.
   */
  app.post('/trades/:id/dispute', {
    preHandler: [disputeRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 1 },
          evidence_urls: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason, evidence_urls } = request.body as { reason: string; evidence_urls?: string[] };

    const dispute = await recordTradeDispute({
      tradeId: id,
      reportedBy: request.user.id,
      reason,
      evidenceUrls: evidence_urls,
    });

    reply.status(201);
    return { dispute };
  });
}
