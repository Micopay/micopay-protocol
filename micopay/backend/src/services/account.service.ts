import db from "../db/schema.js";
import { logAuditEvent } from "./audit.service.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";

interface ActiveUserRow {
  id: string;
  username: string;
  stellar_address: string;
  phone_hash: string | null;
  deleted_at: string | null;
}

const ACTIVE_TRADE_STATUSES = ["pending", "locked", "revealing"] as const;

export async function deleteAccount(userId: string, confirmUsername: string) {
  const user = await db.getOne<ActiveUserRow>(
    "SELECT id, username, stellar_address, phone_hash, deleted_at FROM users WHERE id = $1 AND deleted_at IS NULL",
    [userId],
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.username !== confirmUsername) {
    throw new ConflictError(
      "Confirmation username does not match the current account",
    );
  }

  const activeTrades = await db.getMany<{ id: string }>(
    `SELECT id FROM trades
     WHERE (seller_id = $1 OR buyer_id = $1)
       AND status IN ('pending', 'locked', 'revealing')`,
    [userId],
  );

  if (activeTrades.length > 0) {
    throw new ConflictError(
      "Finish or cancel all active trades before deleting your account",
    );
  }

  // Define anonymized representations for PII minimization
  const idPrefix = userId.substring(0, 8);
  const anonymizedUsername = `deleted_${idPrefix}`;
  const anonymizedStellarAddress = user.stellar_address
    ? `${user.stellar_address.substring(0, 4)}...${user.stellar_address.substring(52)}`
    : null;
  const anonymizedPhoneHash = user.phone_hash ? `anonymized_${idPrefix}` : null;

  // 1. Anonymize primary user table and clear active flags
  await db.execute(
    `UPDATE users
     SET deleted_at = NOW(),
         deleted_username = $2,
         deleted_stellar_address = $3,
         deleted_phone_hash = $4,
         username = NULL,
         stellar_address = NULL,
         phone_hash = NULL,
         merchant_available = false
     WHERE id = $1`,
    [userId, anonymizedUsername, anonymizedStellarAddress, anonymizedPhoneHash],
  );

  // 2. wallets — Delete the user's wallet record for complete PII deletion
  await db.execute(
    "DELETE FROM wallets WHERE user_id = $1",
    [userId],
  );

  // 3. user_devices — Delete the user's push tokens
  await db.execute(
    "DELETE FROM user_devices WHERE user_id = $1",
    [userId],
  );

  // 4. chat_messages — Delete messages sent by this user to clear message sender PII
  await db.execute(
    "DELETE FROM chat_messages WHERE sender_id = $1",
    [userId],
  );

  // 5. dispute_events — Anonymize dispute logs reported by user
  await db.execute(
    `UPDATE dispute_events
     SET evidence_urls = NULL,
         reason = 'Anonymized due to account deletion'
     WHERE reported_by = $1`,
    [userId],
  );

  // 6. secret_access_log — Anonymize IP address and User Agent
  await db.execute(
    `UPDATE secret_access_log
     SET ip_address = '0.0.0.0',
         user_agent = 'Anonymized'
     WHERE user_id = $1`,
    [userId],
  );

  // 7. account_funding_log — Anonymize funding logs
  await db.execute(
    `UPDATE account_funding_log
     SET stellar_address = 'Anonymized',
         phone_hash = NULL,
         ip_address = NULL
     WHERE user_id = $1`,
    [userId],
  );

  await logAuditEvent({
    action: "account.deleted",
    actorUserId: userId,
    entityType: "user",
    entityId: userId,
    details: {
      activeTradeCount: activeTrades.length,
      deletedUsername: user.username,
    },
  });

  return { status: "deleted" as const };
}
