-- Add request_id to audit_log for correlation with API requests
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Index for searching audit events by request_id
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log (request_id)
  WHERE request_id IS NOT NULL;
