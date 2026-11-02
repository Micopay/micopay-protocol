/**
 * WP2 · que el agente pueda operar desde la interfaz.
 *
 *   #2: con la entrega registrada, el agente ve "Liberar fondos".
 *   #3: el chat del detalle abre la operación por su id.
 *   #5: Cancelar en `locked`, solo para quien el backend lo permite, y el
 *       error del backend se muestra.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradeDetail from '../pages/TradeDetail';

const mockGetTrade = vi.fn();
const mockCompleteTrade = vi.fn();
const mockCancel = vi.fn();
let detailFlags: Record<string, unknown> = {};

vi.mock('../services/api', () => ({
  fetchTradeDetail: vi.fn(async (id: string, token: string) => {
    const trade = await mockGetTrade(id, token);
    return { trade, merchant_unavailable: false, seller_username: 'cliente', buyer_username: 'agente', ...detailFlags };
  }),
  completeTrade: (...a: unknown[]) => mockCompleteTrade(...a),
  cancelTradeRequest: (...a: unknown[]) => mockCancel(...a),
  refundTradeRequest: vi.fn(),
  lockTrade: vi.fn(),
  getRefundEligibility: vi.fn().mockResolvedValue(null),
}));
vi.mock('../services/payment', () => ({ ensureTrustline: vi.fn() }));
vi.mock('../services/secureStorage', () => ({ readJSON: vi.fn().mockResolvedValue(null) }));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
});

const CLIENT = 'user-client';
const PROVIDER = 'user-provider';

function cashoutTrade(status: 'locked' | 'revealing') {
  return {
    id: 'trade-123',
    status,
    secret_hash: 'abc',
    amount_mxn: 500,
    platform_fee_mxn: 4,
    lock_tx_hash: 'mock_lock',
    release_tx_hash: null,
    created_at: '2026-01-01T10:00:00Z',
    completed_at: null,
    expires_at: '2099-01-01T12:00:00Z',
    flow: 'cashout',
    seller_id: CLIENT,
    buyer_id: PROVIDER,
    provider_id: PROVIDER,
  };
}

function renderAs(userId: string, status: 'locked' | 'revealing') {
  mockGetTrade.mockResolvedValue(cashoutTrade(status));
  return render(
    <MemoryRouter initialEntries={['/trade/trade-123']}>
      <Routes>
        <Route path="/trade/:id" element={<TradeDetail token="tok" userId={userId} onBack={() => {}} />} />
        <Route path="/chat/:tradeId" element={<div>RUTA_CHAT_TRADE</div>} />
        <Route path="/inbox" element={<div>RUTA_INBOX</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  detailFlags = {};
  mockCompleteTrade.mockResolvedValue({ status: 'completed', release_tx_hash: 'tx' });
});

describe('WP2 · agente', () => {
  it('#2: con la entrega registrada el agente libera desde el detalle', async () => {
    detailFlags = { cash_handoff_confirmed: true };
    renderAs(PROVIDER, 'revealing');
    fireEvent.click(await screen.findByRole('button', { name: 'Liberar fondos' }));
    await waitFor(() => expect(mockCompleteTrade).toHaveBeenCalledWith('trade-123', 'tok'));
    expect(screen.queryByRole('button', { name: /abrir escáner/i })).toBeNull();
  });

  it('#3: el chat del agente abre la operación por su id', async () => {
    renderAs(PROVIDER, 'locked');
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir chat con el cliente' }));
    await waitFor(() => expect(screen.getByText('RUTA_CHAT_TRADE')).toBeInTheDocument());
  });

  it('#5: el agente disponible no ve Cancelar, ve que debe pausarse', async () => {
    renderAs(PROVIDER, 'locked');
    await screen.findByText(/primero ponte en pausa/i);
    expect(screen.queryByRole('button', { name: 'Cancelar operación' })).toBeNull();
  });

  it('#5: el agente en pausa sí puede cancelar', async () => {
    detailFlags = { merchant_unavailable: true };
    renderAs(PROVIDER, 'locked');
    expect(await screen.findByRole('button', { name: 'Cancelar operación' })).toBeInTheDocument();
  });

  it('#5: el cliente cancela y ve el motivo si el backend lo rechaza', async () => {
    mockCancel.mockRejectedValue(new Error('Tu código QR para el agente sigue vigente.'));
    renderAs(CLIENT, 'locked');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar operación' }));
    expect(await screen.findByText('Tu código QR para el agente sigue vigente.')).toBeInTheDocument();
  });
});
