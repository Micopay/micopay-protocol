-- WP2 del plan de correcciones del escrow (N1): el lock enviado nunca queda
-- huerfano. El hash del lock firmado se guarda ANTES de enviarlo; si la
-- confirmacion tarda, la fila sigue `pending` y el intento se resuelve despues
-- (RPC, `get_trade`, evento `locked`) en vez de olvidarse.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS lock_submitted_tx_hash VARCHAR(64);
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS lock_submitted_at TIMESTAMPTZ;
