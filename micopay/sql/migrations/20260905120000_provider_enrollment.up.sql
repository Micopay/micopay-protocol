-- RED-1 · Alta explicita en Red MicoPay.
--
-- Hasta aqui, `merchant_available` nacia en true (por defecto del esquema y
-- ademas explicito en el registro), asi que CUALQUIER persona que abria una
-- cuenta quedaba publicada como proveedora de efectivo en el mapa sin haberlo
-- decidido. Cuatro hechos distintos estaban colapsados en un booleano:
--
--   1. tener cuenta            -> users.id
--   2. pertenecer a la Red     -> provider_status  (esta migracion)
--   3. estar verificado        -> kyc_level / kyc_provider
--   4. estar disponible AHORA  -> availability + merchant_available
--
-- Se separan aqui. La disponibilidad sigue siendo un hecho aparte del alta:
-- un agente activo puede estar en pausa sin dejar de pertenecer a la red.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(24) NOT NULL DEFAULT 'not_enrolled',
  ADD COLUMN IF NOT EXISTS provider_enrolled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_activated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_provider_status'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_provider_status
      CHECK (provider_status IN ('not_enrolled', 'pending_verification', 'active', 'suspended'));
  END IF;
END $$;

-- El alta no se infiere: nadie queda inscrito automaticamente. Se confirmo el
-- 2026-08-27 que produccion no tiene usuarios reales, asi que este default es
-- seguro y no un problema de interpretacion de datos.
--
-- Y se retira la publicacion heredada: quien nunca eligio estar en el mapa,
-- sale de el.
ALTER TABLE users ALTER COLUMN merchant_available SET DEFAULT false;

UPDATE users
   SET merchant_available = false
 WHERE provider_status = 'not_enrolled'
   AND merchant_available = true;

CREATE INDEX IF NOT EXISTS idx_users_provider_status
  ON users (provider_status)
  WHERE provider_status = 'active';

-- La lista de verificacion del alta tenia una casilla decorativa: los limites y
-- la comision son NOT NULL con valores por defecto (100 / 50000 / 250000 / 1%) y
-- la propia base impide combinaciones incoherentes, asi que "tiene limites"
-- SIEMPRE era cierto en cuanto existia la fila. Una lista que siempre da verde
-- no verifica nada.
--
-- Lo que de verdad importa no es que existan numeros, sino que la persona haya
-- visto y aceptado SUS terminos: a que precio trabaja y hasta cuanto. Eso es un
-- hecho con fecha, y es lo que se guarda aqui.
ALTER TABLE merchant_configs
  ADD COLUMN IF NOT EXISTS terms_confirmed_at TIMESTAMPTZ;
