ALTER TABLE trades
  DROP COLUMN IF EXISTS rate_locked_at,
  DROP COLUMN IF EXISTS rate_source,
  DROP COLUMN IF EXISTS rate_mxn,
  DROP COLUMN IF EXISTS asset_code;
