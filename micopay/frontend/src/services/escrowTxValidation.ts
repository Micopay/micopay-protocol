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
import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

export type EscrowAction = 'lock' | 'release' | 'decline' | 'refund' | 'report_paid';

const LOCK_TIMEOUT_MINUTES = 120;
const MAX_ESCROW_FEE_STROOPS = BigInt(import.meta.env.VITE_MAX_ESCROW_FEE_STROOPS || '5000000');

export class EscrowTxMismatchError extends Error {
  constructor(detail: string) {
    super(tr('txValidation.escrowMismatch', { detail }));
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
  if (!value) throw new EscrowTxMismatchError(tr('txValidation.missingField', { field: name }));
  return value;
}

function assertCommonShape(
  xdr: string,
  networkPassphrase: string,
  sourceAccount: string,
  contractId: string,
): { tx: Transaction; invocation: ReturnType<Operation.InvokeHostFunction['func']['invokeContract']> } {
  if (networkPassphrase !== configuredNetworkPassphrase()) {
    throw new EscrowTxMismatchError(tr('txValidation.wrongNetwork'));
  }

  const parsed = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  if (parsed instanceof FeeBumpTransaction || !(parsed instanceof Transaction)) {
    throw new EscrowTxMismatchError(tr('txValidation.noFeeBump'));
  }
  if (parsed.source !== sourceAccount) throw new EscrowTxMismatchError(tr('txValidation.sourceChanged'));
  if (parsed.signatures.length !== 0) throw new EscrowTxMismatchError(tr('txValidation.alreadySigned'));
  if (parsed.operations.length !== 1 || parsed.operations[0].type !== 'invokeHostFunction') {
    throw new EscrowTxMismatchError(tr('txValidation.singleInvocation'));
  }
  if (parsed.memo.type !== 'none') throw new EscrowTxMismatchError(tr('txValidation.noMemo'));
  if (BigInt(parsed.fee) > MAX_ESCROW_FEE_STROOPS) throw new EscrowTxMismatchError(tr('txValidation.feeTooHigh'));

  const now = Math.floor(Date.now() / 1000);
  if (!parsed.timeBounds || Number(parsed.timeBounds.maxTime) <= now || Number(parsed.timeBounds.minTime) > now) {
    throw new EscrowTxMismatchError(tr('txValidation.badTimebounds'));
  }

  const operation = parsed.operations[0] as Operation.InvokeHostFunction;
  if (operation.source && operation.source !== sourceAccount) {
    throw new EscrowTxMismatchError(tr('txValidation.opOtherSource'));
  }
  if (operation.func.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new EscrowTxMismatchError(tr('txValidation.notContractCall'));
  }
  const invocation = operation.func.invokeContract();
  const actualContract = Address.fromScAddress(invocation.contractAddress()).toString();
  if (actualContract !== contractId) throw new EscrowTxMismatchError(tr('txValidation.contractChanged'));
  return { tx: parsed, invocation };
}

export async function validatePreparedEscrowTx(
  xdr: string,
  networkPassphrase: string,
  trade: TradeData,
  action: EscrowAction,
): Promise<void> {
  const sourceAccount = requiredTradeField(await getPublicKey(), tr('txValidation.fieldLocalWallet'));
  const contractId = requiredTradeField(trade.escrow_contract_id, tr('txValidation.fieldContract'));
  const { invocation } = assertCommonShape(xdr, networkPassphrase, sourceAccount, contractId);
  if (invocation.functionName().toString() !== action) {
    throw new EscrowTxMismatchError(tr('txValidation.unexpectedFunction', { expected: action, got: invocation.functionName().toString() }));
  }

  const args = invocation.args().map((arg) => scValToNative(arg));
  const secretHash = Buffer.from(requiredTradeField(trade.secret_hash, 'hash secreto'), 'hex');
  const tradeId = hash(secretHash);

  if (action === 'decline' || action === 'refund' || action === 'report_paid') {
    if (args.length !== 1 || !bytesEqual(args[0], tradeId)) {
      throw new EscrowTxMismatchError(tr('txValidation.tradeIdChanged'));
    }
    return;
  }

  if (action === 'release') {
    if (args.length !== 2 || !bytesEqual(args[0], tradeId)) {
      throw new EscrowTxMismatchError(tr('txValidation.tradeIdChanged'));
    }
    if (!bytesEqual(hash(Buffer.from(args[1] as Uint8Array)), secretHash)) {
      throw new EscrowTxMismatchError(tr('txValidation.secretMismatch'));
    }
    return;
  }

  const seller = requiredTradeField(trade.seller_stellar_address, tr('txValidation.fieldSeller'));
  const buyer = requiredTradeField(trade.buyer_stellar_address, tr('txValidation.fieldBuyer'));
  const amount = BigInt(requiredTradeField(trade.amount_stroops, tr('txValidation.fieldAmount')));
  const platformFee = BigInt(requiredTradeField(trade.platform_fee_stroops, tr('txValidation.fieldPlatformFee')));
  const matches = args.length === 6
    && String(args[0]) === seller
    && String(args[1]) === buyer
    && BigInt(String(args[2])) === amount
    && BigInt(String(args[3])) === platformFee
    && bytesEqual(args[4], secretHash)
    && Number(args[5]) === LOCK_TIMEOUT_MINUTES;
  if (!matches) throw new EscrowTxMismatchError(tr('txValidation.argsChanged'));
}
