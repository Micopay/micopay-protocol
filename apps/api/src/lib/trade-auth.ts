/**
 * Trade authorization helper: enforces participant gating.
 * Called at the start of every message endpoint.
 * 
 * Queries the trade by tradeId.
 * Checks if userId is either buyer_id or seller_id.
 * Throws 403 if not a participant, 404 if trade not found.
 * Returns the trade record so callers don't need to query twice.
 */

import db from '../db/schema.js';

export interface Trade {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  created_at: string;
  [key: string]: any; // other fields like amount_mxn, lock_tx_hash, etc.
}

export async function assertTradeParticipant(
  tradeId: string,
  userId: string
): Promise<Trade> {
  // Query the trade
  const trade = await db.getOne<Trade>(
    'SELECT * FROM trades WHERE id = $1',
    [tradeId]
  );

  // Trade not found
  if (!trade) {
    throw {
      statusCode: 404,
      message: 'Trade not found',
    };
  }

  // Check if user is a participant (buyer or seller)
  const isParticipant = trade.buyer_id === userId || trade.seller_id === userId;
  if (!isParticipant) {
    throw {
      statusCode: 403,
      message: 'You are not a participant in this trade',
    };
  }

  return trade;
}

/**
 * Helper to derive the role of a user in a trade.
 * Returns 'buyer' or 'merchant' based on trade record.
 */
export function getUserRole(trade: Trade, userId: string): 'buyer' | 'merchant' {
  return trade.buyer_id === userId ? 'buyer' : 'merchant';
}
