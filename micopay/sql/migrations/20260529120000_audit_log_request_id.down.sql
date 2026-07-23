DROP INDEX IF EXISTS idx_audit_log_request_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS request_id;
