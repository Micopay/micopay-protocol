import { NO_KEY_MESSAGE } from '../lib/signer/mode';
import { Keypair, Transaction, TransactionBuilder, Operation, Memo, Networks, Asset, Horizon } from '@stellar/stellar-sdk';
import { getPublicKey, signTransactionXdr } from '../lib/keystore';
import { getAsset } from '../constants/assets';
import { buildTxUrl } from '../utils/stellarExplorer';

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;

const server = new Horizon.Server(HORIZON_URL);

export interface SendResult {
  hash: string;
  explorerUrl: string;
}

/** Typed payment failure with a user-facing Spanish message. */
export class PaymentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PaymentError';
  }
}

export function isValidStellarAddress(addr: string): boolean {
  try {
    Keypair.fromPublicKey(addr.trim());
    return true;
  } catch {
    return false;
  }
}

function toAsset(code: string): Asset {
  const def = getAsset(code);
  if (!def) throw new PaymentError('ASSET_UNKNOWN', `Activo no soportado: ${code}`);
  if (def.native) return Asset.native();
  if (!def.issuer) throw new PaymentError('ASSET_NO_ISSUER', `Falta el emisor configurado para ${code}.`);
  return new Asset(def.code, def.issuer);
}

/**
 * Returns true if the device's account already holds a trustline (and is
 * funded on-chain) for the given asset code. Native XLM is always trusted.
 */
export async function hasTrustline(assetCode: string): Promise<boolean> {
  if (assetCode.toUpperCase() === 'XLM') return true;
  // Consulta de solo lectura: basta la clave PUBLICA. Antes sacaba la secreta
  // solo para derivarla, lo que ademas obligaria a pedir huella para mirar un
  // saldo si la compuerta estuviera aqui.
  const publicKey = await getPublicKey();
  if (!publicKey) throw new PaymentError('NO_KEY', NO_KEY_MESSAGE);

  let account;
  try {
    account = await server.loadAccount(publicKey);
  } catch {
    return false; // account not yet funded on-chain
  }
  const asset = toAsset(assetCode);
  return account.balances.some(
    (b: any) => b.asset_code === asset.code && b.asset_issuer === asset.issuer,
  );
}

/**
 * Build, sign (with the device key) and submit a ChangeTrust operation so
 * the device's account can hold the given asset. Required once per asset
 * before it can send/receive it (e.g. before participating in a USDC escrow).
 * The private key never leaves the device.
 */
export async function ensureTrustline(assetCode: string): Promise<SendResult | null> {
  if (await hasTrustline(assetCode)) return null;

  const publicKey = await getPublicKey();
  if (!publicKey) throw new PaymentError('NO_KEY', NO_KEY_MESSAGE);
  const asset = toAsset(assetCode);

  let account;
  try {
    account = await server.loadAccount(publicKey);
  } catch {
    throw new PaymentError('ACCOUNT_NOT_FOUND', 'Tu cuenta aún no está activada en la red (necesita XLM).');
  }

  const unsignedTx = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(120)
    .build();
  const signedTx = TransactionBuilder.fromXDR(
    await signTransactionXdr(unsignedTx.toXDR(), NETWORK_PASSPHRASE, 'payment'),
    NETWORK_PASSPHRASE,
  );
  if (!(signedTx instanceof Transaction)) throw new PaymentError('INVALID_TX', 'La transacción firmada no es válida.');

  try {
    const res = await server.submitTransaction(signedTx);
    return { hash: res.hash, explorerUrl: buildTxUrl(res.hash) };
  } catch (e: any) {
    const codes = e?.response?.data?.extras?.result_codes;
    if (codes?.transaction === 'tx_insufficient_balance') {
      throw new PaymentError('UNDERFUNDED', 'Saldo insuficiente para la reserva de la línea de confianza (~0.5 XLM).');
    }
    throw new PaymentError('TRUSTLINE_FAILED', `No se pudo crear la línea de confianza para ${assetCode}.`);
  }
}

/**
 * Build, sign (with the device key) and submit a classic Stellar payment.
 * The private key never leaves the device.
 */
export async function sendPayment(params: {
  destination: string;
  assetCode: string;
  amount: string;
  memo?: string;
}): Promise<SendResult> {
  const destination = params.destination.trim();
  if (!isValidStellarAddress(destination)) {
    throw new PaymentError('BAD_DESTINATION', 'La dirección de destino no es válida.');
  }

  const amountNum = parseFloat(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new PaymentError('BAD_AMOUNT', 'Ingresa un monto mayor a 0.');
  }

  const publicKey = await getPublicKey();
  if (!publicKey) throw new PaymentError('NO_KEY', NO_KEY_MESSAGE);

  if (destination === publicKey) {
    throw new PaymentError('SELF', 'No puedes enviarte fondos a ti mismo.');
  }

  const asset = toAsset(params.assetCode);

  let account;
  try {
    account = await server.loadAccount(publicKey);
  } catch {
    throw new PaymentError('ACCOUNT_NOT_FOUND', 'Tu cuenta aún no está activada en la red.');
  }

  const builder = new TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({ destination, asset, amount: amountNum.toFixed(7) }),
    )
    .setTimeout(120);

  if (params.memo && params.memo.trim()) {
    builder.addMemo(Memo.text(params.memo.trim().slice(0, 28)));
  }

  const unsignedTx = builder.build();
  const signedTx = TransactionBuilder.fromXDR(
    await signTransactionXdr(unsignedTx.toXDR(), NETWORK_PASSPHRASE, 'payment'),
    NETWORK_PASSPHRASE,
  );
  if (!(signedTx instanceof Transaction)) throw new PaymentError('INVALID_TX', 'La transacción firmada no es válida.');

  try {
    const res = await server.submitTransaction(signedTx);
    return {
      hash: res.hash,
      explorerUrl: buildTxUrl(res.hash),
    };
  } catch (e: any) {
    const codes = e?.response?.data?.extras?.result_codes;
    const op = codes?.operations?.[0];
    if (op === 'op_no_trust') {
      throw new PaymentError('NO_TRUST', `El destinatario no acepta ${params.assetCode} todavía (falta su línea de confianza).`);
    }
    if (op === 'op_no_destination') {
      throw new PaymentError('NO_DEST', 'La cuenta destino no existe o no está activada en la red.');
    }
    if (op === 'op_underfunded' || codes?.transaction === 'tx_insufficient_balance') {
      throw new PaymentError('UNDERFUNDED', 'Saldo insuficiente para este envío (recuerda la reserva de red).');
    }
    throw new PaymentError('SUBMIT_FAILED', 'No se pudo enviar el pago. Revisa tu conexión e intenta de nuevo.');
  }
}
