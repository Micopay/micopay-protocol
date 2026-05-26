import {
  createMerchant,
  getMerchantByUserId,
  getVerifiedMerchants,
  type CreateMerchantInput,
  type MerchantRow,
  type PublicMerchantRow,
} from "../db/merchants.js";
import { ConflictError, UnprocessableEntityError } from "../utils/errors.js";
import { query } from "../db/schema.js";

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type { CreateMerchantInput };

// ── Tier definitions ─────────────────────────────────────────────────────────
const TIERS = [
  { name: "maestro", minTrades: 100, minCompletion: 0.95 },
  { name: "experto", minTrades: 30, minCompletion: 0.88 },
  { name: "activo", minTrades: 10, minCompletion: 0.80 },
  { name: "espora", minTrades: 0, minCompletion: 0.0 },
] as const;

function getTier(tradesCompleted: number, completionRate: number): typeof TIERS[number]["name"] {
  return TIERS.find(
    (t) => tradesCompleted >= t.minTrades && completionRate >= t.minCompletion
  )?.name ?? "espora";
}

// ── Reputation calculation ───────────────────────────────────────────────────

/**
 * Calculate and update merchant reputation from trade history.
 * Queries micopay backend's trades table for completed trades.
 */
export async function calculateMerchantReputation(userId: string): Promise<void> {
  // Query micopay backend for trade statistics
  const result = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'completed') as completed_trades,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_trades,
      COUNT(*) as total_trades,
      AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60) FILTER (WHERE status = 'completed') as avg_time_minutes,
      SUM(amount_mxn) FILTER (WHERE status = 'completed') as total_volume_mxn
    FROM trades
    WHERE seller_id = $1
  `, [userId]);

  const stats = result.rows[0];

  if (!stats) {
    // No trades yet - reset to defaults
    await query(`
      UPDATE merchants 
      SET trades_completed = 0,
          completion_rate = 0,
          avg_time_minutes = 0,
          tier = 'espora',
          total_volume_usdc = 0,
          last_trade_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
    `, [userId]);
    return;
  }

  const completedTrades = parseInt(stats.completed_trades) || 0;
  const cancelledTrades = parseInt(stats.cancelled_trades) || 0;
  const totalTrades = parseInt(stats.total_trades) || 0;
  const avgTimeMinutes = stats.avg_time_minutes ? Math.round(parseFloat(stats.avg_time_minutes)) : 0;
  const totalVolumeMXN = parseFloat(stats.total_volume_mxn) || 0;

  // Convert MXN to USDC (approximate: 1 USDC ≈ 17 MXN)
  const totalVolumeUSDC = totalVolumeMXN / 17;

  // Calculate completion rate
  const completionRate = totalTrades > 0 ? completedTrades / totalTrades : 0;

  // Determine tier
  const tier = getTier(completedTrades, completionRate);

  // Get last trade timestamp
  const lastTradeResult = await query(`
    SELECT updated_at FROM trades 
    WHERE seller_id = $1 AND status = 'completed'
    ORDER BY updated_at DESC LIMIT 1
  `, [userId]);

  const lastTradeAt = lastTradeResult.rows[0]?.updated_at || null;

  // Update merchant record
  await query(`
    UPDATE merchants 
    SET trades_completed = $1,
        completion_rate = $2,
        avg_time_minutes = $3,
        tier = $4,
        total_volume_usdc = $5,
        last_trade_at = $6,
        updated_at = NOW()
    WHERE user_id = $7
  `, [
    completedTrades,
    completionRate,
    avgTimeMinutes,
    tier,
    totalVolumeUSDC,
    lastTradeAt,
    userId,
  ]);
}

export async function registerMerchant(
  input: CreateMerchantInput,
): Promise<MerchantRow> {
  if (input.display_name.length > 60) {
    throw new UnprocessableEntityError(
      "display_name must not exceed 60 characters",
    );
  }

  if (!HH_MM_REGEX.test(input.hours_open)) {
    throw new UnprocessableEntityError(
      "hours_open must match HH:MM format (00:00–23:59)",
    );
  }

  if (!HH_MM_REGEX.test(input.hours_close)) {
    throw new UnprocessableEntityError(
      "hours_close must match HH:MM format (00:00–23:59)",
    );
  }

  if (input.spread_percent < 0) {
    throw new UnprocessableEntityError(
      "spread_percent must be greater than or equal to 0",
    );
  }

  if (input.min_amount <= 0) {
    throw new UnprocessableEntityError("min_amount must be greater than 0");
  }

  if (input.max_amount <= input.min_amount) {
    throw new UnprocessableEntityError(
      "max_amount must be greater than min_amount",
    );
  }

  const existing = await getMerchantByUserId(input.user_id);
  if (existing) {
    throw new ConflictError("A merchant record already exists for this user");
  }

  const merchant = await createMerchant(input);

  // Initialize reputation to defaults
  await calculateMerchantReputation(input.user_id);

  return merchant;
}

export async function listVerifiedMerchants(): Promise<PublicMerchantRow[]> {
  return getVerifiedMerchants();
}

export async function getMerchantById(id: string): Promise<PublicMerchantRow | null> {
  return getOne<PublicMerchantRow>(`
    SELECT id, display_name, latitude, longitude, address_text,
           hours_open, hours_close, base_rate, spread_percent, min_amount, max_amount,
           trades_completed, completion_rate, avg_time_minutes, tier,
           total_volume_usdc, last_trade_at
    FROM merchants
    WHERE id = $1 AND verification_status = 'verified'
  `, [id]);
}
