-- SEC hardening: /defi/ramp/order/:orderId and its regenerate_tx sibling let
-- any authenticated user poll ANY orderId (order IDs are backend-generated
-- UUIDs, never persisted with an owner — see docs/AUDIT_MOBILE_MAINNET.md,
-- "IDOR ramp order"). This table records who created each order so the route
-- can enforce ownership going forward.
CREATE TABLE IF NOT EXISTS ramp_orders (
  order_id    UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ramp_orders_user ON ramp_orders (user_id, created_at DESC);
