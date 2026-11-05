-- Migration 20261101120000 — D4: reclamo "Pagué y no me confirmaron".
--
-- En el depósito el cliente entrega el efectivo mientras la operación está
-- `locked`. Si el agente no confirma, no queda constancia y, al vencer, la app
-- le reembolsaba la cripto al agente. Este registro es la palabra del cliente:
-- con un reclamo abierto la app no reembolsa (ni el botón ni el barrido) y el
-- caso pasa a soporte. No mueve fondos; el contrato no cambia.
--
-- `trade_id` es la llave primaria: un reclamo por operación, reintentar es
-- idempotente.

CREATE TABLE IF NOT EXISTS trade_cash_claims (
  trade_id    UUID PRIMARY KEY REFERENCES trades(id),
  claimant_id UUID NOT NULL REFERENCES users(id),
  note        TEXT,
  status      VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_cash_claims_open
  ON trade_cash_claims (created_at DESC) WHERE status = 'open';
