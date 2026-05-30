import db from '../db/schema.js';
import { config } from '../config.js';
import { generateTradeSecret, encryptSecret, decryptSecret } from './secret.service.js';
import { createHash } from 'crypto';
import { callLockOnChain, callReleaseOnChain, verifyLockOnChain } from './stellar.service.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../utils/errors.js';

// --- Trade lifecycle ---

const STROOPS_PER_MXN = 10_000_000; // 7 decimals
const PLATFORM_FEE_PERCENT = 0.8; // 0.8% platform fee
const DEFAULT_TIMEOUT_MINUTES = 120; // 2 hours

export interface CreateTradeInput {
  sellerId: string;
  buyerId: string;
  amountMxn: number;
}

export async function createTrade(input: CreateTradeInput) {
  const { sellerId, buyerId, amountMxn } = input;

  if (amountMxn < 100 || amountMxn > 50000) {
    throw new BadRequestError('amount_mxn must be between 100 and 50,000');
  }

  // Verify seller exists
  const seller = await db.getOne('SELECT id, stellar_address FROM users WHERE id = $1', [sellerId]);
  if (!seller) throw new NotFoundError('Seller not found');

  // Verify buyer exists
  const buyer = await db.getOne('SELECT id, stellar_address FROM users WHERE id = $1', [buyerId]);
  if (!buyer) throw new NotFoundError('Buyer not found');

  if (sellerId === buyerId) throw new BadRequestError('Cannot trade with yourself');

  // Verify seller is online
  const sellerMerchant = await db.getOne('SELECT verification_status FROM merchants WHERE user_id = $1', [sellerId]);
  if (!sellerMerchant || sellerMerchant.verification_status !== 'verified') {
    throw new BadRequestError('Merchant is currently offline or paused');
  }

  // Generate HTLC secret
  const { secret, secretHash } = generateTradeSecret();

  // Calculate amounts
  const amountStroops = BigInt(amountMxn) * BigInt(STROOPS_PER_MXN);
  const platformFeeMxn = Math.ceil(amountMxn * PLATFORM_FEE_PERCENT / 100);

  // Encrypt and store secret immediately (Option A from spec)
  const { encrypted, nonce } = encryptSecret(secret);

  const expiresAt = new Date(Date.now() + DEFAULT_TIMEOUT_MINUTES * 60 * 1000);

  const result = await db.getOne(
    `INSERT INTO trades
      (seller_id, buyer_id, amount_mxn, amount_stroops, platform_fee_mxn,
       secret_hash, secret_enc, secret_nonce, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
     RETURNING *`,
    [
      sellerId,
      buyerId,
      amountMxn,
      amountStroops.toString(),
      platformFeeMxn,
      secretHash,
      encrypted,
      nonce,
      expiresAt,
    ],
  );

  return result;
}

export async function getTradeById(tradeId: string, userId: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');

  // Only seller or buyer can view
  if (trade.seller_id !== userId && trade.buyer_id !== userId) {
    throw new ForbiddenError('Not a participant of this trade');
  }

  return trade;
}

export async function getActiveTrades(userId: string) {
  return db.getMany(
    `SELECT * FROM trades
     WHERE (seller_id = $1 OR buyer_id = $1)
       AND status IN ('pending', 'locked', 'revealing')
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function getTradeHistory(userId: string) {
  return db.getMany(
    `SELECT id, status, amount_mxn, platform_fee_mxn, lock_tx_hash, release_tx_hash,
            created_at, completed_at, seller_id, buyer_id
     FROM trades
     WHERE (seller_id = $1 OR buyer_id = $1)
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId],
  );
}

export async function lockTrade(
  tradeId: string,
  userId: string,
) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');
  if (trade.seller_id !== userId) throw new ForbiddenError('Only the seller can lock');
  if (trade.status !== 'pending') throw new ConflictError(`Trade is ${trade.status}, expected pending`);

  // Fetch buyer's Stellar address
  const buyer = await db.getOne('SELECT stellar_address FROM users WHERE id = $1', [trade.buyer_id]);
  if (!buyer) throw new NotFoundError('Buyer not found');

  let lockTxHash: string;
  let stellarTradeId: string;

  if (!config.mockStellar) {
    // Real on-chain lock via Soroban
    const result = await callLockOnChain({
      buyerStellarAddress: buyer.stellar_address,
      amountStroops: BigInt(trade.amount_stroops),
      platformFeeMxn: trade.platform_fee_mxn,
      secretHash: trade.secret_hash,
    });
    lockTxHash = result.txHash;
    stellarTradeId = result.txHash;
  } else {
    // Mock mode — generate placeholder hashes
    const verified = await verifyLockOnChain(
      `mock_${Date.now()}`,
      trade.seller_id,
      BigInt(trade.amount_stroops),
    );
    if (!verified) throw new BadRequestError('Could not verify lock on-chain');
    lockTxHash = `mock_${Date.now()}`;
    stellarTradeId = lockTxHash;
  }

  await db.execute(
    `UPDATE trades
     SET status = 'locked',
         stellar_trade_id = $2,
         lock_tx_hash = $3,
         locked_at = NOW()
     WHERE id = $1`,
    [tradeId, stellarTradeId, lockTxHash],
  );

  return { status: 'locked', lock_tx_hash: lockTxHash };
}

export async function revealTrade(tradeId: string, userId: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');
  if (trade.seller_id !== userId) throw new ForbiddenError('Only the seller can reveal');
  if (trade.status !== 'locked') throw new ConflictError(`Trade is ${trade.status}, expected locked`);

  await db.execute(
    `UPDATE trades
     SET status = 'revealing', reveal_requested_at = NOW()
     WHERE id = $1`,
    [tradeId],
  );

  return { status: 'revealing' };
}

export async function getTradeSecret(tradeId: string, userId: string, ip: string, userAgent: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');

  // Only seller can see the secret
  if (trade.seller_id !== userId) {
    throw new ForbiddenError('Only the seller can access the secret');
  }

  // Only in revealing state
  if (trade.status !== 'revealing') {
    throw new ConflictError(`Trade is ${trade.status}, must be revealing`);
  }

  // Check not expired
  if (new Date(trade.expires_at) < new Date()) {
    throw new ConflictError('Trade has expired');
  }

  // Decrypt secret
  const secret = decryptSecret(trade.secret_enc, trade.secret_nonce);

  // Log access
  await db.execute(
    `INSERT INTO secret_access_log (trade_id, user_id, ip_address, user_agent)
     VALUES ($1, $2, $3, $4)`,
    [tradeId, userId, ip, userAgent],
  );

  const qrPayload = `micopay://release?trade_id=${tradeId}&secret=${secret}`;

  return { secret, qr_payload: qrPayload, expires_in: 120 };
}

export async function completeTrade(tradeId: string, userId: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');
  if (trade.buyer_id !== userId) throw new ForbiddenError('Only the buyer can complete');
  if (trade.status !== 'revealing') {
    throw new ConflictError(`Trade is ${trade.status}, expected revealing`);
  }

  // Decrypt the HTLC secret stored at lock time
  const secret = decryptSecret(trade.secret_enc, trade.secret_nonce);

  let releaseTxHash: string;

  if (!config.mockStellar) {
    // Compute trade_id as the contract does: sha256(secret_hash_bytes)
    const secretHashBytes = Buffer.from(trade.secret_hash, 'hex');
    const tradeIdBytes = createHash('sha256').update(secretHashBytes).digest();
    const secretBytes = Buffer.from(secret, 'hex');

    const result = await callReleaseOnChain({ tradeIdBytes, secretBytes });
    releaseTxHash = result.txHash;
  } else {
    releaseTxHash = `mock_release_${Date.now()}`;
  }

  // Clear encrypted secret from DB now that release is confirmed on-chain
  await db.execute(
    `UPDATE trades
     SET status = 'completed',
         release_tx_hash = $2,
         completed_at = NOW(),
         secret_enc = NULL,
         secret_nonce = NULL
     WHERE id = $1`,
    [tradeId, releaseTxHash],
  );

  return { status: 'completed', release_tx_hash: releaseTxHash };
}

export async function cancelTrade(tradeId: string, userId: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('Trade not found');

  if (trade.seller_id !== userId && trade.buyer_id !== userId) {
    throw new ForbiddenError('Not a participant of this trade');
  }

  if (trade.status !== 'pending') {
    throw new ConflictError(`Cannot cancel trade in status ${trade.status}. Only pending trades can be cancelled.`);
  }

  await db.execute(
    `UPDATE trades
     SET status = 'cancelled',
         secret_enc = NULL,
         secret_nonce = NULL
     WHERE id = $1`,
    [tradeId],
  );

  return { status: 'cancelled' };
}
