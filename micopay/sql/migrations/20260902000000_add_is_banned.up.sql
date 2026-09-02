-- Add is_banned column to users table.
-- Referenced by auth.middleware.ts, abuse.service.ts, merchant.service.ts,
-- admin.service.ts, and disputes.test.ts but never created by any migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
