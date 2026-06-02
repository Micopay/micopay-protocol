-- Client-side error reports from the APK / frontend
CREATE TABLE IF NOT EXISTS client_errors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  TEXT,
  user_id     UUID REFERENCES users(id),
  error_code  TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  context     JSONB DEFAULT '{}',
  user_agent  TEXT,
  app_version TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_user ON client_errors (user_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_request_id ON client_errors (request_id)
  WHERE request_id IS NOT NULL;
