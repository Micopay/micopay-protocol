import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { tradeRoutes } from "../routes/trades.js";
import db from "../db/schema.js";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../db/schema.js", () => ({
  default: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    execute: vi.fn(),
  },
  getOne: vi.fn(),
  getMany: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../config.js", () => ({
  config: {
    jwtSecret: "test_secret",
    mockStellar: true,
    secretEncryptionKey:
      "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", // 32 bytes hex
  },
}));

vi.mock("../services/stellar.service.js", () => ({
  callLockOnChain: vi.fn().mockResolvedValue({ txHash: "mock_lock_tx" }),
  callReleaseOnChain: vi.fn().mockResolvedValue({ txHash: "mock_release_tx" }),
  verifyLockOnChain: vi.fn().mockResolvedValue(true),
}));

// ── Test Suite ─────────────────────────────────────────────────────────────

describe("P2P Trade Flow Smoke Test", () => {
  let app: FastifyInstance;
  let buyerToken: string;
  let sellerToken: string;
  const buyerId = "11111111-1111-1111-1111-111111111111";
  const sellerId = "22222222-2222-2222-2222-222222222222";
  const tradeId = "33333333-3333-3333-3333-333333333333";

  beforeAll(async () => {
    app = Fastify();
    app.register(fastifyJwt, { secret: "test_secret" });

    // Manual route registration to avoid full app complexity
    app.register(tradeRoutes);
    await app.ready();

    buyerToken = app.jwt.sign({ id: buyerId, stellar_address: "GBUYER..." });
    sellerToken = app.jwt.sign({ id: sellerId, stellar_address: "GSELLER..." });
  });

  afterAll(async () => {
    await app.close();
  });

  it("completes a full P2P trade lifecycle", async () => {
    const mockTrade = {
      id: tradeId,
      seller_id: sellerId,
      buyer_id: buyerId,
      amount_mxn: 500,
      amount_stroops: "5000000000",
      platform_fee_mxn: 4,
      secret_hash: "hash123",
      status: "pending",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    // 1. Create Trade (Buyer initiated)
    (db.getOne as any)
      .mockResolvedValueOnce({ id: sellerId, stellar_address: "GSELLER..." }) // seller check
      .mockResolvedValueOnce({ id: buyerId, stellar_address: "GBUYER..." }) // buyer check
      .mockResolvedValueOnce(mockTrade); // insert result

    const createRes = await app.inject({
      method: "POST",
      url: "/trades",
      headers: { Authorization: `Bearer ${buyerToken}` },
      payload: { seller_id: sellerId, amount_mxn: 500 },
    });

    expect(createRes.statusCode).toBe(201);
    expect(JSON.parse(createRes.body).trade.id).toBe(tradeId);

    // 2. Lock Trade (Seller calls lock after verifying buyer address)
    (db.getOne as any)
      .mockResolvedValueOnce(mockTrade) // getTrade
      .mockResolvedValueOnce({ id: buyerId, stellar_address: "GBUYER..." }); // get buyer address

    const lockRes = await app.inject({
      method: "POST",
      url: `/trades/${tradeId}/lock`,
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

    expect(lockRes.statusCode).toBe(200);
    expect(JSON.parse(lockRes.body).status).toBe("locked");

    // 3. Reveal Trade (Seller confirms receipt of physical cash)
    (db.getOne as any).mockResolvedValueOnce({
      ...mockTrade,
      status: "locked",
    });

    const revealRes = await app.inject({
      method: "POST",
      url: `/trades/${tradeId}/reveal`,
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

    expect(revealRes.statusCode).toBe(200);
    expect(JSON.parse(revealRes.body).status).toBe("revealing");

    // 4. Get Secret (Seller retrieves secret to show QR code to buyer)
    // We need real encryption data here because tradeService.getTradeSecret calls decryptSecret
    const { encryptSecret } = await import("../services/secret.service.js");
    const { encrypted, nonce } = encryptSecret("my-secret-preimage");

    (db.getOne as any).mockResolvedValueOnce({
      ...mockTrade,
      status: "revealing",
      secret_enc: encrypted,
      secret_nonce: nonce,
    });

    const secretRes = await app.inject({
      method: "GET",
      url: `/trades/${tradeId}/secret`,
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

    expect(secretRes.statusCode).toBe(200);
    const secretData = JSON.parse(secretRes.body);
    expect(secretData.secret).toBe("my-secret-preimage");
    expect(secretData.qr_payload).toContain("my-secret-preimage");

    // 5. Complete Trade (Buyer releases on-chain funds using the secret)
    (db.getOne as any).mockResolvedValueOnce({
      ...mockTrade,
      status: "revealing",
      secret_enc: encrypted,
      secret_nonce: nonce,
    });

    const completeRes = await app.inject({
      method: "POST",
      url: `/trades/${tradeId}/complete`,
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    expect(completeRes.statusCode).toBe(200);
    expect(JSON.parse(completeRes.body).status).toBe("completed");
  });
});
