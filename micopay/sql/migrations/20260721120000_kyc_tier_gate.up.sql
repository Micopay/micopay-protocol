-- Issue #314 [4a]: tiered KYC gate — kyc_level (0/1/2) + last verification
-- timestamp, used for tier expiry. Provider-agnostic: populated by whichever
-- KYC flow (Etherfuse, Didit, etc. — see #314's "out of scope") verifies the
-- user. Tier<->threshold mapping lives in application config (config.ts),
-- not the DB, per #314's "keep thresholds config-driven" requirement.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kyc_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kyc_level_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_kyc_level ON users (kyc_level);
