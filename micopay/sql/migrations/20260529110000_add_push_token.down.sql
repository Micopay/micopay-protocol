-- Rollback: remove push_token columns from users table

DROP INDEX IF EXISTS idx_users_push_token;

ALTER TABLE users
DROP COLUMN IF EXISTS push_token,
DROP COLUMN IF EXISTS push_token_updated_at;
