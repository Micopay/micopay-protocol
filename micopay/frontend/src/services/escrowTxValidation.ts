import {
  Address,
  FeeBumpTransaction,
  Networks,
  Transaction,
  TransactionBuilder,
  hash,
  scValToNative,
  type Operation,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { getPublicKey } from '../lib/keystore';
import type { TradeData } from './api';

export type EscrowAction = 'lock' | 'release' | 'decline';

const LOCK_TIMEOUT_MINUTES = 120;
const MAX_ESCROW_FEE_STROOPS = BigInt(import.meta.env.VITE_MAX_ESCROW_FEE_STROOPS || '5000000');

export class EscrowTxMismatchError extends Error {
  constructor(detail: string) {
    super(`La transacción preparada no coincide con la operación: ${detail}`);
    this.name = 'EscrowTxMismatchError';
  }
}

function configuredNetworkPassphrase(): string {
  if (import.meta.env.VITE_NETWORK_PASSPHRASE) return import.meta.env.VITE_NETWORK_PASSPHRASE;
  const network = (import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET').toUpperCase();
  return network === 'PUBLIC' || network === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;
}

function bytesEqual(actual: unknown, expected: Uint8Array): boolean {
  return (actual instanceof Uint8Array || Buffer.isBuffer(actual))
    && Buffer.from(actual).equals(Buffer.from(expected));
}

function requiredTradeField(value: string | null | undefined, name: string): string {
  if (!value) throw new EscrowTxMismatchError(`falta ${name} en los datos autenticados del intercambio`);
  return value;
}

function assertCommonShape(
  xdr: string,
  networkPassphrase: string,
  sourceAccount: string,
  contractId: string,
): { tx: Transaction; invocation: ReturnType<Operation.InvokeHostFunction['func']['invokeContract']> } {
  if (networkPassphrase !== configuredNetworkPassphrase()) {
    throw new EscrowTxMismatchError('la red no corresponde a esta versión de la app');
  }

  const parsed = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  if (parsed instanceof FeeBumpTransaction || !(parsed instanceof Transaction)) {
    throw new EscrowTxMismatchError('no se admiten transacciones fee-bump');
  }
  if (parsed.source !== sourceAccount) throw new EscrowTxMismatchError('la cuenta source fue cambiada');
  if (parsed.signatures.length !== 0) throw new EscrowTxMismatchError('la transacción ya contiene firmas');
  if (parsed.operations.length !== 1 || parsed.operations[0].type !== 'invokeHostFunction') {
    throw new EscrowTxMismatchError('se esperaba una sola invocación de contrato');
  }
  if (parsed.memo.type !== 'none') throw new EscrowTxMismatchError('el escrow no admite memo');
  if (BigInt(parsed.fee) > MAX_ESCROW_FEE_STROOPS) throw new EscrowTxMismatchError('la comisión de red supera el límite local');

  const now = Math.floor(Date.now() / 1000);
  if (!parsed.timeBounds || Number(parsed.timeBounds.maxTime) <= now || Number(parsed.timeBounds.minTime) > now) {
    throw new EscrowTxMismatchError('la vigencia de la transacción no es válida');
  }

  const operation = parsed.operations[0] as Operation.InvokeHostFunction;
  if (operation.source && operation.source !== sourceAccount) {
    throw new EscrowTxMismatchError('la operación usa otra cuenta source');
  }
  if (operation.func.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new EscrowTxMismatchError('la operación no invoca un contrato');
  }
  const invocation = operation.func.invokeContract();
  const actualContract = Address.fromScAddress(invocation.contractAddress()).toString();
  if (actualContract !== contractId) throw new EscrowTxMismatchError('el contrato fue cambiado');
  return { tx: parsed, invocation };
}

export async function validatePreparedEscrowTx(
  xdr: string,
  networkPassphrase: string,
  trade: TradeData,
  action: EscrowAction,
): Promise<void> {
  const sourceAccount = requiredTradeField(await getPublicKey(), 'wallet local');
  const contractId = requiredTradeField(trade.escrow_contract_id, 'contrato de escrow');
  const { invocation } = assertCommonShape(xdr, networkPassphrase, sourceAccount, contractId);
  if (invocation.functionName().toString() !== action) {
    throw new EscrowTxMismatchError(`se esperaba ${action} y llegó ${invocation.functionName().toString()}`);
  }

  const args = invocation.args().map((arg) => scValToNative(arg));
  const secretHash = Buffer.from(requiredTradeField(trade.secret_hash, 'hash secreto'), 'hex');
  const tradeId = hash(secretHash);

  if (action === 'decline') {
    if (args.length !== 1 || !bytesEqual(args[0], tradeId)) {
      throw new EscrowTxMismatchError('el identificador del intercambio fue cambiado');
    }
    return;
  }

  if (action === 'release') {
    if (args.length !== 2 || !bytesEqual(args[0], tradeId)) {
      throw new EscrowTxMismatchError('el identificador del intercambio fue cambiado');
    }
    if (!bytesEqual(hash(Buffer.from(args[1] as Uint8Array)), secretHash)) {
      throw new EscrowTxMismatchError('el secreto no corresponde al hash del intercambio');
    }
    return;
  }

  const seller = requiredTradeField(trade.seller_stellar_address, 'dirección del vendedor');
  const buyer = requiredTradeField(trade.buyer_stellar_address, 'dirección del comprador');
  const amount = BigInt(requiredTradeField(trade.amount_stroops, 'monto del escrow'));
  const platformFee = BigInt(requiredTradeField(trade.platform_fee_stroops, 'comisión de plataforma'));
  const matches = args.length === 6
    && String(args[0]) === seller
    && String(args[1]) === buyer
    && BigInt(String(args[2])) === amount
    && BigInt(String(args[3])) === platformFee
    && bytesEqual(args[4], secretHash)
    && Number(args[5]) === LOCK_TIMEOUT_MINUTES;
  if (!matches) throw new EscrowTxMismatchError('los participantes, montos o plazo fueron cambiados');
}
