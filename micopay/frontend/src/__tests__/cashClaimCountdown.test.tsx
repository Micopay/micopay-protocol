/**
 * #514 · Aviso al cliente de un depósito vencido.
 *
 * EL HUECO: después del vencimiento el barrido espera un margen antes de
 * devolverle la cripto al agente, pero el cliente no sabía que tenía ese tiempo
 * para apretar "Pagué y no me confirmaron". El plazo lo manda el servidor
 * (`cash_claim_deadline`); la app solo lo muestra y no repite el margen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TradeDetail, { CashClaimCountdown } from '../pages/TradeDetail';

let detailExtras: Record<string, unknown> = {};
const mockGetTrade = vi.fn();

vi.mock('../services/api', () => ({
  fetchTradeDetail: vi.fn(async (id: string, token: string) => {
    const trade = await mockGetTrade(id, token);
    return { trade, merchant_unavailable: false, seller_username: 'agente', ...detailExtras };
  }),
  completeTrade: vi.fn(),
  cancelTradeRequest: vi.fn(),
  refundTradeRequest: vi.fn(),
  lockTrade: vi.fn(),
}));

vi.mock('../services/payment', () => ({ ensureTrustline: vi.fn() }));

vi.mock('../services/secureStorage', () => ({
  readJSON: vi.fn(async () => ({ id: 'client-1', token: 'mock-token' })),
  writeJSON: vi.fn(),
  removeKey: vi.fn(),
}));

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const COUNTDOWN = /te quedan .+ para avisar con “Pagué y no me confirmaron”/i;

describe('CashClaimCountdown (#514)', () => {
  it('vencida y con plazo vigente: dice cuánto queda', () => {
    render(<CashClaimCountdown expiresAt={minutesFromNow(-5)} deadline={minutesFromNow(10)} />);
    expect(screen.getByRole('status')).toHaveTextContent(COUNTDOWN);
    expect(screen.getByRole('status')).toHaveTextContent(/te quedan (9m 5\d|10m 0)s/);
  });

  it('todavía no vence la operación: no se adelanta el aviso', () => {
    render(<CashClaimCountdown expiresAt={minutesFromNow(30)} deadline={minutesFromNow(45)} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('el plazo ya pasó: no promete un tiempo que ya no existe', () => {
    render(<CashClaimCountdown expiresAt={minutesFromNow(-30)} deadline={minutesFromNow(-15)} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sin plazo del servidor (agente, cash-out, ya reclamó): nada', () => {
    render(<CashClaimCountdown expiresAt={minutesFromNow(-5)} deadline={null} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('TradeDetail con cash_claim_deadline (#514)', () => {
  const depositTrade = {
    id: 'trade-514',
    status: 'locked',
    flow: 'deposit',
    secret_hash: 'abc',
    amount_mxn: 500,
    lock_tx_hash: 'mock_lock',
    release_tx_hash: null,
    expires_at: minutesFromNow(-5),
    seller_id: 'agent-1',
    buyer_id: 'client-1',
    provider_id: 'agent-1',
  };

  const renderDetail = () =>
    render(
      <MemoryRouter initialEntries={['/trade/trade-514']}>
        <Routes>
          <Route path="/trade/:id" element={<TradeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    detailExtras = {};
    mockGetTrade.mockResolvedValue(depositTrade);
  });

  it('pinta el plazo que manda el servidor', async () => {
    detailExtras = { cash_claim_deadline: minutesFromNow(10) };
    renderDetail();
    await waitFor(() => expect(screen.getByText(COUNTDOWN)).toBeInTheDocument());
  });

  it('sin el campo, no inventa un plazo', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText('Bloqueado')).toBeInTheDocument());
    expect(screen.queryByText(COUNTDOWN)).toBeNull();
  });
});
