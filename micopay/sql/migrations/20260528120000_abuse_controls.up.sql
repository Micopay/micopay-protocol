-- Issue #82: abuse controls, device limits, P2P safety rules

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability VARCHAR(16) NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE TABLE IF NOT EXISTS merchant_configs (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rate_percent    NUMERIC(5, 2) NOT NULL DEFAULT 0,
  min_trade_mxn   INTEGER NOT NULL DEFAULT 100,
  max_trade_mxn   INTEGER NOT NULL DEFAULT 50000,
  daily_cap_mxn   INTEGER NOT NULL DEFAULT 250000,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id_hash  TEXT NOT NULL,
  last_ip         TEXT,
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_device ON user_devices (device_id_hash, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS platform_risk_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action          TEXT NOT NULL,
  actor_user_id   UUID,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_risk_events_entity
  ON platform_risk_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_messages_trade ON trade_messages (trade_id, created_at ASC);

CREATE TABLE IF NOT EXISTS trade_disputes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  opener_id       UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_disputes_trade ON trade_disputes (trade_id, created_at DESC);
