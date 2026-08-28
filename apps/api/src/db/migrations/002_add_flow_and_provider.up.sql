-- CASH-1: Add flow and provider_id columns to trades table
-- This migration adds explicit product flow (deposit vs cash_out) and server-derived provider_id

-- Migration guard: Check for ambiguous existing rows
-- If any trades exist without a clear way to determine flow, abort the migration
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  -- Count trades that would be ambiguous to classify
  -- For this migration, we'll check if there are any existing trades
  -- In a real scenario with existing data, you'd need business logic to classify them
  SELECT COUNT(*) INTO ambiguous_count
  FROM trades
  WHERE id IS NOT NULL;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % existing trade(s). Manual classification required before migration. Each trade must be classified as either "deposit" or "cash_out" with a corresponding provider_id.', ambiguous_count;
  END IF;
END $$;

-- Add flow column
ALTER TABLE trades
ADD COLUMN flow VARCHAR(32);

-- Add provider_id column
ALTER TABLE trades
ADD COLUMN provider_id UUID REFERENCES users(id);

-- Make columns NOT NULL (safe because guard ensures no existing rows)
ALTER TABLE trades
ALTER COLUMN flow SET NOT NULL;

ALTER TABLE trades
ALTER COLUMN provider_id SET NOT NULL;

-- Add check constraint for valid flow values
ALTER TABLE trades
ADD CONSTRAINT trades_flow_check CHECK (flow IN ('deposit', 'cash_out'));

-- Add check constraint for flow/provider consistency
-- deposit: provider_id must be seller_id (merchant provides cash deposit service)
-- cash_out: provider_id must be buyer_id (user withdrawing cash from their balance)
ALTER TABLE trades
ADD CONSTRAINT trades_flow_provider_consistency CHECK (
  (flow = 'deposit' AND provider_id = seller_id) OR
  (flow = 'cash_out' AND provider_id = buyer_id)
);

-- Create index for provider queries
CREATE INDEX idx_trades_provider ON trades(provider_id, status);

-- Update migrations_meta to record this migration
-- (This is handled automatically by the migration runner)
