-- Migration 20260904000000 — CASH-1 (#372): canonical trade flow and provider identity.
--
-- `trades` stored only escrow roles (seller_id/buyer_id). Those reverse between
-- deposit and cash-out, so consumers could not tell the product flow apart and
-- the code guessed that seller_id is always the Red MicoPay liquidity provider —
-- false for cash-out. This adds the product model explicitly:
--
--   flow = 'deposit'  → the caller buys crypto with cash; provider is the escrow seller
--   flow = 'cashout'  → the caller sells crypto for cash; provider is the escrow buyer
--
-- Both columns are NOT NULL. Per the issue's data-migration policy we do not
-- guess from seller_id/buyer_id and we do not keep an ambiguous legacy state.
-- The maintainer confirmed on 2026-08-27 that production holds no real trades,
-- so there is nothing to interpret.
--
-- The guard below is an execution safeguard, not an open product question: if
-- this ever runs against a database that DOES hold trades, it aborts loudly
-- instead of inventing a flow for them. The whole file runs inside one
-- transaction (see src/db/migrate.ts), so the abort leaves the schema untouched.

DO $$
DECLARE
  ambiguous BIGINT;
BEGIN
  -- Only rows that predate the columns are ambiguous. On a fresh database
  -- init.sql has already created them, so this counts zero and we no-op.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trades' AND column_name = 'flow'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO ambiguous FROM trades;

  IF ambiguous > 0 THEN
    RAISE EXCEPTION
      'CASH-1 aborted: % existing rows in trades have no canonical flow/provider_id. Refusing to guess them from seller_id/buyer_id. Clear or reseed these rows explicitly, then re-run.',
      ambiguous
      USING ERRCODE = 'raise_exception';
  END IF;
END $$;

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS flow        VARCHAR(16) NOT NULL,
  ADD COLUMN IF NOT EXISTS provider_id UUID        NOT NULL REFERENCES users(id);

-- Named explicitly so init.sql and this migration converge on one constraint
-- name instead of Postgres generating a different one for each path.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_trades_flow') THEN
    ALTER TABLE trades
      ADD CONSTRAINT chk_trades_flow CHECK (flow IN ('deposit', 'cashout'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_trades_flow_provider') THEN
    ALTER TABLE trades
      ADD CONSTRAINT chk_trades_flow_provider CHECK (
        (flow = 'deposit' AND provider_id = seller_id) OR
        (flow = 'cashout' AND provider_id = buyer_id)
      );
  END IF;
END $$;

-- Provider inbox queries (CASH-3) filter by provider, not by escrow role.
CREATE INDEX IF NOT EXISTS idx_trades_provider ON trades (provider_id, status);
