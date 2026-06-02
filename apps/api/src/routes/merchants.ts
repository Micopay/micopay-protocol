import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import * as merchantService from "../services/merchant.service.js";
import { ConflictError, UnprocessableEntityError } from "../utils/errors.js";

export async function merchantRoutes(app: FastifyInstance) {
  /**
   * POST /merchants/register
   * Authenticated. Creates a merchant record for the requesting user.
   * Returns 201 with the created MerchantRow on success.
   */
  app.post(
    "/merchants/register",
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: "object",
          required: [
            "display_name",
            "latitude",
            "longitude",
            "address_text",
            "hours_open",
            "hours_close",
            "base_rate",
            "spread_percent",
            "min_amount",
            "max_amount",
          ],
          properties: {
            display_name: { type: "string" },
            latitude: { type: "number" },
            longitude: { type: "number" },
            address_text: { type: "string" },
            hours_open: { type: "string" },
            hours_close: { type: "string" },
            base_rate: { type: "number" },
            spread_percent: { type: "number" },
            min_amount: { type: "number" },
            max_amount: { type: "number" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        display_name: string;
        latitude: number;
        longitude: number;
        address_text: string;
        hours_open: string;
        hours_close: string;
        base_rate: number;
        spread_percent: number;
        min_amount: number;
        max_amount: number;
      };

      const user_id = (request as any).user.id as string;

      try {
        const merchant = await merchantService.registerMerchant({
          user_id,
          ...body,
        });
        return reply.status(201).send(merchant);
      } catch (err) {
        if (err instanceof ConflictError) {
          return reply.status(409).send({ error: err.message });
        }
        if (err instanceof UnprocessableEntityError) {
          return reply.status(422).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  /**
   * GET /merchants
   * Public. Returns only verified merchants with public fields.
   */
  app.get("/merchants", async (_request, reply) => {
    const merchants = await merchantService.listVerifiedMerchants();
    return reply.status(200).send(merchants);
  });

  /**
   * GET /merchants/:id
   * Public. Returns a specific verified merchant with reputation data.
   */
  app.get("/merchants/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const merchant = await merchantService.getMerchantById(id);
    if (!merchant) {
      return reply.status(404).send({ error: "Merchant not found" });
    }

    return reply.status(200).send(merchant);
  });
}
