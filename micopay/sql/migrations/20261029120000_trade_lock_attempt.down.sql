ALTER TABLE trades
  DROP COLUMN IF EXISTS lock_submitted_at;
ALTER TABLE trades
  DROP COLUMN IF EXISTS lock_submitted_tx_hash;
