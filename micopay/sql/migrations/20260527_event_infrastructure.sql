-- Migration: Soroban event streaming infrastructure
-- Adds contract_trade_id to trades for O(1) event → trade lookup.
-- Adds event_cursor table to persist the last processed ledger per contract.

-- Index-backed lookup: each on-chain trade_id = sha256(secret_hash), stored at lock time.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS contract_trade_id CHAR(64);

CREATE INDEX IF NOT EXISTS idx_trades_contract_trade_id
  ON trades (contract_trade_id)
  WHERE contract_trade_id IS NOT NULL;

-- One row per watched contract; updated after every successful event batch.
CREATE TABLE IF NOT EXISTS event_cursor (
  contract_id  CHAR(56)    PRIMARY KEY,
  last_ledger  BIGINT      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
