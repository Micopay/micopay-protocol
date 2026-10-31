import { hash } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import type { TradeData } from './api';
import { validatePreparedEscrowTx } from './escrowTxValidation';
import { WalletRequestRejected, type EscrowRequestSummary } from './walletRequest';

export interface EscrowIntent extends EscrowRequestSummary {
  tradeId: string;
  amountMxn: number;
  assetCode: string | null;
  /** Lo que sale del escrow o entra en el, en stroops; null si es operacion antigua. */
  amountStroops: string | null;
  seller: string | null;
  buyer: string | null;
}

interface IntentDeps {
  listActive: (token: string) => Promise<Pick<TradeData, 'id' | 'secret_hash'>[]>;
  getTrade: (tradeId: string, token: string) => Promise<TradeData>;
  validate?: typeof validatePreparedEscrowTx;
}

function matches(trade: Pick<TradeData, 'secret_hash'>, summary: EscrowRequestSummary): boolean {
  if (summary.kind === 'secret_hash') return trade.secret_hash === summary.tradeKey;
  return hash(Buffer.from(trade.secret_hash, 'hex')).toString('hex') === summary.tradeKey;
}

/**
 * Compara lo que pide la web con la operacion autenticada del backend. La web
 * no elige el trade: se busca entre los abiertos de esta cuenta, y cualquier
 * diferencia en participantes, monto o plazo rechaza la firma.
 */
export async function resolveEscrowIntent(
  xdr: string,
  networkPassphrase: string,
  summary: EscrowRequestSummary,
  token: string,
  deps: IntentDeps,
): Promise<EscrowIntent> {
  const active = await deps.listActive(token);
  const found = active.find((trade) => matches(trade, summary));
  if (!found) throw new WalletRequestRejected('no hay una operación abierta que coincida');

  const trade = await deps.getTrade(found.id, token);
  if (trade.escrow_contract_id !== summary.contractId) {
    throw new WalletRequestRejected('el contrato no corresponde a la operación');
  }
  await (deps.validate ?? validatePreparedEscrowTx)(xdr, networkPassphrase, trade, summary.action);

  return {
    ...summary,
    tradeId: trade.id,
    amountMxn: trade.amount_mxn,
    assetCode: trade.asset_code ?? null,
    amountStroops: trade.total_locked_stroops ?? trade.amount_stroops ?? null,
    seller: trade.seller_stellar_address ?? null,
    buyer: trade.buyer_stellar_address ?? null,
  };
}
