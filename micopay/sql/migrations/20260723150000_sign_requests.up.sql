-- Issue #323 [SIGN-01]: Delegated signing endpoints
-- Tables for device authentication and sign requests.

CREATE TABLE IF NOT EXISTS device_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sign_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES device_keys(id),
  txxdr TEXT NOT NULL,
  identifier TEXT,
  instruction TEXT,
  kind TEXT NOT NULL DEFAULT 'transaction',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'signed' | 'cancelled' | 'expired'
  signed_xdr TEXT,
  txid TEXT,
  account TEXT,
  pushed BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sign_requests_device ON sign_requests (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_requests_status_expires ON sign_requests (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sign_requests_identifier ON sign_requests (identifier);
