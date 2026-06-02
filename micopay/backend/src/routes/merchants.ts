import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  getOrCreateMerchantConfig,
  updateMerchantConfig,
  getAvailableMerchants,
} from '../services/merchant.service.js';
import db from '../db/schema.js';

export async function merchantRoutes(app: FastifyInstance) {
  /**
   * GET /merchants/available
   * Public. Returns merchants near the caller that can handle the requested amount.
   *
   * Query params:
   *   lat        – caller latitude  (required)
   *   lng        – caller longitude (required)
   *   radius_km  – search radius in km (default 5, max 50)
   *   amount_mxn – trade amount in MXN (required)
   *   flow       – 'cashout' | 'deposit' (optional, reserved)
   */
  app.get('/merchants/available', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng', 'amount_mxn'],
        properties: {
          lat:        { type: 'number', minimum: -90,  maximum: 90  },
          lng:        { type: 'number', minimum: -180, maximum: 180 },
          radius_km:  { type: 'number', minimum: 0.1,  maximum: 50, default: 5 },
          amount_mxn: { type: 'number', minimum: 1 },
          flow:       { type: 'string', enum: ['cashout', 'deposit'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const q = request.query as {
      lat: number;
      lng: number;
      radius_km?: number;
      amount_mxn: number;
      flow?: string;
    };

    const merchants = await getAvailableMerchants({
      lat: q.lat,
      lng: q.lng,
      radius_km: q.radius_km ?? 5,
      amount_mxn: q.amount_mxn,
      flow: q.flow,
    });

    return reply.send({ merchants });
  });

  // ── Authenticated routes ──────────────────────────────────────────────────

  app.addHook('preHandler', authMiddleware);

  app.get('/merchants/me/config', async (request) => {
    const config = await getOrCreateMerchantConfig(request.user.id);
    return {
      config,
      daily_cap_reset_timezone: 'UTC',
      daily_cap_reset_time: '00:00',
      daily_cap_reset_note: 'Daily cap usage resets every day at 00:00 UTC.',
    };
  });

  app.put('/merchants/me/config', {
    schema: {
      body: {
        type: 'object',
        required: ['rate_percent', 'min_trade_mxn', 'max_trade_mxn', 'daily_cap_mxn'],
        properties: {
          rate_percent:  { type: 'number', minimum: 0, maximum: 100 },
          min_trade_mxn: { type: 'integer', minimum: 100, maximum: 50000 },
          max_trade_mxn: { type: 'integer', minimum: 100, maximum: 50000 },
          daily_cap_mxn: { type: 'integer', minimum: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const body = request.body as {
      rate_percent: number;
      min_trade_mxn: number;
      max_trade_mxn: number;
      daily_cap_mxn: number;
    };

    const config = await updateMerchantConfig(request.user.id, {
      ratePercent: body.rate_percent,
      minTradeMxn: body.min_trade_mxn,
      maxTradeMxn: body.max_trade_mxn,
      dailyCapMxn: body.daily_cap_mxn,
    });

    return {
      config,
      daily_cap_reset_timezone: 'UTC',
      daily_cap_reset_time: '00:00',
      daily_cap_reset_note: 'Daily cap usage resets every day at 00:00 UTC.',
    };
  });

  /**
   * PATCH /merchants/me/location
   * Authenticated. Sets or updates the merchant's location.
   */
  app.patch('/merchants/me/location', {
    schema: {
      body: {
        type: 'object',
        required: ['latitude', 'longitude'],
        properties: {
          latitude:     { type: 'number', minimum: -90,  maximum: 90  },
          longitude:    { type: 'number', minimum: -180, maximum: 180 },
          address_text: { type: 'string', maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const body = request.body as {
      latitude: number;
      longitude: number;
      address_text?: string;
    };

    // Ensure config row exists before updating location
    await getOrCreateMerchantConfig(request.user.id);

    const updated = await db.getOne(
      `UPDATE merchant_configs
       SET latitude = $2, longitude = $3, address_text = $4, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, latitude, longitude, address_text, updated_at`,
      [request.user.id, body.latitude, body.longitude, body.address_text ?? null],
    );

    return reply.send({ location: updated });
  });

  /**
   * GET /merchants/me/trades
   * Authenticated. Returns trades where the caller is the seller.
   */
  app.get('/merchants/me/trades', async (request) => {
    const q = request.query as { state?: string };

    const stateFilter = q.state && q.state !== 'all' ? q.state : null;

    const trades = await db.getMany(
      `SELECT t.id, u.username AS buyer_handle, t.amount_mxn, t.status, t.created_at
       FROM trades t
       JOIN users u ON u.id = t.buyer_id
       WHERE t.seller_id = $1
         AND ($2::text IS NULL OR t.status = $2)
       ORDER BY t.created_at DESC
       LIMIT 100`,
      [request.user.id, stateFilter],
    );

    return { trades };
  });
}
