import type { TradeData, TradeFlow } from '../services/api';

/** Estados de una operación que sigue abierta. */
export const OPEN_TRADE_STATUSES = ['pending', 'locked', 'revealing'];

/**
 * WP3: decide si se retoma una operación en vez de crear otra.
 *
 *   · `retry`: la que se creó y no se pudo bloquear. Mientras siga `pending`,
 *     reintentar la usa a ella (cada reintento creaba una nueva).
 *   · `active`: las abiertas del usuario. Una con el mismo agente, flujo y
 *     monto se retoma; con otro monto es un conflicto que la persona decide.
 */
export function pickReusableTrade(input: {
  retry: TradeData | null;
  active: TradeData[];
  counterpartyId: string;
  flow: TradeFlow;
  amountMxn: number;
}): { trade: TradeData | null; conflict: TradeData | null } {
  const { retry, active, counterpartyId, flow, amountMxn } = input;
  if (retry && retry.status === 'pending') return { trade: retry, conflict: null };

  const sameAgent = active.find((t) =>
    (t.seller_id === counterpartyId || t.buyer_id === counterpartyId)
    && (t.flow ?? 'deposit') === flow
    && OPEN_TRADE_STATUSES.includes(t.status));
  if (!sameAgent) return { trade: null, conflict: null };
  return Number(sameAgent.amount_mxn) === Number(amountMxn)
    ? { trade: sameAgent, conflict: null }
    : { trade: null, conflict: sameAgent };
}
