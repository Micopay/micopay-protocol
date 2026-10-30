/**
 * Tests for the Soroban event listener.
 *
 * Covers:
 *   - jitteredBackoff: pure-function behaviour
 *   - isBeforeOldestLedgerError: error classification
 *   - EscrowEventListener: reconnect/backoff on fetch error
 *   - EscrowEventListener: duplicate event deduplication
 *   - EscrowEventListener: polling-fallback health signal (isHealthy)
 *   - parseEscrowEvent: event type classification and trade_id extraction
 *   - applyEscrowEvent: idempotency on already-terminal trade states
 *
 * Uses in-memory DB fallback (PostgreSQL not required) and mock deps for
 * the listener — no network access needed.
 */

import { ok, strictEqual } from 'assert';
import { randomUUID } from 'crypto';
import {
  jitteredBackoff,
  isBeforeOldestLedgerError,
  EscrowEventListener,
  type EventListenerDeps,
  type EventBatch,
} from '../services/event-listener.service.js';
import {
  parseEscrowEvent,
  applyEscrowEvent,
  type RawContractEvent,
  type ParsedEscrowEvent,
} from '../services/event-dispatcher.service.js';
import db from '../db/schema.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Contrato de las filas de prueba: el dispatcher solo aplica eventos suyos. */
const TEST_CONTRACT = 'C_TEST';
/** Otra instancia del escrow, con el mismo trade_id posible (H1). */
const OTHER_CONTRACT = 'C_OTHER';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeEvent(id: string, topic0: string, valueBytes: Buffer): RawContractEvent {
  return {
    id,
    contractId: TEST_CONTRACT,
    topic: [topic0],       // tests provide pre-stringified topics
    value: [valueBytes],   // tests provide pre-parsed values
    txHash: `txhash_${id}`,
    ledger: 1000,
  };
}

/** Build a deps object with safe defaults; override as needed per test. */
function makeDeps(overrides: Partial<EventListenerDeps> = {}): EventListenerDeps {
  return {
    fetchEvents: async (): Promise<EventBatch> => ({ events: [], latestLedger: 101 }),
    currentLedger: async () => 1000,
    loadCursor: async () => 100,
    saveCursor: async () => {},
    isProcessed: async () => false,
    markProcessed: async () => {},
    dispatch: async () => {},
    ...overrides,
  };
}

// ── jitteredBackoff ───────────────────────────────────────────────────────

async function testBackoffRange() {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const ms = jitteredBackoff(attempt, 1_000, 60_000);
    ok(ms >= 1, `attempt ${attempt}: delay must be ≥ 1ms, got ${ms}`);
    ok(ms <= 60_000, `attempt ${attempt}: delay must be ≤ 60000ms, got ${ms}`);
  }
  console.log('  ✓ jitteredBackoff stays within [1, maxMs]');
}

async function testBackoffGrowth() {
  // With deterministic check: cap doubles per attempt up to maxMs.
  // Run many samples to verify median grows with attempt count.
  const samples = 200;
  const avg = (attempt: number) => {
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += jitteredBackoff(attempt, 100, 100_000);
    return sum / samples;
  };
  ok(avg(3) > avg(0), 'Later attempts should have larger average backoff');
  console.log('  ✓ jitteredBackoff average grows with attempt count');
}

// ── isBeforeOldestLedgerError ─────────────────────────────────────────────

async function testBeforeOldestLedgerError() {
  ok(isBeforeOldestLedgerError(new Error('start is before oldest ledger')));
  ok(isBeforeOldestLedgerError(new Error('ledger before oldest')));
  ok(!isBeforeOldestLedgerError(new Error('network timeout')));
  ok(!isBeforeOldestLedgerError('not an error'));
  console.log('  ✓ isBeforeOldestLedgerError classifies correctly');
}

// ── EscrowEventListener — health signal ───────────────────────────────────

async function testHealthWhenStopped() {
  const listener = new EscrowEventListener('C_TEST', makeDeps());
  strictEqual(listener.isHealthy(), false, 'Stopped listener must not be healthy');
  strictEqual(listener.currentState(), 'stopped');
  console.log('  ✓ isHealthy() = false when stopped');
}

async function testHealthAfterSuccessfulPoll() {
  let pollCount = 0;
  const deps = makeDeps({
    fetchEvents: async () => {
      pollCount++;
      return { events: [], latestLedger: 101 };
    },
  });

  const listener = new EscrowEventListener('C_TEST', deps, {
    pollIntervalMs: 50,
    healthStaleMs: 5_000,
  });

  await listener.start();
  await delay(120); // allow at least two poll cycles
  const healthy = listener.isHealthy();
  listener.stop();

  ok(pollCount >= 1, `Expected at least 1 poll, got ${pollCount}`);
  ok(healthy, 'Listener should be healthy after successful polls');
  console.log('  ✓ isHealthy() = true after successful polls');
}

async function testHealthAfterStale() {
  const listener = new EscrowEventListener('C_TEST', makeDeps(), {
    pollIntervalMs: 10_000,   // long interval — won't poll again
    healthStaleMs: 1,          // expire immediately
  });
  await listener.start();
  await delay(50); // enough for first poll
  await delay(10); // ensure stale threshold passes
  const healthy = listener.isHealthy();
  listener.stop();

  // With healthStaleMs=1 the signal goes stale almost immediately.
  strictEqual(healthy, false, 'Listener should be unhealthy when stale');
  console.log('  ✓ isHealthy() = false after stale window');
}

// ── EscrowEventListener — reconnect / backoff ────────────────────────────

async function testReconnectAfterError() {
  let fetchCalls = 0;
  const deps = makeDeps({
    fetchEvents: async () => {
      fetchCalls++;
      if (fetchCalls === 1) throw new Error('RPC unavailable');
      return { events: [], latestLedger: 102 };
    },
  });

  const listener = new EscrowEventListener('C_TEST', deps, {
    pollIntervalMs: 20,
    backoffBaseMs: 10,
    backoffMaxMs: 30,
  });

  await listener.start();
  await delay(200); // allow several backoff cycles
  listener.stop();

  ok(fetchCalls >= 2, `Expected retry after error, got ${fetchCalls} fetch calls`);
  console.log('  ✓ Listener retries after fetch error with backoff');
}

async function testGapOnOldestLedgerError() {
  let savedCursor = 12345; // simulate a very old cursor
  const gaps: Array<[number, number]> = [];
  let fetches = 0;

  const deps = makeDeps({
    loadCursor: async () => savedCursor,
    saveCursor: async (ledger) => { savedCursor = ledger; },
    fetchEvents: async () => {
      fetches++;
      if (fetches === 1) throw new Error('start is before oldest ledger');
      return { events: [], latestLedger: savedCursor };
    },
    currentLedger: async () => 99999,
    onGap: async (from, to) => { gaps.push([from, to]); },
  });

  const listener = new EscrowEventListener('C_TEST', deps, {
    pollIntervalMs: 20,
    backoffBaseMs: 10,
    backoffMaxMs: 20,
  });

  await listener.start();
  await delay(100);
  listener.stop();

  strictEqual(savedCursor, 99999, 'Cursor jumps to the current ledger, never to 0');
  strictEqual(gaps.length, 1, 'The gap is reported exactly once');
  strictEqual(gaps[0][0], 12346, 'Gap starts right after the old cursor');
  strictEqual(gaps[0][1], 99999, 'Gap ends at the current ledger');
  console.log('  ✓ Cursor outside the RPC window: reports the exact gap and jumps to current');
}

// ── WP4: eventos durables y completos ─────────────────────────────────────

function ledgerEvent(id: string, ledger: number): RawContractEvent {
  return { ...makeEvent(id, 'released', Buffer.alloc(32)), ledger };
}

async function testFailedDispatchIsRetriedOnce() {
  const processed = new Set<string>();
  const applied: string[] = [];
  let cursor = 100;
  let failNext = true;
  const events = [ledgerEvent('a', 105), ledgerEvent('b', 107), ledgerEvent('c', 110)];

  const deps = makeDeps({
    loadCursor: async () => cursor,
    saveCursor: async (ledger) => { cursor = ledger; },
    fetchEvents: async (start) => ({
      events: events.filter((e) => e.ledger >= start),
      latestLedger: 120,
    }),
    isProcessed: async (key) => processed.has(key),
    markProcessed: async (key) => { processed.add(key); },
    dispatch: async (event) => {
      if (event.id === 'b' && failNext) {
        failNext = false;
        throw new Error('db down');
      }
      applied.push(event.id);
    },
  });

  const listener = new EscrowEventListener(TEST_CONTRACT, deps, {
    pollIntervalMs: 10,
    backoffBaseMs: 1,
    backoffMaxMs: 2,
  });
  await listener.start();
  await delay(120);
  listener.stop();

  strictEqual(applied.join(','), 'a,b,c', 'Each event is applied exactly once, in order');
  strictEqual(cursor, 120, 'Cursor reaches the latest ledger after the retry');
  console.log('  ✓ A failed dispatch stops the batch and is retried, without duplicates');
}

async function testFailedDispatchHoldsTheCursor() {
  let cursor = 100;
  const saved: number[] = [];
  const deps = makeDeps({
    loadCursor: async () => cursor,
    saveCursor: async (ledger) => { saved.push(ledger); cursor = ledger; },
    fetchEvents: async () => ({ events: [ledgerEvent('x', 105)], latestLedger: 120 }),
    dispatch: async () => { throw new Error('db down'); },
  });

  const listener = new EscrowEventListener(TEST_CONTRACT, deps, {
    pollIntervalMs: 1_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 1_000,
  });
  await listener.start();
  await delay(50);
  listener.stop();

  strictEqual(saved.join(','), '104', 'Cursor stops right before the failed event');
  ok(listener.lagLedgers() > 0, 'The lag is visible');
  ok(!saved.includes(120), 'Cursor never skips past a failed event');
  console.log('  ✓ The cursor never advances past an event that failed');
}

async function testAllPagesAreProcessed() {
  const total = 250;
  const all = Array.from({ length: total }, (_, i) => ledgerEvent(`p${i}`, 101 + Math.floor(i / 10)));
  const applied: string[] = [];
  const cursors: Array<string | undefined> = [];
  let cursor = 100;

  const deps = makeDeps({
    loadCursor: async () => cursor,
    saveCursor: async (ledger) => { cursor = ledger; },
    fetchEvents: async (_start, page) => {
      cursors.push(page);
      const offset = page ? Number(page) : 0;
      const slice = all.slice(offset, offset + 200);
      const next = offset + 200;
      return { events: slice, latestLedger: 500, ...(next < total ? { nextCursor: String(next) } : {}) };
    },
    dispatch: async (event) => { applied.push(event.id); },
  });

  const listener = new EscrowEventListener(TEST_CONTRACT, deps, { pollIntervalMs: 10_000 });
  await listener.start();
  await delay(60);
  listener.stop();

  strictEqual(applied.length, total, 'All 250 events are applied, not just the first 200');
  strictEqual(applied[0], 'p0');
  strictEqual(applied[total - 1], `p${total - 1}`, 'In order');
  strictEqual(cursors[1], '200', 'The second page asks for the RPC cursor');
  strictEqual(cursor, 500, 'Cursor advances only after the last page');
  console.log('  ✓ 250 events over two pages: all applied, in order');
}

async function testPageCapResumesOnNextPoll() {
  let cursor = 100;
  let polls = 0;
  const applied = new Set<string>();
  const processed = new Set<string>();

  const deps = makeDeps({
    loadCursor: async () => cursor,
    saveCursor: async (ledger) => { cursor = ledger; },
    fetchEvents: async (start, page) => {
      if (!page) polls++;
      const offset = page ? Number(page) : 0;
      const event = ledgerEvent(`e${offset}`, Math.max(start, 101 + offset));
      if (offset >= 30) return { events: [event], latestLedger: 500 };
      return { events: [event], latestLedger: 500, nextCursor: String(offset + 1) };
    },
    isProcessed: async (key) => processed.has(key),
    markProcessed: async (key) => { processed.add(key); },
    dispatch: async (event) => { applied.add(event.id); },
  });

  const listener = new EscrowEventListener(TEST_CONTRACT, deps, {
    pollIntervalMs: 20,
    backoffBaseMs: 5,
    backoffMaxMs: 10,
  });
  await listener.start();
  await delay(30);
  listener.stop();

  ok(cursor < 500, `Cursor stays behind the unread pages after the cap (got ${cursor})`);
  ok(polls >= 1, 'The poll ran');
  console.log('  ✓ At the page cap the cursor stays behind what was not read');
}

async function testFailureOnSecondPageKeepsItsLedger() {
  let cursor = 100;
  const firstPage = [ledgerEvent('p1', 105)];
  const secondPage = [ledgerEvent('p2', 130)];
  const deps = makeDeps({
    loadCursor: async () => cursor,
    saveCursor: async (ledger) => { cursor = ledger; },
    fetchEvents: async (_start, page) => (page
      ? { events: secondPage, latestLedger: 500 }
      : { events: firstPage, latestLedger: 500, nextCursor: 'next' }),
    dispatch: async (event) => { if (event.id === 'p2') throw new Error('db down'); },
  });

  const listener = new EscrowEventListener(TEST_CONTRACT, deps, {
    pollIntervalMs: 1_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 1_000,
  });
  await listener.start();
  await delay(50);
  listener.stop();

  strictEqual(cursor, 129, 'Cursor stops right before the failed event of page 2');
  console.log('  ✓ A failure on a later page keeps the cursor just before it');
}

// ── EscrowEventListener — deduplication ──────────────────────────────────

async function testDuplicateEventSkipped() {
  const processedIds = new Set<string>();
  let dispatchCount = 0;

  const sameEvent = makeEvent('evt-42', 'released', Buffer.alloc(32));

  const deps = makeDeps({
    fetchEvents: async () => ({
      events: [sameEvent, sameEvent], // same event delivered twice in one batch
      latestLedger: 102,
    }),
    isProcessed: async (id) => processedIds.has(id),
    markProcessed: async (id) => { processedIds.add(id); },
    dispatch: async () => { dispatchCount++; },
  });

  const listener = new EscrowEventListener('C_TEST', deps, { pollIntervalMs: 10_000 });
  await listener.start();
  await delay(80);
  listener.stop();

  strictEqual(dispatchCount, 1, 'Duplicate event must be dispatched exactly once');
  console.log('  ✓ Duplicate events in the same batch dispatched only once');
}

async function testDuplicateAcrossPolls() {
  const processedIds = new Set<string>();
  let dispatchCount = 0;
  let pollCount = 0;

  const deps = makeDeps({
    fetchEvents: async () => {
      pollCount++;
      // Return the same event on every poll
      return {
        events: [makeEvent('evt-99', 'released', Buffer.alloc(32))],
        latestLedger: 100 + pollCount,
      };
    },
    isProcessed: async (id) => processedIds.has(id),
    markProcessed: async (id) => { processedIds.add(id); },
    dispatch: async () => { dispatchCount++; },
  });

  const listener = new EscrowEventListener('C_TEST', deps, {
    pollIntervalMs: 30,
  });

  await listener.start();
  await delay(200); // allow multiple polls
  listener.stop();

  ok(pollCount >= 2, `Expected multiple polls, got ${pollCount}`);
  strictEqual(dispatchCount, 1, 'Same event across polls must only be dispatched once');
  console.log('  ✓ Same event across multiple polls dispatched only once');
}

// ── parseEscrowEvent ──────────────────────────────────────────────────────

async function testParseReleasedEvent() {
  const tradeId = Buffer.from('a'.repeat(64), 'hex'); // 32 bytes

  // Mock scValToNative: topics are already strings, value is already an array
  const mockParser = (v: unknown) => v;

  const event: RawContractEvent = {
    id: 'evt-parse-1',
    contractId: TEST_CONTRACT,
    topic: ['released'],
    value: [tradeId, 'GSELLER...', 'GBUYER...'],
    txHash: 'tx_abc',
    ledger: 500,
  };

  const parsed = parseEscrowEvent(event, mockParser);

  ok(parsed !== null, 'Should parse released event');
  strictEqual(parsed!.type, 'released');
  strictEqual(parsed!.contractTradeIdHex, 'a'.repeat(64));
  strictEqual(parsed!.txHash, 'tx_abc');
  strictEqual(parsed!.ledger, 500);
  console.log('  ✓ parseEscrowEvent handles released event');
}

async function testParseRefundedEvent() {
  const tradeId = Buffer.from('b'.repeat(64), 'hex');
  const mockParser = (v: unknown) => v;

  const event: RawContractEvent = {
    id: 'evt-parse-2',
    contractId: TEST_CONTRACT,
    topic: ['refunded'],
    value: [tradeId, 'GSELLER...'], // refunded only has trade_id + seller
    txHash: 'tx_def',
    ledger: 501,
  };

  const parsed = parseEscrowEvent(event, mockParser);

  ok(parsed !== null);
  strictEqual(parsed!.type, 'refunded');
  strictEqual(parsed!.contractTradeIdHex, 'b'.repeat(64));
  console.log('  ✓ parseEscrowEvent handles refunded event');
}

async function testParseDeclinedEvent() {
  const tradeId = Buffer.from('d'.repeat(64), 'hex');
  const mockParser = (v: unknown) => v;
  const parsed = parseEscrowEvent({
    id: 'evt-parse-declined',
    contractId: TEST_CONTRACT,
    topic: ['declined'],
    value: [tradeId, 'GSELLER...'],
    txHash: 'tx_declined',
    ledger: 502,
  }, mockParser);

  ok(parsed !== null);
  strictEqual(parsed!.type, 'declined');
  strictEqual(parsed!.contractTradeIdHex, 'd'.repeat(64));
  console.log('  ✓ parseEscrowEvent handles declined event');
}

async function testParseLockedEvent() {
  const tradeId = Buffer.from('c'.repeat(64), 'hex');
  const mockParser = (v: unknown) => v;

  const event: RawContractEvent = {
    id: 'evt-parse-3',
    contractId: TEST_CONTRACT,
    topic: ['locked'],
    value: [tradeId, 'GSELLER...', 'GBUYER...', BigInt(1000), 9999],
    txHash: 'tx_ghi',
    ledger: 502,
  };

  const parsed = parseEscrowEvent(event, mockParser);

  ok(parsed !== null);
  strictEqual(parsed!.type, 'locked');
  console.log('  ✓ parseEscrowEvent handles locked event');
}

async function testParseUnknownEventReturnsNull() {
  const mockParser = (v: unknown) => v;
  const event: RawContractEvent = {
    id: 'evt-unknown',
    topic: ['transfer'],
    value: [],
    txHash: 'tx_x',
    ledger: 1,
  };
  strictEqual(parseEscrowEvent(event, mockParser), null, 'Unknown topic must return null');
  console.log('  ✓ parseEscrowEvent returns null for unknown topics');
}

async function testParseMalformedValueReturnsNull() {
  const mockParser = (v: unknown) => { throw new Error('bad XDR'); };
  const event: RawContractEvent = {
    id: 'evt-bad',
    topic: ['released'],
    value: 'corrupt',
    txHash: 'tx_y',
    ledger: 1,
  };
  strictEqual(parseEscrowEvent(event, mockParser), null, 'Malformed event must return null');
  console.log('  ✓ parseEscrowEvent returns null when parser throws');
}

async function testParseWrongTradeIdLength() {
  const shortBytes = Buffer.alloc(16); // 16 bytes — should be 32
  const mockParser = (v: unknown) => v;
  const event: RawContractEvent = {
    id: 'evt-short',
    topic: ['released'],
    value: [shortBytes, 'G...'],
    txHash: 'tx_z',
    ledger: 1,
  };
  strictEqual(parseEscrowEvent(event, mockParser), null, '16-byte trade_id must return null');
  console.log('  ✓ parseEscrowEvent rejects trade_id with wrong length');
}

// ── applyEscrowEvent — idempotency ────────────────────────────────────────
//
// These tests use the real in-memory DB (schema.ts fallback) so we exercise
// the actual SQL path without needing PostgreSQL or module patching.

/** Insert a minimal trade row directly into the in-memory store. */
async function insertTestTrade(overrides: {
  id: string;
  status: string;
  contractTradeId: string;
  escrowContractId?: string;
}): Promise<void> {
  // CASH-1: fixtures model a deposit, so the escrow seller is also the
  // provider. Hoisted because provider_id must equal seller_id — two separate
  // randomUUID() calls would violate chk_trades_flow_provider.
  //
  // Los dos participantes se crean de verdad: contra PostgreSQL las llaves
  // foraneas de `trades` rechazan ids inventados, y asi la suite puede probar
  // el SQL real del dispatcher y no solo el store en memoria.
  const suffix = randomUUID().replace(/-/g, '');
  const makeUser = async (label: string) => {
    const row = await db.getOne<{ id: string }>(
      `INSERT INTO users (stellar_address, username) VALUES ($1, $2) RETURNING id`,
      [`G${suffix.slice(0, 32).toUpperCase()}${label}`.padEnd(56, 'A').slice(0, 56), `evt_${label}_${suffix.slice(0, 20)}`],
    );
    if (!row?.id) throw new Error('Failed to seed user');
    return row.id;
  };
  const sellerId = await makeUser('S');
  const buyerId = await makeUser('B');

  await db.execute(
    `INSERT INTO trades
       (id, status, contract_trade_id, seller_id, buyer_id, flow, provider_id,
        amount_mxn, amount_stroops, platform_fee_mxn, secret_hash, escrow_contract_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      overrides.id,
      overrides.status,
      overrides.contractTradeId,
      sellerId,       // seller_id
      buyerId,        // buyer_id
      'deposit',      // flow
      sellerId,       // provider_id
      100,            // amount_mxn
      '1000000000',   // amount_stroops
      1,              // platform_fee_mxn
      'testhash',     // secret_hash
      overrides.escrowContractId ?? TEST_CONTRACT,
    ],
  );
}

async function testApplyReleasedIdempotentOnCompleted() {
  const contractTradeId = 'e'.repeat(64);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'completed', contractTradeId });

  const parsed: ParsedEscrowEvent = {
    type: 'released',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-idem-1',
    txHash: 'tx_idem_1',
    ledger: 100,
  };

  await applyEscrowEvent(parsed);

  const after = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'completed', 'Already-completed trade must stay completed');
  console.log('  ✓ applyEscrowEvent(released) is a no-op when trade is already completed');
}

/**
 * H1: cancelar no liquida el contrato. Una operacion cancelada con bloqueo es
 * justo donde llega el refund; antes el evento se ignoraba y la fila quedaba
 * "en garantia" con el dinero ya devuelto.
 */
async function testApplyRefundedSettlesCancelledTrade() {
  const contractTradeId = 'f'.repeat(64);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'cancelled', contractTradeId });

  const parsed: ParsedEscrowEvent = {
    type: 'refunded',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-idem-2',
    txHash: 'tx_idem_2',
    ledger: 200,
  };

  await applyEscrowEvent(parsed);

  const after = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded', 'A cancelled trade with funds inside must become refunded');
  strictEqual(after?.release_tx_hash, 'tx_idem_2', 'The refund tx hash must be recorded');
  console.log('  ✓ applyEscrowEvent(refunded) settles a cancelled trade as refunded with its hash');
}

/** H1: un evento tardio no reescribe una operacion que el refund HTTP/sweep ya liquido. */
async function testLateRefundedEventKeepsRefundedTrade() {
  const contractTradeId = '3c'.repeat(32);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'refunded', contractTradeId });
  await db.execute('UPDATE trades SET release_tx_hash = $2 WHERE id = $1', [tradeId, 'tx_http_refund']);

  for (const type of ['refunded', 'released'] as const) {
    await applyEscrowEvent({
      type,
      contractTradeIdHex: contractTradeId,
      eventId: `evt-late-${type}`,
      txHash: `tx_late_${type}`,
      ledger: 500,
    });
  }

  const after = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded', 'A refunded trade must stay refunded');
  strictEqual(after?.release_tx_hash, 'tx_http_refund', 'The original refund hash must be kept');
  console.log('  ✓ late refunded/released events do not rewrite an already refunded trade');
}

/** H1: repetir el mismo evento de reembolso es idempotente. */
async function testRefundedEventIsIdempotent() {
  const contractTradeId = '4d'.repeat(32);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'locked', contractTradeId });
  const ev: ParsedEscrowEvent = {
    type: 'refunded', contractId: TEST_CONTRACT, contractTradeIdHex: contractTradeId, eventId: 'evt-rep', txHash: 'tx_rep_1', ledger: 600,
  };
  await applyEscrowEvent(ev);
  await applyEscrowEvent({ ...ev, txHash: 'tx_rep_2' });

  const after = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded');
  strictEqual(after?.release_tx_hash, 'tx_rep_1', 'The first settlement hash wins');
  console.log('  ✓ re-delivering a refunded event is a no-op');
}

async function testApplyReleasedUpdatesActiveTradeToCompleted() {
  const contractTradeId = '1a'.repeat(32);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'revealing', contractTradeId });

  const parsed: ParsedEscrowEvent = {
    type: 'released',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-idem-3',
    txHash: 'tx_idem_3',
    ledger: 300,
  };

  await applyEscrowEvent(parsed);

  const after = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'completed', 'Trade in revealing state must be moved to completed');
  console.log('  ✓ applyEscrowEvent(released) completes an active trade');
}

async function testApplyRefundedUpdatesActiveTradeToRefunded() {
  const contractTradeId = '2b'.repeat(32);
  const tradeId = randomUUID();

  await insertTestTrade({ id: tradeId, status: 'locked', contractTradeId });

  const parsed: ParsedEscrowEvent = {
    type: 'refunded',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-idem-4',
    txHash: 'tx_idem_4',
    ledger: 400,
  };

  await applyEscrowEvent(parsed);

  const after = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded', 'Locked trade must be refunded on on-chain refund');
  strictEqual(after?.release_tx_hash, 'tx_idem_4', 'The refund tx hash must be recorded');
  console.log('  ✓ applyEscrowEvent(refunded) refunds an active trade and records the hash');
}

async function testApplyDeclinedUpdatesCancelledTradeToRefunded() {
  const contractTradeId = '5e'.repeat(32);
  const tradeId = randomUUID();
  await insertTestTrade({ id: tradeId, status: 'cancelled', contractTradeId });
  const before = await db.getOne<{ id: string; status: string }>(
    'SELECT id, status FROM trades WHERE contract_trade_id = $1', [contractTradeId]);
  strictEqual(before?.id, tradeId, 'declined fixture must be addressable by contract trade id');

  await applyEscrowEvent({
    type: 'declined',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-declined-1',
    txHash: 'tx_declined_1',
    ledger: 401,
  });

  const after = await db.getOne<{ status: string; release_tx_hash: string | null }>(
    'SELECT status, release_tx_hash FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded');
  strictEqual(after?.release_tx_hash, 'tx_declined_1');
  console.log('  ✓ applyEscrowEvent(declined) confirms the early return');
}

// ── H1 · identidad contrato + trade_id ────────────────────────────────────
//
// El trade_id es sha256(secret_hash) y el hash es publico. Un atacante puede
// repetirlo en OTRA instancia del escrow, reembolsarla al instante y emitir un
// `refunded` autentico con el mismo trade_id. Ese evento no debe tocar la
// operacion del primer contrato.

async function testRefundFromOtherContractDoesNotTouchTrade() {
  const contractTradeId = '1'.repeat(64);
  const tradeId = randomUUID();
  await insertTestTrade({ id: tradeId, status: 'revealing', contractTradeId });
  await db.execute(
    `UPDATE trades SET secret_enc = $2, secret_nonce = $3 WHERE id = $1`,
    [tradeId, 'enc_keep', 'nonce_keep'],
  );

  for (const type of ['refunded', 'declined', 'released'] as const) {
    await applyEscrowEvent({
      type,
      contractId: OTHER_CONTRACT,
      contractTradeIdHex: contractTradeId,
      eventId: `evt-foreign-${type}`,
      txHash: `tx_foreign_${type}`,
      ledger: 900,
    });
  }

  const after = await db.getOne<{ status: string; secret_enc: string | null; release_tx_hash: string | null }>(
    'SELECT status, secret_enc, release_tx_hash FROM trades WHERE id = $1',
    [tradeId],
  );
  strictEqual(after?.status, 'revealing', 'A foreign contract event must not settle the trade');
  strictEqual(after?.secret_enc, 'enc_keep', 'A foreign contract event must not wipe the secret');
  strictEqual(after?.release_tx_hash ?? null, null, 'A foreign contract event must not record a settlement');
  console.log('  ✓ refunded/declined/released from another contract leave the trade untouched');
}

async function testRefundFromOwnContractStillSettles() {
  const contractTradeId = '2'.repeat(64);
  const tradeId = randomUUID();
  await insertTestTrade({ id: tradeId, status: 'locked', contractTradeId });

  await applyEscrowEvent({
    type: 'refunded',
    contractId: TEST_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-own-refund',
    txHash: 'tx_own_refund',
    ledger: 901,
  });

  const after = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeId]);
  strictEqual(after?.status, 'refunded', 'The contract that holds the trade still settles it');
  console.log('  ✓ refunded from the trade contract still settles it');
}

async function testSameTradeIdInTwoContractsOnlyMatchingRowChanges() {
  const contractTradeId = '3'.repeat(64);
  const tradeA = randomUUID();
  const tradeB = randomUUID();
  await insertTestTrade({ id: tradeA, status: 'revealing', contractTradeId, escrowContractId: TEST_CONTRACT });
  await insertTestTrade({ id: tradeB, status: 'locked', contractTradeId, escrowContractId: OTHER_CONTRACT });

  await applyEscrowEvent({
    type: 'refunded',
    contractId: OTHER_CONTRACT,
    contractTradeIdHex: contractTradeId,
    eventId: 'evt-b-refund',
    txHash: 'tx_b_refund',
    ledger: 902,
  });

  const a = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeA]);
  const b = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeB]);
  strictEqual(a?.status, 'revealing', 'Trade in contract A is untouched');
  strictEqual(b?.status, 'refunded', 'Trade in contract B is settled');
  console.log('  ✓ with the same trade_id in two contracts, only the emitting contract row changes');
}

async function testParseRejectsEventWithoutContract() {
  const parsed = parseEscrowEvent({
    id: 'evt-no-contract',
    topic: ['refunded'],
    value: [Buffer.from('4'.repeat(64), 'hex'), 'GSELLER...'],
    txHash: 'tx_no_contract',
    ledger: 903,
  }, (v: unknown) => v);
  strictEqual(parsed, null, 'An event without its contract cannot be applied');
  console.log('  ✓ parseEscrowEvent rejects an event without its contract');
}

async function testParseRejectsFailedCallEvent() {
  const parsed = parseEscrowEvent({
    id: 'evt-failed-call',
    contractId: TEST_CONTRACT,
    inSuccessfulContractCall: false,
    topic: ['released'],
    value: [Buffer.from('5'.repeat(64), 'hex'), 'GSELLER...', 'GBUYER...'],
    txHash: 'tx_failed_call',
    ledger: 904,
  }, (v: unknown) => v);
  strictEqual(parsed, null, 'An event from a failed contract call is not a settlement');
  console.log('  ✓ parseEscrowEvent rejects an event from a failed contract call');
}

async function testListenerSkipsEventFromAnotherContract() {
  const dispatched: RawContractEvent[] = [];
  const keys: string[] = [];
  const foreign = { ...makeEvent('evt-l-foreign', 'refunded', Buffer.alloc(32)), contractId: OTHER_CONTRACT };
  const missing = { ...makeEvent('evt-l-missing', 'refunded', Buffer.alloc(32)), contractId: undefined };
  const own = makeEvent('evt-l-own', 'refunded', Buffer.alloc(32));
  let served = false;

  const deps = makeDeps({
    fetchEvents: async (): Promise<EventBatch> => {
      if (served) return { events: [], latestLedger: 102 };
      served = true;
      return { events: [foreign, missing, own], latestLedger: 102 };
    },
    isProcessed: async (key) => { keys.push(key); return false; },
    dispatch: async (event) => { dispatched.push(event); },
  });
  const listener = new EscrowEventListener(TEST_CONTRACT, deps, { pollIntervalMs: 10_000 });
  await listener.start();
  await delay(50);
  listener.stop();

  strictEqual(dispatched.length, 2, 'Only events of this listener contract are dispatched');
  ok(dispatched.every((e) => e.contractId === TEST_CONTRACT), 'Dispatched events carry the listener contract');
  ok(!dispatched.some((e) => e.id === 'evt-l-foreign'), 'The foreign event is not dispatched');
  ok(keys.every((k) => k.startsWith(`${TEST_CONTRACT}:`)), 'Dedup key includes the contract');
  console.log('  ✓ listener skips events from another contract and scopes the rest to its own');
}

// ── Runner ────────────────────────────────────────────────────────────────

const SUITES = [
  { name: 'jitteredBackoff', tests: [testBackoffRange, testBackoffGrowth] },
  { name: 'isBeforeOldestLedgerError', tests: [testBeforeOldestLedgerError] },
  { name: 'EscrowEventListener — health', tests: [testHealthWhenStopped, testHealthAfterSuccessfulPoll, testHealthAfterStale] },
  { name: 'EscrowEventListener — reconnect', tests: [testReconnectAfterError, testGapOnOldestLedgerError] },
  { name: 'WP4 — durable and complete events', tests: [testFailedDispatchIsRetriedOnce, testFailedDispatchHoldsTheCursor, testAllPagesAreProcessed, testPageCapResumesOnNextPoll, testFailureOnSecondPageKeepsItsLedger] },
  { name: 'EscrowEventListener — deduplication', tests: [testDuplicateEventSkipped, testDuplicateAcrossPolls] },
  { name: 'parseEscrowEvent', tests: [testParseReleasedEvent, testParseRefundedEvent, testParseDeclinedEvent, testParseLockedEvent, testParseUnknownEventReturnsNull, testParseMalformedValueReturnsNull, testParseWrongTradeIdLength] },
  { name: 'H1 — contract + trade_id identity', tests: [testRefundFromOtherContractDoesNotTouchTrade, testRefundFromOwnContractStillSettles, testSameTradeIdInTwoContractsOnlyMatchingRowChanges, testParseRejectsEventWithoutContract, testParseRejectsFailedCallEvent, testListenerSkipsEventFromAnotherContract] },
  { name: 'applyEscrowEvent — idempotency', tests: [testApplyReleasedIdempotentOnCompleted, testApplyRefundedSettlesCancelledTrade, testLateRefundedEventKeepsRefundedTrade, testRefundedEventIsIdempotent, testApplyReleasedUpdatesActiveTradeToCompleted, testApplyRefundedUpdatesActiveTradeToRefunded, testApplyDeclinedUpdatesCancelledTradeToRefunded] },
];

async function runAll() {
  let passed = 0;
  let failed = 0;

  for (const suite of SUITES) {
    console.log(`\n${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test();
        passed++;
      } catch (err: any) {
        console.error(`  ✗ ${test.name}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

runAll().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
