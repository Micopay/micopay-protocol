DROP INDEX IF EXISTS idx_trades_chain_review;
ALTER TABLE trades DROP COLUMN IF EXISTS chain_checked_at;
ALTER TABLE trades DROP COLUMN IF EXISTS chain_review_at;
ALTER TABLE trades DROP COLUMN IF EXISTS chain_review_reason;
