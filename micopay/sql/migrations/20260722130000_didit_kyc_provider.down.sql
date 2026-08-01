DROP INDEX IF EXISTS idx_kyc_didit_sessions_user;
DROP TABLE IF EXISTS kyc_didit_sessions;

ALTER TABLE users
  DROP COLUMN IF EXISTS kyc_provider;
