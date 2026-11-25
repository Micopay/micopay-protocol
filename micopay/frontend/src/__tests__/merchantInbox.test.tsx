import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import MerchantInbox from '../pages/MerchantInbox';
import { getMerchantTrades } from '../services/api';

vi.mock('../services/api', () => ({
  getMerchantTrades: vi.fn().mockResolvedValue([]),
  merchantConfirmScan: vi.fn(),
  completeTrade: vi.fn(),
}));

const { scan } = vi.hoisted(() => ({ scan: vi.fn().mockResolvedValue({ value: null, error: null }) }));
vi.mock('../hooks/useQRScanner', () => ({
  useQRScanner: () => ({
    scan,
  }),
}));

vi.mock('../components/SupportLink', () => ({
  default: () => null,
}));

describe('MerchantInbox i18n', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders translated English copy', async () => {
    render(
      <MerchantInbox
        token="token"
        onBack={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument());
    expect(screen.getByText('No transactions')).toBeInTheDocument();
  });

  // #4: la tarjeta abre el detalle, donde estan las acciones.
  it('opens the trade detail from a card', async () => {
    vi.mocked(getMerchantTrades).mockResolvedValueOnce([
      { id: 'trade-9', status: 'pending', amount_mxn: 500, flow: 'deposit', client_handle: '@cliente', created_at: '2026-11-01T10:00:00Z' },
    ] as any);
    const onOpenTrade = vi.fn();
    render(<MerchantInbox token="token" onBack={() => {}} onOpenTrade={onOpenTrade} />);
    fireEvent.click(await screen.findByText('@cliente'));
    expect(onOpenTrade).toHaveBeenCalledWith('trade-9');
  });

  // WP1: desde el detalle de un retiro el escaner se abre solo, una vez.
  it('opens the scanner right away when asked to', async () => {
    scan.mockClear();
    render(<MerchantInbox token="token" onBack={() => {}} autoScan />);
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
  });

  it('does not open the scanner by itself otherwise', async () => {
    scan.mockClear();
    render(<MerchantInbox token="token" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument());
    expect(scan).not.toHaveBeenCalled();
  });
});
