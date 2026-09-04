/**
 * CASH-1: Trade Flow and Provider Types
 * 
 * Shared TypeScript types for trade flows and provider identification.
 */

/**
 * Product flow type for trades.
 * - deposit: Cash deposit (buyer deposits cash with merchant to receive USDC)
 * - cash_out: Cash withdrawal (user withdraws cash from their USDC balance)
 */
export type TradeFlow = 'deposit' | 'cash_out';

/**
 * Request payload for creating a new trade.
 */
export interface CreateTradeRequest {
  seller_id: string;
  amount_mxn: number;
  flow: TradeFlow;
  // Note: provider_id is NEVER accepted from client - it's server-derived
}

/**
 * Trade response object with flow and provider information.
 */
export interface TradeResponse {
  id: string;
  seller_id: string;
  buyer_id: string;
  amount_mxn: number;
  amount_stroops: string;
  platform_fee_mxn: number;
  seller_fee_mxn?: number;
  secret_hash: string;
  status: string;
  
  // CASH-1: New fields
  flow: TradeFlow;
  provider_id: string;
  
  // Stellar transaction hashes
  stellar_trade_id?: string;
  lock_tx_hash?: string;
  release_tx_hash?: string;
  
  // Timestamps
  created_at: string;
  locked_at?: string;
  reveal_requested_at?: string;
  completed_at?: string;
  expires_at: string;
}

/**
 * Trade history item (limited fields for list views)
 */
export interface TradeHistoryItem {
  id: string;
  status: string;
  amount_mxn: number;
  platform_fee_mxn: number;
  lock_tx_hash?: string;
  release_tx_hash?: string;
  created_at: string;
  completed_at?: string;
  seller_id: string;
  buyer_id: string;
  
  // CASH-1: New fields
  flow: TradeFlow;
  provider_id: string;
}

/**
 * Helper to determine provider based on flow.
 * This logic must match the database constraint and service layer.
 */
export function deriveProviderId(flow: TradeFlow, sellerId: string, buyerId: string): string {
  return flow === 'deposit' ? sellerId : buyerId;
}

/**
 * Validate that flow and provider_id are consistent.
 * Returns true if the combination is valid.
 */
export function isValidFlowProviderCombination(
  flow: TradeFlow,
  providerId: string,
  sellerId: string,
  buyerId: string,
): boolean {
  if (flow === 'deposit') {
    return providerId === sellerId;
  } else if (flow === 'cash_out') {
    return providerId === buyerId;
  }
  return false;
}
