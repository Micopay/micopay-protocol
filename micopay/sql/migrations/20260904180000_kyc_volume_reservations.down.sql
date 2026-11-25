-- Rollback de 20260904180000 — CASH-10.
DROP TRIGGER IF EXISTS trg_settle_kyc_volume ON trades;
DROP FUNCTION IF EXISTS settle_kyc_volume_on_trade_terminal();
DROP INDEX IF EXISTS idx_kyc_reservations_user_month;
DROP TABLE IF EXISTS kyc_volume_reservations;
