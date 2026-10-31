// @vitest-environment node

import { hash } from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { describe, expect, it, vi } from 'vitest';
import type { TradeData } from '../services/api';
import { resolveEscrowIntent } from '../services/walletIntent';
import { assertWalletProposal, type EscrowRequestSummary } from '../services/walletRequest';

vi.mock('../services/escrowTxValidation', () => ({ validatePreparedEscrowTx: vi.fn() }));

const CONTRATO = 'CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3';
const secretHash = hash(Buffer.alloc(32, 9));
const tradeKey = hash(secretHash).toString('hex');
const summary: EscrowRequestSummary = { action: 'release', contractId: CONTRATO, tradeKey, kind: 'trade_id' };
const trade = {
  id: 't1',
  secret_hash: secretHash.toString('hex'),
  amount_mxn: 500,
  escrow_contract_id: CONTRATO,
  asset_code: 'USDC',
} as TradeData;

function deps(cambios: Partial<TradeData> = {}) {
  return {
    listActive: async () => [trade],
    getTrade: async () => ({ ...trade, ...cambios }),
    validate: vi.fn(async () => undefined),
  };
}

describe('resolveEscrowIntent', () => {
  it('encuentra la operación por trade_id y valida el XDR', async () => {
    const d = deps();
    const r = await resolveEscrowIntent('xdr', 'red', summary, 'jwt', d);
    expect(r).toMatchObject({ tradeId: 't1', amountMxn: 500, assetCode: 'USDC' });
    expect(d.validate).toHaveBeenCalledWith('xdr', 'red', expect.objectContaining({ id: 't1' }), 'release');
  });

  it('encuentra un lock por hash del secreto', async () => {
    const lock = { ...summary, action: 'lock' as const, kind: 'secret_hash' as const, tradeKey: secretHash.toString('hex') };
    await expect(resolveEscrowIntent('xdr', 'red', lock, 'jwt', deps())).resolves.toMatchObject({ tradeId: 't1' });
  });

  it('rechaza si la cuenta no tiene esa operación abierta', async () => {
    const otra = { ...summary, tradeKey: '00'.repeat(32) };
    await expect(resolveEscrowIntent('xdr', 'red', otra, 'jwt', deps())).rejects.toThrow('no hay una operación');
  });

  it('rechaza si el contrato no es el de la operación', async () => {
    const d = deps({ escrow_contract_id: 'COTRO' });
    await expect(resolveEscrowIntent('xdr', 'red', summary, 'jwt', d)).rejects.toThrow('contrato no corresponde');
    expect(d.validate).not.toHaveBeenCalled();
  });

  it('propaga el rechazo del validador', async () => {
    const d = deps();
    d.validate.mockRejectedValueOnce(new Error('monto cambiado'));
    await expect(resolveEscrowIntent('xdr', 'red', summary, 'jwt', d)).rejects.toThrow('monto cambiado');
  });
});

describe('assertWalletProposal', () => {
  const policy = { officialOrigin: 'https://app.micopay.com.mx', chainId: 'stellar:testnet' };
  const buena = {
    verifiedOrigin: 'https://app.micopay.com.mx',
    validation: 'VALID' as const,
    requiredMethods: ['stellar_signXDR'],
    requiredChains: ['stellar:testnet'],
  };

  it('acepta la conexión oficial', () => {
    expect(() => assertWalletProposal(buena, policy)).not.toThrow();
  });

  it.each([
    ['dominio falso', { verifiedOrigin: 'https://evil.io' }],
    ['sin verificar', { validation: 'UNKNOWN' as const }],
    ['fraude', { isScam: true }],
    ['otro método obligatorio', { requiredMethods: ['stellar_signXDR', 'stellar_signMessage'] }],
    ['otra red', { requiredChains: ['stellar:pubnet'] }],
  ])('rechaza %s', (_n, cambios) => {
    expect(() => assertWalletProposal({ ...buena, ...cambios }, policy)).toThrow();
  });
});
