import {
  createMerchant,
  getMerchantByUserId as getMerchantByUserIdDb,
  getVerifiedMerchants,
  updateMerchantAvailability as updateMerchantAvailabilityDb,
  updateMerchantConfig as updateMerchantConfigDb,
  type CreateMerchantInput,
  type MerchantRow,
  type PublicMerchantRow,
  type VerificationStatus,
} from "../db/merchants.js";
import { ConflictError, UnprocessableEntityError } from "../utils/errors.js";

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type { CreateMerchantInput };

export async function registerMerchant(
  input: CreateMerchantInput,
): Promise<MerchantRow> {
  if (input.display_name.length > 60) {
    throw new UnprocessableEntityError(
      "display_name must not exceed 60 characters",
    );
  }

  if (!HH_MM_REGEX.test(input.hours_open)) {
    throw new UnprocessableEntityError(
      "hours_open must match HH:MM format (00:00–23:59)",
    );
  }

  if (!HH_MM_REGEX.test(input.hours_close)) {
    throw new UnprocessableEntityError(
      "hours_close must match HH:MM format (00:00–23:59)",
    );
  }

  if (input.spread_percent < 0) {
    throw new UnprocessableEntityError(
      "spread_percent must be greater than or equal to 0",
    );
  }

  if (input.min_amount <= 0) {
    throw new UnprocessableEntityError("min_amount must be greater than 0");
  }

  if (input.max_amount <= input.min_amount) {
    throw new UnprocessableEntityError(
      "max_amount must be greater than min_amount",
    );
  }

  const existing = await getMerchantByUserId(input.user_id);
  if (existing) {
    throw new ConflictError("A merchant record already exists for this user");
  }

  return createMerchant(input);
}

export async function listVerifiedMerchants(): Promise<PublicMerchantRow[]> {
  return getVerifiedMerchants();
}

export async function getMerchantByUserId(
  userId: string,
): Promise<MerchantRow | null> {
  const result = await getMerchantByUserIdDb(userId);
  return result;
}

export async function updateMerchantAvailability(
  userId: string,
  status: VerificationStatus,
): Promise<void> {
  await updateMerchantAvailabilityDb(userId, status);
}

export async function updateMerchantConfig(
  userId: string,
  data: {
    spread_percent: number;
    min_amount: number;
    max_amount: number;
  },
): Promise<MerchantRow> {
  return updateMerchantConfigDb(userId, data);
}
