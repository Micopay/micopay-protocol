-- Rollback initial schema migration
-- This drops all tables created by 001_initial_schema.up.sql

DROP TABLE IF EXISTS x402_payments CASCADE;
DROP TABLE IF EXISTS agent_history CASCADE;
DROP TABLE IF EXISTS bazaar_quotes CASCADE;
DROP TABLE IF EXISTS bazaar_intents CASCADE;
DROP TABLE IF EXISTS swap_history CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS auth_challenges CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP EXTENSION IF EXISTS "pgcrypto";
