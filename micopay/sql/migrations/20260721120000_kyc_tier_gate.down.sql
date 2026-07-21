DROP INDEX IF EXISTS idx_users_kyc_level;

ALTER TABLE users
  DROP COLUMN IF EXISTS kyc_level_verified_at,
  DROP COLUMN IF EXISTS kyc_level;
