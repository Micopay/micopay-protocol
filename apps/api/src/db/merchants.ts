import { query, getOne, getMany, execute } from "./schema.js";

export type VerificationStatus = "pending" | "verified" | "paused";

export interface MerchantRow {
  id: string;
  user_id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  address_text: string;
  hours_open: string; // HH:MM
  hours_close: string; // HH:MM
  base_rate: number;
  spread_percent: number;
  min_amount: number;
  max_amount: number;
  verification_status: VerificationStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicMerchantRow {
  id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  address_text: string;
  hours_open: string;
  hours_close: string;
  base_rate: number;
  spread_percent: number;
  min_amount: number;
  max_amount: number;
}

export interface CreateMerchantInput {
  user_id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  address_text: string;
  hours_open: string;
  hours_close: string;
  base_rate: number;
  spread_percent: number;
  min_amount: number;
  max_amount: number;
}

export async function initMerchantsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name        VARCHAR(60) NOT NULL,
      latitude            DECIMAL(10, 7) NOT NULL,
      longitude           DECIMAL(10, 7) NOT NULL,
      address_text        TEXT NOT NULL,
      hours_open          VARCHAR(5) NOT NULL,
      hours_close         VARCHAR(5) NOT NULL,
      base_rate           DECIMAL(12, 6) NOT NULL,
      spread_percent      DECIMAL(7, 4) NOT NULL CHECK (spread_percent >= 0),
      min_amount          DECIMAL(15, 2) NOT NULL CHECK (min_amount > 0),
      max_amount          DECIMAL(15, 2) NOT NULL CHECK (max_amount > min_amount),
      verification_status VARCHAR(10) NOT NULL DEFAULT 'pending'
                            CHECK (verification_status IN ('pending', 'verified', 'paused')),
      verified_at         TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT merchants_user_unique UNIQUE (user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants(user_id);
    CREATE INDEX IF NOT EXISTS idx_merchants_status  ON merchants(verification_status);
  `);
}

export async function createMerchant(
  data: CreateMerchantInput,
): Promise<MerchantRow> {
  const result = await getOne<MerchantRow>(
    `
    INSERT INTO merchants (
      user_id, display_name, latitude, longitude, address_text,
      hours_open, hours_close, base_rate, spread_percent, min_amount, max_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `,
    [
      data.user_id,
      data.display_name,
      data.latitude,
      data.longitude,
      data.address_text,
      data.hours_open,
      data.hours_close,
      data.base_rate,
      data.spread_percent,
      data.min_amount,
      data.max_amount,
    ],
  );
  return result as MerchantRow;
}

export async function getMerchantByUserId(
  userId: string,
): Promise<MerchantRow | null> {
  return getOne<MerchantRow>("SELECT * FROM merchants WHERE user_id = $1", [
    userId,
  ]);
}

export async function getVerifiedMerchants(): Promise<PublicMerchantRow[]> {
  return getMany<PublicMerchantRow>(`
    SELECT id, display_name, latitude, longitude, address_text,
           hours_open, hours_close, base_rate, spread_percent, min_amount, max_amount
    FROM merchants
    WHERE verification_status = 'verified'
  `);
}

export async function updateMerchantAvailability(
  userId: string,
  status: VerificationStatus,
): Promise<void> {
  await execute(
    "UPDATE merchants SET verification_status = $2, updated_at = NOW() WHERE user_id = $1",
    [userId, status],
  );
}

export async function updateMerchantConfig(
  userId: string,
  data: {
    spread_percent: number;
    min_amount: number;
    max_amount: number;
  },
): Promise<MerchantRow> {
  const result = await getOne<MerchantRow>(
    `UPDATE merchants 
     SET spread_percent = $2, min_amount = $3, max_amount = $4, updated_at = NOW() 
     WHERE user_id = $1 
     RETURNING *`,
    [userId, data.spread_percent, data.min_amount, data.max_amount],
  );
  if (!result) throw new Error("Merchant not found");
  return result;
}
