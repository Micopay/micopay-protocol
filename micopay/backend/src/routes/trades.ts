import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
import { config } from '../config.js';
import * as tradeService from '../services/trade.service.js';

const tradeRateLimit = createRateLimiter({
  windowMs: config.tradeRateLimitWindowMs,
  max: config.tradeRateLimitMax,
  keyGenerator: (req) => req.user?.id || req.ip,
});

export async function tradeRoutes(app: FastifyInstance) {
  // All trade routes require authentication
  app.addHook('preHandler', authMiddleware);

  /**
   * POST /trades
   * Buyer creates a new trade. Generates HTLC secret and returns secret_hash.
   */
  app.post('/trades', {
    preHandler: [tradeRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['seller_id', 'amount_mxn'],
        properties: {
          seller_id: { type: 'string', format: 'uuid' },
          amount_mxn: { type: 'integer', minimum: 100, maximum: 50000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { seller_id, amount_mxn } = request.body as { seller_id: string; amount_mxn: number };
    const buyerId = request.user.id;

    const trade = await tradeService.createTrade({
      request,
      sellerId: seller_id,
      buyerId,
      amountMxn: amount_mxn,
    });

    // Don't expose encrypted secret fields in response
    const { secret_enc, secret_nonce, ...safeTrade } = trade;

    reply.status(201);
    return { trade: safeTrade };
  });

  /**
   * GET /trades/active
   * List active trades for the authenticated user.
   */
  app.get('/trades/active', async (request) => {
    const trades = await tradeService.getActiveTrades(request.user.id);
    const safeTrades = trades.map(({ secret_enc, secret_nonce, ...t }: any) => t);
    return { trades: safeTrades };
  });

  /**
   * GET /trades/history
   * All trades (active + completed) for the authenticated user, newest first.
   */
  app.get('/trades/history', async (request) => {
    const { status, page, limit } = request.query as { status?: string; page?: string; limit?: string };
    const trades = await tradeService.getTradeHistory(
      request.user.id,
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20
    );
    return { trades };
  });

  /**
   * GET /trades/:id
   * Get trade detail (only for participants).
   */
  app.get('/trades/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { trade, merchant_unavailable, seller_username } =
      await tradeService.getTradeDetailForParticipant(id, request.user.id);

    const { secret_enc, secret_nonce, ...safeTrade } = trade;
    return { trade: safeTrade, merchant_unavailable, seller_username };
  });

  /**
   * POST /trades/:id/lock
   * Backend calls Soroban contract lock() and returns the tx hash.
   */
  app.post('/trades/:id/lock', async (request) => {
    const { id } = request.params as { id: string };
    return tradeService.lockTrade(request, id, request.user.id);
  });

  /**
   * POST /trades/:id/reveal
   * Seller confirms cash was received. Enables secret access.
   */
  app.post('/trades/:id/reveal', async (request) => {
    const { id } = request.params as { id: string };
    return tradeService.revealTrade(request, id, request.user.id);
  });

  /**
   * GET /trades/:id/secret
   * Seller gets the HTLC secret to show QR to buyer.
   * Only available in 'revealing' state.
   */
  app.get('/trades/:id/secret', async (request) => {
    const { id } = request.params as { id: string };
    return tradeService.getTradeSecret(
      request,
      id,
      request.user.id,
      request.ip,
      request.headers['user-agent'] || 'unknown',
    );
  });

  /**
   * POST /trades/:id/complete
   * Buyer confirms cash received. Backend calls release() on Soroban and returns the tx hash.
   */
  app.post('/trades/:id/complete', async (request) => {
    const { id } = request.params as { id: string };
    return tradeService.completeTrade(request, id, request.user.id);
  });

  /**
   * POST /trades/:id/cancel
   *
   * Returns `{ status, refund_expected, lock_tx_hash }` for client copy (#20). Errors use `{ error, message }`
   * (`ConflictError`, `ForbiddenError`, …) from the global Fastify error handler.
   */
  app.post('/trades/:id/cancel', async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = (request.body as { reason?: string } | undefined) ?? {};
    return tradeService.cancelTrade(request, id, request.user.id, reason);
  });

  /**
   * POST /trades/:id/refund
   *
   * Buyer triggers on-chain refund for an expired trade. Calls refund() on the Soroban contract
   * and transitions the trade to 'refunded' status. Returns `{ status, refund_tx_hash }`.
   * Errors use `{ error, message }` via the global Fastify error handler.
   */
  app.post('/trades/:id/refund', async (request) => {
    const { id } = request.params as { id: string };
    return tradeService.refundTrade(request, id, request.user.id);
  });

  /**
   * GET /trades/:id/audit
   * Ordered trade transition audit trail for support/ops.
   */
  app.get('/trades/:id/audit', async (request) => {
    const { id } = request.params as { id: string };
    const audit = await tradeService.getTradeAuditTrail(id, request.user.id);
    return { audit };
  });

  /**
   * GET /audit/lookup?request_id=<uuid>
   * Look up audit events by correlation ID. Useful for support when a user
   * reports a support code — support can find the request_id from logs and
   * query this endpoint to see exactly what happened.
   */
  app.get('/audit/lookup', {
    schema: {
      querystring: {
        type: 'object',
        required: ['request_id'],
        properties: {
          request_id: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    const { request_id } = request.query as { request_id: string };
    const events = await tradeService.lookupAuditByRequestId(request_id);
    return { audit: events };
  });

  /**
   * GET /merchants/me/trades
   * List incoming trades for the authenticated merchant, filtered by state.
   * Returns trades where merchant is the seller, newest first.
   */
  app.get('/merchants/me/trades', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            enum: ['all', 'pending', 'locked', 'revealing', 'completed', 'cancelled', 'expired', 'refunded'],
            default: 'all'
          },
        },
      },
    },
  }, async (request) => {
    const { state } = request.query as { state?: string };
    const trades = await tradeService.getMerchantTrades(request.user.id, state || 'all');
    return { trades };
  });
}
