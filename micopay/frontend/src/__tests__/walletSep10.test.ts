// @vitest-environment node

import { Account, Keypair, Networks, Operation, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it } from 'vitest';
import { isSep10Challenge, parseSep10Request, type WalletPolicy } from '../services/walletRequest';

const server = Keypair.random();
const client = Keypair.random();
const HOME = 'app.micopay.com.mx';
const AUTH = 'api.micopay.app';

const policy: WalletPolicy = {
  officialOrigin: `https://${HOME}`,
  chainId: 'stellar:testnet',
  networkPassphrase: Networks.TESTNET,
  account: client.publicKey(),
  allowedContracts: [],
  now: 0,
  sep10SigningKey: server.publicKey(),
  sep10HomeDomain: HOME,
  sep10WebAuthDomain: AUTH,
};

const challenge = (from = server, account = client.publicKey(), home = HOME) =>
  WebAuth.buildChallengeTx(from, account, home, 300, Networks.TESTNET, AUTH);

describe('reto SEP-10 en la APK', () => {
  it('reconoce y acepta el reto de esta cuenta', () => {
    const xdr = challenge();
    expect(isSep10Challenge(xdr, policy)).toBe(true);
    expect(parseSep10Request(xdr, policy)).toEqual({ homeDomain: HOME });
  });

  it('una transacción de otro servidor no es un reto', () => {
    expect(isSep10Challenge(challenge(Keypair.random()), policy)).toBe(false);
  });

  it('sin llave configurada nada es un reto', () => {
    expect(isSep10Challenge(challenge(), { ...policy, sep10SigningKey: '' })).toBe(false);
    expect(() => parseSep10Request(challenge(), { ...policy, sep10SigningKey: '' })).toThrow('sin configurar');
  });

  it('rechaza el reto de otra cuenta', () => {
    expect(() => parseSep10Request(challenge(server, Keypair.random().publicKey()), policy)).toThrow('otra cuenta');
  });

  it('rechaza otro dominio', () => {
    expect(() => parseSep10Request(challenge(server, client.publicKey(), 'micopay.evil.io'), policy)).toThrow('inválido');
  });

  it('rechaza una transacción ejecutable del servidor que imita un reto', () => {
    const now = Math.floor(Date.now() / 1000);
    const tx = new TransactionBuilder(new Account(server.publicKey(), '41'), {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: now, maxTime: now + 300 },
    })
      .addOperation(Operation.manageData({
        name: `${HOME} auth`,
        value: Buffer.alloc(48, 7).toString('base64'),
        source: client.publicKey(),
      }))
      .build();
    tx.sign(server);
    expect(isSep10Challenge(tx.toXDR(), policy)).toBe(true);
    expect(() => parseSep10Request(tx.toXDR(), policy)).toThrow('inválido');
  });
});
