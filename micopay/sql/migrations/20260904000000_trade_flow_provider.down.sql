-- Rollback of 20260904000000 — CASH-1 (#372).
-- Returns `trades` to its previous shape: escrow roles only, no product model.

DROP INDEX IF EXISTS idx_trades_provider;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS chk_trades_flow_provider;
ALTER TABLE trades DROP CONSTRAINT IF EXISTS chk_trades_flow;

ALTER TABLE trades
  DROP COLUMN IF EXISTS provider_id,
  DROP COLUMN IF EXISTS flow;
