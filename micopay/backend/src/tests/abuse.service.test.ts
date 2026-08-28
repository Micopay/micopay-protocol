import { strictEqual, ok, rejects } from "assert";
import db from "../db/schema.js";
import {
  assertCanCreateTrade,
  pauseUser,
  unpauseUser,
} from "../services/abuse.service.js";
import { RiskBlockedError } from "../utils/errors.js";

async function seedUsers() {
  const seller = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    ["GSELLER1111111111111111111111111111111111111111111111111111", "seller_abuse", "hash_a", true, "online", false],
  );
  const buyer = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    ["GBUYER11111111111111111111111111111111111111111111111111111", "buyer_abuse", "hash_b", true, "online", false],
  );
  if (!seller?.id || !buyer?.id) throw new Error("Failed to seed users");
  return { sellerId: seller.id, buyerId: buyer.id };
}

async function testSelfTradeBlocked() {
  const { sellerId } = await seedUsers();
  const mockRequest = { ip: "10.0.0.1", headers: {} } as any;

  await rejects(
    () =>
      assertCanCreateTrade({
        request: mockRequest,
        buyerId: sellerId,
        sellerId,
        amountMxn: 500,
      }),
    (err: unknown) => {
      ok(err instanceof RiskBlockedError || (err as Error).message.includes("mismo"));
      return true;
    },
  );
  console.log("Self-trade path: blocked via trade.service ValidationError (separate test)");
}

async function testSuspendedUserBlocked() {
  const { sellerId, buyerId } = await seedUsers();
  await pauseUser(sellerId, "test_suspend", null);

  const mockRequest = { ip: "10.0.0.2", headers: { "x-device-id": "device-test-1" } } as any;

  await rejects(
    () =>
      assertCanCreateTrade({
        request: mockRequest,
        buyerId,
        sellerId,
        amountMxn: 500,
      }),
    (err: unknown) =>
      err instanceof RiskBlockedError &&
      (err.code === "MERCHANT_SUSPENDED" || err.code === "ACCOUNT_SUSPENDED"),
  );

  await unpauseUser(sellerId, null);
  console.log("Suspended merchant: blocked create trade");
}

async function testRelatedAccountsBlocked() {
  const seller = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    ["GREL111111111111111111111111111111111111111111111111111111", "rel_seller", "same_hash", true, "online", false],
  );
  const buyer = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    ["GREL222222222222222222222222222222222222222222222222222222", "rel_buyer", "same_hash", true, "online", false],
  );

  const mockRequest = { ip: "10.0.0.3", headers: {} } as any;

  await rejects(
    () =>
      assertCanCreateTrade({
        request: mockRequest,
        buyerId: buyer!.id,
        sellerId: seller!.id,
        amountMxn: 500,
      }),
    (err: unknown) => err instanceof RiskBlockedError && err.code === "RELATED_ACCOUNTS",
  );
  console.log("Related accounts (shared phone_hash): blocked");
}

// ── #371: atomic pause/unpause consistency ─────────────────────────────────

/**
 * #371: When a provider is paused (by auto-pause or admin), both the
 * canonical `availability` and the compatibility boolean `merchant_available`
 * must be updated atomically so discovery cannot show a paused provider.
 */
async function testPauseWritesAtomicAvailability() {
  const { sellerId } = await seedUsers();

  // Verify initial state: online + available
  const before = await db.getOne<{ availability: string; merchant_available: boolean }>(
    `SELECT availability, merchant_available FROM users WHERE id = $1`,
    [sellerId],
  );
  strictEqual(before?.availability, "online", "initial availability must be online");
  strictEqual(before?.merchant_available, true, "initial merchant_available must be true");

  // Pause the provider
  await pauseUser(sellerId, "test_atomic_pause", null);

  const after = await db.getOne<{ availability: string; merchant_available: boolean }>(
    `SELECT availability, merchant_available FROM users WHERE id = $1`,
    [sellerId],
  );
  strictEqual(after?.availability, "paused", "paused availability must be 'paused'");
  strictEqual(after?.merchant_available, false, "paused merchant_available must be false");

  console.log("  \u2713 pauseUser atomically sets availability='paused' + merchant_available=false");
}

/**
 * #371: When a suspended provider is unpaused, both fields must be
 * restored atomically.
 */
async function testUnpauseWritesAtomicAvailability() {
  const { sellerId } = await seedUsers();

  // Pause first
  await pauseUser(sellerId, "test_atomic_unpause", null);

  // Unpause
  await unpauseUser(sellerId, null);

  const after = await db.getOne<{ availability: string; merchant_available: boolean }>(
    `SELECT availability, merchant_available FROM users WHERE id = $1`,
    [sellerId],
  );
  strictEqual(after?.availability, "online", "unpaused availability must be 'online'");
  strictEqual(after?.merchant_available, true, "unpaused merchant_available must be true");

  console.log("  \u2713 unpauseUser atomically sets availability='online' + merchant_available=true");
}

async function run() {
  console.log("Running abuse.service tests...");
  await testSuspendedUserBlocked();
  await testRelatedAccountsBlocked();
  await testSelfTradeBlocked();
  console.log("\n  #371 atomic pause/unpause tests:\n");
  await testPauseWritesAtomicAvailability();
  await testUnpauseWritesAtomicAvailability();
  console.log("\nAll abuse.service tests passed.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
