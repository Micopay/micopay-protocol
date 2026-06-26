import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, UnprocessableEntityError } from "../utils/errors.js";

// Mock the DB module so tests don't need a real database
vi.mock("../db/merchants.js", () => ({
  getMerchantByUserId: vi.fn(),
  createMerchant: vi.fn(),
  getVerifiedMerchants: vi.fn(),
}));

vi.mock("../db/schema.js", () => ({
  query: vi.fn().mockResolvedValue({ rows: [{}] }),
  getOne: vi.fn(),
  getMany: vi.fn(),
  execute: vi.fn(),
}));

import {
  getMerchantByUserId,
  createMerchant,
  getVerifiedMerchants,
  MerchantRow,
  PublicMerchantRow,
} from "../db/merchants.js";
import {
  registerMerchant,
  listVerifiedMerchants,
} from "../services/merchant.service.js";

const validInput = {
  user_id: "user-1",
  display_name: "Casa de Cambio Juárez",
  latitude: 19.4326,
  longitude: -99.1332,
  address_text: "Av. Insurgentes Sur 1234, CDMX",
  hours_open: "09:00",
  hours_close: "18:00",
  base_rate: 17.5,
  spread_percent: 2,
  min_amount: 100,
  max_amount: 5000,
};

const mockRow: MerchantRow = {
  ...validInput,
  id: "merchant-uuid",
  verification_status: "pending" as const,
  verified_at: null,
  trades_completed: 0,
  completion_rate: 0,
  avg_time_minutes: 0,
  tier: "espora" as const,
  total_volume_usdc: 0,
  last_trade_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMerchantByUserId).mockResolvedValue(null);
  vi.mocked(createMerchant).mockResolvedValue(mockRow);
});

describe("registerMerchant — happy path", () => {
  it("creates a merchant and returns a row with verification_status pending", async () => {
    const result = await registerMerchant(validInput);
    expect(result.verification_status).toBe("pending");
    expect(createMerchant).toHaveBeenCalledWith(validInput);
  });
});

describe("registerMerchant — display_name validation", () => {
  it("throws 422 when display_name exceeds 60 chars", async () => {
    await expect(
      registerMerchant({ ...validInput, display_name: "A".repeat(61) }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("accepts display_name of exactly 60 chars", async () => {
    await expect(
      registerMerchant({ ...validInput, display_name: "A".repeat(60) }),
    ).resolves.toBeDefined();
  });
});

describe("registerMerchant — hours validation", () => {
  it.each(["9:00", "24:00", "09:60", "9am", "", "25:00"])(
    "throws 422 for invalid hours_open: %s",
    async (bad) => {
      await expect(
        registerMerchant({ ...validInput, hours_open: bad }),
      ).rejects.toThrow(UnprocessableEntityError);
    },
  );

  it.each(["9:00", "24:00", "09:60", "9pm", ""])(
    "throws 422 for invalid hours_close: %s",
    async (bad) => {
      await expect(
        registerMerchant({ ...validInput, hours_close: bad }),
      ).rejects.toThrow(UnprocessableEntityError);
    },
  );

  it.each(["00:00", "09:00", "23:59", "12:30"])(
    "accepts valid time string: %s",
    async (good) => {
      await expect(
        registerMerchant({
          ...validInput,
          hours_open: good,
          hours_close: good,
        }),
      ).resolves.toBeDefined();
    },
  );
});

describe("registerMerchant — numeric constraints", () => {
  it("throws 422 when spread_percent is negative", async () => {
    await expect(
      registerMerchant({ ...validInput, spread_percent: -1 }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("accepts spread_percent of 0", async () => {
    await expect(
      registerMerchant({ ...validInput, spread_percent: 0 }),
    ).resolves.toBeDefined();
  });

  it("throws 422 when min_amount is 0", async () => {
    await expect(
      registerMerchant({ ...validInput, min_amount: 0 }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("throws 422 when min_amount is negative", async () => {
    await expect(
      registerMerchant({ ...validInput, min_amount: -50 }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("throws 422 when max_amount equals min_amount", async () => {
    await expect(
      registerMerchant({ ...validInput, min_amount: 100, max_amount: 100 }),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  it("throws 422 when max_amount is less than min_amount", async () => {
    await expect(
      registerMerchant({ ...validInput, min_amount: 500, max_amount: 100 }),
    ).rejects.toThrow(UnprocessableEntityError);
  });
});

describe("registerMerchant — duplicate user", () => {
  it("throws 409 ConflictError when user already has a merchant record", async () => {
    vi.mocked(getMerchantByUserId).mockResolvedValue(mockRow);
    await expect(registerMerchant(validInput)).rejects.toThrow(ConflictError);
    expect(createMerchant).not.toHaveBeenCalled();
  });
});

describe("listVerifiedMerchants", () => {
  it("returns only the public fields from getVerifiedMerchants", async () => {
    const publicRow: PublicMerchantRow = {
      id: "merchant-uuid",
      display_name: "Casa de Cambio Juárez",
      latitude: 19.4326,
      longitude: -99.1332,
      address_text: "Av. Insurgentes Sur 1234, CDMX",
      hours_open: "09:00",
      hours_close: "18:00",
      base_rate: 17.5,
      spread_percent: 2,
      min_amount: 100,
      max_amount: 5000,
      trades_completed: 0,
      completion_rate: 0,
      avg_time_minutes: 0,
      tier: "espora" as const,
      total_volume_usdc: 0,
      last_trade_at: null,
    };
    vi.mocked(getVerifiedMerchants).mockResolvedValue([publicRow]);
    const result = await listVerifiedMerchants();
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("verification_status");
    expect(result[0]).not.toHaveProperty("user_id");
    expect(result[0].display_name).toBe("Casa de Cambio Juárez");
  });
});
