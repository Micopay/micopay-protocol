import { ok, strictEqual } from 'assert';
import db from '../db/schema.js';
import { declineTrade, prepareDeclineTrade } from '../services/trade.service.js';
import { AppError } from '../utils/errors.js';

const request = {
  ip: '127.0.0.1',
  headers: {},
  log: { info() {}, warn() {}, error() {} },
} as any;

async function createUser(label: string): Promise<string> {
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO users (stellar_address, username, phone_hash, merchant_available, availability, is_suspended)
     VALUES ($1, $2, $3, true, 'online', false)
     RETURNING id`,
    [`G${label.toUpperCase().padEnd(55, 'A').slice(0, 55)}`, `decline_${label}`, `decline_hash_${label}`],
  );
  if (!row) throw new Error(`Could not create ${label}`);
  return row.id;
}

async function insertTrade(
  sellerId: string,
  buyerId: string,
  flow: 'deposit' | 'cashout' = 'deposit',
): Promise<string> {
  const providerId = flow === 'deposit' ? sellerId : buyerId;
  const row = await db.getOne<{ id: string }>(
    `INSERT INTO trades
       (seller_id, buyer_id, flow, provider_id, amount_mxn, amount_stroops,
        platform_fee_mxn, secret_hash, status, expires_at, lock_tx_hash, locked_at)
     VALUES ($1, $2, $3, $4, 500, 5000000000, 4, $5, 'locked', $6, $7, NOW())
     RETURNING id`,
    [sellerId, buyerId, flow, providerId, 'ab'.repeat(32), new Date(Date.now() + 7_200_000), `mock_lock_${flow}_${Date.now()}`],
  );
  if (!row) throw new Error('Could not create trade');
  return row.id;
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    ok(error instanceof AppError);
    strictEqual(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

async function testBuyerCanDeclineBeforeTimeout() {
  const seller = await createUser('seller');
  const buyer = await createUser('buyer');
  const tradeId = await insertTrade(seller, buyer);

  strictEqual((await prepareDeclineTrade(request, tradeId, buyer) as any).mock, true);
  const result = await declineTrade(request, tradeId, buyer);
  strictEqual(result.status, 'refunded');
  ok(result.refund_tx_hash.startsWith('mock_decline_'));

  const trade = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1',
    [tradeId],
  );
  strictEqual(trade?.status, 'refunded');
  strictEqual(trade?.release_tx_hash, result.refund_tx_hash);

  const replay = await declineTrade(request, tradeId, buyer);
  strictEqual(replay.refund_tx_hash, result.refund_tx_hash);
  console.log('  ✓ buyer returns funds immediately and replay is idempotent');
}

async function testSellerCannotAuthorizeDecline() {
  const seller = await createUser('seller2');
  const buyer = await createUser('buyer2');
  const tradeId = await insertTrade(seller, buyer);

  await expectCode(() => prepareDeclineTrade(request, tradeId, seller), 'ONLY_BUYER_CAN_DECLINE');
  console.log('  ✓ seller may request cancellation but cannot authorize decline');
}

async function testConfirmedHandoffBlocksBackendDecline() {
  const seller = await createUser('seller3');
  const buyer = await createUser('buyer3');
  const tradeId = await insertTrade(seller, buyer, 'cashout');
  await db.execute(
    `INSERT INTO trade_cash_handoffs (trade_id, provider_id, claim_token_hash)
     VALUES ($1, $2, $3)`,
    [tradeId, buyer, 'cd'.repeat(32)],
  );

  await expectCode(() => prepareDeclineTrade(request, tradeId, buyer), 'CASH_HANDOFF_CONFIRMED');
  await expectCode(() => declineTrade(request, tradeId, buyer), 'CASH_HANDOFF_CONFIRMED');
  console.log('  ✓ confirmed cash handoff blocks prepare and submit in backend');
}

async function main() {
  console.log('\ndecline — early escrow return\n');
  await testBuyerCanDeclineBeforeTimeout();
  await testSellerCannotAuthorizeDecline();
  await testConfirmedHandoffBlocksBackendDecline();
  console.log('\nAll decline tests passed.\n');
}

main().catch((error) => {
  console.error('Decline tests failed:', error);
  process.exit(1);
});
