// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  buildBankWithdrawPathPaymentXdr,
  WithdrawTxMismatchError,
  type BankWithdrawSwapPlan,
  type ExpectedBankWithdraw,
} from '../services/stellarRamp';

function key(byte: number): Keypair {
  return Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(byte));
}

const user = key(0x10);
const destination = key(0x20).publicKey();
const usdcIssuer = key(0x30).publicKey();
const cetesIssuer = key(0x40).publicKey();
const passphrase = Networks.TESTNET;

function preparedPayment(): string {
  return new TransactionBuilder(new Account(user.publicKey(), '7'), {
    fee: '100',
    networkPassphrase: passphrase,
  })
    .addOperation(Operation.payment({
      destination,
      asset: new Asset('CETES', cetesIssuer),
      amount: '558.1733120',
    }))
    .addMemo(Memo.text('order-123'))
    .setTimeout(300)
    .build()
    .toXDR();
}

const expected: ExpectedBankWithdraw = {
  fromAddress: user.publicKey(),
  toAddress: destination,
  memo: 'order-123',
  assetCode: 'CETES',
  assetIssuer: cetesIssuer,
  amount: '558.1733120',
};

const swap: BankWithdrawSwapPlan = {
  sendAsset: { code: 'USDC', issuer: usdcIssuer },
  sendMax: '10.0000000',
  destinationAsset: { code: 'CETES', issuer: cetesIssuer },
  destinationAmount: '558.1733120',
  path: [{ code: 'XLM' }],
};

describe('bank withdraw path payment', () => {
  it('construye un strict-receive atomico y conserva destino, memo y limites', () => {
    const xdr = buildBankWithdrawPathPaymentXdr(
      new Account(user.publicKey(), '8'),
      preparedPayment(),
      expected,
      swap,
      passphrase,
    );
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    expect(tx).toBeInstanceOf(Transaction);
    const parsed = tx as Transaction;
    expect(parsed.memo.type).toBe('text');
    expect(parsed.memo.value.toString()).toBe('order-123');
    expect(parsed.operations).toHaveLength(1);
    const op = parsed.operations[0] as Operation.PathPaymentStrictReceive;
    expect(op.type).toBe('pathPaymentStrictReceive');
    expect(op.destination).toBe(destination);
    expect(op.sendAsset.getCode()).toBe('USDC');
    expect(op.sendAsset.getIssuer()).toBe(usdcIssuer);
    expect(op.sendMax).toBe('10.0000000');
    expect(op.destAsset.getCode()).toBe('CETES');
    expect(op.destAsset.getIssuer()).toBe(cetesIssuer);
    expect(op.destAmount).toBe('558.1733120');
    expect(op.path).toHaveLength(1);
    expect(op.path[0].isNative()).toBe(true);
  });

  it('rechaza que el plan cambie el monto que Etherfuse espera', () => {
    expect(() => buildBankWithdrawPathPaymentXdr(
      new Account(user.publicKey(), '8'),
      preparedPayment(),
      expected,
      { ...swap, destinationAmount: '500' },
      passphrase,
    )).toThrowError(WithdrawTxMismatchError);
  });
});
