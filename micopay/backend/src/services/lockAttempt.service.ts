/**
 * WP2 del plan de correcciones del escrow (N1): un lock enviado nunca queda
 * huerfano.
 *
 * Antes, si la confirmacion tardaba mas de 30 s, `lockTrade` respondia error y
 * la fila seguia `pending` sin rastro del envio. Si la transaccion entraba
 * despues, los fondos del vendedor quedaban bloqueados en el contrato sin que
 * la app lo supiera: ni boton de reembolso ni sweep.
 *
 * Ahora el hash del XDR firmado se guarda ANTES de enviarlo
 * (`lock_submitted_tx_hash`) y el intento se resuelve contra la cadena:
 *   - `getTransaction` del RPC: SUCCESS confirma, FAILED descarta;
 *   - si el RPC ya no la conoce y paso su ventana de validez, `get_trade`
 *     decide: el escrow existe (y coincide) o la transaccion nunca entro;
 *   - el evento `locked` del contrato (dispatcher) confirma tambien.
 * Ningun camino descarta un intento sin una respuesta definitiva de la red.
 */
import { createHash } from 'crypto';
import pino from 'pino';
import db from '../db/schema.js';
import { config } from '../config.js';
import { insertTradeAuditEvent } from '../db/audit-log.model.js';
import { rpcRead } from '../lib/stellarRpc.js';
import { CircuitOpenError } from '../lib/circuitBreaker.js';
import { readEscrowTrade } from './stellar.service.js';
import { escrowContractForTrade } from './escrowContract.js';
import { captureFundsTimeout } from './fundsDeadline.service.js';
import { sendTradeUpdateNotification } from './push.service.js';
import { AppError, ConflictError } from '../utils/errors.js';

const logger = pino({ name: 'lock-attempt' });

/**
 * `prepareLockTx` arma el lock con `setTimeout(180)`: pasado ese tiempo desde
 * que se preparo, la red ya no puede aplicarlo. Se cuenta desde el envio (que
 * es posterior) y con margen, asi que el limite es conservador.
 */
export const LOCK_TX_VALIDITY_SECONDS = 180;
const LOCK_EXPIRY_GRACE_SECONDS = 60;

/** Cuando la red ya no puede aplicar un lock enviado en `submittedAt`. */
export function lockAttemptExpired(submittedAt: string | Date, now = new Date()): boolean {
  const ageMs = now.getTime() - new Date(submittedAt).getTime();
  return ageMs > (LOCK_TX_VALIDITY_SECONDS + LOCK_EXPIRY_GRACE_SECONDS) * 1000;
}

/** sha256(secret_hash), igual que `compute_trade_id()` del contrato. */
export function contractTradeIdFor(secretHash: string): string {
  return createHash('sha256').update(Buffer.from(secretHash, 'hex')).digest('hex');
}

export class LockConfirmingError extends AppError {
  constructor(txHash: string) {
    super(
      'LOCK_CONFIRMING',
      'Tu bloqueo anterior se envió a la red y aún no se confirma. Espera un momento antes de volver a intentarlo.',
      `Lock attempt ${txHash} is still unresolved`,
      409,
    );
  }
}

type TradeRow = Record<string, any>;

/**
 * Guarda el intento antes de enviarlo. Un reenvio del MISMO XDR (mismo hash)
 * no cambia nada: la red lo aplica a lo sumo una vez. Un XDR distinto mientras
 * otro sigue sin resolver se rechaza, porque los dos podrian entrar.
 */
export async function recordLockSubmission(tradeId: string, secretHash: string, txHash: string): Promise<void> {
  const current = await db.getOne('SELECT status, lock_submitted_tx_hash FROM trades WHERE id = $1', [tradeId]);
  if (!current) throw new ConflictError('Trade disappeared before lock submission');
  if (current.lock_submitted_tx_hash === txHash) return;
  if (current.lock_submitted_tx_hash) throw new LockConfirmingError(current.lock_submitted_tx_hash);

  await db.execute(
    `UPDATE trades
     SET lock_submitted_tx_hash = $2,
         lock_submitted_at = NOW(),
         contract_trade_id = $3
     WHERE id = $1 AND status = 'pending' AND lock_submitted_tx_hash IS NULL`,
    [tradeId, txHash, contractTradeIdFor(secretHash)],
  );

  // El UPDATE es condicional: si otra peticion gano, o la fila dejo de estar
  // `pending`, no se envia nada.
  const after = await db.getOne('SELECT status, lock_submitted_tx_hash FROM trades WHERE id = $1', [tradeId]);
  if (after?.lock_submitted_tx_hash !== txHash) {
    if (after?.lock_submitted_tx_hash) throw new LockConfirmingError(after.lock_submitted_tx_hash);
    throw new ConflictError(`Trade is ${after?.status ?? 'missing'}, expected pending`);
  }
}

/**
 * Errores de envio que SI son una respuesta definitiva: la red rechazo el lock,
 * no lo acepto en la cola, fallo en cadena, o no se llego a contactar el RPC
 * (circuito abierto). Cualquier otro (incierto, espera agotada, desconocido)
 * puede haber entrado y el intento se conserva.
 */
const DEFINITIVE_LOCK_FAILURES = new Set([
  'STELLAR_LOCK_SEND_FAILED',
  'STELLAR_LOCK_NOT_ACCEPTED',
  'STELLAR_TRANSACTION_FAILED',
]);

export function lockAttemptMayHaveLanded(err: unknown): boolean {
  if (err instanceof CircuitOpenError) return false;
  return !DEFINITIVE_LOCK_FAILURES.has((err as any)?.code);
}

/** Olvida un intento que la red rechazo o que nunca llego a ella. */
export async function clearLockAttempt(tradeId: string, txHash: string, reason: string): Promise<void> {
  await db.execute(
    `UPDATE trades
     SET lock_submitted_tx_hash = NULL,
         lock_submitted_at = NULL
     WHERE id = $1 AND lock_submitted_tx_hash = $2`,
    [tradeId, txHash],
  );
  logger.info({ trade_id: tradeId, tx_hash: txHash, reason, category: 'lock-attempt' }, '[lock-attempt] Attempt cleared');
}

/**
 * Registra el lock confirmado. Desde `pending` pasa a `locked`. Si la
 * operacion se cancelo mientras se confirmaba, sigue `cancelled` pero con
 * `lock_tx_hash`: asi el sweep la reembolsa al vencer, en vez de dejar los
 * fondos olvidados en el contrato.
 *
 * Idempotente: una fila que ya tiene `lock_tx_hash` no se toca.
 */
export async function markLockConfirmed(params: {
  tradeId: string;
  lockTxHash: string;
  actor: string;
  /** De donde salio la confirmacion: 'http', 'rpc', 'get_trade' o 'event'. */
  source: string;
  requestId?: string | null;
  /** WP3: plazo en cadena ya conocido (evento o `get_trade`); si falta, se lee. */
  fundsTimeout?: { timeoutLedger: number; latestLedger: number };
}): Promise<'locked' | 'cancelled' | 'noop'> {
  const { tradeId, lockTxHash, actor, source } = params;
  const trade = await db.getOne('SELECT * FROM trades WHERE id = $1', [tradeId]);
  if (!trade) return 'noop';

  if (trade.lock_tx_hash) {
    if (trade.lock_tx_hash !== lockTxHash) {
      logger.error(
        { trade_id: tradeId, recorded: trade.lock_tx_hash, confirmed: lockTxHash, source, category: 'lock-attempt' },
        '[lock-attempt] Trade already has a different lock — not overwritten',
      );
    }
    return 'noop';
  }

  const contractTradeId = contractTradeIdFor(trade.secret_hash);
  let toState: 'locked' | 'cancelled';
  if (trade.status === 'pending') {
    toState = 'locked';
    await db.execute(
      `UPDATE trades
       SET status = 'locked',
           stellar_trade_id = $2,
           lock_tx_hash = $2,
           locked_at = NOW(),
           contract_trade_id = $3,
           lock_submitted_tx_hash = NULL,
           lock_submitted_at = NULL
       WHERE id = $1 AND status = 'pending' AND lock_tx_hash IS NULL`,
      [tradeId, lockTxHash, contractTradeId],
    );
  } else if (trade.status === 'cancelled') {
    toState = 'cancelled';
    await db.execute(
      `UPDATE trades
       SET stellar_trade_id = $2,
           lock_tx_hash = $2,
           locked_at = NOW(),
           contract_trade_id = $3,
           lock_submitted_tx_hash = NULL,
           lock_submitted_at = NULL
       WHERE id = $1 AND status = 'cancelled' AND lock_tx_hash IS NULL`,
      [tradeId, lockTxHash, contractTradeId],
    );
  } else {
    logger.error(
      { trade_id: tradeId, status: trade.status, lock_tx_hash: lockTxHash, source, category: 'lock-attempt' },
      '[lock-attempt] Lock confirmed for a trade in an unexpected state — not applied',
    );
    return 'noop';
  }

  const after = await db.getOne('SELECT status, lock_tx_hash FROM trades WHERE id = $1', [tradeId]);
  if (after?.lock_tx_hash !== lockTxHash) return 'noop'; // otra via gano la carrera

  // La marca de repeticion la pone `lockTrade` en la ruta HTTP; aqui solo se
  // asegura que exista para las demas vias.
  await db.insertUnique(
    `INSERT INTO processed_tx (tx_hash, source_route, user_id, processed_at)
     VALUES ($1, 'trade/lock', $2, NOW())
     RETURNING tx_hash`,
    [lockTxHash, trade.seller_id],
    'tx_hash',
  );

  await insertTradeAuditEvent({
    tradeId,
    fromState: trade.status,
    toState,
    actor,
    requestId: params.requestId ?? undefined,
    metadata: {
      success: true,
      lock_tx_hash: lockTxHash,
      stellar_trade_id: lockTxHash,
      confirmed_by: source,
    },
  });

  // WP3: el plazo de los fondos corre desde ESTE lock, no desde la creacion.
  await captureFundsTimeout(trade, params.fundsTimeout);

  if (toState === 'locked') {
    // Bloquea el vendedor; el aviso es para el comprador.
    sendTradeUpdateNotification(trade.buyer_id, { tradeId, kind: 'locked', amountMxn: Number(trade.amount_mxn) })
      .catch((err: unknown) => logger.error({ err, trade_id: tradeId, category: 'lock-attempt' }, '[lock-attempt] Push notification failed silently'));
  }
  return toState;
}

export type LockAttemptResolution = 'none' | 'locked' | 'cleared' | 'pending';

/**
 * Resuelve el intento guardado de una fila contra la cadena. 'pending' quiere
 * decir "todavia no se sabe": nunca se descarta un intento por una falla del
 * RPC ni por un desacuerdo con lo que hay en el contrato.
 */
export async function resolveSubmittedLock(trade: TradeRow, actor = 'system:lock-attempt'): Promise<LockAttemptResolution> {
  const txHash: string | null = trade.lock_submitted_tx_hash ?? null;
  if (!txHash) return 'none';
  if (trade.lock_tx_hash) return 'locked';

  let status: string | null;
  try {
    status = (await rpcRead(config.stellarRpcUrl, (s) => s.getTransaction(txHash))).status;
  } catch {
    status = null;
  }

  if (status === 'SUCCESS') {
    await markLockConfirmed({ tradeId: trade.id, lockTxHash: txHash, actor, source: 'rpc' });
    return 'locked';
  }
  if (status === 'FAILED') {
    await clearLockAttempt(trade.id, txHash, 'failed_on_chain');
    return 'cleared';
  }
  if (status !== 'NOT_FOUND') return 'pending';

  // El RPC no la conoce: o aun no entra, o ya paso su ventana de historial.
  if (!trade.lock_submitted_at || !lockAttemptExpired(trade.lock_submitted_at)) return 'pending';

  let onChain;
  try {
    onChain = await readEscrowTrade({
      contractId: escrowContractForTrade(trade),
      tradeIdBytes: Buffer.from(contractTradeIdFor(trade.secret_hash), 'hex'),
    });
  } catch {
    return 'pending';
  }

  if (!onChain.trade) {
    // Paso su ventana de validez y el contrato no tiene el escrow: no entro.
    await clearLockAttempt(trade.id, txHash, 'expired_not_on_chain');
    return 'cleared';
  }

  const seller = await db.getOne('SELECT stellar_address FROM users WHERE id = $1', [trade.seller_id]);
  const buyer = await db.getOne('SELECT stellar_address FROM users WHERE id = $1', [trade.buyer_id]);
  const matches = onChain.trade.seller === seller?.stellar_address
    && onChain.trade.buyer === buyer?.stellar_address
    && onChain.trade.amount === BigInt(trade.amount_stroops);
  if (!matches) {
    logger.error(
      { trade_id: trade.id, tx_hash: txHash, on_chain: { seller: onChain.trade.seller, buyer: onChain.trade.buyer, amount: String(onChain.trade.amount) }, category: 'lock-attempt' },
      '[lock-attempt] Escrow on chain does not match the trade — needs review',
    );
    return 'pending';
  }
  if (onChain.trade.status !== 'Locked') {
    // Ya se libero o reembolso en cadena: lo corrige la conciliacion (WP5).
    logger.warn(
      { trade_id: trade.id, tx_hash: txHash, on_chain_status: onChain.trade.status, category: 'lock-attempt' },
      '[lock-attempt] Escrow already settled on chain — left for reconciliation',
    );
    return 'pending';
  }

  // El escrow coincide y solo pudo crearlo un lock firmado por este vendedor
  // con estos argumentos; el hash guardado es el de ese envio.
  await markLockConfirmed({
    tradeId: trade.id,
    lockTxHash: txHash,
    actor,
    source: 'get_trade',
    fundsTimeout: { timeoutLedger: onChain.trade.timeoutLedger, latestLedger: onChain.latestLedger },
  });
  return 'locked';
}

/** Ciclo de fondo: resuelve todos los intentos abiertos. Errores por fila, no fatales. */
export async function resolveSubmittedLocks(): Promise<{ locked: number; cleared: number; pending: number }> {
  const counts = { locked: 0, cleared: 0, pending: 0 };
  if (config.mockStellar) return counts;

  const rows = await db.getMany(
    `SELECT * FROM trades
     WHERE lock_submitted_tx_hash IS NOT NULL
       AND lock_tx_hash IS NULL`,
  );
  for (const row of rows) {
    try {
      const r = await resolveSubmittedLock(row);
      if (r === 'locked' || r === 'cleared' || r === 'pending') counts[r]++;
    } catch (err) {
      counts.pending++;
      logger.error({ err, trade_id: row.id, category: 'lock-attempt' }, '[lock-attempt] Could not resolve attempt');
    }
  }
  return counts;
}
