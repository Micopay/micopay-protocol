-- Add push_token column to users table for merchant push notifications

ALTER TABLE users
ADD COLUMN push_token TEXT,
ADD COLUMN push_token_updated_at TIMESTAMPTZ;

-- Index for efficient lookups of users with valid push tokens
CREATE INDEX idx_users_push_token ON users(push_token)
WHERE push_token IS NOT NULL;
