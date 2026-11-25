-- Migration 20260904180000 — CASH-10: ledger idempotente de volumen KYC.
--
-- `user_monthly_volume` guardaba solo un acumulado por usuario y mes, y el
-- servicio hacia leer-sumar-escribir protegido por un mutex EN PROCESO
-- (lib/keyedMutex.ts). De ahi salian tres problemas:
--
--   * el acumulado se incrementaba ANTES de que la operacion existiera, asi
--     que un fallo posterior dejaba volumen fantasma que nadie devolvia;
--   * reintentar la misma operacion la contaba dos veces, porque no habia
--     nada que identificara "esta operacion, este usuario";
--   * el mutex no cruza procesos: con dos instancias del backend, dos
--     peticiones concurrentes podian superar el tope juntas.
--
-- Este ledger las cierra por construccion. La llave primaria (trade_id,
-- user_id) hace idempotente el reintento, y el total del mes deja de ser un
-- numero acumulado para ser la SUMA de las reservas vivas, que es un dato
-- reconstruible y auditable operacion por operacion.
--
-- Ciclo de vida documentado:
--   reserved  -> la operacion se creo y aparta volumen. Cuenta para el tope.
--   finalized -> la operacion se completo. Cuenta para el tope.
--   released  -> la operacion murio sin completarse (cancelada, expirada,
--                reembolsada). NO cuenta: el volumen vuelve a estar libre.

CREATE TABLE IF NOT EXISTS kyc_volume_reservations (
  trade_id   UUID NOT NULL REFERENCES trades(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  -- 'YYYY-MM' en UTC, igual que user_monthly_volume, para que el mes de una
  -- reserva no se mueva si la operacion se finaliza el mes siguiente.
  month_key  TEXT NOT NULL,
  amount_mxn NUMERIC NOT NULL CHECK (amount_mxn >= 0),
  status     TEXT NOT NULL DEFAULT 'reserved'
             CONSTRAINT chk_kyc_reservation_status
             CHECK (status IN ('reserved', 'finalized', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una reserva por participante y operacion: reintentar no cuenta dos veces.
  PRIMARY KEY (trade_id, user_id)
);

-- La consulta caliente es "cuanto lleva esta persona este mes".
CREATE INDEX IF NOT EXISTS idx_kyc_reservations_user_month
  ON kyc_volume_reservations (user_id, month_key, status);

-- Nota sobre `user_monthly_volume`: se deja en su sitio y con sus datos. Ya
-- no es la fuente de verdad del tope P2P —lo es este ledger—, pero la sigue
-- usando la ruta de Etherfuse (routes/ramp.ts), que pertenece a KYC-2.

-- ── Ciclo de vida por trigger ─────────────────────────────────────────────
--
-- Se hace en la base y no en el servicio a proposito. Las transiciones
-- terminales viven en cuerpos que pertenecen a otros issues —cancelacion
-- (CASH-2), completado (CASH-4), reembolso (CASH-6), disputas (SAFE-1)—, y
-- un trigger las cubre TODAS sin que CASH-10 tenga que editarlos. Tambien
-- cubre cualquier ruta futura que cambie el estado sin acordarse del ledger.
--
--   completed             -> finalized  (el volumen cuenta en firme)
--   cancelled/expired/
--   refunded              -> released   (el volumen vuelve a estar libre)

CREATE OR REPLACE FUNCTION settle_kyc_volume_on_trade_terminal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      UPDATE kyc_volume_reservations
      SET status = 'finalized', updated_at = NOW()
      WHERE trade_id = NEW.id AND status = 'reserved';
    ELSIF NEW.status IN ('cancelled', 'expired', 'refunded') THEN
      UPDATE kyc_volume_reservations
      SET status = 'released', updated_at = NOW()
      WHERE trade_id = NEW.id AND status = 'reserved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settle_kyc_volume ON trades;
CREATE TRIGGER trg_settle_kyc_volume
  AFTER UPDATE OF status ON trades
  FOR EACH ROW
  EXECUTE FUNCTION settle_kyc_volume_on_trade_terminal();
