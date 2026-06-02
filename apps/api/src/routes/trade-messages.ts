/**
 * Trade Messages API Routes
 * 
 * Real-time messaging backend for buyer-merchant chat.
 * All endpoints enforce participant authorization via assertTradeParticipant().
 * Messages are gated to the trade — no cross-trade leakage.
 * 
 * Real-time delivery: Short polling (3s interval) — no WebSocket infrastructure exists.
 * Frontend will poll GET /trades/:id/messages at 3s intervals with visibility state pausing.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { assertTradeParticipant, getUserRole } from '../lib/trade-auth.js';
import db from '../db/schema.js';

interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  senderRole: 'buyer' | 'merchant';
  body: string;
  createdAt: string;
  readAt: string | null;
  isOwn: boolean;
}

interface GetMessagesResponse {
  messages: TradeMessage[];
  hasMore: boolean;
  oldest: string | null;
}

/**
 * Sanitize message body: strip HTML tags (simple approach).
 * Production should use a more robust HTML sanitizer like DOMPurify or xss.
 */
function sanitizeBody(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Convert DB row to TradeMessage object.
 */
function dbRowToMessage(
  row: any,
  tradeId: string,
  userId: string,
  trade: any
): TradeMessage {
  return {
    id: row.id,
    tradeId,
    senderId: row.sender_id,
    senderRole: getUserRole(trade, row.sender_id),
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    isOwn: row.sender_id === userId,
  };
}

export async function tradeMessagesRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /trades/:id/messages
  // Fetch messages for a trade with optional pagination.
  // Side effect: mark unread messages from OTHER participant as read.
  fastify.get(
    '/trades/:id/messages',
    { preHandler: authMiddleware },
    async (request: FastifyRequest & { user: any }, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };
      const { before, limit: rawLimit } = request.query as {
        before?: string;
        limit?: string;
      };

      const userId = request.user.id;
      const limit = Math.min(Math.max(parseInt(rawLimit ?? '50', 10) || 50, 1), 50);

      try {
        // 1. Authorize participant
        const trade = await assertTradeParticipant(tradeId, userId);

        // 2. Query messages
        const query =
          before
            ? `
              SELECT id, trade_id, sender_id, body, created_at, read_at
              FROM trade_messages
              WHERE trade_id = $1 AND created_at < $2
              ORDER BY created_at ASC
              LIMIT $3
            `
            : `
              SELECT id, trade_id, sender_id, body, created_at, read_at
              FROM trade_messages
              WHERE trade_id = $1
              ORDER BY created_at ASC
              LIMIT $2
            `;

        const params = before ? [tradeId, before, limit] : [tradeId, limit];
        const rows = await db.getMany(query, params);

        // 3. Format response
        const messages = rows.map((row) =>
          dbRowToMessage(row, tradeId, userId, trade)
        );

        const oldest = messages.length > 0 ? messages[0].createdAt : null;
        const hasMore = messages.length === limit;

        // 4. Side effect (fire-and-forget): mark unread messages from OTHER participant as read
        db.execute(
          `UPDATE trade_messages
           SET read_at = NOW()
           WHERE trade_id = $1 AND sender_id != $2 AND read_at IS NULL`,
          [tradeId, userId]
        ).catch((err) => fastify.log.warn('Failed to mark messages as read:', err));

        return reply.send({
          messages,
          hasMore,
          oldest,
        } as GetMessagesResponse);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        if (error.statusCode === 403) {
          return reply.status(403).send({ error: 'Forbidden', message: error.message });
        }
        fastify.log.error('GET /trades/:id/messages error:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  // POST /trades/:id/messages
  // Send a message to a trade.
  // Checks: participant authorization, trade is not closed, body is valid.
  fastify.post(
    '/trades/:id/messages',
    { preHandler: authMiddleware },
    async (request: FastifyRequest & { user: any }, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };
      const { body: rawBody } = request.body as { body?: string };

      const userId = request.user.id;

      try {
        // 1. Validate body
        if (!rawBody || typeof rawBody !== 'string') {
          return reply.status(422).send({
            error: 'Unprocessable Entity',
            message: 'body is required and must be a string',
          });
        }

        const body = sanitizeBody(rawBody);
        if (body.length === 0 || body.length > 2000) {
          return reply.status(422).send({
            error: 'Unprocessable Entity',
            message: 'Message body must be between 1 and 2000 characters',
          });
        }

        // 2. Authorize participant
        const trade = await assertTradeParticipant(tradeId, userId);

        // 3. Check trade status — cannot send to closed trades
        const terminalStatuses = ['completed', 'cancelled', 'expired', 'refunded'];
        if (terminalStatuses.includes(trade.status)) {
          return reply.status(422).send({
            error: 'Unprocessable Entity',
            message: 'Cannot send messages to a closed trade',
          });
        }

        // 4. Insert message
        const result = await db.getOne(
          `INSERT INTO trade_messages (trade_id, sender_id, body, created_at, read_at)
           VALUES ($1, $2, $3, NOW(), NULL)
           RETURNING id, trade_id, sender_id, body, created_at, read_at`,
          [tradeId, userId, body]
        );

        const message = dbRowToMessage(result, tradeId, userId, trade);

        // Fire-and-forget: could emit WebSocket event here if socket.io was installed
        // await io.to(`trade:${tradeId}`).emit('new_message', message);
        // For now, polling will pick it up on next request.

        return reply.status(201).send(message);
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        if (error.statusCode === 403) {
          return reply.status(403).send({ error: 'Forbidden', message: error.message });
        }
        fastify.log.error('POST /trades/:id/messages error:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );

  // POST /trades/:id/messages/read
  // Explicit read receipt: mark all unread messages from OTHER participant as read.
  // Use case: when user opens the chat tab (vs relying on GET side effect).
  fastify.post(
    '/trades/:id/messages/read',
    { preHandler: authMiddleware },
    async (request: FastifyRequest & { user: any }, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };
      const userId = request.user.id;

      try {
        // 1. Authorize participant
        await assertTradeParticipant(tradeId, userId);

        // 2. Mark unread messages from OTHER participant as read
        await db.execute(
          `UPDATE trade_messages
           SET read_at = NOW()
           WHERE trade_id = $1 AND sender_id != $2 AND read_at IS NULL`,
          [tradeId, userId]
        );

        // 3. Return 204 No Content
        return reply.status(204).send();
      } catch (error: any) {
        if (error.statusCode === 404) {
          return reply.status(404).send({ error: 'Not Found', message: error.message });
        }
        if (error.statusCode === 403) {
          return reply.status(403).send({ error: 'Forbidden', message: error.message });
        }
        fastify.log.error('POST /trades/:id/messages/read error:', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
      }
    }
  );
}
