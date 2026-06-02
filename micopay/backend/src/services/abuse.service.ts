import { createHash } from "crypto";
import type { FastifyRequest } from "fastify";
import db from "../db/schema.js";
import { config } from "../config.js";
import { RiskBlockedError, ForbiddenError } from "../utils/errors.js";
import { logAuditEvent } from "./audit.service.js";

const UTC_DAY_MS = 24 * 60 * 60 * 1000;

export interface ClientContext {
  ip: string;
  deviceIdHash: string | null;
}

export function getClientContext(request: FastifyRequest): ClientContext {
  const ip =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown";
  const rawDevice =
    (request.headers["x-device-id"] as string) ||
    (request.headers["x-micopay-device-id"] as string) ||
    "";
  const deviceIdHash = rawDevice
    ? createHash("sha256").update(rawDevice).digest("hex")
    : null;
  return { ip, deviceIdHash };
}

function getUtcDayRange(date = new Date()) {
  const start = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(start.getTime() + UTC_DAY_MS);
  return { start, end };
}

export async function touchUserDevice(
  userId: string,
  ctx: ClientContext,
): Promise<void> {
  if (!ctx.deviceIdHash) return;

  const existing = await db.getOne<{ id: string }>(
    `SELECT id FROM user_devices
     WHERE user_id = $1 AND device_id_hash = $2`,
    [userId, ctx.deviceIdHash],
  );

  if (existing) {
    await db.execute(
      `UPDATE user_devices
       SET last_ip = $1, last_seen_at = NOW()
       WHERE user_id = $2 AND device_id_hash = $3`,
      [ctx.ip, userId, ctx.deviceIdHash],
    );
    return;
  }

  await db.execute(
    `INSERT INTO user_devices (user_id, device_id_hash, last_ip, last_seen_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, ctx.deviceIdHash, ctx.ip],
  );
}

export async function assertUserCanAct(userId: string): Promise<void> {
  const user = await db.getOne<{
    is_suspended: boolean | null;
    availability: string | null;
  }>(
    `SELECT is_suspended, availability FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  if (!user) {
    throw new RiskBlockedError(
      "ACCOUNT_NOT_FOUND",
      "Tu cuenta no está disponible. Inicia sesión de nuevo.",
      `User ${userId} not found or deleted`,
    );
  }

  if (user.is_suspended) {
    throw new RiskBlockedError(
      "ACCOUNT_SUSPENDED",
      "Tu cuenta está suspendida. Contacta a soporte si crees que es un error.",
      `User ${userId} is suspended`,
    );
  }
}

async function assertNotRelatedAccounts(
  buyerId: string,
  sellerId: string,
): Promise<void> {
  const buyer = await db.getOne<{ phone_hash: string | null }>(
    `SELECT phone_hash FROM users WHERE id = $1`,
    [buyerId],
  );
  const seller = await db.getOne<{ phone_hash: string | null }>(
    `SELECT phone_hash FROM users WHERE id = $1`,
    [sellerId],
  );

  if (
    buyer?.phone_hash &&
    seller?.phone_hash &&
    buyer.phone_hash === seller.phone_hash
  ) {
    await logAuditEvent({
      action: "abuse.related_account_blocked",
      actorUserId: buyerId,
      entityType: "trade",
      entityId: `${buyerId}:${sellerId}`,
      details: { reason: "shared_phone_hash" },
    });
    throw new RiskBlockedError(
      "RELATED_ACCOUNTS",
      "No puedes operar con una cuenta vinculada a la tuya.",
      "Buyer and seller share phone_hash",
    );
  }
}

async function countBuyerDailyTrades(buyerId: string): Promise<{
  count: number;
  volumeMxn: number;
}> {
  const { start, end } = getUtcDayRange();
  const rows = await db.getMany<{ amount_mxn: number }>(
    `SELECT amount_mxn FROM trades
     WHERE buyer_id = $1
       AND created_at >= $2
       AND created_at < $3
       AND status IN ('pending', 'locked', 'revealing', 'completed')`,
    [buyerId, start.toISOString(), end.toISOString()],
  );
  const volumeMxn = rows.reduce((sum, r) => sum + Number(r.amount_mxn || 0), 0);
  return { count: rows.length, volumeMxn };
}

async function countTradesForDeviceOrIp(
  deviceIdHash: string | null,
  ip: string,
): Promise<{ deviceCount: number; ipCount: number }> {
  const { start, end } = getUtcDayRange();
  const windowStart = start.toISOString();
  const windowEnd = end.toISOString();

  let deviceCount = 0;
  if (deviceIdHash) {
    const deviceUsers = await db.getMany<{ user_id: string }>(
      `SELECT user_id FROM user_devices WHERE device_id_hash = $1`,
      [deviceIdHash],
    );
    const userIds = deviceUsers.map((u) => u.user_id);
    for (const userId of userIds) {
      const rows = await db.getMany<{ id: string }>(
        `SELECT id FROM trades
         WHERE buyer_id = $1
           AND created_at >= $2
           AND created_at < $3
           AND status IN ('pending', 'locked', 'revealing', 'completed')`,
        [userId, windowStart, windowEnd],
      );
      deviceCount += rows.length;
    }
  }

  const ipRows = await db.getMany<{ id: string }>(
    `SELECT DISTINCT t.id
     FROM trades t
     JOIN user_devices d ON d.user_id = t.buyer_id
     WHERE d.last_ip = $1
       AND t.created_at >= $2
       AND t.created_at < $3
       AND t.status IN ('pending', 'locked', 'revealing', 'completed')`,
    [ip, windowStart, windowEnd],
  );

  return { deviceCount, ipCount: ipRows.length };
}

export async function assertCanCreateTrade(input: {
  request: FastifyRequest;
  buyerId: string;
  sellerId: string;
  amountMxn: number;
}): Promise<void> {
  const { request, buyerId, sellerId, amountMxn } = input;
  const ctx = getClientContext(request);

  await assertUserCanAct(buyerId);
  await assertUserCanAct(sellerId);
  await touchUserDevice(buyerId, ctx);
  await assertNotRelatedAccounts(buyerId, sellerId);

  const seller = await db.getOne<{
    availability: string | null;
    is_suspended: boolean | null;
    merchant_available: boolean | null;
  }>(
    `SELECT availability, is_suspended, merchant_available FROM users WHERE id = $1`,
    [sellerId],
  );

  if (seller?.is_suspended) {
    throw new RiskBlockedError(
      "MERCHANT_SUSPENDED",
      "Este comercio no puede recibir operaciones en este momento.",
      `Seller ${sellerId} is suspended`,
    );
  }

  const availability = seller?.availability ?? "online";
  if (availability !== "online" || seller?.merchant_available === false) {
    throw new RiskBlockedError(
      "MERCHANT_UNAVAILABLE",
      "El comercio no está disponible para nuevas operaciones.",
      `Seller ${sellerId} availability=${availability}`,
    );
  }

  const { count, volumeMxn } = await countBuyerDailyTrades(buyerId);
  if (count >= config.buyerDailyTradeMax) {
    await logAuditEvent({
      action: "abuse.buyer_daily_trade_limit",
      actorUserId: buyerId,
      entityType: "user",
      entityId: buyerId,
      details: { count, limit: config.buyerDailyTradeMax },
    });
    throw new RiskBlockedError(
      "BUYER_DAILY_TRADE_LIMIT",
      `Has alcanzado el límite diario de ${config.buyerDailyTradeMax} operaciones. Intenta mañana (UTC).`,
      `Buyer ${buyerId} exceeded daily trade count`,
      422,
    );
  }

  if (volumeMxn + amountMxn > config.buyerDailyAmountMxnMax) {
    throw new RiskBlockedError(
      "BUYER_DAILY_AMOUNT_LIMIT",
      `Superarías el límite diario de ${config.buyerDailyAmountMxnMax} MXN. Reduce el monto o intenta mañana (UTC).`,
      `Buyer ${buyerId} daily volume cap`,
      422,
    );
  }

  const { deviceCount, ipCount } = await countTradesForDeviceOrIp(
    ctx.deviceIdHash,
    ctx.ip,
  );

  if (ctx.deviceIdHash && deviceCount >= config.deviceRateLimitMax) {
    throw new RiskBlockedError(
      "DEVICE_DAILY_LIMIT",
      "Este dispositivo alcanzó el límite diario de operaciones. Intenta mañana o usa otro dispositivo.",
      `Device ${ctx.deviceIdHash} trade limit`,
      429,
    );
  }

  if (ipCount >= config.ipRateLimitMax) {
    throw new RiskBlockedError(
      "IP_DAILY_LIMIT",
      "Se alcanzó el límite diario de operaciones desde esta red. Intenta más tarde.",
      `IP ${ctx.ip} trade limit`,
      429,
    );
  }
}

export async function assertCanCancelTrade(userId: string): Promise<void> {
  await assertUserCanAct(userId);

  const since = new Date(Date.now() - config.cancelCooldownWindowMs).toISOString();
  const recent = await db.getOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_log
     WHERE actor = $1
       AND to_state = 'cancelled'
       AND occurred_at >= $2`,
    [userId, since],
  );

  const cancelCount = parseInt(recent?.count ?? "0", 10);
  if (cancelCount >= config.cancelCooldownThreshold) {
    await logAuditEvent({
      action: "abuse.cancel_cooldown",
      actorUserId: userId,
      entityType: "user",
      entityId: userId,
      details: {
        recent_cancellations: cancelCount,
        cooldown_ms: config.cancelCooldownMs,
      },
    });
    throw new RiskBlockedError(
      "CANCEL_COOLDOWN",
      `Demasiadas cancelaciones recientes. Espera ${Math.ceil(config.cancelCooldownMs / 60000)} minutos antes de cancelar otra operación.`,
      `User ${userId} cancel cooldown`,
      429,
    );
  }
}

export async function recordTradeCancelled(input: {
  tradeId: string;
  sellerId: string;
  cancelledBy: string;
}): Promise<void> {
  const { tradeId, sellerId, cancelledBy } = input;

  await logAuditEvent({
    action: "trade.cancelled",
    actorUserId: cancelledBy,
    entityType: "trade",
    entityId: tradeId,
    details: { seller_id: sellerId },
  });

  await maybeAutoPauseMerchant(sellerId);
}

export async function maybeAutoPauseMerchant(merchantId: string): Promise<void> {
  const { start, end } = getUtcDayRange();

  const cancelRow = await db.getOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM trades
     WHERE seller_id = $1
       AND status = 'cancelled'
       AND created_at >= $2
       AND created_at < $3`,
    [merchantId, start.toISOString(), end.toISOString()],
  );

  const cancelCount = parseInt(cancelRow?.count ?? "0", 10);
  if (cancelCount < config.merchantCancelPauseThreshold) {
    return;
  }

  await pauseUser(merchantId, "auto_pause_excessive_cancellations", null);
}

export async function recordTradeDispute(input: {
  tradeId: string;
  sellerId: string;
  openerId: string;
  disputeId: string;
}): Promise<void> {
  await logAuditEvent({
    action: "trade.dispute_opened",
    actorUserId: input.openerId,
    entityType: "trade_dispute",
    entityId: input.disputeId,
    details: { trade_id: input.tradeId, seller_id: input.sellerId },
  });

  const openDisputes = await db.getOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM trade_disputes d
     JOIN trades t ON t.id = d.trade_id
     WHERE t.seller_id = $1 AND d.status = 'open'`,
    [input.sellerId],
  );

  const count = parseInt(openDisputes?.count ?? "0", 10);
  if (count >= config.merchantDisputePauseThreshold) {
    await pauseUser(
      input.sellerId,
      "auto_pause_excessive_disputes",
      null,
    );
  }
}

export async function pauseUser(
  userId: string,
  reason: string,
  adminId: string | null,
): Promise<void> {
  await db.execute(
    `UPDATE users
     SET is_suspended = true,
         availability = 'paused',
         suspended_at = NOW(),
         suspension_reason = $2
     WHERE id = $1`,
    [userId, reason],
  );

  await logAuditEvent({
    action: "admin.user.suspended",
    actorUserId: adminId,
    entityType: "user",
    entityId: userId,
    details: { reason },
  });
}

export async function unpauseUser(
  userId: string,
  adminId: string | null,
): Promise<void> {
  await db.execute(
    `UPDATE users
     SET is_suspended = false,
         availability = 'online',
         suspended_at = NULL,
         suspension_reason = NULL
     WHERE id = $1`,
    [userId],
  );

  await logAuditEvent({
    action: "admin.user.unsuspended",
    actorUserId: adminId,
    entityType: "user",
    entityId: userId,
    details: {},
  });
}

export async function assertCanOpenDispute(
  userId: string,
  tradeId: string,
): Promise<void> {
  await assertUserCanAct(userId);

  const existing = await db.getOne<{ id: string }>(
    `SELECT id FROM trade_disputes WHERE trade_id = $1 AND status = 'open'`,
    [tradeId],
  );
  if (existing) {
    throw new ForbiddenError(
      "DISPUTE_ALREADY_OPEN",
      "Ya hay una disputa abierta para esta operación.",
      `Open dispute exists for trade ${tradeId}`,
    );
  }
}
