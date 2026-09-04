-- Migración 20260903000000: declarar users.is_banned y users.is_admin.
--
-- Las dos columnas se leen en rutas de producción desde hace meses pero ningún
-- archivo de micopay/sql/ las creaba:
--
--   auth.middleware.ts:33  SELECT id, is_admin, is_banned, is_suspended FROM users
--                          — en CADA request autenticado
--   admin.service.ts:242   UPDATE users SET is_banned = true WHERE id = $1
--   abuse.service.ts:112   SELECT is_suspended, is_banned, availability FROM users
--   admin.ts:27            SELECT is_admin FROM users
--
-- 20260528120000_abuse_controls agregó is_suspended, availability, suspended_at y
-- suspension_reason, pero no estas dos. Como el backend en RDS sí funciona, lo más
-- probable es que se hayan agregado a mano fuera del repo; esta migración deja una
-- base nueva igual a producción en vez de depender de eso.
--
-- IF NOT EXISTS a propósito: si ya existen out-of-band, esto es un no-op y no pisa
-- la nullabilidad que tengan. El código ya las lee con COALESCE / truthiness, así
-- que tolera ambos casos.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin  BOOLEAN NOT NULL DEFAULT false;

-- Los admins se marcan a mano; no hay backfill que hacer.
