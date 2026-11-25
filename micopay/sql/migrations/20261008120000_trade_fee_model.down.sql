ALTER TABLE trades
  DROP COLUMN IF EXISTS escrow_amount_mxn,
  DROP COLUMN IF EXISTS fee_model;
