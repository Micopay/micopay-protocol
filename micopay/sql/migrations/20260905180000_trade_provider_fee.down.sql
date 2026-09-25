ALTER TABLE trades
  DROP COLUMN IF EXISTS payout_mxn,
  DROP COLUMN IF EXISTS provider_rate_percent,
  DROP COLUMN IF EXISTS provider_fee_mxn;
