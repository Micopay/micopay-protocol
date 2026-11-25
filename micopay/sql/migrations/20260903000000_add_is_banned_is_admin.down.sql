-- Rollback de 20260903000000.
-- Ojo: borrar is_banned/is_admin rompe auth.middleware.ts en el siguiente request
-- autenticado. Solo para bases de prueba.

ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
ALTER TABLE users DROP COLUMN IF EXISTS is_banned;
