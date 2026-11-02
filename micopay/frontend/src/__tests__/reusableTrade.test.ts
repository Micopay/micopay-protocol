/** WP3 · reintentar o volver a elegir al agente no crea operaciones fantasma. */
import { describe, it, expect } from 'vitest';
import { pickReusableTrade } from '../utils/reusableTrade';
import type { TradeData } from '../services/api';

const AGENT = 'agent-1';
const ME = 'me';

const trade = (patch: Partial<TradeData>): TradeData => ({
  id: 't1',
  status: 'pending',
  secret_hash: 'h',
  amount_mxn: 500,
  seller_id: ME,
  buyer_id: AGENT,
  flow: 'cashout',
  ...patch,
} as TradeData);

describe('pickReusableTrade', () => {
  it('a failed lock is retried on the same trade', () => {
    const retry = trade({ id: 'first' });
    const r = pickReusableTrade({ retry, active: [], counterpartyId: AGENT, flow: 'cashout', amountMxn: 500 });
    expect(r.trade?.id).toBe('first');
  });

  it('three failed locks leave a single trade', () => {
    const created: string[] = [];
    let retry: TradeData | null = null;
    for (let i = 0; i < 3; i++) {
      const r = pickReusableTrade({ retry, active: retry ? [retry] : [], counterpartyId: AGENT, flow: 'cashout', amountMxn: 500 });
      const used = r.trade ?? trade({ id: `new-${i}` });
      if (!r.trade) created.push(used.id);
      retry = used; // el bloqueo vuelve a fallar
    }
    expect(created).toEqual(['new-0']);
  });

  it('an open trade with the same agent, flow and amount is resumed', () => {
    const open = trade({ id: 'open', status: 'locked' });
    const r = pickReusableTrade({ retry: null, active: [open], counterpartyId: AGENT, flow: 'cashout', amountMxn: 500 });
    expect(r.trade?.id).toBe('open');
  });

  it('a different amount is a conflict, not a silent reuse', () => {
    const open = trade({ id: 'open', amount_mxn: 300 });
    const r = pickReusableTrade({ retry: null, active: [open], counterpartyId: AGENT, flow: 'cashout', amountMxn: 500 });
    expect(r.trade).toBeNull();
    expect(r.conflict?.id).toBe('open');
  });

  it('another flow or another agent creates a new trade', () => {
    const open = trade({ id: 'open' });
    expect(pickReusableTrade({ retry: null, active: [open], counterpartyId: AGENT, flow: 'deposit', amountMxn: 500 }).trade).toBeNull();
    expect(pickReusableTrade({ retry: null, active: [open], counterpartyId: 'other', flow: 'cashout', amountMxn: 500 }).trade).toBeNull();
  });

  it('a retry that is no longer pending is not reused', () => {
    const r = pickReusableTrade({ retry: trade({ status: 'cancelled' }), active: [], counterpartyId: AGENT, flow: 'cashout', amountMxn: 500 });
    expect(r.trade).toBeNull();
  });
});
