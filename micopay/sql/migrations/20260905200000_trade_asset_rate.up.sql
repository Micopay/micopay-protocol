-- WP2 del plan de escrow multiactivo · el activo y su tasa, congelados por operacion.
--
-- EL FALLO
-- --------
-- `amount_stroops` se calculaba como `amount_mxn * 10^7`, o sea tratando 1 MXN
-- como 1 unidad del activo. El escrow bloquea XLM (verificado en cadena el
-- 2026-09-05: el `TokenId` del contrato CB4M... es el Stellar Asset Contract del
-- nativo, y su `symbol()` devuelve "native"). A ~3.13 MXN por XLM, una operacion
-- de 500 pesos bloqueaba 500 XLM = ~1 563 pesos. El cliente entregaba 3.13 veces
-- lo que valia la operacion.
--
-- POR QUE NADIE LO VIO
-- --------------------
-- `contracts/TESTNET.md` etiquetaba ese contrato como "MXNe token contract". El
-- diagnostico WP0 de julio leyo correctamente el token en cadena, lo comparo
-- contra esa tabla y concluyo que el escrow guardaba un peso digital — con lo
-- que la conversion 1:1 parecia correcta. La verificacion fue real; la
-- referencia estaba mal. Y como el bloqueo fallaba antes por otra causa (las
-- direcciones falsas de los agentes sembrados), nunca llego a ejecutarse.
--
-- QUE SE GUARDA
-- -------------
-- El peso es la denominacion del acuerdo: dos personas quedan por "quinientos
-- pesos". El activo y la tasa son metadata de esa operacion, y se congelan al
-- crearla para que una fluctuacion no mueva lo pactado, y para que una disputa
-- de "acordamos X pesos" tenga la tasa y su fuente como evidencia.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS asset_code     VARCHAR(12) NOT NULL DEFAULT 'XLM',
  ADD COLUMN IF NOT EXISTS rate_mxn       NUMERIC(18, 7) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rate_source    VARCHAR(32),
  ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMPTZ;

-- Las operaciones anteriores se marcan con la tasa 1 que REALMENTE se les
-- aplico, no con la correcta: reescribirla afirmaria que se calcularon bien.
-- Ninguna llego a bloquear en cadena (el bloqueo fallaba antes), asi que no hay
-- dinero movido con esa tasa; queda como registro de lo que el codigo creia.
UPDATE trades
   SET rate_source = 'legacy_1to1_bug'
 WHERE rate_source IS NULL;

COMMENT ON COLUMN trades.asset_code IS
  'Activo bloqueado en el escrow. Hoy solo XLM; USDC y MXNe entran con WP3.';
COMMENT ON COLUMN trades.rate_mxn IS
  'MXN por 1 unidad del activo, congelada al crear la operacion.';
COMMENT ON COLUMN trades.rate_source IS
  'De donde salio la tasa. "legacy_1to1_bug" marca las creadas con la conversion 1:1 erronea.';
