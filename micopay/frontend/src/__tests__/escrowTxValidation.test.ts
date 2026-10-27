// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  hash,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import type { TradeData } from '../services/api';

vi.mock('../lib/keystore', () => ({ getPublicKey: vi.fn() }));

import { getPublicKey } from '../lib/keystore';
import { EscrowTxMismatchError, validatePreparedEscrowTx, type EscrowAction } from '../services/escrowTxValidation';

const seller = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(0x11));
const buyer = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(0x22));
const other = Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(0x33));
const contractId = Address.contract(Buffer.alloc(32, 0x44)).toString();
const otherContractId = Address.contract(Buffer.alloc(32, 0x55)).toString();
const secret = Buffer.alloc(32, 0x66);
const secretHash = hash(secret);
const tradeId = hash(secretHash);

const trade: TradeData = {
  id: 'trade-1',
  status: 'locked',
  secret_hash: secretHash.toString('hex'),
  amount_mxn: 100,
  seller_stellar_address: seller.publicKey(),
  buyer_stellar_address: buyer.publicKey(),
  escrow_contract_id: contractId,
  amount_stroops: '10000000',
  platform_fee_stroops: '100000',
};

function operation(action: EscrowAction, targetContract = contractId) {
  const contract = new Contract(targetContract);
  if (action === 'lock') {
    return contract.call(
      'lock',
      nativeToScVal(seller.publicKey(), { type: 'address' }),
      nativeToScVal(buyer.publicKey(), { type: 'address' }),
      nativeToScVal(10_000_000n, { type: 'i128' }),
      nativeToScVal(100_000n, { type: 'i128' }),
      nativeToScVal(secretHash, { type: 'bytes' }),
      nativeToScVal(120, { type: 'u32' }),
    );
  }
  if (action === 'release') {
    return contract.call(
      'release',
      nativeToScVal(tradeId, { type: 'bytes' }),
      nativeToScVal(secret, { type: 'bytes' }),
    );
  }
  return contract.call('decline', nativeToScVal(tradeId, { type: 'bytes' }));
}

function build(action: EscrowAction, options: {
  source?: Keypair;
  targetContract?: string;
  extraOperation?: boolean;
  sign?: boolean;
} = {}) {
  const source = options.source ?? (action === 'lock' ? seller : buyer);
  const builder = new TransactionBuilder(new Account(source.publicKey(), '1'), {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  }).addOperation(operation(action, options.targetContract));
  if (options.extraOperation) builder.addOperation(operation(action, options.targetContract));
  const tx = builder.setTimeout(180).build();
  if (options.sign) tx.sign(source);
  return tx.toXDR();
}

describe('validatePreparedEscrowTx', () => {
  beforeEach(() => {
    vi.mocked(getPublicKey).mockResolvedValue(seller.publicKey());
  });

  it('acepta lock exacto antes de firmar', async () => {
    await expect(validatePreparedEscrowTx(build('lock'), Networks.TESTNET, trade, 'lock')).resolves.toBeUndefined();
  });

  it('acepta release y verifica que el preimage corresponde al hash', async () => {
    vi.mocked(getPublicKey).mockResolvedValue(buyer.publicKey());
    await expect(validatePreparedEscrowTx(build('release'), Networks.TESTNET, trade, 'release')).resolves.toBeUndefined();
  });

  it('acepta decline exacto', async () => {
    vi.mocked(getPublicKey).mockResolvedValue(buyer.publicKey());
    await expect(validatePreparedEscrowTx(build('decline'), Networks.TESTNET, trade, 'decline')).resolves.toBeUndefined();
  });

  it('rechaza contrato, source y método alterados', async () => {
    await expect(validatePreparedEscrowTx(build('lock', { targetContract: otherContractId }), Networks.TESTNET, trade, 'lock'))
      .rejects.toBeInstanceOf(EscrowTxMismatchError);
    await expect(validatePreparedEscrowTx(build('lock', { source: other }), Networks.TESTNET, trade, 'lock'))
      .rejects.toThrow(/source/);
    await expect(validatePreparedEscrowTx(build('decline', { source: seller }), Networks.TESTNET, trade, 'lock'))
      .rejects.toThrow(/esperaba lock/);
  });

  it('rechaza operación adicional, firma previa y red distinta', async () => {
    await expect(validatePreparedEscrowTx(build('lock', { extraOperation: true }), Networks.TESTNET, trade, 'lock'))
      .rejects.toThrow(/sola invocación/);
    await expect(validatePreparedEscrowTx(build('lock', { sign: true }), Networks.TESTNET, trade, 'lock'))
      .rejects.toThrow(/contiene firmas/);
    await expect(validatePreparedEscrowTx(build('lock'), Networks.PUBLIC, trade, 'lock'))
      .rejects.toThrow(/red/);
  });
});
