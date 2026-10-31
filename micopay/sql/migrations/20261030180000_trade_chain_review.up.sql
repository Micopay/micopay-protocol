-- WP5 del plan de correcciones del escrow: conciliacion contra la cadena.
-- `chain_review_reason` es una discrepancia abierta para soporte: la base y el
-- contrato no coinciden y nadie la corrige solo. Es independiente de la
-- constancia de efectivo. `chain_checked_at` reparte las lecturas entre ciclos.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS chain_review_reason TEXT;
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS chain_review_at TIMESTAMPTZ;
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS chain_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_trades_chain_review
  ON trades (chain_review_at)
  WHERE chain_review_reason IS NOT NULL;
