-- Issue #315 [4b]: Didit KYC provider integration, generalizing #314's
-- provider-agnostic kyc_level/kyc_level_verified_at columns to a second
-- hosted-KYC provider (Etherfuse remains the CETES-only flow, untouched).

-- Which provider last verified this user. Nullable: existing Etherfuse-only
-- users and never-verified users have no provider on record yet.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kyc_provider TEXT;

-- Tracks each Didit hosted-verification session so:
--   1. the webhook (which only receives session_id + vendor_data back from
--      Didit) can look up which user/level a decision belongs to, and
--   2. GET /defi/kyc/status?provider=didit has a pending/approved/rejected
--      answer even before the webhook fires (Etherfuse's status endpoint
--      avoids this by polling Etherfuse live on every call; Didit's decision
--      only arrives via webhook, so we need our own local state).
CREATE TABLE IF NOT EXISTS kyc_didit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  requested_level SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_didit_sessions_user ON kyc_didit_sessions (user_id, created_at DESC);
