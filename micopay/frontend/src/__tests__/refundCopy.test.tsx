/**
 * WP5 · #15 y #16: los textos de reembolso dicen la verdad.
 *
 *   #15: una cancelada con fondos no ofrece "recuperarlos ahora" antes del
 *        plazo; dice desde cuándo regresan.
 *   #16: un decline no se presenta como "el tiempo había expirado".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradeDetail from '../pages/TradeDetail';

const mockGetTrade = vi.fn();
const mockEligibility = vi.fn();
let detailFlags: Record<string, unknown> = {};

vi.mock('../services/api', () => ({
  fetchTradeDetail: vi.fn(async (id: string, token: string) => {
    const trade = await mockGetTrade(id, token);
    return { trade, merchant_unavailable: false, seller_username: 'a', buyer_username: 'b', ...detailFlags };
  }),
  fetchRefundEligibility: (...a: unknown[]) => mockEligibility(...a),
  completeTrade: vi.fn(),
  cancelTradeRequest: vi.fn(),
  refundTradeRequest: vi.fn(),
  lockTrade: vi.fn(),
}));
vi.mock('../services/payment', () => ({ ensureTrustline: vi.fn() }));
vi.mock('../services/secureStorage', () => ({ readJSON: vi.fn().mockResolvedValue(null) }));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
});

const CLIENT = 'client';
const PROVIDER = 'provider';

function trade(status: string) {
  return {
    id: 'trade-1',
    status,
    secret_hash: 'h',
    amount_mxn: 500,
    platform_fee_mxn: 4,
    lock_tx_hash: 'mock_lock',
    release_tx_hash: status === 'refunded' ? 'mock_refund' : null,
    created_at: '2026-01-01T10:00:00Z',
    completed_at: null,
    expires_at: '2099-01-01T12:00:00Z',
    flow: 'cashout',
    seller_id: CLIENT,
    buyer_id: PROVIDER,
    provider_id: PROVIDER,
  };
}

function renderAs(userId: string) {
  return render(
    <MemoryRouter initialEntries={['/trade/trade-1']}>
      <Routes>
        <Route path="/trade/:id" element={<TradeDetail token="tok" userId={userId} onBack={() => {}} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  detailFlags = {};
});

describe('WP5 · textos de reembolso', () => {
  it('#15: antes del plazo dice desde cuándo regresan y no ofrece recuperarlos', async () => {
    mockGetTrade.mockResolvedValue(trade('cancelled'));
    mockEligibility.mockResolvedValue({
      trade_id: 'trade-1', eligible: false, reason: 'not_expired_yet',
      refund_available_at: '2099-01-01T12:00:00Z', expires_at: '2099-01-01T12:00:00Z', server_time: '2026-01-01T10:00:00Z', seconds_remaining: 100,
    });
    renderAs(CLIENT);
    expect(await screen.findByText(/regresan solos a quien los bloqueó a partir del/)).toBeInTheDocument();
    expect(screen.queryByText(/puedes recuperarlos ahora/)).toBeNull();
  });

  it('#16: un decline no se presenta como vencimiento', async () => {
    mockGetTrade.mockResolvedValue(trade('refunded'));
    mockEligibility.mockResolvedValue(null);
    detailFlags = { refund_kind: 'decline' };
    renderAs(CLIENT);
    expect(await screen.findByText(/se autorizó la devolución inmediata/)).toBeInTheDocument();
    expect(screen.queryByText(/había vencido|había expirado/)).toBeNull();
  });

  it('#16: un reembolso por vencimiento lo dice', async () => {
    mockGetTrade.mockResolvedValue(trade('refunded'));
    mockEligibility.mockResolvedValue(null);
    detailFlags = { refund_kind: 'timeout' };
    renderAs(CLIENT);
    expect(await screen.findByText(/había vencido/)).toBeInTheDocument();
  });
});
