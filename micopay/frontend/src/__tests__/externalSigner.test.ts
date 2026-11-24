// @vitest-environment node

import { Account, Keypair, Networks, Operation, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertWalletReady,
  connectWallet,
  getConnectedAddress,
  onWalletLost,
  signWithWallet,
  useWalletBackendForTests,
  type WalletBackend,
} from '../lib/signer/externalSigner';
import { assertWebAuthChallenge } from '../lib/signer/webAuthChallenge';

const values = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

const owner = Keypair.random();

function unsignedTx(): string {
  return new TransactionBuilder(new Account(owner.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '5' }))
    .setTimeout(180)
    .build()
    .toXDR();
}

function signedBy(keypair: Keypair, xdr: string): string {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  tx.sign(keypair);
  return tx.toXDR();
}

function fakeWallet(overrides: Partial<WalletBackend> = {}) {
  const listeners: Parameters<WalletBackend['onChange']>[0][] = [];
  const wallet: WalletBackend = {
    connect: async () => owner.publicKey(),
    currentAddress: async () => owner.publicKey(),
    networkPassphrase: async () => Networks.TESTNET,
    sign: async (xdr) => signedBy(owner, xdr),
    disconnect: async () => undefined,
    onChange: (listener) => { listeners.push(listener); },
    ...overrides,
  };
  useWalletBackendForTests(wallet);
  return { emit: (change: Parameters<typeof listeners[number]>[0]) => listeners.forEach((l) => l(change)) };
}

describe('firmador externo', () => {
  beforeEach(() => values.clear());

  it('conecta y firma con la cuenta conectada', async () => {
    fakeWallet();
    await connectWallet();
    const xdr = unsignedTx();
    const signed = await signWithWallet(xdr, Networks.TESTNET);
    expect(TransactionBuilder.fromXDR(signed, Networks.TESTNET).signatures).toHaveLength(1);
  });

  it('no conecta una billetera de otra red', async () => {
    fakeWallet({ networkPassphrase: async () => Networks.PUBLIC });
    await expect(connectWallet()).rejects.toThrow('otra red');
    expect(getConnectedAddress()).toBeNull();
  });

  it('sin billetera conectada no pide firma', async () => {
    const sign = vi.fn();
    fakeWallet({ sign });
    await expect(signWithWallet(unsignedTx(), Networks.TESTNET)).rejects.toThrow('Conecta tu billetera');
    expect(sign).not.toHaveBeenCalled();
  });

  it('un cambio de cuenta cierra la sesión antes de firmar', async () => {
    const sign = vi.fn();
    let current = owner.publicKey();
    fakeWallet({ sign, currentAddress: async () => current });
    await connectWallet();
    const lost = vi.fn();
    const stop = onWalletLost(lost);
    current = Keypair.random().publicKey();
    await expect(signWithWallet(unsignedTx(), Networks.TESTNET)).rejects.toThrow('Cambiaste de cuenta');
    expect(sign).not.toHaveBeenCalled();
    expect(lost).toHaveBeenCalledOnce();
    expect(getConnectedAddress()).toBeNull();
    stop();
  });

  it('un cambio de red en plena sesión la cierra', async () => {
    let passphrase = Networks.TESTNET;
    fakeWallet({ networkPassphrase: async () => passphrase });
    await connectWallet();
    const lost = vi.fn();
    const stop = onWalletLost(lost);
    passphrase = Networks.PUBLIC;
    await expect(assertWalletReady()).rejects.toThrow('otra red');
    expect(lost).toHaveBeenCalledOnce();
    stop();
  });

  it('el evento de la billetera también cierra la sesión', async () => {
    const wallet = fakeWallet();
    await connectWallet();
    const lost = vi.fn();
    const stop = onWalletLost(lost);
    wallet.emit({ address: owner.publicKey(), networkPassphrase: Networks.TESTNET });
    expect(lost).not.toHaveBeenCalled();
    wallet.emit({ disconnected: true });
    expect(lost).toHaveBeenCalledOnce();
    stop();
  });

  it('una billetera bloqueada no cierra la sesión', async () => {
    fakeWallet({ currentAddress: async () => null, networkPassphrase: async () => null });
    await connectWallet();
    await expect(assertWalletReady()).resolves.toBe(owner.publicKey());
  });

  it('rechaza una transacción cambiada por la billetera', async () => {
    fakeWallet({ sign: async () => signedBy(owner, otherTx()) });
    await connectWallet();
    await expect(signWithWallet(unsignedTx(), Networks.TESTNET)).rejects.toThrow('transacción distinta');
  });

  it('rechaza la firma de otra cuenta', async () => {
    fakeWallet({ sign: async (xdr) => signedBy(Keypair.random(), xdr) });
    await connectWallet();
    await expect(signWithWallet(fixedTx, Networks.TESTNET)).rejects.toThrow('cuenta conectada');
  });

  it('rechaza firmar para otra red', async () => {
    fakeWallet();
    await connectWallet();
    await expect(signWithWallet(unsignedTx(), Networks.PUBLIC)).rejects.toThrow('otra red');
  });
});

const fixedTx = unsignedTx();

function otherTx(): string {
  return new TransactionBuilder(new Account(owner.publicKey(), '9'), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '99' }))
    .setTimeout(180)
    .build()
    .toXDR();
}

describe('reto web', () => {
  const server = Keypair.random();
  const account = Keypair.random().publicKey();
  const challenge = (home = 'app.micopay.com.mx', from = server, client = account) =>
    WebAuth.buildChallengeTx(from, client, home, 300, Networks.TESTNET, 'api.micopay.app');
  const check = (xdr: string, key: string | undefined = server.publicKey()) =>
    assertWebAuthChallenge(xdr, account, Networks.TESTNET, key);

  it('acepta el reto de MicoPay', () => {
    expect(() => check(challenge())).not.toThrow();
  });

  it('rechaza otro dominio, otro servidor y otra cuenta', () => {
    expect(() => check(challenge('evil.io'))).toThrow();
    expect(() => check(challenge(undefined, Keypair.random()))).toThrow();
    expect(() => check(challenge(undefined, server, Keypair.random().publicKey()))).toThrow('otra cuenta');
  });

  it('sin llave configurada no sigue', () => {
    expect(() => assertWebAuthChallenge(challenge(), account, Networks.TESTNET, '')).toThrow('no está configurado');
  });
});
