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
   * GET /merchants/me/config
   * Authenticated. Returns the merchant configuration for the requesting user.
   */
  app.get(
    "/merchants/me/config",
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const merchant = await merchantService.getMerchantByUserId(userId);
      if (!merchant) {
        return reply.status(404).send({ error: "Merchant record not found" });
      }

      return reply.send({
        config: {
          rate_percent: merchant.spread_percent,
          min_trade_mxn: merchant.min_amount,
          max_trade_mxn: merchant.max_amount,
          daily_cap_mxn: 250000, // Hardcoded for now as per frontend expectations
        },
      });
    },
  );

  /**
   * PUT /merchants/me/config
   * Authenticated. Updates the merchant configuration.
   */
  app.put(
    "/merchants/me/config",
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: "object",
          properties: {
            rate_percent: { type: "number" },
            min_trade_mxn: { type: "number" },
            max_trade_mxn: { type: "number" },
            daily_cap_mxn: { type: "number" },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const body = request.body as any;

      const merchant = await merchantService.updateMerchantConfig(userId, {
        spread_percent: body.rate_percent,
        min_amount: body.min_trade_mxn,
        max_amount: body.max_trade_mxn,
      });

      return reply.send({
        config: {
          rate_percent: merchant.spread_percent,
          min_trade_mxn: merchant.min_amount,
          max_trade_mxn: merchant.max_amount,
          daily_cap_mxn: 250000,
        },
      });
    },
  );

  /**
   * PATCH /users/me/availability
   * Authenticated. Updates the merchant availability status.
   */
  app.patch(
    "/users/me/availability",
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: "object",
          required: ["availability"],
          properties: {
            availability: {
              type: "string",
              enum: ["online", "offline", "paused"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = (request as any).user.id;
      const { availability } = request.body as {
        availability: "online" | "offline" | "paused";
      };

      // Map frontend availability to DB verification_status
      // Note: 'verified' in DB acts as 'online'
      const status =
        availability === "online"
          ? "verified"
          : availability === "paused"
            ? "paused"
            : "pending"; // offline maps to pending for now

      await merchantService.updateMerchantAvailability(userId, status);
      return reply.status(204).send();
    },
  );
}
