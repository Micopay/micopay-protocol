-- Migration: revoked_tokens
-- Stores revoked JWT JTI values so logout is enforced server-side.
-- Rows are safe to prune once expires_at has passed.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        VARCHAR(36) PRIMARY KEY,
  user_id    UUID        NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires
  ON revoked_tokens (expires_at);
