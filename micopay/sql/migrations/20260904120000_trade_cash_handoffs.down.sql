-- Rollback de 20260904120000 — CASH-4.
DROP INDEX IF EXISTS idx_trade_cash_handoffs_provider;
DROP TABLE IF EXISTS trade_cash_handoffs;
