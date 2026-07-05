import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { verifyWebhookSignature } from "../lib/webhook-auth.js";
import db from "../db/schema.js";
import {
  createQuote,
  createOrder,
  getOrder,
  regenerateOrderTx,
  getCetesIdentifier,
} from "../services/etherfuse.service.js";

interface RampUserRow {
  stellar_address: string;
  etherfuse_customer_id: string | null;
  etherfuse_bank_account_id: string | null;
}

async function requireOnboardedUser(userId: string): Promise<RampUserRow | null> {
  const user = await db.getOne<RampUserRow>(
    "SELECT stellar_address, etherfuse_customer_id, etherfuse_bank_account_id FROM users WHERE id = $1",
    [userId]
  );
  if (!user?.etherfuse_customer_id || !user?.etherfuse_bank_account_id) {
    return null;
  }
  return user;
}

export async function rampRoutes(fastify: FastifyInstance): Promise<void> {
  // Get quote: MXN->CETES (onramp) or CETES->MXN (offramp).
  fastify.post<{ Body: { type: "onramp" | "offramp"; sourceAmount: string } }>(
    "/defi/ramp/quote",
    { preHandler: [authMiddleware] },
    async (request: any, reply) => {
      if (!process.env.ETHERFUSE_API_KEY) {
        return reply.status(503).send({ error: "Etherfuse ramp not configured" });
      }

      const { type, sourceAmount } = request.body ?? {};
      if (!type || !sourceAmount) {
        return reply.status(400).send({ error: "type y sourceAmount son requeridos" });
      }
      const amount = parseFloat(sourceAmount);
      if (isNaN(amount) || amount <= 0) {
        return reply.status(400).send({ error: "sourceAmount invalido" });
      }

      const user = await requireOnboardedUser(request.user.id);
      if (!user) {
        return reply.status(403).send({ error: "KYC requerido antes de cotizar" });
      }

      try {
        const cetesIdentifier = await getCetesIdentifier(user.stellar_address);
        const quote = await createQuote({
          quoteId: randomUUID(),
          customerId: user.etherfuse_customer_id!,
          sourceAmount,
          walletAddress: user.stellar_address,
          quoteAssets:
            type === "onramp"
              ? { type: "onramp", sourceAsset: "MXN", targetAsset: cetesIdentifier }
              : { type: "offramp", sourceAsset: cetesIdentifier, targetAsset: "MXN" },
        });

        return reply.send({
          quoteId: quote.quoteId,
          type,
          exchangeRate: quote.exchangeRate,
          sourceAmount: quote.sourceAmount,
          destinationAmount: quote.destinationAmount,
          feeAmount: quote.feeAmount,
          expiresAt: quote.expiresAt,
        });
      } catch (error) {
        fastify.log.error(error, "Failed to create Etherfuse quote");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );

  // Create order: returns CLABE deposit instructions (onramp) or anchor account+memo (offramp).
  fastify.post<{ Body: { quoteId: string; useAnchor?: boolean } }>(
    "/defi/ramp/order",
    { preHandler: [authMiddleware] },
    async (request: any, reply) => {
      if (!process.env.ETHERFUSE_API_KEY) {
        return reply.status(503).send({ error: "Etherfuse ramp not configured" });
      }

      const { quoteId, useAnchor } = request.body ?? {};
      if (!quoteId) {
        return reply.status(400).send({ error: "quoteId es requerido" });
      }

      const user = await requireOnboardedUser(request.user.id);
      if (!user) {
        return reply.status(403).send({ error: "KYC requerido antes de ordenar" });
      }

      try {
        const result = await createOrder({
          orderId: randomUUID(),
          quoteId,
          bankAccountId: user.etherfuse_bank_account_id!,
          publicKey: user.stellar_address,
          useAnchor,
        });

        if ("offramp" in result) {
          return reply.send(result.offramp);
        }
        return reply.send(result.onramp);
      } catch (error) {
        fastify.log.error(error, "Failed to create Etherfuse order");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );

  // Poll order status.
  fastify.get<{ Params: { orderId: string } }>(
    "/defi/ramp/order/:orderId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { orderId } = request.params;
      try {
        const order = await getOrder(orderId);
        return reply.send({ orderId: order.orderId, status: order.status, type: order.orderType });
      } catch (error) {
        if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
          return reply.status(404).send({ error: "Orden no encontrada" });
        }
        fastify.log.error(error, "Failed to fetch Etherfuse order");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );

  // Regenerate expired Stellar transaction (offramp anchor mode, or stale onramp claim TX).
  fastify.post<{ Params: { orderId: string } }>(
    "/defi/ramp/order/:orderId/regenerate_tx",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { orderId } = request.params;
      try {
        const { status, body } = await regenerateOrderTx(orderId);
        return reply.status(status).send(body ?? {});
      } catch (error) {
        fastify.log.error(error, "Failed to regenerate Etherfuse order tx");
        return reply.status(503).send({ error: "Etherfuse API unavailable" });
      }
    }
  );

  // Webhook endpoints (Etherfuse calls these on order/KYC status changes).
  // One URL per event type — see docs/SPEI_ANCHOR_PLAN.md for why (each
  // POST /ramp/webhook subscription gets its own signing secret, and the
  // X-Signature header doesn't tell you which one to verify against).
  fastify.post<{ Body: unknown }>("/defi/ramp/webhook/order", async (request, reply) => {
    const signature = request.headers["x-signature"] as string | undefined;
    const secret = process.env.ETHERFUSE_WEBHOOK_SECRET_ORDER;
    const { valid, error } = verifyWebhookSignature(request.body, signature, secret);
    if (!valid) {
      return reply.status(401).send({ error: `webhook signature verification failed: ${error}` });
    }
    fastify.log.info(request.body, "Etherfuse order_updated webhook");
    return reply.status(200).send({ received: true });
  });

  fastify.post<{ Body: unknown }>("/defi/ramp/webhook/kyc", async (request, reply) => {
    const signature = request.headers["x-signature"] as string | undefined;
    const secret = process.env.ETHERFUSE_WEBHOOK_SECRET_KYC;
    const { valid, error } = verifyWebhookSignature(request.body, signature, secret);
    if (!valid) {
      return reply.status(401).send({ error: `webhook signature verification failed: ${error}` });
    }
    fastify.log.info(request.body, "Etherfuse kyc_updated webhook");
    return reply.status(200).send({ received: true });
  });
}
