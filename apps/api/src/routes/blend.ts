import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";

export async function blendRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /defi/blend/status
   * Authenticated. Returns user's Blend position status.
   */
  fastify.get(
    "/defi/blend/status",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = (request as any).user.id;

      // In productized demo, we return a simulated position
      return reply.send({
        available_liquidity_usdc: 500.0,
        borrow_limit_usdc: 1200.0,
        current_borrowed_usdc: 0.0,
        health_factor: 1.0,
        collateral_assets: [
          { symbol: "XLM", amount: "1500", value_usdc: "250.0" },
          { symbol: "USDC", amount: "250", value_usdc: "250.0" }
        ],
        note: "Data simulated for MicoPay Demo"
      });
    }
  );

  /**
   * POST /defi/blend/borrow
   * Authenticated. Initiates a borrow request on Blend.
   */
  fastify.post(
    "/defi/blend/borrow",
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: "object",
          required: ["amount", "asset"],
          properties: {
            amount: { type: "number" },
            asset: { type: "string", enum: ["USDC", "XLM"] }
          }
        }
      }
    },
    async (request, reply) => {
      const { amount, asset } = request.body as { amount: number; asset: string };
      
      // Simulate on-chain transaction
      return reply.send({
        hash: `sim_blend_borrow_${Date.now()}`,
        status: "success",
        amount,
        asset,
        explorer_url: `https://stellar.expert/explorer/testnet/tx/sim_blend_borrow_${Date.now()}`,
        message: `Successfully borrowed ${amount} ${asset} from Blend`
      });
    }
  );
}
