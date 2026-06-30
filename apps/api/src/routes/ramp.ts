import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { verifyWebhookSignature } from "../lib/webhook-auth.js";

// Stub routes for A-5 (onramp SPEI) and A-6 (offramp CETES→SPEI) — Drips
// These return the correct response shape without calling Etherfuse.
// Replace with real Etherfuse API calls once API key is available (A-3).

// In-memory order store: tracks creation time to simulate pending→completed progression.
const orderStore = new Map<string, { createdAt: number; type: "onramp" | "offramp" }>();
const ORDER_COMPLETE_AFTER_MS = 10_000; // 10s after creation → completed

const STUB_EXCHANGE_RATE = 17.5; // MXN per CETES (stub)

export async function rampRoutes(fastify: FastifyInstance): Promise<void> {
  // Register user's CLABE with Etherfuse (stub)
  fastify.post<{ Body: { clabe: string } }>(
    "/defi/bank-account",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { clabe } = request.body ?? {};
      if (!clabe || clabe.length !== 18 || !/^\d{18}$/.test(clabe)) {
        return reply.status(400).send({ error: "CLABE debe tener 18 digitos numericos" });
      }
      return reply.send({
        bankAccountId: `stub-bank-${Date.now()}`,
        clabe,
        note: "stub — Etherfuse API not connected yet",
      });
    }
  );

  // Get quote: MXN→CETES (onramp) or CETES→MXN (offramp)
  fastify.post<{
    Body: {
      type: "onramp" | "offramp";
      sourceAsset: string;
      targetAsset: string;
      sourceAmount: string;
      walletAddress?: string;
    };
  }>(
    "/defi/ramp/quote",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { type, sourceAmount } = request.body ?? {};
      if (!type || !sourceAmount) {
        return reply.status(400).send({ error: "type y sourceAmount son requeridos" });
      }

      const amount = parseFloat(sourceAmount);
      if (isNaN(amount) || amount <= 0) {
        return reply.status(400).send({ error: "sourceAmount invalido" });
      }

      const destinationAmount =
        type === "onramp"
          ? (amount / STUB_EXCHANGE_RATE).toFixed(7)   // MXN → CETES
          : (amount * STUB_EXCHANGE_RATE).toFixed(2);  // CETES → MXN

      const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

      return reply.send({
        quoteId: `stub-q-${Date.now()}`,
        type,
        exchangeRate: STUB_EXCHANGE_RATE.toString(),
        sourceAmount,
        destinationAmount,
        expiresAt,
        note: "stub — Etherfuse API not connected yet",
      });
    }
  );

  // Create order: returns CLABE deposit instructions (onramp) or anchor account+memo (offramp)
  fastify.post<{
    Body: {
      quoteId: string;
      bankAccountId: string;
      cryptoWalletId?: string;
      useAnchor?: boolean;
    };
  }>(
    "/defi/ramp/order",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { quoteId, bankAccountId, useAnchor } = request.body ?? {};
      if (!quoteId || !bankAccountId) {
        return reply.status(400).send({ error: "quoteId y bankAccountId son requeridos" });
      }

      const orderId = `stub-o-${Date.now()}`;
      const isOfframp = useAnchor === true;

      orderStore.set(orderId, {
        createdAt: Date.now(),
        type: isOfframp ? "offramp" : "onramp",
      });

      if (isOfframp) {
        return reply.send({
          orderId,
          withdrawAnchorAccount: "GDKKW2WSMQWZ63PIZBKDDBAAOBG5FP3TUHRYQ4U5RBKTFNESL5K5BJJK",
          withdrawMemo: "c3R1Ym1lbW8xMjM0NTY3ODkw", // base64: "stubmemo1234567890"
          withdrawMemoType: "hash",
          note: "stub — Etherfuse API not connected yet",
        });
      }

      return reply.send({
        orderId,
        depositClabe: "646180157000000004",
        depositAmount: "1000.00",
        depositBankName: "Etherfuse MX (stub)",
        depositAccountHolder: "Etherfuse MX",
        note: "stub — Etherfuse API not connected yet",
      });
    }
  );

  // Poll order status: pending for 10s after creation, then completed
  fastify.get<{ Params: { orderId: string } }>(
    "/defi/ramp/order/:orderId",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { orderId } = request.params;
      const order = orderStore.get(orderId);

      if (!order) {
        return reply.status(404).send({ error: "Orden no encontrada" });
      }

      const elapsed = Date.now() - order.createdAt;
      const status = elapsed >= ORDER_COMPLETE_AFTER_MS ? "completed" : "funded";

      return reply.send({
        orderId,
        status,
        type: order.type,
        note: "stub — Etherfuse API not connected yet",
      });
    }
  );

  // Regenerate expired Stellar transaction (offramp anchor mode)
  fastify.post<{ Params: { orderId: string } }>(
    "/defi/ramp/order/:orderId/regenerate_tx",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const { orderId } = request.params;
      if (!orderStore.has(orderId)) {
        return reply.status(404).send({ error: "Orden no encontrada" });
      }
      return reply.send({
        orderId,
        withdrawAnchorAccount: "GDKKW2WSMQWZ63PIZBKDDBAAOBG5FP3TUHRYQ4U5RBKTFNESL5K5BJJK",
        withdrawMemo: "c3R1Ym1lbW8xMjM0NTY3ODkw",
        withdrawMemoType: "hash",
        note: "stub — regenerated transaction",
      });
    }
  );

  // Webhook endpoint (Etherfuse calls this when SPEI arrives)
  // Protected by HMAC signature verification — see webhook-auth.ts
  fastify.post<{ Body: unknown }>(
    "/defi/ramp/webhook",
    async (request, reply) => {
      const signature = request.headers["x-webhook-signature"] as string | undefined;
      const timestamp = request.headers["x-webhook-timestamp"] as string | undefined;

      const { valid, error } = verifyWebhookSignature(request.body, signature, timestamp);
      if (!valid) {
        return reply.status(401).send({ error: `webhook signature verification failed: ${error}` });
      }

      // Stub: accept and acknowledge
      return reply.status(200).send({ received: true });
    }
  );
}
