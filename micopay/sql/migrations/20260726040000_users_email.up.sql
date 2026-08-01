-- Etherfuse's /ramp/onboarding-url now requires userInfo.email (was optional,
-- their docs flagged it "will become required in a future release" — that
-- release landed in sandbox 2026-07-25, breaking POST /defi/kyc/start with
-- "missing field `email`"). MicoPay's Stellar-keypair auth never collected
-- an email from anyone; this is the first feature that needs one.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(254);
