-- Issue #316 [4c]: monthly cumulative volume caps per KYC level, extending
-- #314's per-operation gate. Race-safe check-and-increment is implemented in
-- kyc-gate.service.ts (per-user in-process lock, see lib/keyedMutex.ts) —
-- this table just persists the running per-user-per-calendar-month total.
CREATE TABLE IF NOT EXISTS user_monthly_volume (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  month_key TEXT NOT NULL, -- 'YYYY-MM', UTC calendar month
  amount_mxn NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_user_monthly_volume_user_month ON user_monthly_volume (user_id, month_key);
