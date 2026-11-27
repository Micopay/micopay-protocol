import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradeDetail from '../pages/TradeDetail';

// El agente de un retiro rechaza y devuelve sin cancelar ni pausarse antes.

const mockDetail = vi.fn();
const mockDecline = vi.fn();

vi.mock('../services/api', () => ({
  fetchTradeDetail: (...args: unknown[]) => mockDetail(...args),
  declineTradeRequest: (...args: unknown[]) => mockDecline(...args),
  completeTrade: vi.fn(),
  cancelTradeRequest: vi.fn(),
  refundTradeRequest: vi.fn(),
  lockTrade: vi.fn(),
}));

vi.mock('../services/payment', () => ({ ensureTrustline: vi.fn() }));

vi.mock('../services/secureStorage', () => ({
  readJSON: vi.fn(async () => ({ id: 'agent-1', token: 'mock-token' })),
  writeJSON: vi.fn(),
  removeKey: vi.fn(),
}));

const lockedCashout = {
  id: 'trade-123',
  status: 'locked',
  flow: 'cashout',
  secret_hash: 'abc123',
  amount_mxn: 100,
  lock_tx_hash: 'mock_lock_hash',
  release_tx_hash: null,
  created_at: '2026-11-27T20:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
  seller_id: 'client-1',
  buyer_id: 'agent-1',
  provider_id: 'agent-1',
};

const detail = (overrides: Record<string, unknown> = {}) => ({
  trade: lockedCashout,
  merchant_unavailable: false,
  decline_available: true,
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/trade/trade-123']}>
      <Routes>
        <Route path="/trade/:id" element={<TradeDetail token="mock-token" userId="agent-1" onBack={() => {}} />} />
      </Routes>
    </MemoryRouter>,
  );

describe('TradeDetail: el agente rechaza y devuelve', () => {
  beforeEach(() => {
    mockDetail.mockReset();
    mockDecline.mockReset();
  });

  it('pide confirmar y luego firma decline', async () => {
    mockDetail.mockResolvedValue(detail());
    mockDecline.mockResolvedValue({ status: 'refunded', refund_tx_hash: 'tx' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar y devolver al cliente' }));
    expect(mockDecline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, devolver' }));

    await waitFor(() => expect(mockDecline).toHaveBeenCalledWith('trade-123', 'mock-token'));
  });

  it('no pide pausarse cuando puede rechazar y devolver', async () => {
    mockDetail.mockResolvedValue(detail());
    renderPage();
    await screen.findByRole('button', { name: 'Rechazar y devolver al cliente' });
    expect(screen.queryByText(/ponte en pausa/)).toBeNull();
  });

  it('no aparece si el servidor no ofrece decline', async () => {
    mockDetail.mockResolvedValue(detail({ decline_available: false }));
    renderPage();
    await screen.findAllByText('Bloqueado');
    expect(screen.queryByRole('button', { name: 'Rechazar y devolver al cliente' })).toBeNull();
  });

  it('no aparece para el cliente', async () => {
    mockDetail.mockResolvedValue(detail({ trade: { ...lockedCashout, provider_id: 'otro-agente', buyer_id: 'otro-agente', seller_id: 'agent-1' } }));
    renderPage();
    await screen.findAllByText('Bloqueado');
    expect(screen.queryByRole('button', { name: 'Rechazar y devolver al cliente' })).toBeNull();
  });
});
