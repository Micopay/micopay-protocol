import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import MerchantInbox from '../pages/MerchantInbox';

// N2 (auditoría del escrow 2026-10-29): la relectura de una entrega sobre una
// fila que dejó de ser cobrable mostraba la tarjeta normal con el botón de
// liberar, y solo una etiqueta gris decía "Reembolsado".

const { scanMock, confirmMock } = vi.hoisted(() => ({
  scanMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getMerchantTrades: vi.fn().mockResolvedValue([]),
  merchantConfirmScan: confirmMock,
  completeTrade: vi.fn(),
}));

vi.mock('../hooks/useQRScanner', () => ({
  useQRScanner: () => ({ scan: scanMock }),
}));

vi.mock('../components/SupportLink', () => ({
  default: () => null,
}));

function scanResult(status: string) {
  return {
    trade_id: '11111111-2222-4333-8444-555555555555',
    status,
    flow: 'cashout',
    amount_mxn: 500,
    platform_fee_mxn: 4,
    provider_fee_mxn: 10,
    client_handle: 'cliente',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    expired: false,
    created_at: new Date().toISOString(),
    lock_tx_hash: 'lockhash',
    release_tx_hash: null,
    resumed: true,
    handoff_confirmed_at: new Date().toISOString(),
  };
}

async function scanWith(status: string) {
  scanMock.mockResolvedValue({
    value: 'micopay://release?trade_id=11111111-2222-4333-8444-555555555555&claim_token=abababababababababababababababababababababababababababababababab',
    error: null,
  });
  confirmMock.mockResolvedValue(scanResult(status));
  render(<MerchantInbox token="token" onBack={() => {}} />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /scan/i }));
  await waitFor(() => expect(screen.getByText('QR verified')).toBeInTheDocument());
}

describe('MerchantInbox · operación no cobrable', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('una fila reembolsada avisa y no ofrece liberar', async () => {
    await scanWith('refunded');
    expect(screen.getByRole('alert')).toHaveTextContent('Do not hand over cash');
    expect(screen.queryByText(/release funds/i)).not.toBeInTheDocument();
  });

  it('una fila en revealing sigue ofreciendo liberar, sin aviso', async () => {
    await scanWith('revealing');
    expect(screen.queryByText('Do not hand over cash')).not.toBeInTheDocument();
    expect(screen.getByText(/release funds/i)).toBeInTheDocument();
  });
});
