DROP TABLE IF EXISTS trade_disputes;
DROP TABLE IF EXISTS trade_messages;
DROP INDEX IF EXISTS idx_platform_risk_events_entity;
DROP TABLE IF EXISTS platform_risk_events;
DROP INDEX IF EXISTS idx_user_devices_device;
DROP TABLE IF EXISTS user_devices;
DROP TABLE IF EXISTS merchant_configs;

ALTER TABLE users
  DROP COLUMN IF EXISTS suspension_reason,
  DROP COLUMN IF EXISTS suspended_at,
  DROP COLUMN IF EXISTS availability,
  DROP COLUMN IF EXISTS is_suspended;
