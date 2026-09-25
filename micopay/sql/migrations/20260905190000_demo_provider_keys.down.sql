ALTER TABLE users
  DROP COLUMN IF EXISTS demo_secret_nonce,
  DROP COLUMN IF EXISTS demo_secret_enc;
