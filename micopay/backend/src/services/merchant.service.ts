import db from '../db/schema.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export const GLOBAL_MIN_AMOUNT_MXN = 100;
export const GLOBAL_MAX_AMOUNT_MXN = 50000;

export interface MerchantConfig {
  user_id: string;
  rate_percent: number;
  min_trade_mxn: number;
  max_trade_mxn: number;
  daily_cap_mxn: number;
  latitude: number | null;
  longitude: number | null;
  address_text: string | null;
  updated_at: string;
}

export interface AvailableMerchant {
  seller_id: string;
  username: string;
  rate_percent: number;
  min_trade_mxn: number;
  max_trade_mxn: number;
  daily_cap_mxn: number;
  latitude: number;
  longitude: number;
  address_text: string | null;
  distance_km: number;
  /** Payout the buyer receives for the requested amount */
  payout_mxn: number;
}

export interface AvailableMerchantsQuery {
  lat: number;
  lng: number;
  radius_km: number;
  amount_mxn: number;
  /** 'cashout' | 'deposit' — reserved for future flow-specific filtering */
  flow?: string;
}

/**
 * Haversine distance in km between two lat/lng points.
 * Computed in SQL to avoid pulling all rows into Node.
 */
const HAVERSINE_SQL = `
  (6371 * acos(
    LEAST(1.0, cos(radians($1)) * cos(radians(mc.latitude))
    * cos(radians(mc.longitude) - radians($2))
    + sin(radians($1)) * sin(radians(mc.latitude)))
  ))
`.trim();

export interface UpdateMerchantConfigInput {
  ratePercent: number;
  minTradeMxn: number;
  maxTradeMxn: number;
  dailyCapMxn: number;
}

const DEFAULT_CONFIG = {
  rate_percent: 1.0,
  min_trade_mxn: 100,
  max_trade_mxn: 50000,
  daily_cap_mxn: 250000,
};

function validateConfig(input: UpdateMerchantConfigInput) {
  const { ratePercent, minTradeMxn, maxTradeMxn, dailyCapMxn } = input;

  if (ratePercent < 0 || ratePercent > 100) {
    throw new BadRequestError('rate_percent must be between 0 and 100');
  }

  if (minTradeMxn < GLOBAL_MIN_AMOUNT_MXN || minTradeMxn > GLOBAL_MAX_AMOUNT_MXN) {
    throw new BadRequestError(`min_trade_mxn must be between ${GLOBAL_MIN_AMOUNT_MXN} and ${GLOBAL_MAX_AMOUNT_MXN}`);
  }

  if (maxTradeMxn < GLOBAL_MIN_AMOUNT_MXN || maxTradeMxn > GLOBAL_MAX_AMOUNT_MXN) {
    throw new BadRequestError(`max_trade_mxn must be between ${GLOBAL_MIN_AMOUNT_MXN} and ${GLOBAL_MAX_AMOUNT_MXN}`);
  }

  if (minTradeMxn > maxTradeMxn) {
    throw new BadRequestError('min_trade_mxn cannot exceed max_trade_mxn');
  }

  if (dailyCapMxn < maxTradeMxn) {
    throw new BadRequestError('daily_cap_mxn must be greater than or equal to max_trade_mxn');
  }
}

export async function getOrCreateMerchantConfig(userId: string): Promise<MerchantConfig> {
  const user = await db.getOne('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw new NotFoundError('Merchant not found');

  const existing = await db.getOne<MerchantConfig>(
    `SELECT user_id, rate_percent, min_trade_mxn, max_trade_mxn, daily_cap_mxn,
            latitude, longitude, address_text, updated_at
     FROM merchant_configs WHERE user_id = $1`,
    [userId],
  );
  if (existing) return existing;

  const created = await db.getOne<MerchantConfig>(
    `INSERT INTO merchant_configs (user_id, rate_percent, min_trade_mxn, max_trade_mxn, daily_cap_mxn, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING user_id, rate_percent, min_trade_mxn, max_trade_mxn, daily_cap_mxn,
               latitude, longitude, address_text, updated_at`,
    [
      userId,
      DEFAULT_CONFIG.rate_percent,
      DEFAULT_CONFIG.min_trade_mxn,
      DEFAULT_CONFIG.max_trade_mxn,
      DEFAULT_CONFIG.daily_cap_mxn,
    ],
  );

  return created!;
}

export async function updateMerchantConfig(userId: string, input: UpdateMerchantConfigInput): Promise<MerchantConfig> {
  validateConfig(input);

  await getOrCreateMerchantConfig(userId);

  const updated = await db.getOne<MerchantConfig>(
    `UPDATE merchant_configs
     SET rate_percent = $2,
         min_trade_mxn = $3,
         max_trade_mxn = $4,
         daily_cap_mxn = $5,
         updated_at = NOW()
     WHERE user_id = $1
     RETURNING user_id, rate_percent, min_trade_mxn, max_trade_mxn, daily_cap_mxn,
               latitude, longitude, address_text, updated_at`,
    [userId, input.ratePercent, input.minTradeMxn, input.maxTradeMxn, input.dailyCapMxn],
  );

  return updated!;
}

/**
 * GET /merchants/available
 *
 * Returns merchants who:
 *  - have merchant_available = true
 *  - have a location set (latitude/longitude NOT NULL)
 *  - are within radius_km of the caller's position
 *  - accept the requested amount_mxn (min_trade_mxn ≤ amount ≤ max_trade_mxn)
 *
 * Sorted by haversine distance ascending (nearest first).
 */
export async function getAvailableMerchants(
  query: AvailableMerchantsQuery,
): Promise<AvailableMerchant[]> {
  const { lat, lng, radius_km, amount_mxn } = query;

  const rows = await db.getMany<{
    seller_id: string;
    username: string;
    rate_percent: string;
    min_trade_mxn: number;
    max_trade_mxn: number;
    daily_cap_mxn: number;
    latitude: string;
    longitude: string;
    address_text: string | null;
    distance_km: string;
  }>(
    `SELECT
       u.id            AS seller_id,
       u.username,
       mc.rate_percent,
       mc.min_trade_mxn,
       mc.max_trade_mxn,
       mc.daily_cap_mxn,
       mc.latitude,
       mc.longitude,
       mc.address_text,
       ${HAVERSINE_SQL} AS distance_km
     FROM merchant_configs mc
     JOIN users u ON u.id = mc.user_id
     WHERE u.merchant_available = true
       AND mc.latitude  IS NOT NULL
       AND mc.longitude IS NOT NULL
       AND mc.min_trade_mxn <= $3
       AND mc.max_trade_mxn >= $3
       AND ${HAVERSINE_SQL} <= $4
     ORDER BY distance_km ASC
     LIMIT 50`,
    [lat, lng, amount_mxn, radius_km],
  );

  return rows.map((r) => {
    const ratePercent = parseFloat(r.rate_percent as unknown as string);
    const distanceKm = parseFloat(r.distance_km as unknown as string);
    const payoutMxn = parseFloat(
      (amount_mxn * (1 - ratePercent / 100)).toFixed(2),
    );

    return {
      seller_id: r.seller_id,
      username: r.username,
      rate_percent: ratePercent,
      min_trade_mxn: r.min_trade_mxn,
      max_trade_mxn: r.max_trade_mxn,
      daily_cap_mxn: r.daily_cap_mxn,
      latitude: parseFloat(r.latitude as unknown as string),
      longitude: parseFloat(r.longitude as unknown as string),
      address_text: r.address_text,
      distance_km: Math.round(distanceKm * 1000) / 1000,
      payout_mxn: payoutMxn,
    };
  });
}
