-- Etherfuse SPEI <-> CETES anchor: IDs we generate and bind to a user during
-- hosted onboarding (customerId/bankAccountId are permanent once submitted to
-- Etherfuse — see docs/SPEI_ANCHOR_PLAN.md).
ALTER TABLE users ADD COLUMN IF NOT EXISTS etherfuse_customer_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS etherfuse_bank_account_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'not_started';
