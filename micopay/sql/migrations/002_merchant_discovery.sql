-- Migration 002: Merchant discovery — merchant_configs table + location columns
-- Run with: psql $DATABASE_URL -f micopay/sql/migrations/002_merchant_discovery.sql

-- ── merchant_configs ──────────────────────────────────────────────────────
-- Stores per-user merchant settings (rate, limits, location, availability).
-- One row per user; created lazily on first GET /merchants/me/config.

CREATE TABLE IF NOT EXISTS merchant_configs (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rate_percent  DECIMAL(7, 4) NOT NULL DEFAULT 1.0
                  CHECK (rate_percent >= 0 AND rate_percent <= 100),
  min_trade_mxn INTEGER NOT NULL DEFAULT 100
                  CHECK (min_trade_mxn > 0),
  max_trade_mxn INTEGER NOT NULL DEFAULT 50000
                  CHECK (max_trade_mxn >= min_trade_mxn),
  daily_cap_mxn INTEGER NOT NULL DEFAULT 250000
                  CHECK (daily_cap_mxn >= max_trade_mxn),
  -- Location (optional — NULL means merchant has not set a location yet)
  latitude      DECIMAL(10, 7),
  longitude     DECIMAL(10, 7),
  address_text  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_configs_location
  ON merchant_configs (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ── Add location columns to existing merchant_configs if table already exists
-- (idempotent — safe to run multiple times)
ALTER TABLE merchant_configs
  ADD COLUMN IF NOT EXISTS latitude     DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude    DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS address_text TEXT;
