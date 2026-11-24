-- WP4 de MicoPay web: los retos de inicio de sesion salen de la memoria del
-- proceso. Sobreviven a un despliegue, admiten varios retos por direccion y el
-- uso unico lo decide un UPDATE atomico sobre `consumed_at`.
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id    TEXT PRIMARY KEY,
  stellar_address TEXT NOT NULL,
  format          TEXT NOT NULL CHECK (format IN ('apk', 'sep10')),
  network         TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges (expires_at);
