import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";
import { config } from "../config.js";
import db from "../db/schema.js";
import * as tradeService from "../services/trade.service.js";
import {
  assertCanOpenDispute,
  recordTradeDispute,
  touchUserDevice,
  getClientContext,
} from "../services/abuse.service.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

const messageRateLimit = createRateLimiter({
  windowMs: config.messageRateLimitWindowMs,
  max: config.messageRateLimitMax,
  keyGenerator: (req) => `${req.user?.id ?? req.ip}:messages`,
});

const disputeRateLimit = createRateLimiter({
  windowMs: config.disputeRateLimitWindowMs,
  max: config.disputeRateLimitMax,
  keyGenerator: (req) => `${req.user?.id ?? req.ip}:disputes`,
});

export async function tradeSafetyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  /**
   * GET /trades/:id/messages
   * Trade-scoped chat messages (rate limited).
   */
  app.get("/trades/:id/messages", {
    preHandler: [messageRateLimit],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await tradeService.getTradeById(id, request.user.id);

    const messages = await db.getMany(
      `SELECT id, trade_id, sender_id, body, created_at
       FROM trade_messages
       WHERE trade_id = $1
       ORDER BY created_at ASC`,
      [id],
    );

    return { messages };
  });

  /**
   * POST /trades/:id/messages
   */
  app.post("/trades/:id/messages", {
    preHandler: [messageRateLimit],
    schema: {
      body: {
        type: "object",
        required: ["body"],
        properties: {
          body: { type: "string", minLength: 1, maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { body } = request.body as { body: string };

    await tradeService.getTradeById(id, request.user.id);
    await touchUserDevice(request.user.id, getClientContext(request));

    const message = await db.getOne(
      `INSERT INTO trade_messages (trade_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, trade_id, sender_id, body, created_at`,
      [id, request.user.id, body.trim()],
    );

    reply.status(201);
    return { message };
  });

  /**
   * POST /trades/:id/disputes
   * Open a trade dispute (rate limited; may auto-pause merchant).
   */
  app.post("/trades/:id/disputes", {
    preHandler: [disputeRateLimit],
    schema: {
      body: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: { type: "string", minLength: 10, maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };

    const trade = await tradeService.getTradeById(id, request.user.id);
    if (!["locked", "revealing", "completed"].includes(trade.status)) {
      throw new ValidationError(
        "DISPUTE_NOT_ALLOWED",
        "Solo puedes abrir una disputa cuando la operación está en curso o completada.",
        `Dispute not allowed in status ${trade.status}`,
      );
    }

    await assertCanOpenDispute(request.user.id, id);

    const dispute = await db.getOne<{ id: string }>(
      `INSERT INTO trade_disputes (trade_id, opener_id, reason, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING id`,
      [id, request.user.id, reason.trim()],
    );

    if (!dispute) {
      throw new NotFoundError("No se pudo crear la disputa");
    }

    await recordTradeDispute({
      tradeId: id,
      sellerId: trade.seller_id,
      openerId: request.user.id,
      disputeId: dispute.id,
    });

    reply.status(201);
    return {
      dispute: {
        id: dispute.id,
        trade_id: id,
        status: "open",
      },
    };
  });
}
