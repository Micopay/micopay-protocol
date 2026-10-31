// @vitest-environment node
import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  Asset,
  TransactionBuilder,
  hash,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import {
  WalletRequestRejected,
  assertWalletRequestOrigin,
  parseEscrowRequest,
  type WalletPolicy,
  type WalletRequest,
} from '../services/walletRequest';

const CONTRATO = 'CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3';
const AJENO = 'CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4';
const llave = Keypair.random();
const otra = Keypair.random();
const secreto = Buffer.alloc(32, 9);
const secretHash = hash(secreto);
const tradeId = hash(secretHash);

const policy: WalletPolicy = {
  officialOrigin: 'https://app.micopay.com.mx',
  chainId: 'stellar:testnet',
  networkPassphrase: Networks.TESTNET,
  account: llave.publicKey(),
  allowedContracts: [CONTRATO],
  now: 1000,
};

function solicitud(cambios: Partial<WalletRequest> = {}): WalletRequest {
  return {
    id: 1,
    topic: 't',
    verifiedOrigin: 'https://app.micopay.com.mx',
    validation: 'VALID',
    chainId: 'stellar:testnet',
    method: 'stellar_signXDR',
    expiry: 2000,
    xdr: 'x',
    ...cambios,
  };
}

const bytes = (b: Buffer) => nativeToScVal(b, { type: 'bytes' });

function tx(op: ReturnType<Contract['call']>, source = llave.publicKey()) {
  return new TransactionBuilder(new Account(source, '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(op).setTimeout(180).build();
}

const release = (contrato = CONTRATO) => new Contract(contrato).call('release', bytes(tradeId), bytes(secreto));
const lock = () => new Contract(CONTRATO).call(
  'lock',
  new Address(llave.publicKey()).toScVal(),
  new Address(otra.publicKey()).toScVal(),
  nativeToScVal(1n, { type: 'i128' }),
  nativeToScVal(0n, { type: 'i128' }),
  bytes(secretHash),
  nativeToScVal(120, { type: 'u32' }),
);

describe('assertWalletRequestOrigin', () => {
  it('acepta una solicitud del dominio oficial', () => {
    expect(() => assertWalletRequestOrigin(solicitud(), policy, new Set())).not.toThrow();
  });

  it.each([
    ['dominio falso', { verifiedOrigin: 'https://app.micopay.com.mx.evil.io' }],
    ['dominio sin verificar', { validation: 'UNKNOWN' as const }],
    ['verificación inválida', { validation: 'INVALID' as const }],
    ['fraude', { isScam: true }],
    ['otra red', { chainId: 'stellar:pubnet' }],
    ['otro método', { method: 'stellar_signAndSubmitXDR' }],
    ['vencida', { expiry: 1000 }],
  ])('rechaza %s', (_n, cambios) => {
    expect(() => assertWalletRequestOrigin(solicitud(cambios), policy, new Set())).toThrow(WalletRequestRejected);
  });

  it('rechaza una solicitud repetida', () => {
    const seen = new Set<string>();
    assertWalletRequestOrigin(solicitud(), policy, seen);
    expect(() => assertWalletRequestOrigin(solicitud(), policy, seen)).toThrow('repetida');
  });
});

describe('parseEscrowRequest', () => {
  it('resume release con el trade_id', () => {
    expect(parseEscrowRequest(tx(release()).toXDR(), policy)).toEqual({
      action: 'release',
      contractId: CONTRATO,
      tradeKey: tradeId.toString('hex'),
      kind: 'trade_id',
    });
  });

  it('resume lock con el hash del secreto', () => {
    const r = parseEscrowRequest(tx(lock()).toXDR(), policy);
    expect(r).toMatchObject({ action: 'lock', tradeKey: secretHash.toString('hex'), kind: 'secret_hash' });
  });

  it('rechaza otro contrato con la misma función', () => {
    expect(() => parseEscrowRequest(tx(release(AJENO)).toXDR(), policy)).toThrow('contrato no autorizado');
  });

  it('rechaza una función que no es del escrow', () => {
    const op = new Contract(CONTRATO).call('transfer', bytes(tradeId));
    expect(() => parseEscrowRequest(tx(op).toXDR(), policy)).toThrow('función no permitida');
  });

  it('rechaza argumentos inesperados', () => {
    const op = new Contract(CONTRATO).call('release', bytes(tradeId));
    expect(() => parseEscrowRequest(tx(op).toXDR(), policy)).toThrow('argumentos inesperados');
  });

  it('rechaza una transacción de otra cuenta', () => {
    expect(() => parseEscrowRequest(tx(release(), otra.publicKey()).toXDR(), policy)).toThrow('otra cuenta');
  });

  it('rechaza un pago clásico', () => {
    const pago = Operation.payment({ destination: otra.publicKey(), asset: Asset.native(), amount: '1' });
    const t = new TransactionBuilder(new Account(llave.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
      .addOperation(pago).setTimeout(180).build();
    expect(() => parseEscrowRequest(t.toXDR(), policy)).toThrow('una sola llamada');
  });

  it('rechaza una transacción ya firmada', () => {
    const t = tx(release());
    t.sign(llave);
    expect(() => parseEscrowRequest(t.toXDR(), policy)).toThrow('ya contiene firmas');
  });

  it.each([['basura', 'no-es-xdr'], ['vacío', ''], ['no texto', { a: 1 }]])('rechaza XDR %s', (_n, xdr) => {
    expect(() => parseEscrowRequest(xdr, policy)).toThrow(WalletRequestRejected);
  });
});
