-- CASH-1: Rollback flow and provider_id columns from trades table
-- This is the down migration that reverses 002_add_flow_and_provider.up.sql

-- Drop the check constraints first
ALTER TABLE trades
DROP CONSTRAINT IF EXISTS trades_flow_provider_consistency;

ALTER TABLE trades
DROP CONSTRAINT IF EXISTS trades_flow_check;

-- Drop the index
DROP INDEX IF EXISTS idx_trades_provider;

-- Drop the columns
ALTER TABLE trades
DROP COLUMN IF EXISTS provider_id;

ALTER TABLE trades
DROP COLUMN IF EXISTS flow;

-- The schema is now back to the state before migration 002
