/**
 * WP5 del plan de correcciones del escrow: conciliacion contra la cadena.
 *
 * El listener y las rutas HTTP pueden perder un evento; `get_trade` no. Cada
 * ciclo compara las filas con su contrato y:
 *   - corrige lo que la cadena ya decidio (`Released`/`Refunded` con la fila
 *     abierta), con un UPDATE condicionado al estado leido;
 *   - marca para soporte lo que no se corrige solo (`chain_review_reason`): una
 *     fila terminal que contradice a la cadena no se reescribe;
 *   - no toca nada si no pudo leer: RPC caido o registro archivado no son un
 *     resultado.
 *
 * Nunca envia transacciones.
 */

import pino from 'pino';
import db from '../db/schema.js';
import { insertTradeAuditEvent } from '../db/audit-log.model.js';
import { config } from '../config.js';
import { readEscrowTrade, type OnChainEscrowTrade } from './stellar.service.js';
import { escrowContractForTrade } from './escrowContract.js';
import { contractTradeIdFor } from './lockAttempt.service.js';

const logger = pino({ name: 'escrow-reconciliation' });

const ACTOR = 'system:reconciliation';
const SETTLED = new Set(['completed', 'refunded']);
const SECONDS_PER_LEDGER = 5;

export type ChainReviewReason =
  | 'chain_locked_db_settled'
  | 'settlement_conflict'
  | 'escrow_mismatch'
  | 'escrow_not_found';

export interface ReconciliationCounts {
  checked: number;
  corrected: number;
  review: number;
  unreadable: number;
}

type TradeRow = Record<string, any> & { id: string; status: string; escrow_contract_id?: string | null };

export type ReconcileAction =
  | { kind: 'none' }
  | { kind: 'capture_timeout' }
  | { kind: 'settle'; toState: 'completed' | 'refunded' }
  | { kind: 'review'; reason: ChainReviewReason };

/** Decision pura: que hacer con una fila dado lo que dice el contrato. */
export function decideReconciliation(
  trade: { status: string; lock_tx_hash?: string | null; funds_timeout_ledger?: number | null },
  onChain: OnChainEscrowTrade | null,
  expected: { seller?: string | null; buyer?: string | null; amountStroops: bigint },
): ReconcileAction {
  const settled = SETTLED.has(trade.status);

  if (!onChain) {
    // Un intento sin confirmar que no esta en cadena es asunto de WP2. Una fila
    // terminal puede haber salido del almacenamiento: solo se marca si sigue abierta.
    return trade.lock_tx_hash && !settled ? { kind: 'review', reason: 'escrow_not_found' } : { kind: 'none' };
  }
  if (
    onChain.seller !== expected.seller
    || onChain.buyer !== expected.buyer
    || onChain.amount !== expected.amountStroops
  ) {
    return { kind: 'review', reason: 'escrow_mismatch' };
  }

  if (onChain.status === 'Locked') {
    if (settled) return { kind: 'review', reason: 'chain_locked_db_settled' };
    return trade.lock_tx_hash && trade.funds_timeout_ledger == null ? { kind: 'capture_timeout' } : { kind: 'none' };
  }

  const toState = onChain.status === 'Released' ? 'completed' : onChain.status === 'Refunded' ? 'refunded' : null;
  if (!toState) return { kind: 'review', reason: 'escrow_mismatch' };
  if (!settled) return { kind: 'settle', toState };
  return trade.status === toState ? { kind: 'none' } : { kind: 'review', reason: 'settlement_conflict' };
}

async function settle(trade: TradeRow, toState: 'completed' | 'refunded', contractId: string, latestLedger: number): Promise<boolean> {
  await db.execute(
    `UPDATE trades
        SET status       = $2,
            lock_tx_hash = $4,
            completed_at = NOW(),
            secret_enc   = NULL,
            secret_nonce = NULL
      WHERE id = $1
        AND status = $3`,
    [trade.id, toState, trade.status, trade.lock_tx_hash ?? trade.lock_submitted_tx_hash],
  );
  const after = await db.getOne<{ status: string }>('SELECT status FROM trades WHERE id = $1', [trade.id]);
  if (after?.status !== toState) return false;

  await insertTradeAuditEvent({
    tradeId: trade.id,
    fromState: trade.status,
    toState,
    actor: ACTOR,
    metadata: { source: 'reconciliation', evidence: 'reconciled', contract_id: contractId, ledger: latestLedger },
  });
  logger.warn(
    { trade_id: trade.id, from: trade.status, to: toState, contract_id: contractId, ledger: latestLedger, category: 'escrow-reconciliation' },
    '[reconciliation] Trade corrected from chain state',
  );
  return true;
}

async function setReview(trade: TradeRow, reason: ChainReviewReason, contractId: string, onChain: OnChainEscrowTrade | null): Promise<void> {
  if (trade.chain_review_reason === reason) return;
  await db.execute(
    'UPDATE trades SET chain_review_reason = $2, chain_review_at = NOW() WHERE id = $1',
    [trade.id, reason],
  );
  await insertTradeAuditEvent({
    tradeId: trade.id,
    fromState: trade.status,
    toState: trade.status,
    actor: ACTOR,
    metadata: { source: 'reconciliation', review: reason, contract_id: contractId, on_chain_status: onChain?.status ?? null },
  });
  logger.error(
    { trade_id: trade.id, status: trade.status, reason, contract_id: contractId, on_chain_status: onChain?.status ?? null, category: 'escrow-reconciliation' },
    '[reconciliation] Discrepancy with chain, needs review',
  );
}

async function clearReview(trade: TradeRow, contractId: string): Promise<void> {
  await db.execute('UPDATE trades SET chain_review_reason = NULL, chain_review_at = NULL WHERE id = $1', [trade.id]);
  await insertTradeAuditEvent({
    tradeId: trade.id,
    fromState: trade.status,
    toState: trade.status,
    actor: ACTOR,
    metadata: { source: 'reconciliation', review_cleared: trade.chain_review_reason, contract_id: contractId },
  });
}

async function reconcileTrade(trade: TradeRow, counts: ReconciliationCounts): Promise<void> {
  const contractId = escrowContractForTrade(trade);
  const hex: string = trade.contract_trade_id ?? contractTradeIdFor(trade.secret_hash);

  // Si no se pudo leer, lanza aqui sin haber cambiado nada: se reintenta en el siguiente ciclo.
  const { trade: onChain, latestLedger } = await readEscrowTrade({
    contractId,
    tradeIdBytes: Buffer.from(hex, 'hex'),
  });
  counts.checked++;

  const seller = await db.getOne<{ stellar_address: string }>('SELECT stellar_address FROM users WHERE id = $1', [trade.seller_id]);
  const buyer = await db.getOne<{ stellar_address: string }>('SELECT stellar_address FROM users WHERE id = $1', [trade.buyer_id]);
  const action = decideReconciliation(trade, onChain, {
    seller: seller?.stellar_address,
    buyer: buyer?.stellar_address,
    amountStroops: BigInt(trade.amount_stroops),
  });

  if (action.kind === 'review') {
    await setReview(trade, action.reason, contractId, onChain);
    counts.review++;
  } else {
    if (action.kind === 'settle' && await settle(trade, action.toState, contractId, latestLedger)) counts.corrected++;
    if (action.kind === 'capture_timeout' && onChain) {
      const estimate = new Date(Date.now() + (onChain.timeoutLedger - latestLedger) * SECONDS_PER_LEDGER * 1000);
      await db.execute(
        `UPDATE trades SET funds_timeout_ledger = $2, funds_expires_at_estimate = $3
          WHERE id = $1 AND funds_timeout_ledger IS NULL`,
        [trade.id, onChain.timeoutLedger, estimate.toISOString()],
      );
    }
    if (trade.chain_review_reason) await clearReview(trade, contractId);
  }
  await db.execute('UPDATE trades SET chain_checked_at = NOW() WHERE id = $1', [trade.id]);
}

/**
 * Filas con lock (confirmado o intentado): abiertas y terminales recientes.
 * Con `contractId` (hueco del listener) se revisa todo ese contrato, sin limite
 * de fecha ni de cantidad: esos eventos ya no se pueden leer.
 */
async function candidates(contractId?: string): Promise<TradeRow[]> {
  const hasLock = '(lock_tx_hash IS NOT NULL OR lock_submitted_tx_hash IS NOT NULL)';
  if (contractId) {
    const rows = await db.getMany<TradeRow>(`SELECT * FROM trades WHERE ${hasLock}`);
    return rows.filter((row) => {
      try {
        return escrowContractForTrade(row) === contractId;
      } catch {
        return false;
      }
    });
  }
  const limit = Math.max(1, Math.floor(config.reconciliationBatchSize));
  return db.getMany<TradeRow>(
    `SELECT * FROM trades
     WHERE ${hasLock}
       AND (status NOT IN ('completed', 'refunded')
            OR completed_at > NOW() - make_interval(days => $1))
     ORDER BY chain_checked_at ASC NULLS FIRST
     LIMIT ${limit}`,
    [config.reconciliationLookbackDays],
  );
}

/** Un ciclo. Los errores son por fila: una lectura fallida no detiene a las demas. */
export async function reconcileEscrowTrades(opts: { contractId?: string } = {}): Promise<ReconciliationCounts> {
  const counts: ReconciliationCounts = { checked: 0, corrected: 0, review: 0, unreadable: 0 };
  if (config.mockStellar) return counts;

  for (const trade of await candidates(opts.contractId)) {
    try {
      await reconcileTrade(trade, counts);
    } catch (err) {
      counts.unreadable++;
      logger.warn({ err, trade_id: trade.id, category: 'escrow-reconciliation' }, '[reconciliation] Could not verify trade, retry next cycle');
    }
  }
  return counts;
}
