import { KEY_MISMATCH_MESSAGE, NO_KEY_MESSAGE } from '../lib/signer/mode';
import { TransactionBuilder, Operation, Memo, Networks, Asset, Horizon, Transaction, Account } from '@stellar/stellar-sdk';
import { getPublicKey, signTransactionXdr } from '../lib/keystore';
import { Buffer } from 'buffer';
import { buildTxUrl } from '../utils/stellarExplorer';
import { decodeTransactionXdr } from './transactionDecoder';

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;

const server = new Horizon.Server(HORIZON_URL);

export async function getStellarAssetBalance(
  address: string,
  assetRef: { code: string; issuer?: string },
): Promise<string> {
  const account = await server.loadAccount(address);
  const balance = account.balances.find((item) => {
    if (assetRef.code === 'XLM') return item.asset_type === 'native';
    return (item.asset_type === 'credit_alphanum4' || item.asset_type === 'credit_alphanum12')
      && item.asset_code === assetRef.code
      && item.asset_issuer === assetRef.issuer;
  });
  return balance?.balance ?? '0';
}

export async function sendCETESToEtherfuse(
  cetesAmount: string,
  withdrawAnchorAccount: string,
  withdrawMemo: string,
  cetesIssuer: string
): Promise<{ hash: string; explorerUrl: string }> {
  const publicKey = await getPublicKey();
  if (!publicKey) throw new Error(NO_KEY_MESSAGE);
  const account = await server.loadAccount(publicKey);

  const memoBuffer = Buffer.from(withdrawMemo, 'base64');
  const memo = Memo.hash(memoBuffer);

  const asset = new Asset('CETES', cetesIssuer);

  const unsignedTx = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: withdrawAnchorAccount,
        asset: asset,
        amount: cetesAmount,
      })
    )
    .setTimeout(90)
    .addMemo(memo)
    .build();
  const signedTx = TransactionBuilder.fromXDR(
    await signTransactionXdr(unsignedTx.toXDR(), NETWORK_PASSPHRASE, 'payment'),
    NETWORK_PASSPHRASE,
  );
  if (!(signedTx instanceof Transaction)) throw new Error('La transacción firmada no es válida.');

  try {
    const response = await server.submitTransaction(signedTx);
    return {
      hash: response.hash,
      explorerUrl: buildTxUrl(response.hash)
    };
  } catch (error: any) {
    if (error?.response?.data?.extras?.result_codes?.transaction === 'tx_too_late') {
      throw new Error('tx_too_late');
    }
    throw error;
  }
}

// ---- Retirar a banco (SPEI) --------------------------------------------
//
// Para una orden de offramp USDC->MXN, Etherfuse puede devolver una
// `preparedTransaction` (XDR sin firmar) ademas de las fundingInstructions.
// La app NUNCA firma a ciegas lo que llega: antes compara que esa tx
// coincida con la orden que el usuario autorizo (plan decision 7).

export interface ExpectedBankWithdraw {
  /** Direccion de la wallet del usuario (debe ser el source de la tx). */
  fromAddress: string;
  /** Direccion a la que Etherfuse espera recibir los fondos (fundingInstructions.destination.address). */
  toAddress: string;
  /** Memo que Etherfuse pide (opcional segun orden). */
  memo?: string | null;
  /** Codigo del activo que Etherfuse espera recibir. */
  assetCode: string;
  /** Emisor del activo que Etherfuse espera recibir. */
  assetIssuer: string;
  /** Monto exacto que Etherfuse debe recibir, con hasta 7 decimales. */
  amount: string;
}

export interface BankWithdrawSwapPlan {
  sendAsset: { code: string; issuer?: string };
  sendMax: string;
  destinationAsset: { code: string; issuer?: string };
  destinationAmount: string;
  path: Array<{ code: string; issuer?: string }>;
}

export class WithdrawTxMismatchError extends Error {
  constructor(public reason: string, public detail?: Record<string, string | undefined>) {
    super(`La transaccion no coincide con la orden: ${reason}`);
    this.name = 'WithdrawTxMismatchError';
  }
}

/**
 * Normaliza una cantidad decimal (strict-equal entre "1.00" y "1.0000000").
 */
function normalizeAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n.toFixed(7);
}

/**
 * Parsea y valida la preparedTransaction contra la orden. Lanza
 * WithdrawTxMismatchError si algo no cuadra. No firma.
 */
export function validatePreparedWithdrawTx(
  xdr: string,
  expected: ExpectedBankWithdraw,
  networkPassphrase: string = NETWORK_PASSPHRASE,
): void {
  const decoded = decodeTransactionXdr(xdr, networkPassphrase);
  if (decoded.type !== 'payment') {
    throw new WithdrawTxMismatchError('la transaccion no es un pago simple', {
      type: decoded.type,
    });
  }
  if (decoded.sourceAccount && decoded.sourceAccount !== expected.fromAddress) {
    throw new WithdrawTxMismatchError('source account incorrecta', {
      got: decoded.sourceAccount,
      expected: expected.fromAddress,
    });
  }
  if (decoded.destination !== expected.toAddress) {
    throw new WithdrawTxMismatchError('destino incorrecto', {
      got: decoded.destination,
      expected: expected.toAddress,
    });
  }
  if (decoded.assetCode !== expected.assetCode) {
    throw new WithdrawTxMismatchError('activo incorrecto', {
      got: decoded.assetCode,
      expected: expected.assetCode,
    });
  }
  if (decoded.assetIssuer !== expected.assetIssuer) {
    throw new WithdrawTxMismatchError('emisor del activo incorrecto', {
      got: decoded.assetIssuer,
      expected: expected.assetIssuer,
    });
  }
  if (normalizeAmount(decoded.amount) !== normalizeAmount(expected.amount)) {
    throw new WithdrawTxMismatchError('monto incorrecto', {
      got: decoded.amount,
      expected: expected.amount,
    });
  }
  if (expected.memo) {
    if (!decoded.memo || decoded.memo !== expected.memo) {
      throw new WithdrawTxMismatchError('memo incorrecto', {
        got: decoded.memo,
        expected: expected.memo,
      });
    }
  }
}

/**
 * Firma y envia la preparedTransaction a Horizon despues de validarla.
 * Firma mediante el firmador central, que aplica la confirmación local. No reintenta: si `tx_bad_seq`,
 * la pantalla pide nuevas instrucciones y vuelve a cotizar.
 */
export async function signAndSubmitPreparedWithdrawTx(
  xdr: string,
  expected: ExpectedBankWithdraw,
): Promise<{ hash: string; explorerUrl: string }> {
  validatePreparedWithdrawTx(xdr, expected);

  const publicKey = await getPublicKey();
  if (!publicKey) throw new Error(NO_KEY_MESSAGE);
  if (publicKey !== expected.fromAddress) {
    throw new WithdrawTxMismatchError(KEY_MISMATCH_MESSAGE);
  }

  const parsed = TransactionBuilder.fromXDR(
    await signTransactionXdr(xdr, NETWORK_PASSPHRASE, 'payment'),
    NETWORK_PASSPHRASE,
  );
  if (!(parsed instanceof Transaction)) {
    throw new WithdrawTxMismatchError('la tx es un fee-bump; no se soporta');
  }

  try {
    const response = await server.submitTransaction(parsed);
    return { hash: response.hash, explorerUrl: buildTxUrl(response.hash) };
  } catch (error: any) {
    const code = error?.response?.data?.extras?.result_codes?.transaction;
    if (code === 'tx_bad_seq') throw new Error('tx_bad_seq');
    if (code === 'tx_too_late') throw new Error('tx_too_late');
    throw error;
  }
}

function stellarAsset(ref: { code: string; issuer?: string }): Asset {
  if (ref.code === 'XLM') return Asset.native();
  if (!ref.issuer) throw new WithdrawTxMismatchError(`falta el emisor de ${ref.code}`);
  return new Asset(ref.code, ref.issuer);
}

function assertSwapPlan(expected: ExpectedBankWithdraw, swap: BankWithdrawSwapPlan): void {
  if (swap.sendAsset.code !== 'USDC' || !swap.sendAsset.issuer) {
    throw new WithdrawTxMismatchError('el activo de entrada del swap no es USDC');
  }
  if (swap.destinationAsset.code !== expected.assetCode || swap.destinationAsset.issuer !== expected.assetIssuer) {
    throw new WithdrawTxMismatchError('el activo destino del swap no coincide con la orden');
  }
  if (normalizeAmount(swap.destinationAmount) !== normalizeAmount(expected.amount)) {
    throw new WithdrawTxMismatchError('el monto destino del swap no coincide con la orden');
  }
  if (normalizeAmount(swap.sendMax) === 'invalid') {
    throw new WithdrawTxMismatchError('el maximo de USDC del swap no es valido');
  }
  if (swap.path.length > 5) {
    throw new WithdrawTxMismatchError('la ruta del swap tiene demasiados saltos');
  }
}

/**
 * Verifica primero el pago CETES preparado por Etherfuse y luego lo sustituye
 * por un pathPaymentStrictReceive equivalente. Es atomico: Etherfuse recibe la
 * cantidad exacta o no sale ningun activo de la wallet. `sendMax` limita los
 * USDC que el DEX puede gastar.
 */
export async function signAndSubmitBankWithdrawPathPayment(
  preparedXdr: string,
  expectedFunding: ExpectedBankWithdraw,
  swap: BankWithdrawSwapPlan,
): Promise<{ hash: string; explorerUrl: string }> {
  const publicKey = await getPublicKey();
  if (!publicKey) throw new Error(NO_KEY_MESSAGE);
  if (publicKey !== expectedFunding.fromAddress) {
    throw new WithdrawTxMismatchError(KEY_MISMATCH_MESSAGE);
  }

  const account = await server.loadAccount(publicKey);
  const unsignedXdr = buildBankWithdrawPathPaymentXdr(account, preparedXdr, expectedFunding, swap);
  const signed = TransactionBuilder.fromXDR(
    await signTransactionXdr(unsignedXdr, NETWORK_PASSPHRASE, 'payment'),
    NETWORK_PASSPHRASE,
  );
  if (!(signed instanceof Transaction)) throw new WithdrawTxMismatchError('la firma devolvio una tx no soportada');

  try {
    const response = await server.submitTransaction(signed);
    return { hash: response.hash, explorerUrl: buildTxUrl(response.hash) };
  } catch (error: any) {
    const txCode = error?.response?.data?.extras?.result_codes?.transaction;
    const opCode = error?.response?.data?.extras?.result_codes?.operations?.[0];
    if (txCode === 'tx_bad_seq') throw new Error('tx_bad_seq');
    if (txCode === 'tx_too_late') throw new Error('tx_too_late');
    if (['op_over_sendmax', 'op_too_few_offers', 'op_src_no_trust', 'op_src_not_authorized', 'op_underfunded'].includes(opCode)) {
      throw new Error('No se pudo completar el swap USDC→CETES; solicita una cotización nueva y revisa tu saldo.');
    }
    throw error;
  }
}

/** Construye la tx que se mostrará al firmador; exportada para probar el XDR exacto. */
export function buildBankWithdrawPathPaymentXdr(
  account: Account,
  preparedXdr: string,
  expectedFunding: ExpectedBankWithdraw,
  swap: BankWithdrawSwapPlan,
  networkPassphrase: string = NETWORK_PASSPHRASE,
): string {
  validatePreparedWithdrawTx(preparedXdr, expectedFunding, networkPassphrase);
  assertSwapPlan(expectedFunding, swap);
  if (account.accountId() !== expectedFunding.fromAddress) {
    throw new WithdrawTxMismatchError('la cuenta cargada no coincide con el retiro');
  }
  const prepared = TransactionBuilder.fromXDR(preparedXdr, networkPassphrase);
  if (!(prepared instanceof Transaction)) throw new WithdrawTxMismatchError('la tx es un fee-bump; no se soporta');
  const builder = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase,
  }).addOperation(Operation.pathPaymentStrictReceive({
    sendAsset: stellarAsset(swap.sendAsset),
    sendMax: swap.sendMax,
    destination: expectedFunding.toAddress,
    destAsset: stellarAsset(swap.destinationAsset),
    destAmount: swap.destinationAmount,
    path: swap.path.map(stellarAsset),
  }));
  if (prepared.memo.type !== 'none') builder.addMemo(prepared.memo);
  return builder.setTimeout(90).build().toXDR();
}
