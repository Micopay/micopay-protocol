import pino from 'pino';
import db from '../db/schema.js';
import { insertTradeAuditEvent } from '../db/audit-log.model.js';

const logger = pino({ name: 'event-dispatcher' });

// ── Types ─────────────────────────────────────────────────────────────────

/** Raw event shape from Stellar RPC getEvents. */
export interface RawContractEvent {
  id: string;
  topic: unknown[];
  value: unknown;
  txHash: string;
  ledger: number;
}

/** Parsed, XDR-free representation of a known escrow event. */
export interface ParsedEscrowEvent {
  type: 'locked' | 'released' | 'refunded';
  /** 64-char hex of the contract's trade_id (sha256 of secret_hash). */
  contractTradeIdHex: string;
  /** Stellar RPC event ID — used in audit metadata for traceability. */
  eventId: string;
  txHash: string;
  ledger: number;
}

// ── Parsing ───────────────────────────────────────────────────────────────

/**
 * Convert a raw Soroban contract event to a ParsedEscrowEvent.
 *
 * The escrow contract emits three event types:
 *   locked   → topic[0] = Symbol("locked"),   value = (trade_id, seller, buyer, amount, timeout_ledger)
 *   released → topic[0] = Symbol("released"), value = (trade_id, seller, buyer)
 *   refunded → topic[0] = Symbol("refunded"), value = (trade_id, seller)
 *
 * `scValToNative` is injected so this function is pure and unit-testable.
 *
 * Returns null for unknown or malformed events (caller should skip them).
 */
export function parseEscrowEvent(
  event: RawContractEvent,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scValToNative: (v: any) => any,
): ParsedEscrowEvent | null {
  let eventType: string;
  try {
    eventType = String(scValToNative(event.topic[0]));
  } catch {
    return null;
  }

  if (eventType !== 'locked' && eventType !== 'released' && eventType !== 'refunded') {
    return null;
  }

  let tradeIdBytes: Buffer;
  try {
    const values = scValToNative(event.value) as unknown[];
    const raw = values[0];
    if (!raw || typeof raw !== 'object') return null;
    tradeIdBytes = Buffer.from(raw as ArrayBufferLike);
    if (tradeIdBytes.length !== 32) return null;
  } catch {
    return null;
  }

  return {
    type: eventType,
    contractTradeIdHex: tradeIdBytes.toString('hex'),
    eventId: event.id,
    txHash: event.txHash,
    ledger: event.ledger,
  };
}

// ── DB mutations (idempotent) ─────────────────────────────────────────────

const ACTOR_SYSTEM = 'system:event-listener';
const TERMINAL_STATES = new Set(['completed', 'cancelled']);

/**
 * Apply a parsed escrow event to the database.
 *
 * All mutations are guarded with NOT IN ('completed', 'cancelled') so
 * re-delivering the same event is a safe no-op.
 *
 * - released  → trade transitions to completed (clears encrypted secret).
 * - refunded  → trade transitions to cancelled (clears encrypted secret).
 * - locked    → no-op (the HTTP lock route already handled this).
 */
export async function applyEscrowEvent(parsed: ParsedEscrowEvent): Promise<void> {
  if (parsed.type === 'released') {
    await handleReleased(parsed);
  } else if (parsed.type === 'refunded') {
    await handleRefunded(parsed);
  }
  // 'locked': trade already updated by the HTTP route; nothing to do here.
}

// ── Full pipeline ─────────────────────────────────────────────────────────

/**
 * Parse a raw RPC event and apply the resulting DB mutation.
 * Called by EscrowEventListener for each deduplicated event.
 */
export async function dispatchEscrowEvent(event: RawContractEvent): Promise<void> {
  const { scValToNative } = await import('@stellar/stellar-sdk');

  const parsed = parseEscrowEvent(event, scValToNative);
  if (!parsed) {
    logger.debug({ event_id: event.id }, '[dispatcher] Unknown or malformed event — skipped');
    return;
  }

  await applyEscrowEvent(parsed);
}

// ── Handlers ──────────────────────────────────────────────────────────────

async function handleReleased(ev: ParsedEscrowEvent): Promise<void> {
  const trade = await db.getOne<{ id: string; status: string }>(
    'SELECT id, status FROM trades WHERE contract_trade_id = $1',
    [ev.contractTradeIdHex],
  );

  if (!trade) {
    // Expected when the on-chain release was performed by a different environment or
    // before this server had the contract_trade_id populated.
    logger.info(
      { contract_trade_id: ev.contractTradeIdHex, ledger: ev.ledger, category: 'event-dispatcher' },
      '[dispatcher] released event for untracked trade — skipped',
    );
    return;
  }

  if (TERMINAL_STATES.has(trade.status)) {
    // Idempotent: already in a terminal state — no mutation required.
    return;
  }

  await db.execute(
    `UPDATE trades
        SET status       = 'completed',
            release_tx_hash = $2,
            completed_at = NOW(),
            secret_enc   = NULL,
            secret_nonce = NULL
      WHERE id     = $1
        AND status NOT IN ('completed', 'cancelled')`,
    [trade.id, ev.txHash],
  );

  await insertTradeAuditEvent({
    tradeId: trade.id,
    fromState: trade.status,
    toState: 'completed',
    actor: ACTOR_SYSTEM,
    metadata: {
      source: 'soroban_event',
      event_id: ev.eventId,
      release_tx_hash: ev.txHash,
      ledger: ev.ledger,
    },
  });

  logger.info(
    { trade_id: trade.id, ledger: ev.ledger, tx_hash: ev.txHash, category: 'event-dispatcher' },
    '[dispatcher] Trade completed via on-chain released event',
  );
}

async function handleRefunded(ev: ParsedEscrowEvent): Promise<void> {
  const trade = await db.getOne<{ id: string; status: string }>(
    'SELECT id, status FROM trades WHERE contract_trade_id = $1',
    [ev.contractTradeIdHex],
  );

  if (!trade) {
    logger.info(
      { contract_trade_id: ev.contractTradeIdHex, ledger: ev.ledger, category: 'event-dispatcher' },
      '[dispatcher] refunded event for untracked trade — skipped',
    );
    return;
  }

  if (TERMINAL_STATES.has(trade.status)) {
    return;
  }

  await db.execute(
    `UPDATE trades
        SET status       = 'cancelled',
            secret_enc   = NULL,
            secret_nonce = NULL
      WHERE id     = $1
        AND status NOT IN ('completed', 'cancelled')`,
    [trade.id],
  );

  await insertTradeAuditEvent({
    tradeId: trade.id,
    fromState: trade.status,
    toState: 'cancelled',
    actor: ACTOR_SYSTEM,
    metadata: {
      source: 'soroban_event',
      event_id: ev.eventId,
      cancel_reason: 'refunded_on_chain',
      refund_tx_hash: ev.txHash,
      refund_expected: true,
      ledger: ev.ledger,
    },
  });

  logger.info(
    { trade_id: trade.id, ledger: ev.ledger, tx_hash: ev.txHash, category: 'event-dispatcher' },
    '[dispatcher] Trade cancelled via on-chain refunded event',
  );
}
