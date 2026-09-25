-- Las comisiones de una operacion vivian a medias.
--
-- `trades` guardaba `platform_fee_mxn` (0.8%) pero NO la comision del agente.
-- La tarifa del agente solo existia en `merchant_configs.rate_percent`, que es
-- CONFIGURACION MUTABLE: el agente puede cambiarla mañana y con ella cambiaria
-- retroactivamente lo que cobro por una operacion de hoy. Y en el momento de
-- liquidar no habia ningun numero que dijera cuanto le toca.
--
-- Ademas los dos descuentos se calculaban en sitios distintos y con criterios
-- distintos, asi que no cuadraban:
--
--   * El descubrimiento anunciaba `payout = monto * (1 - tarifa)` — ignoraba la
--     comision de plataforma por completo.
--   * La pantalla de confirmacion deducia la parte del agente RESTANDO la de
--     plataforma de ese total, con lo que un agente al 1.5% acababa cobrando
--     0.7% sin saberlo.
--
-- DECISION DE PRODUCTO (2026-09-05, confirmada por Eric): el cliente paga las
-- dos comisiones. El agente cobra su tarifa integra y la plataforma la suya
-- aparte. En un cash-out de $500 con un agente al 1.5%:
--
--     monto             500.00
--     comision agente    -7.50   (1.5%)
--     comision MicoPay   -4.00   (0.8%)
--     ---------------------------------
--     el cliente recibe 488.50
--
-- Las tres cifras se congelan al crear la operacion. Una comision pactada no
-- puede cambiar despues, ni porque el agente edite su perfil ni porque la
-- plataforma cambie su porcentaje.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS provider_fee_mxn INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_rate_percent NUMERIC(7, 4),
  ADD COLUMN IF NOT EXISTS payout_mxn INTEGER;

-- Las operaciones anteriores se rellenan con lo que REALMENTE se les aplico,
-- no con lo que la regla nueva habria dicho: reescribir el pasado seria mentir
-- sobre lo que se cobro. Hasta hoy solo se descontaba la plataforma.
UPDATE trades
   SET payout_mxn = amount_mxn - platform_fee_mxn
 WHERE payout_mxn IS NULL;

COMMENT ON COLUMN trades.provider_fee_mxn IS
  'Comision del agente en MXN, congelada al crear la operacion.';
COMMENT ON COLUMN trades.provider_rate_percent IS
  'Tarifa del agente vigente al crear la operacion. Se guarda para poder explicar la cifra despues, aunque el agente cambie su perfil.';
COMMENT ON COLUMN trades.payout_mxn IS
  'Lo que el cliente recibe: amount_mxn - provider_fee_mxn - platform_fee_mxn.';
