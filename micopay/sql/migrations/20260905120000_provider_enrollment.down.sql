ALTER TABLE merchant_configs DROP COLUMN IF EXISTS terms_confirmed_at;

-- Revierte RED-1. El default de `merchant_available` vuelve a true por fidelidad
-- al esquema anterior, aunque ese default era precisamente el defecto.
DROP INDEX IF EXISTS idx_users_provider_status;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_provider_status;

ALTER TABLE users
  DROP COLUMN IF EXISTS provider_activated_at,
  DROP COLUMN IF EXISTS provider_enrolled_at,
  DROP COLUMN IF EXISTS provider_status;

ALTER TABLE users ALTER COLUMN merchant_available SET DEFAULT true;
