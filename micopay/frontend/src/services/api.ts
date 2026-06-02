import axios from 'axios';
import { extractApiErrorPayload } from '../utils/apiError';
import { signChallenge, getPublicKey } from '../lib/keystore';

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const http = axios.create({ baseURL: BASE_URL });

function authHeaders(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export interface UserData {
  id: string;
  username: string;
  token: string;
}

export interface CurrentUserProfile {
  id: string;
  username: string;
  stellar_address: string;
  phone_hash?: string | null;
  deleted_at?: string | null;
  wallet_type?: string | null;
  created_at?: string;
}

export interface TradeData {
  id: string;
  status: string;
  secret_hash: string;
  amount_mxn: number;
  lock_tx_hash?: string | null;
}

export interface TradeDetailResponse {
  trade: TradeData & {
    lock_tx_hash?: string | null;
    release_tx_hash?: string | null;
    platform_fee_mxn?: number;
    seller_id?: string;
    buyer_id?: string;
    created_at?: string;
    completed_at?: string | null;
    expires_at?: string;
  };
  merchant_unavailable: boolean;
  seller_username: string | null;
}

export async function fetchTradeDetail(tradeId: string, buyerToken: string): Promise<TradeDetailResponse> {
  const res = await http.get(`/trades/${tradeId}`, authHeaders(buyerToken));
  return res.data;
}

/** Mirrors backend `CancelTradeResult` after POST /trades/:id/cancel (#20). */
export interface CancelTradeResponse {
  status: 'cancelled';
  refund_expected: boolean;
  lock_tx_hash: string | null;
}

export async function cancelTradeRequest(tradeId: string, buyerToken: string): Promise<CancelTradeResponse> {
  try {
    const res = await http.post(`/trades/${tradeId}/cancel`, {}, authHeaders(buyerToken));
    return res.data as CancelTradeResponse;
  } catch (e: unknown) {
    const { message } = extractApiErrorPayload(e);
    throw new Error(message);
  }
}

export async function patchMerchantAvailability(
    token: string,
    merchant_available: boolean,
): Promise<{ merchant_available: boolean }> {
  const res = await http.patch('/users/me', { merchant_available }, authHeaders(token));
  return res.data.user;
}

export async function registerUser(username: string): Promise<UserData> {
  const stellar_address = (await getPublicKey()) ?? generateFallbackAddress(username);
  const res = await http.post("/users/register", { username, stellar_address });
  return { ...res.data.user, token: res.data.token };
}

// Used only if keypair hasn't been generated yet (should not happen in normal flow)
function generateFallbackAddress(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let address = "G" + prefix.toUpperCase().replace(/[^A-Z2-7]/g, "A");
  while (address.length < 56) {
    address += chars[Math.floor(Math.random() * chars.length)];
  }
  return address.substring(0, 56);
}

export async function getAuthToken(username: string): Promise<string> {
  // Step 1: request a one-time challenge from the server
  const { challenge } = await fetch(`${BASE_URL}/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  }).then(r => r.json());

  // Step 2: sign with the device keypair — private key never leaves the device
  const signature = await signChallenge(challenge);

  // Step 3: exchange challenge + signature for a JWT
  const { token } = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, challenge, signature }),
  }).then(r => r.json());

  return token;
}

export async function createTrade(
    sellerId: string,
    amountMxn: number,
    buyerToken: string,
): Promise<TradeData> {
  try {
    const res = await http.post(
        '/trades',
        { seller_id: sellerId, amount_mxn: amountMxn },
        authHeaders(buyerToken),
    );
    return res.data.trade;
  } catch (e: unknown) {
    const { message } = extractApiErrorPayload(e);
    throw new Error(message);
  }
}

export async function getTrade(
    tradeId: string,
    token: string,
): Promise<TradeData> {
  const res = await http.get(`/trades/${tradeId}`, authHeaders(token));
  return res.data.trade;
}

export async function lockTrade(
    tradeId: string,
    sellerToken: string,
): Promise<{ lock_tx_hash: string }> {
  const res = await http.post(
      `/trades/${tradeId}/lock`,
      {},
      authHeaders(sellerToken),
  );
  return { lock_tx_hash: res.data.lock_tx_hash };
}

export async function revealTrade(
    tradeId: string,
    sellerToken: string,
): Promise<void> {
  await http.post(
      `/trades/${tradeId}/reveal`,
      undefined,
      authHeaders(sellerToken),
  );
}

export async function getSecret(
    tradeId: string,
    sellerToken: string,
): Promise<{ secret: string; qr_payload: string }> {
  const res = await http.get(
      `/trades/${tradeId}/secret`,
      authHeaders(sellerToken),
  );
  return res.data;
}

export interface CompleteTradeResponse {
  status: string;
  release_tx_hash: string;
}

export async function completeTrade(
    tradeId: string,
    buyerToken: string,
): Promise<void> {
  await http.post(`/trades/${tradeId}/complete`, {}, authHeaders(buyerToken));
}

export interface RefundTradeResponse {
  status: 'refunded';
  refund_tx_hash: string;
}

export async function refundTradeRequest(tradeId: string, token: string): Promise<RefundTradeResponse> {
  try {
    const res = await http.post(`/trades/${tradeId}/refund`, {}, authHeaders(token));
    return res.data as RefundTradeResponse;
  } catch (e: unknown) {
    const { message } = extractApiErrorPayload(e);
    throw new Error(message);
  }
}

export interface TradeHistoryItem {
  id: string;
  status: string;
  amount_mxn: number;
  platform_fee_mxn: number;
  lock_tx_hash: string | null;
  release_tx_hash: string | null;
  created_at: string;
  completed_at: string | null;
  seller_id: string;
  buyer_id: string;
}

export interface MerchantTrade {
  id: string;
  buyer_handle: string;
  amount_mxn: number;
  status: string;
  created_at: string;
}

export async function getMerchantTrades(
    token: string,
    state: string = 'all',
): Promise<MerchantTrade[]> {
  const res = await http.get(`/merchants/me/trades?state=${state}`, authHeaders(token));
  return res.data.trades;
}

export async function getTradeHistory(
    token: string,
): Promise<TradeHistoryItem[]> {
  const res = await http.get("/trades/history", authHeaders(token));
  return res.data.trades;
}

export async function getCurrentUser(
    token: string,
): Promise<CurrentUserProfile> {
  const res = await http.get("/users/me", authHeaders(token));
  return res.data.user;
}

export async function deleteAccount(
    token: string,
    username: string,
): Promise<{ status: string }> {
  const res = await http.post(
      "/users/me/delete",
      { username },
      authHeaders(token),
  );
  return res.data;
}

export async function getAccountBalance(): Promise<{
  xlm: string;
  address: string;
}> {
  const res = await http.get("/account/balance");
  return res.data;
}

export type Availability = 'online' | 'offline' | 'paused';

export async function setAvailability(availability: Availability, token: string): Promise<void> {
  await http.patch('/users/me/availability', { availability }, authHeaders(token));
}

// ─── DeFi: CETES ──────────────────────────────────────────────────────────

export interface CETESRate {
  apy: number;
  xlmPerUsdc: number;
  cetesIssuer: string;
  cesPriceMxn: number;
  network: string;
  note: string;
}

export interface CETESTxResult {
  hash: string;
  status: string;
  simulated: boolean;
  amount: string;
  sourceAsset?: string;
  cetesReceived?: string;
  destReceived?: string;
  explorerUrl: string;
  note?: string;
}

export async function getCETESRate(amount = "100"): Promise<CETESRate> {
  const res = await http.get(`/defi/cetes/rate?amount=${amount}`);
  return res.data;
}

export async function buyCETES(
    amount: string,
    sourceAsset: "XLM" | "USDC" | "MXNe",
): Promise<CETESTxResult> {
  const res = await http.post("/defi/cetes/buy", { amount, sourceAsset });
  return res.data;
}

export async function sellCETES(
    amount: string,
    destAsset: "XLM" | "USDC" | "MXNe",
): Promise<CETESTxResult> {
  const res = await http.post("/defi/cetes/sell", { amount, destAsset });
  return res.data;
}

// ─── DeFi: Blend ──────────────────────────────────────────────────────────

export interface BlendPoolAsset {
  code: string;
  supplyApy: number;
  borrowApy: number;
  liquidity: number;
}

export interface BlendPool {
  id: string;
  name: string;
  tvl: number;
  assets: BlendPoolAsset[];
}

export interface BlendPoolsResponse {
  pools: BlendPool[];
  network: string;
  simulated: boolean;
}

export interface BlendTxResult {
  hash: string;
  status: string;
  simulated: boolean;
  amount: string;
  asset: string;
  explorerUrl: string;
  note?: string;
}

export async function getBlendPools(): Promise<BlendPoolsResponse> {
  const res = await http.get("/defi/blend/pools");
  return res.data;
}

export async function blendSupply(
    amount: string,
    asset: string,
    collateral = false,
): Promise<BlendTxResult> {
  const res = await http.post("/defi/blend/supply", {
    amount,
    asset,
    collateral,
  });
  return res.data;
}

export async function blendBorrow(
    amount: string,
    asset: string,
): Promise<BlendTxResult> {
  const res = await http.post("/defi/blend/borrow", { amount, asset });
  return res.data;
}

export interface MerchantConfig {
  rate_percent: number;
  min_trade_mxn: number;
  max_trade_mxn: number;
  daily_cap_mxn: number;
}

export interface UserProfile {
  id: string;
  username: string;
  stellar_address: string;
  wallet_type?: string;
  rate_percent?: number;
  min_trade_mxn?: number;
  max_trade_mxn?: number;
  daily_cap_mxn?: number;
}

export async function getMyProfile(token: string): Promise<UserProfile> {
  const res = await http.get('/users/me', authHeaders(token));
  return res.data.user;
}

export async function getMerchantConfig(token: string): Promise<MerchantConfig> {
  const res = await http.get('/merchants/me/config', authHeaders(token));
  return res.data.config;
}

export async function updateMerchantConfig(token: string, config: MerchantConfig): Promise<MerchantConfig> {
  const res = await http.put('/merchants/me/config', config, authHeaders(token));
  return res.data.config;
}
