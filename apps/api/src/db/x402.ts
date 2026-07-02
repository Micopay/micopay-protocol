import { query, getOne, getMany } from './schema.js';

export interface X402PaymentRow {
  tx_hash: string;
  payer_address: string;
  amount_usdc: string;
  service: string;
  created_at: Date;
  expires_at: Date;
  used: boolean;
}

export async function initX402Tables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS x402_payments (
      tx_hash         VARCHAR(64) PRIMARY KEY,
      payer_address   VARCHAR(56) NOT NULL,
      amount_usdc     VARCHAR(32) NOT NULL,
      service         VARCHAR(64) NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      used            BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE INDEX IF NOT EXISTS idx_x402_payments_expires ON x402_payments(expires_at);
    CREATE INDEX IF NOT EXISTS idx_x402_payments_payer ON x402_payments(payer_address);
  `);
}

export async function isPaymentUsed(txHash: string): Promise<boolean> {
  // SEC-A2: a spent payment must be replay-proof forever, not just for 5
  // minutes — the old `expires_at` check let the exact same tx_hash serve a
  // second credential once its row "expired", even though it was `used`.
  const payment = await getOne<Pick<X402PaymentRow, 'tx_hash' | 'used'>>(
    'SELECT tx_hash, used FROM x402_payments WHERE tx_hash = $1',
    [txHash]
  );

  return payment?.used ?? false;
}

export async function markPaymentUsed(
  txHash: string,
  payerAddress: string,
  amountUsdc: string,
  service: string
): Promise<void> {
  // expires_at is kept for schema/audit compatibility but no longer drives
  // replay logic (see isPaymentUsed) — a used payment record is permanent.
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await query(`
    INSERT INTO x402_payments (tx_hash, payer_address, amount_usdc, service, expires_at, used)
    VALUES ($1, $2, $3, $4, $5, TRUE)
    ON CONFLICT (tx_hash) DO UPDATE SET used = TRUE
  `, [txHash, payerAddress, amountUsdc, service, expiresAt.toISOString()]);
}

/**
 * SEC-A2: `used` payment rows are the permanent replay-protection record and
 * must never be deleted. Only unused/stale rows (if this table ever grows a
 * "reserved but not yet paid" concept) would be safe to prune here — today
 * every row markPaymentUsed() creates is `used = TRUE`, so this is a no-op
 * until such a concept exists. Kept (rather than removed) so callers don't
 * need to change, and so it's the obvious place to add real pruning logic later.
 */
export async function cleanupExpiredPayments(): Promise<number> {
  const result = await query('DELETE FROM x402_payments WHERE expires_at < NOW() AND used = FALSE');
  return result.rowCount ?? 0;
}

export async function getPaymentStats(): Promise<{
  total_payments: number;
  active_payments: number;
  expired_payments: number;
}> {
  const total = await getOne<{ count: string }>('SELECT COUNT(*) as count FROM x402_payments');
  const active = await getOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM x402_payments WHERE expires_at > NOW() AND used = TRUE"
  );
  const expired = await getOne<{ count: string }>(
    "SELECT COUNT(*) as count FROM x402_payments WHERE expires_at < NOW()"
  );

  return {
    total_payments: parseInt(total?.count ?? '0', 10),
    active_payments: parseInt(active?.count ?? '0', 10),
    expired_payments: parseInt(expired?.count ?? '0', 10),
  };
}
