-- Llaves de los agentes DEMO. SOLO TESTNET.
--
-- El seed fabricaba direcciones Stellar a partir del nombre de usuario
-- (`GABARROTESXLAXESQUINAXXX...`): 56 caracteres que empiezan por G, pero sin
-- checksum valido. Mientras `MOCK_STELLAR=true` daba igual, porque no se
-- llamaba a la cadena. Al pasar a `false` el bloqueo del escrow revienta con
-- "Unsupported address type" y la operacion se queda en `pending` para siempre.
--
-- Para poder probar el ciclo completo —crear, bloquear, revelar, escanear y
-- liberar— con un solo telefono, los agentes demo necesitan cuentas reales que
-- alguien pueda firmar. Aqui se guarda su llave, cifrada con la misma clave y
-- el mismo AES-256-GCM que ya protege los secretos HTLC.
--
-- ⚠️ ESTO ES CUSTODIA, y solo se acepta porque:
--     * son cuentas sembradas, no de personas reales;
--     * viven en testnet, donde el dinero no vale nada;
--     * su unico proposito es poder probar el flujo de punta a punta.
--
--   NO debe existir en mainnet. La columna es `demo_*` a proposito, para que
--   sea evidente en cualquier revision. Ver DECISION en el commit del
--   2026-09-05: Eric la aprobo explicitamente para testnet.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS demo_secret_enc   BYTEA,
  ADD COLUMN IF NOT EXISTS demo_secret_nonce BYTEA;

COMMENT ON COLUMN users.demo_secret_enc IS
  'SOLO TESTNET. Llave secreta de un agente sembrado, cifrada (AES-256-GCM). No debe existir en mainnet.';
