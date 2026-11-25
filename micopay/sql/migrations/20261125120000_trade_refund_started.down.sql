-- Rollback de 20261125120000 — #514.
ALTER TABLE trades DROP COLUMN IF EXISTS refund_started_at;
