import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ChatRoom from '../pages/ChatRoom';
import '../i18n';

const mockGetTrade = vi.fn();
const mockUseChatMessages = vi.fn();

vi.mock('../services/api', () => ({
  getTrade: (...args: unknown[]) => mockGetTrade(...args),
}));

vi.mock('../hooks/useChatMessages', () => ({
  useChatMessages: (...args: unknown[]) => mockUseChatMessages(...args),
}));

const defaultChatMessages = {
  messages: [],
  isLoading: false,
  error: null,
  sendMessage: vi.fn(),
  isSending: false,
  sendError: null,
  retryLoad: vi.fn(),
};

function renderChatRoom(overrides: Partial<React.ComponentProps<typeof ChatRoom>> = {}) {
  return render(
    <ChatRoom
      tradeId="trade-123"
      userId="user-1"
      onBack={vi.fn()}
      onViewQR={vi.fn()}
      token="mock-token"
      counterpartyName="Farmacia Guadalupe"
      {...overrides}
    />,
  );
}

describe('ChatRoom — role-specific cash-out banners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatMessages.mockReturnValue(defaultChatMessages);
    mockGetTrade.mockResolvedValue({
      status: 'locked',
      amount_mxn: 1500,
      lock_tx_hash: 'abc123lockhash',
    });
  });

  it('shows the client banner when isProvider is false', async () => {
    renderChatRoom({ isProvider: false });

    await waitFor(() => {
      expect(screen.getByText(/Oferta aceptada · Tu saldo en garantía/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Bloqueaste tu saldo/i)).toBeInTheDocument();
    expect(screen.getByText(/te entregará el efectivo/i)).toBeInTheDocument();
    expect(screen.queryByText(/El cliente bloqueó/i)).not.toBeInTheDocument();
  });

  it('shows the agent banner when isProvider is true', async () => {
    renderChatRoom({ isProvider: true });

    await waitFor(() => {
      expect(screen.getByText(/Cliente conectado · Saldo en garantía/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/El cliente bloqueó 1,500 MXN en garantía/i)).toBeInTheDocument();
    expect(screen.getByText(/Entrégale el efectivo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Bloqueaste tu saldo/i)).not.toBeInTheDocument();
  });

  it('shows pending copy for the agent while escrow is not locked yet', async () => {
    mockGetTrade.mockResolvedValue({
      status: 'pending',
      amount_mxn: 1500,
      lock_tx_hash: null,
    });

    renderChatRoom({ isProvider: true });

    await waitFor(() => {
      expect(screen.getByText(/Esperando garantía del cliente/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/El cliente está bloqueando su saldo/i)).toBeInTheDocument();
  });

  it('shows the scan-client QR action only for the agent when locked', async () => {
    renderChatRoom({ isProvider: true });

    await waitFor(() => {
      expect(screen.getByText(/Escanear QR del cliente/i)).toBeInTheDocument();
    });
  });
});

describe('ChatRoom — prueba local 2.7', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrade.mockResolvedValue({ status: 'locked', amount_mxn: 500, lock_tx_hash: 'tx' });
  });

  it('el agente no ve "Ver mi QR" y su botón de escanear abre el escáner', async () => {
    mockUseChatMessages.mockReturnValue(defaultChatMessages);
    const onScan = vi.fn();
    const onViewQR = vi.fn();
    renderChatRoom({ isProvider: true, onScan, onViewQR });
    await waitFor(() => expect(mockGetTrade).toHaveBeenCalled());
    expect(screen.queryByText(/Ver mi QR/)).toBeNull();
    const scanButtons = await screen.findAllByRole('button', { name: /escanear/i });
    scanButtons[scanButtons.length - 1].click();
    expect(onScan).toHaveBeenCalled();
    expect(onViewQR).not.toHaveBeenCalled();
  });

  it('cada mensaje dice quién lo escribió', async () => {
    mockUseChatMessages.mockReturnValue({
      ...defaultChatMessages,
      messages: [
        { id: 'm1', body: 'hola', isOwn: false, createdAt: '2026-11-01T10:00:00Z' },
        { id: 'm2', body: 'ya voy', isOwn: true, createdAt: '2026-11-01T10:01:00Z' },
      ],
    });
    renderChatRoom({ isProvider: false });
    expect(await screen.findByText('Tú')).toBeInTheDocument();
    expect(screen.getAllByText('Farmacia Guadalupe').length).toBeGreaterThan(1);
  });
});
