import { createHash } from 'crypto';
import { config } from '../config.js';
import db from '../db/schema.js';
import { ConflictError } from '../utils/errors.js';
import { escrowContractForTrade } from './escrowContract.js';
import { readEscrowTrade, type OnChainEscrowTrade } from './stellar.service.js';

/**
 * ¿Se puede todavia cobrar este escrow? Se pregunta ANTES de registrar una
 * entrega de efectivo: despues de esa constancia, quien entrego el efectivo
 * solo recupera su dinero si la liberacion entra en cadena.
 *
 * La base de datos no basta para responder (H1/N2 de
 * docs/audits/AUDITORIA_ESCROW_REFERENCIA_XRPL_2026-10-29.md): una fila puede
 * decir `revealing` con el escrow ya liquidado, o al reves. La respuesta sale
 * del contrato donde se bloqueo la operacion.
 */

/**
 * Segundos por ledger que asume el contrato al convertir minutos en ledgers
 * (`lib.rs`: 12 ledgers por minuto). Si la red cierra mas lento, el margen real
 * es mayor que el estimado, asi que el error va del lado seguro.
 */
const SECONDS_PER_LEDGER = 5;

export type CollectableRejection = 'not_found' | 'not_locked' | 'mismatch' | 'insufficient_margin';

export type CollectableVerdict =
  | { collectable: true; secondsRemaining: number }
  | { collectable: false; reason: CollectableRejection; detail: string; secondsRemaining?: number };

/** Decision pura, sin red: separada para poder probarla sola. */
export function evaluateEscrowCollectable(input: {
  onChain: OnChainEscrowTrade | null;
  expected: { seller: string; buyer: string; amountStroops: bigint };
  latestLedger: number;
  minMarginMinutes: number;
}): CollectableVerdict {
  const { onChain, expected } = input;
  if (!onChain) {
    return { collectable: false, reason: 'not_found', detail: 'the contract has no escrow for this trade_id' };
  }
  if (onChain.status !== 'Locked') {
    return { collectable: false, reason: 'not_locked', detail: `on-chain status is ${onChain.status}` };
  }
  if (onChain.seller !== expected.seller || onChain.buyer !== expected.buyer || onChain.amount !== expected.amountStroops) {
    return {
      collectable: false,
      reason: 'mismatch',
      detail: `on-chain escrow (${onChain.seller} -> ${onChain.buyer}, ${onChain.amount}) does not match the trade`,
    };
  }

  const secondsRemaining = Math.max(0, (onChain.timeoutLedger - input.latestLedger) * SECONDS_PER_LEDGER);
  if (secondsRemaining < input.minMarginMinutes * 60) {
    return {
      collectable: false,
      reason: 'insufficient_margin',
      detail: `${secondsRemaining}s left on-chain, ${input.minMarginMinutes} min required`,
      secondsRemaining,
    };
  }
  return { collectable: true, secondsRemaining };
}

const USER_MESSAGES: Record<CollectableRejection, string> = {
  not_found: 'No encontramos los fondos de este intercambio en la red. No entregues efectivo.',
  not_locked: 'Los fondos de este intercambio ya no están en garantía. No entregues efectivo.',
  mismatch: 'Los fondos en garantía no corresponden a este intercambio. No entregues efectivo.',
  insufficient_margin: 'Queda muy poco tiempo para cobrar este intercambio. No entregues efectivo.',
};

/**
 * Lanza si el escrow de la operacion no se puede cobrar con margen. Con
 * MOCK_STELLAR no hay contrato que leer y la comprobacion se omite.
 * Si la red no responde, `readEscrowTrade` lanza ESCROW_UNVERIFIABLE: sin
 * confirmacion no hay entrega.
 */
export async function assertEscrowCollectable(trade: {
  id: string;
  seller_id: string;
  buyer_id: string;
  amount_stroops: string | number;
  secret_hash: string;
  escrow_contract_id?: string | null;
  asset_code?: string | null;
}): Promise<void> {
  if (config.mockStellar) return;

  const seller = await db.getOne<{ stellar_address: string }>('SELECT stellar_address FROM users WHERE id = $1', [trade.seller_id]);
  const buyer = await db.getOne<{ stellar_address: string }>('SELECT stellar_address FROM users WHERE id = $1', [trade.buyer_id]);

  const tradeIdBytes = createHash('sha256').update(Buffer.from(trade.secret_hash, 'hex')).digest();
  const { trade: onChain, latestLedger } = await readEscrowTrade({
    contractId: escrowContractForTrade(trade),
    tradeIdBytes,
  });

  const verdict = evaluateEscrowCollectable({
    onChain,
    expected: {
      seller: seller?.stellar_address ?? '',
      buyer: buyer?.stellar_address ?? '',
      amountStroops: BigInt(trade.amount_stroops),
    },
    latestLedger,
    minMarginMinutes: config.cashHandoffMinMarginMinutes,
  });

  if (!verdict.collectable) {
    throw new ConflictError(
      `ESCROW_${verdict.reason.toUpperCase()}`,
      USER_MESSAGES[verdict.reason],
      `Trade ${trade.id}: ${verdict.detail}`,
    );
  }
}
