-- Migration 20260904120000 — CASH-4 (#70 follow-up): entrega de efectivo durable.
--
-- El escaneo del proveedor quemaba el `claim_token` (SEC-02) y devolvia un
-- resumen para pintar. No dejaba rastro, asi que:
--
--   * si la firma o el envio a la red fallaban despues del escaneo, el
--     proveedor quedaba atrapado: ya habia entregado el efectivo y su QR
--     estaba quemado, sin forma de reanudar;
--   * nada ataba el escaneo a la liberacion posterior, asi que completar no
--     podia exigir que la entrega hubiera ocurrido.
--
-- Este registro es esa constancia. `trade_id` es la llave primaria: hay como
-- maximo UNA entrega por operacion, de modo que reintentar es idempotente por
-- construccion y no por convencion. La garantia de SEC-02 no se debilita —el
-- token se sigue quemando una sola vez y sigue sin persistirse en claro—; lo
-- que se permite es reanudar LA MISMA entrega, no crear una segunda.

CREATE TABLE IF NOT EXISTS trade_cash_handoffs (
  trade_id         UUID PRIMARY KEY REFERENCES trades(id),
  -- Quien entrego el efectivo. Se compara contra trades.provider_id al
  -- reanudar: otro actor no puede continuar una entrega ajena.
  provider_id      UUID NOT NULL REFERENCES users(id),
  -- Hash del token quemado en el escaneo, para poder auditar que esta
  -- constancia nacio de un QR valido y de cual.
  claim_token_hash VARCHAR(64) NOT NULL,
  confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_cash_handoffs_provider
  ON trade_cash_handoffs (provider_id, confirmed_at DESC);
