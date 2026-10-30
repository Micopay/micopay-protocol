/**
 * WP3 del plan de correcciones del escrow (H2): un solo plazo, el de la cadena.
 *
 * Antes la app decidia reembolsos con `expires_at`, que corre desde que se CREA
 * la solicitud. El contrato, en cambio, fija `timeout_ledger` al BLOQUEAR
 * (`sequence + timeout_minutes * 12`) y `refund` solo pasa cuando
 * `sequence >= timeout_ledger`. Una operacion bloqueada 30 minutos despues de
 * crearse quedaba "vencida" en la app media hora antes que en la cadena: el
 * boton de reembolso fallaba con `TimeoutNotReached`.
 *
 * Ahora:
 *   - `funds_timeout_ledger` es el plazo real (de `get_trade` o del evento);
 *   - `funds_expires_at_estimate` es solo para mostrar una cuenta regresiva;
 *   - el reembolso se decide comparando contra el ultimo ledger del RPC.
 *
 * En modo mock no hay ledger: se usa `expires_at`, como antes.
 */
import { createHash } from 'crypto';
import pino from 'pino';
import db from '../db/schema.js';
import { config } from '../config.js';
import { rpcRead } from '../lib/stellarRpc.js';
import { readEscrowTrade } from './stellar.service.js';
import { escrowContractForTrade } from './escrowContract.js';
import { UpstreamError } from '../utils/errors.js';

const logger = pino({ name: 'funds-deadline' });

/** Segundos por ledger que asume la estimacion (la misma cuenta que el contrato: 12 por minuto). */
export const LEDGER_SECONDS = 5;

type TradeRow = Record<string, any>;

export function estimateFromLedgers(timeoutLedger: number, latestLedger: number, now = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, timeoutLedger - latestLedger) * LEDGER_SECONDS * 1000);
}

/**
 * Plazo efectivo de la operacion para mostrar y para cortar el flujo de la
 * app: con fondos bloqueados, el estimado de la cadena; sin lock (o sin dato
 * todavia), la caducidad de la solicitud.
 */
export function tradeDeadline(trade: TradeRow): Date {
  if (trade.lock_tx_hash && trade.funds_expires_at_estimate) return new Date(trade.funds_expires_at_estimate);
  return new Date(trade.expires_at);
}

function contractTradeIdBytes(secretHash: string): Buffer {
  // sha256(secret_hash), igual que `compute_trade_id()` del contrato.
  return createHash('sha256').update(Buffer.from(secretHash, 'hex')).digest();
}

async function recordFundsTimeout(tradeId: string, timeoutLedger: number, latestLedger: number): Promise<Date> {
  const estimate = estimateFromLedgers(timeoutLedger, latestLedger);
  await db.execute(
    `UPDATE trades
     SET funds_timeout_ledger = $2,
         funds_expires_at_estimate = $3
     WHERE id = $1`,
    [tradeId, timeoutLedger, estimate.toISOString()],
  );
  return estimate;
}

/**
 * Guarda el plazo de los fondos al confirmar un lock. Si ya se conoce (evento
 * `locked`, `get_trade` del resolvedor) se usa; si no, se lee del contrato.
 * Nunca hace fallar la confirmacion: si no se puede leer ahora, se completa
 * despues, la primera vez que alguien pregunte por el reembolso.
 */
export async function captureFundsTimeout(
  trade: TradeRow,
  known?: { timeoutLedger: number; latestLedger: number },
): Promise<void> {
  if (config.mockStellar) return;
  try {
    if (known) {
      await recordFundsTimeout(trade.id, known.timeoutLedger, known.latestLedger);
      return;
    }
    const { trade: onChain, latestLedger } = await readEscrowTrade({
      contractId: escrowContractForTrade(trade),
      tradeIdBytes: contractTradeIdBytes(trade.secret_hash),
    });
    if (onChain) await recordFundsTimeout(trade.id, onChain.timeoutLedger, latestLedger);
  } catch (err) {
    logger.warn({ err, trade_id: trade.id, category: 'funds-deadline' }, '[funds-deadline] Could not read the on-chain timeout yet');
  }
}

export interface RefundTiming {
  /** El contrato ya acepta `refund`. */
  reached: boolean;
  /** Cuando se estima que se podra reembolsar (o cuando se pudo). */
  availableAt: Date;
}

const unverifiable = (dev: string) => new UpstreamError(
  'ESCROW_UNVERIFIABLE',
  'No pudimos confirmar el plazo del escrow. Intenta de nuevo en un momento.',
  dev,
  503,
);

/**
 * Si el contrato ya acepta el reembolso de esta operacion. Lee el ultimo
 * ledger del RPC; si el plazo aun no se conoce, lo lee del contrato y lo
 * guarda. Cualquier falla de lectura lanza ESCROW_UNVERIFIABLE: "no pude
 * leer" nunca es "ya vencio".
 */
export async function fundsRefundTiming(trade: TradeRow, now = new Date()): Promise<RefundTiming> {
  if (config.mockStellar) {
    const availableAt = new Date(trade.funds_expires_at_estimate ?? trade.expires_at);
    return { reached: availableAt.getTime() <= now.getTime(), availableAt };
  }

  let timeoutLedger: number | null = trade.funds_timeout_ledger ?? null;
  let latestLedger: number;

  if (timeoutLedger == null) {
    const { trade: onChain, latestLedger: latest } = await readEscrowTrade({
      contractId: escrowContractForTrade(trade),
      tradeIdBytes: contractTradeIdBytes(trade.secret_hash),
    });
    if (!onChain) throw unverifiable(`Trade ${trade.id} has a lock but the contract has no escrow for it`);
    timeoutLedger = onChain.timeoutLedger;
    latestLedger = latest;
    await recordFundsTimeout(trade.id, timeoutLedger, latestLedger);
  } else {
    try {
      latestLedger = (await rpcRead(config.stellarRpcUrl, (s) => s.getLatestLedger())).sequence;
    } catch (err) {
      throw unverifiable(`getLatestLedger failed: ${(err as Error)?.message ?? String(err)}`);
    }
  }

  // El contrato: `if sequence < timeout_ledger { TimeoutNotReached }`. El
  // ultimo ledger cerrado es una cota conservadora del que incluira el refund.
  return {
    reached: latestLedger >= timeoutLedger,
    availableAt: estimateFromLedgers(timeoutLedger, latestLedger, now),
  };
}
