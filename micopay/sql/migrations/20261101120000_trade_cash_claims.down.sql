-- Rollback de 20261101120000 — D4.
DROP INDEX IF EXISTS idx_trade_cash_claims_open;
DROP TABLE IF EXISTS trade_cash_claims;
