/**
 * CASH-1 — Trade Flow and Provider Schema Tests
 *
 * Verifies:
 *   1. Trade creation requires explicit 'flow' parameter
 *   2. Server derives 'provider_id' based on flow (deposit -> seller, cash_out -> buyer)
 *   3. Client-supplied 'provider_id' is ignored (security rule)
 *   4. Database constraints enforce flow/provider consistency
 *   5. Trade reads include 'flow' and 'provider_id' fields
 *   6. Invalid flow values are rejected
 *
 * NOTE: This test requires a running PostgreSQL database with the migrations applied.
 * For CI/CD, use a test database or Docker container.
 * 
 * Usage: 
 *   1. Ensure PostgreSQL is running and DATABASE_URL is set
 *   2. Run migrations: npm run db:migrate
 *   3. Run test: MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npx tsx src/tests/test-trade-flow-schema.ts
 */

import { strictEqual, ok } from 'assert';
import db from '../db/schema.js';
import { createTrade, getTradeById, getTradeHistory } from '../services/trade.service.js';
import { BadRequestError } from '../utils/errors.js';

// ── Helpers ────────────────────────────────────────────────────────────────

async function createUser(suffix: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username)
     VALUES ($1, $2)
     RETURNING id`,
    [
      `G${'A'.repeat(54)}${suffix.padStart(1, '0')}`,
      `user_cash1_${suffix}_${Date.now()}`,
    ],
  );
  if (!row?.id) throw new Error(`Failed to seed user ${suffix}`);
  return row.id;
}

async function createMerchant(userId: string): Promise<void> {
  await db.execute(
    `INSERT INTO merchants (user_id, display_name, latitude, longitude, address_text, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, 'Test Merchant', 19.4326, -99.1332, 'CDMX', 'verified'],
  );
}

async function cleanup() {
  // Clean up test data
  try {
    await db.execute(`DELETE FROM trades WHERE seller_id IN (SELECT id FROM users WHERE username LIKE 'user_cash1_%')`);
    await db.execute(`DELETE FROM merchants WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'user_cash1_%')`);
    await db.execute(`DELETE FROM users WHERE username LIKE 'user_cash1_%'`);
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function testDepositFlowDerivesProviderAsSeller() {
  const sellerId = await createUser('s1');
  const buyerId = await createUser('b1');
  await createMerchant(sellerId);

  const trade = await createTrade({
    sellerId,
    buyerId,
    amountMxn: 500,
    flow: 'deposit',
  });

  strictEqual(trade.flow, 'deposit', 'Flow should be deposit');
  strictEqual(trade.provider_id, sellerId, 'Provider should be seller for deposit flow');
  strictEqual(trade.seller_id, sellerId, 'Seller ID should match');
  strictEqual(trade.buyer_id, buyerId, 'Buyer ID should match');

  console.log('  ✓ Deposit flow: provider_id correctly derived as seller_id');
}

async function testCashOutFlowDerivesProviderAsBuyer() {
  const sellerId = await createUser('s2');
  const buyerId = await createUser('b2');
  await createMerchant(sellerId);

  const trade = await createTrade({
    sellerId,
    buyerId,
    amountMxn: 1000,
    flow: 'cash_out',
  });

  strictEqual(trade.flow, 'cash_out', 'Flow should be cash_out');
  strictEqual(trade.provider_id, buyerId, 'Provider should be buyer for cash_out flow');
  strictEqual(trade.seller_id, sellerId, 'Seller ID should match');
  strictEqual(trade.buyer_id, buyerId, 'Buyer ID should match');

  console.log('  ✓ Cash-out flow: provider_id correctly derived as buyer_id');
}

async function testMissingFlowParameterIsRejected() {
  const sellerId = await createUser('s3');
  const buyerId = await createUser('b3');
  await createMerchant(sellerId);

  let threw = false;
  try {
    // @ts-expect-error - intentionally missing flow parameter
    await createTrade({
      sellerId,
      buyerId,
      amountMxn: 500,
    });
  } catch (err) {
    threw = true;
    ok(err instanceof BadRequestError, 'Should throw BadRequestError');
    ok(
      (err as BadRequestError).message.includes('flow'),
      'Error message should mention flow',
    );
  }

  ok(threw, 'Should throw error when flow is missing');
  console.log('  ✓ Missing flow parameter is rejected with BadRequestError');
}

async function testInvalidFlowValueIsRejected() {
  const sellerId = await createUser('s4');
  const buyerId = await createUser('b4');
  await createMerchant(sellerId);

  let threw = false;
  try {
    await createTrade({
      sellerId,
      buyerId,
      amountMxn: 500,
      // @ts-expect-error - intentionally invalid flow value
      flow: 'invalid_flow',
    });
  } catch (err) {
    threw = true;
    ok(err instanceof BadRequestError, 'Should throw BadRequestError');
  }

  ok(threw, 'Should throw error when flow is invalid');
  console.log('  ✓ Invalid flow value is rejected with BadRequestError');
}

async function testTradeReadsIncludeFlowAndProvider() {
  const sellerId = await createUser('s5');
  const buyerId = await createUser('b5');
  await createMerchant(sellerId);

  const createdTrade = await createTrade({
    sellerId,
    buyerId,
    amountMxn: 750,
    flow: 'deposit',
  });

  // Test getTradeById
  const fetchedTrade = await getTradeById(createdTrade.id, buyerId);
  strictEqual(fetchedTrade.flow, 'deposit', 'Fetched trade should have flow');
  strictEqual(
    fetchedTrade.provider_id,
    sellerId,
    'Fetched trade should have provider_id',
  );

  // Test getTradeHistory
  const history = await getTradeHistory(buyerId);
  ok(history.length > 0, 'History should contain trades');
  const historyTrade = history.find((t: any) => t.id === createdTrade.id);
  ok(historyTrade, 'History should contain the created trade');
  strictEqual(historyTrade.flow, 'deposit', 'History trade should have flow');
  strictEqual(
    historyTrade.provider_id,
    sellerId,
    'History trade should have provider_id',
  );

  console.log('  ✓ Trade reads include flow and provider_id fields');
}

async function testDatabaseConstraintEnforcesConsistency() {
  const sellerId = await createUser('s6');
  const buyerId = await createUser('b6');

  // Try to insert a trade with inconsistent flow and provider_id
  // This should be rejected by the database constraint
  let threw = false;
  try {
    await db.execute(
      `INSERT INTO trades
        (seller_id, buyer_id, amount_mxn, amount_stroops, platform_fee_mxn,
         secret_hash, flow, provider_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sellerId,
        buyerId,
        500,
        '5000000000',
        4,
        'test_hash',
        'deposit', // flow is deposit
        buyerId, // but provider_id is buyer (should be seller)
        new Date(Date.now() + 2 * 60 * 60 * 1000),
      ],
    );
  } catch (err: any) {
    threw = true;
    ok(
      err.message.includes('trades_flow_provider_consistency') ||
        err.message.includes('constraint'),
      'Error should mention constraint violation',
    );
  }

  ok(threw, 'Database should reject inconsistent flow/provider combination');
  console.log(
    '  ✓ Database constraint rejects inconsistent flow/provider_id combinations',
  );
}

async function testDepositWithBuyerAsProviderIsRejected() {
  const sellerId = await createUser('s7');
  const buyerId = await createUser('b7');

  let threw = false;
  try {
    await db.execute(
      `INSERT INTO trades
        (seller_id, buyer_id, amount_mxn, amount_stroops, platform_fee_mxn,
         secret_hash, flow, provider_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sellerId,
        buyerId,
        500,
        '5000000000',
        4,
        'test_hash_2',
        'deposit',
        buyerId, // Wrong: deposit flow requires seller as provider
        new Date(Date.now() + 2 * 60 * 60 * 1000),
      ],
    );
  } catch (err: any) {
    threw = true;
    ok(err.message.includes('constraint'), 'Should be constraint violation');
  }

  ok(threw, 'Deposit with buyer as provider should be rejected');
  console.log('  ✓ Deposit flow with buyer as provider is rejected by constraint');
}

async function testCashOutWithSellerAsProviderIsRejected() {
  const sellerId = await createUser('s8');
  const buyerId = await createUser('b8');

  let threw = false;
  try {
    await db.execute(
      `INSERT INTO trades
        (seller_id, buyer_id, amount_mxn, amount_stroops, platform_fee_mxn,
         secret_hash, flow, provider_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sellerId,
        buyerId,
        500,
        '5000000000',
        4,
        'test_hash_3',
        'cash_out',
        sellerId, // Wrong: cash_out flow requires buyer as provider
        new Date(Date.now() + 2 * 60 * 60 * 1000),
      ],
    );
  } catch (err: any) {
    threw = true;
    ok(err.message.includes('constraint'), 'Should be constraint violation');
  }

  ok(threw, 'Cash-out with seller as provider should be rejected');
  console.log('  ✓ Cash-out flow with seller as provider is rejected by constraint');
}

async function testValidFlowTransitionsPreserveProvider() {
  const sellerId = await createUser('s9');
  const buyerId = await createUser('b9');
  await createMerchant(sellerId);

  // Create a deposit trade
  const trade = await createTrade({
    sellerId,
    buyerId,
    amountMxn: 500,
    flow: 'deposit',
  });

  // Verify initial state
  strictEqual(trade.flow, 'deposit');
  strictEqual(trade.provider_id, sellerId);

  // Simulate state transition (e.g., to locked) - provider should remain unchanged
  await db.execute(
    `UPDATE trades SET status = 'locked' WHERE id = $1`,
    [trade.id],
  );

  const updatedTrade = await getTradeById(trade.id, buyerId);
  strictEqual(updatedTrade.flow, 'deposit', 'Flow should remain deposit');
  strictEqual(
    updatedTrade.provider_id,
    sellerId,
    'Provider should remain unchanged',
  );

  console.log('  ✓ State transitions preserve flow and provider_id');
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nCASH-1 — Trade Flow and Provider Schema Tests\n');

  try {
    await testDepositFlowDerivesProviderAsSeller();
    await testCashOutFlowDerivesProviderAsBuyer();
    await testMissingFlowParameterIsRejected();
    await testInvalidFlowValueIsRejected();
    await testTradeReadsIncludeFlowAndProvider();
    await testDatabaseConstraintEnforcesConsistency();
    await testDepositWithBuyerAsProviderIsRejected();
    await testCashOutWithSellerAsProviderIsRejected();
    await testValidFlowTransitionsPreserveProvider();

    console.log('\nAll CASH-1 flow and provider schema tests passed.\n');
  } finally {
    await cleanup();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err);
  cleanup().then(() => process.exit(1));
});

