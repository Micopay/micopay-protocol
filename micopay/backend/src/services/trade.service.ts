import db from '../db/schema.js';
import { config } from '../config.js';
import pino from 'pino';
import { generateTradeSecret, encryptSecret, decryptSecret } from './secret.service.js';
import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { callLockOnChain, callReleaseOnChain, verifyLockOnChain, assertNotReplayed } from './stellar.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  AuthError,
  ValidationError,
  TradeStateError,
  MerchantLimitError,
} from '../utils/errors.js';
import {
  getTradeAuditTrail as getTradeAuditTrailRows,
  insertTradeAuditEvent,
} from '../db/audit-log.model.js';

const logger = pino({ name: 'trade.service' });

// --- Trade lifecycle ---

/** Trade states where the buyer still depends on the merchant before cash handoff / release (#31). */
const MERCHANT_DEPENDENT_STATUSES = ['pending', 'locked', 'revealing'] as const;

async function getSellerMerchantRow(sellerId: string) {
  return db.getOne<{ username: string; merchant_available: boolean | null }>(
    'SELECT username, merchant_available FROM users WHERE id = $1',
    [sellerId],
  );
}

function isMerchantUnavailableForTrade(
  trade: { status: string },
  sellerRow: { merchant_available: boolean | null } | null,
) {
  if (!MERCHANT_DEPENDENT_STATUSES.includes(trade.status as (typeof MERCHANT_DEPENDENT_STATUSES)[number])) {
    return false;
  }
  return sellerRow?.merchant_available === false;
}

const STROOPS_PER_MXN = 10_000_000; // 7 decimals
const PLATFORM_FEE_PERCENT = 0.8; // 0.8% platform fee
const DEFAULT_TIMEOUT_MINUTES = 120; // 2 hours
const UNKNOWN_STATE = 'unknown';

interface TransitionFailureContext {
  tradeId: string;
  fromState: string;
  toState: string;
  actor: string;
  metadata?: Record<string, unknown>;
}

function transitionFailureMetadata(error: unknown, metadata: Record<string, unknown> = {}) {
  if (error instanceof Error) {
    return {
      ...metadata,
      success: false,
      reason: error.message,
      error_name: error.name,
    };
  }

  return {
    ...metadata,
    success: false,
    reason: String(error),
    error_name: 'UnknownError',
  };
}

async function logTransitionFailure(context: TransitionFailureContext, error: unknown) {
  try {
    await insertTradeAuditEvent({
      tradeId: context.tradeId,
      fromState: context.fromState,
      toState: context.toState,
      actor: context.actor,
      metadata: transitionFailureMetadata(error, context.metadata),
    });
  } catch (auditError) {
    logger.error({ err: auditError, category: 'trade.lifecycle', trade_id: context.tradeId }, '[audit_log] Failed to persist failed transition');
  }
}

const DAILY_CAP_RESET_NOTE = 'Daily cap usage resets at 00:00 UTC.';

function getUtcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function validateAgainstMerchantLimits(sellerId: string, amountMxn: number) {
  const merchantConfig = await db.getOne(
    `SELECT user_id, min_trade_mxn, max_trade_mxn, daily_cap_mxn
     FROM merchant_configs
     WHERE user_id = $1`,
    [sellerId],
  );

  const minTrade = merchantConfig?.min_trade_mxn ?? 100;
  const maxTrade = merchantConfig?.max_trade_mxn ?? 50000;
  const dailyCap = merchantConfig?.daily_cap_mxn ?? 250000;

  if (amountMxn < minTrade || amountMxn > maxTrade) {
    throw new MerchantLimitError(
      `Trade amount must be between merchant limits: ${minTrade} and ${maxTrade} MXN`,
    );
  }

  const { start, end } = getUtcDayRange();
  const todayTrades = await db.getMany<{ amount_mxn: number }>(
    `SELECT amount_mxn
     FROM trades
     WHERE seller_id = $1
       AND created_at >= $2
       AND created_at < $3
       AND status IN ('pending', 'locked', 'revealing', 'completed')`,
    [sellerId, start.toISOString(), end.toISOString()],
  );

  const todayVolume = todayTrades.reduce((sum, t) => sum + Number(t.amount_mxn || 0), 0);
  const projectedVolume = todayVolume + amountMxn;

  if (projectedVolume > dailyCap) {
    throw new MerchantLimitError(
      `Daily merchant cap exceeded (${projectedVolume}/${dailyCap} MXN). ${DAILY_CAP_RESET_NOTE}`,
    );
  }
}

export interface CreateTradeInput {
  request: FastifyRequest;
  sellerId: string;
  buyerId: string;
  amountMxn: number;
}

export async function createTrade(input: CreateTradeInput) {
  const { request, sellerId, buyerId, amountMxn } = input;
  request.log.info({ seller_id: sellerId, buyer_id: buyerId, amount_mxn: amountMxn, category: 'trade.lifecycle' }, '[trade] Creating trade');

  if (amountMxn < 100 || amountMxn > 50000) {
    throw new ValidationError(
      'INVALID_AMOUNT',
      'El monto debe ser entre 100 y 50,000 MXN',
      'amount_mxn must be between 100 and 50,000'
    );
  }

  // Verify seller exists
  const seller = await db.getOne('SELECT id, stellar_address FROM users WHERE id = $1', [sellerId]);
  if (!seller) throw new NotFoundError('USER_NOT_FOUND', 'El usuario vendedor no existe', 'Seller not found');

  // Block matching if seller is explicitly offline or paused
  // null/undefined means legacy record — treat as online for backward compat
  const sellerAvailability = seller.availability ?? 'online';
  if (sellerAvailability !== 'online') {
    throw new ConflictError(
      `Merchant is currently ${sellerAvailability} and cannot accept new trades`,
    );
  }
  // Verify buyer exists
  const buyer = await db.getOne('SELECT id, stellar_address FROM users WHERE id = $1', [buyerId]);
  if (!buyer) throw new NotFoundError('USER_NOT_FOUND', 'El usuario comprador no existe', 'Buyer not found');

  if (sellerId === buyerId) throw new ValidationError('INVALID_PARTICIPANTS', 'No puedes crear un intercambio contigo mismo', 'Cannot trade with yourself');

  await validateAgainstMerchantLimits(sellerId, amountMxn);

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

  await insertTradeAuditEvent({
    tradeId: result.id,
    fromState: UNKNOWN_STATE,
    toState: 'pending',
    actor: buyerId,
    metadata: {
      success: true,
      amount_mxn: amountMxn,
      seller_id: sellerId,
      buyer_id: buyerId,
    },
  });

  return result;
}

export async function getTradeById(tradeId: string, userId: string) {
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('TRADE_NOT_FOUND', 'El intercambio no existe', 'Trade not found');

  // Only seller or buyer can view
  if (trade.seller_id !== userId && trade.buyer_id !== userId) {
    throw new AuthError('UNAUTHORIZED_ACCESS', 'No tienes permiso para ver este intercambio', 'Not a participant of this trade', 403);
  }

  return trade;
}

/** Trade row for API plus flags for merchant-unavailable UX (issue #31). */
export async function getTradeDetailForParticipant(tradeId: string, userId: string) {
  const trade = await getTradeById(tradeId, userId);
  const seller = await getSellerMerchantRow(trade.seller_id);
  const merchant_unavailable = isMerchantUnavailableForTrade(trade, seller);

  return {
    trade,
    merchant_unavailable,
    seller_username: seller?.username ?? null,
  };
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

export async function getTradeHistory(userId: string, status?: string, page = 1, limit = 20) {
  const trades = await db.getMany(
    `SELECT id, status, amount_mxn, platform_fee_mxn, lock_tx_hash, release_tx_hash,
            created_at, completed_at, seller_id, buyer_id, expires_at
     FROM trades
     WHERE (seller_id = $1 OR buyer_id = $1)
     ORDER BY created_at DESC`,
    [userId],
  );

  let filtered = trades;
  const now = new Date();

  if (status && status !== 'all') {
    if (status === 'expired') {
      filtered = trades.filter(t =>
        !['completed', 'cancelled'].includes(t.status) &&
        new Date(t.expires_at) < now
      );
    } else {
      filtered = trades.filter(t => t.status === status);
    }
  }

  // Fetch usernames to provide merchant info
  const allUsers = await db.getMany('SELECT id, username FROM users');
  const userMap = Object.fromEntries(allUsers.map(u => [u.id, u.username]));

  const mapped = filtered.map(t => {
    const isBuyer = t.buyer_id === userId;
    const otherPartyId = isBuyer ? t.seller_id : t.buyer_id;
    return {
      ...t,
      direction: isBuyer ? 'cash-in' : 'cash-out',
      merchant_username: userMap[otherPartyId] || 'Usuario Micopay',
    };
  });

  const offset = (page - 1) * limit;
  return mapped.slice(offset, offset + limit);
}

export async function lockTrade(
  request: FastifyRequest,
  tradeId: string,
  userId: string,
) {
  request.log.info({ trade_id: tradeId, user_id: userId, category: 'trade.lifecycle' }, '[trade] Locking trade');
  let fromState = UNKNOWN_STATE;

  try {
    const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
    if (!trade) throw new NotFoundError('Trade not found');

    fromState = trade.status;
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
        request,
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
        request,
        `mock_${Date.now()}`,
        trade.seller_id,
        BigInt(trade.amount_stroops),
      );
      if (!verified) throw new BadRequestError('Could not verify lock on-chain');
      lockTxHash = `mock_${Date.now()}`;
      stellarTradeId = lockTxHash;
    }

    await assertNotReplayed(lockTxHash, 'trade/lock', userId);

    await db.execute(
      `UPDATE trades
       SET status = 'locked',
           stellar_trade_id = $2,
           lock_tx_hash = $3,
           locked_at = NOW()
       WHERE id = $1`,
      [tradeId, stellarTradeId, lockTxHash],
    );

    await insertTradeAuditEvent({
      tradeId,
      fromState,
      toState: 'locked',
      actor: userId,
      metadata: {
        success: true,
        lock_tx_hash: lockTxHash,
        stellar_trade_id: stellarTradeId,
      },
    });

    return { status: 'locked', lock_tx_hash: lockTxHash };
  } catch (error) {
    await logTransitionFailure({
      tradeId,
      fromState,
      toState: 'locked',
      actor: userId,
    }, error);
    throw error;
  }
}

export async function revealTrade(request: FastifyRequest, tradeId: string, userId: string) {
  request.log.info({ trade_id: tradeId, user_id: userId, category: 'trade.lifecycle' }, '[trade] Revealing trade');
  let fromState = UNKNOWN_STATE;

  try {
    const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
    if (!trade) throw new NotFoundError('Trade not found');

    fromState = trade.status;
    if (trade.seller_id !== userId) throw new ForbiddenError('Only the seller can reveal');
    if (trade.status !== 'locked') throw new ConflictError(`Trade is ${trade.status}, expected locked`);

    await db.execute(
      `UPDATE trades
       SET status = 'revealing', reveal_requested_at = NOW()
       WHERE id = $1`,
      [tradeId],
    );

    await insertTradeAuditEvent({
      tradeId,
      fromState,
      toState: 'revealing',
      actor: userId,
      metadata: { success: true },
    });

    return { status: 'revealing' };
  } catch (error) {
    await logTransitionFailure({
      tradeId,
      fromState,
      toState: 'revealing',
      actor: userId,
    }, error);
    throw error;
  }
}

export async function getTradeSecret(request: FastifyRequest, tradeId: string, userId: string, ip: string, userAgent: string) {
  request.log.info({ trade_id: tradeId, user_id: userId, category: 'trade.lifecycle' }, '[trade] Secret accessed');
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) throw new NotFoundError('TRADE_NOT_FOUND', 'El intercambio no existe', 'Trade not found');

  // Only seller can see the secret
  if (trade.seller_id !== userId) {
    throw new AuthError('UNAUTHORIZED_ACTION', 'Solo el vendedor puede ver el secreto', 'Only the seller can access the secret', 403);
  }

  // Only in revealing state
  if (trade.status !== 'revealing') {
    throw new TradeStateError('INVALID_STATE', `El intercambio no está en estado de revelación (actual: ${trade.status})`, `Trade is ${trade.status}, must be revealing`);
  }

  // Check not expired
  if (new Date(trade.expires_at) < new Date()) {
    throw new TradeStateError('TRADE_EXPIRED', 'El intercambio ha expirado', 'Trade has expired');
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

export async function completeTrade(request: FastifyRequest, tradeId: string, userId: string) {
  request.log.info({ trade_id: tradeId, user_id: userId, category: 'trade.lifecycle' }, '[trade] Completing trade');
  let fromState = UNKNOWN_STATE;

  try {
    const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
    if (!trade) throw new NotFoundError('Trade not found');

    fromState = trade.status;
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

      const result = await callReleaseOnChain({ request, tradeIdBytes, secretBytes });
      releaseTxHash = result.txHash;
    } else {
      releaseTxHash = `mock_release_${Date.now()}`;
    }

    await assertNotReplayed(releaseTxHash, 'trade/complete', userId);

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

    await insertTradeAuditEvent({
      tradeId,
      fromState,
      toState: 'completed',
      actor: userId,
      metadata: {
        success: true,
        release_tx_hash: releaseTxHash,
      },
    });

    return { status: 'completed', release_tx_hash: releaseTxHash };
  } catch (error) {
    await logTransitionFailure({
      tradeId,
      fromState,
      toState: 'completed',
      actor: userId,
    }, error);
    throw error;
  }
}

/** Response shape for POST /trades/:id/cancel — drives refund copy on the client (#20). */
export interface CancelTradeResult {
  status: 'cancelled';
  refund_expected: boolean;
  lock_tx_hash: string | null;
}

async function finalizeTradeCancellation(tradeId: string) {
  await db.execute(
    `UPDATE trades
     SET status = 'cancelled',
         secret_enc = NULL,
         secret_nonce = NULL
     WHERE id = $1`,
    [tradeId],
  );
}

export async function cancelTrade(
  tradeId: string,
  userId: string,
  reason?: string,
): Promise<CancelTradeResult> {
  let fromState = UNKNOWN_STATE;

  const audit = async (result: CancelTradeResult) => {
    await insertTradeAuditEvent({
      tradeId,
      fromState,
      toState: 'cancelled',
      actor: userId,
      metadata: {
        success: true,
        cancel_reason: reason ?? null,
        refund_expected: result.refund_expected,
        lock_tx_hash: result.lock_tx_hash,
      },
    });
  };

  try {
    const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
    if (!trade) throw new NotFoundError('Trade not found');
    fromState = trade.status;

    if (trade.seller_id !== userId && trade.buyer_id !== userId) {
      throw new ForbiddenError('Not a participant of this trade');
    }

    const lockTx: string | null = trade.lock_tx_hash ?? null;

    if (trade.status === 'pending') {
      await finalizeTradeCancellation(tradeId);
      const result: CancelTradeResult = { status: 'cancelled', refund_expected: false, lock_tx_hash: lockTx };
      await audit(result);
      return result;
    }

    if (trade.status === 'locked') {
      if (trade.buyer_id === userId) {
        await finalizeTradeCancellation(tradeId);
        const result: CancelTradeResult = {
          status: 'cancelled',
          refund_expected: Boolean(lockTx),
          lock_tx_hash: lockTx,
        };
        await audit(result);
        return result;
      }
      if (trade.seller_id === userId) {
        const seller = await getSellerMerchantRow(trade.seller_id);
        if (!isMerchantUnavailableForTrade(trade, seller)) {
          throw new ForbiddenError(
            'Only the buyer may cancel a locked trade before reveal. Pause merchant availability if you need to unwind as the agent.',
          );
        }
        await finalizeTradeCancellation(tradeId);
        const result: CancelTradeResult = {
          status: 'cancelled',
          refund_expected: Boolean(lockTx),
          lock_tx_hash: lockTx,
        };
        await audit(result);
        return result;
      }
      throw new ForbiddenError('Not a participant of this trade');
    }

    if (trade.status === 'revealing') {
      const seller = await getSellerMerchantRow(trade.seller_id);
      if (!isMerchantUnavailableForTrade(trade, seller)) {
        throw new ConflictError(
          'Cannot cancel while the trade is in handoff. Wait for completion, or cancel only if the merchant is temporarily unavailable.',
        );
      }
      await finalizeTradeCancellation(tradeId);
      const result: CancelTradeResult = {
        status: 'cancelled',
        refund_expected: Boolean(lockTx),
        lock_tx_hash: lockTx,
      };
      await audit(result);
      return result;
    }

    throw new ConflictError(`Cannot cancel trade in status ${trade.status}.`);
  } catch (error) {
    await logTransitionFailure({
      tradeId,
      fromState,
      toState: 'cancelled',
      actor: userId,
      metadata: { cancel_reason: reason ?? null },
    }, error);
    throw error;
  }
}

export async function getTradeAuditTrail(tradeId: string, userId: string) {
  await getTradeById(tradeId, userId);

  const events = await getTradeAuditTrailRows(tradeId);
  return events.map((event) => ({
    ...event,
    timestamp: event.occurred_at,
  }));
}

export async function getMerchantTrades(merchantId: string, state: string = 'all') {
  const statusValues = state === 'all'
    ? ['pending', 'locked', 'revealing', 'completed', 'cancelled', 'refunded']
    : [state];

  const trades = await db.getMany(
    `SELECT
       t.id,
       t.seller_id,
       t.buyer_id,
       t.amount_mxn,
       t.status,
       t.created_at,
       u.username as buyer_handle
     FROM trades t
     JOIN users u ON t.buyer_id = u.id
     WHERE t.seller_id = $1
       AND t.status = ANY($2)
     ORDER BY t.created_at DESC`,
    [merchantId, statusValues],
  );

  return trades;
}
