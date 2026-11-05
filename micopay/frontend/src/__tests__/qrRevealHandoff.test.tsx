/** WP2 · #17: la pantalla del QR del cliente se entera de la entrega registrada. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QRReveal from '../pages/QRReveal';

const { detail, trade } = vi.hoisted(() => ({
  detail: { cash_handoff_confirmed: false },
  trade: {
    id: 'trade-1', status: 'revealing', secret_hash: 'h', amount_mxn: 500,
    seller_id: 'client', buyer_id: 'agent', flow: 'cashout', lock_tx_hash: 'tx',
  },
}));

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) } }));
vi.mock('../services/api', () => ({
  getTrade: vi.fn().mockResolvedValue(trade),
  lockTrade: vi.fn(),
  revealTrade: vi.fn().mockResolvedValue({}),
  getSecret: vi.fn().mockResolvedValue({
    qr_payload: 'micopay://release?trade_id=trade-1&claim_token=x',
    expires_at: '2099-01-01T00:00:00Z',
  }),
  fetchTradeDetail: vi.fn(async () => ({ trade, ...detail })),
}));
vi.mock('../components/SupportLink', () => ({ default: () => null }));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
});

function renderQr() {
  render(
    <QRReveal activeTrade={trade as any} token="tok" viewerId="client" onBack={() => {}} onChat={() => {}} onSuccess={() => {}} />,
  );
}

describe('#17 · QR del retiro', () => {
  it('stops asking for a code once the handoff is registered', async () => {
    detail.cash_handoff_confirmed = true;
    renderQr();
    expect(await screen.findByText('El agente registró la entrega del efectivo.')).toBeInTheDocument();
    expect(screen.queryByText('qrReveal.newCode')).toBeNull();
  });

  it('keeps showing the code while there is no handoff', async () => {
    detail.cash_handoff_confirmed = false;
    renderQr();
    expect(await screen.findByText('qrReveal.exchangeCode')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('El agente registró la entrega del efectivo.')).toBeNull();
  });
});
