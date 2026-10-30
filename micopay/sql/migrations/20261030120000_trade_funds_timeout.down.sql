ALTER TABLE trades
  DROP COLUMN IF EXISTS funds_expires_at_estimate;
ALTER TABLE trades
  DROP COLUMN IF EXISTS funds_timeout_ledger;
