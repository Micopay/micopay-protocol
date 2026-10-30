-- WP3 del plan de correcciones del escrow (H2): un solo plazo, el de la cadena.
-- `expires_at` queda como caducidad de la SOLICITUD (hasta cuando se puede
-- bloquear). El vencimiento de los fondos es el `timeout_ledger` del contrato,
-- que corre desde el lock, no desde la creacion. La estimacion en hora solo
-- sirve para mostrar la cuenta regresiva; los reembolsos los decide el ledger.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS funds_timeout_ledger INTEGER;
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS funds_expires_at_estimate TIMESTAMPTZ;
