/**
 * #510 · Textos que quedaban en español con la app en inglés.
 *
 * EL HUECO: la lista de #510 salió de una búsqueda que no vio todo. Con el
 * idioma en inglés seguían saliendo en español, entre otros, el cuerpo de la
 * operación en garantía, "Recibir mis activos" y "Retirar a banco".
 *
 * LO QUE ESTO ES, Y LO QUE NO: cada prueba cambia a inglés, pinta la pantalla
 * y busca el texto en inglés. Las pruebas existentes siguen en español y
 * cuidan que el texto en español no cambie. No revisa la calidad de la
 * traducción.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../i18n';
import TradeDetail from '../pages/TradeDetail';
import WebShell from '../components/WebShell';
import { ConnectionBanner } from '../components/ConnectionBanner';

const mockGetTrade = vi.fn();

vi.mock('../services/api', () => ({
  fetchTradeDetail: vi.fn(async (id: string, token: string) => ({
    trade: await mockGetTrade(id, token),
    merchant_unavailable: false,
    seller_username: 'agente',
  })),
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

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function renderTrade(trade: Record<string, unknown>) {
  mockGetTrade.mockResolvedValue({
    id: 'trade-510',
    secret_hash: 'abc',
    amount_mxn: 500,
    lock_tx_hash: 'mock_lock',
    release_tx_hash: null,
    expires_at: inMinutes(60),
    ...trade,
  });
  return render(
    <MemoryRouter initialEntries={['/trade/trade-510']}>
      <Routes>
        <Route path="/trade/:id" element={<TradeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
});

afterEach(async () => {
  await i18n.changeLanguage('es');
});

describe('TradeDetail en inglés (#510)', () => {
  it('cash-out en garantía: el cliente lee el cuerpo en inglés', async () => {
    // En cash-out el cliente vende la cripto: es el seller del escrow.
    renderTrade({ status: 'revealing', flow: 'cashout', seller_id: 'client-1', buyer_id: 'agent-1' });
    expect(
      await screen.findByText(/Your crypto is held in escrow\. Show the code to the agent/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tu cripto está en garantía/)).toBeNull();
  });
});

describe('navegación en inglés (#510)', () => {
  it('la barra lateral web titula sus grupos en inglés', () => {
    render(
      <MemoryRouter>
        <WebShell
          showSidebar
          operation={[{ page: 'home', label: 'Home', icon: 'home' }]}
          account={[{ page: 'profile', label: 'Profile', icon: 'person' }]}
          currentPage="home"
          onNavigate={() => {}}
        >
          <p>contenido</p>
        </WebShell>
      </MemoryRouter>,
    );
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('Operación')).toBeNull();
    expect(screen.queryByText('Cuenta')).toBeNull();
  });

  it('el aviso de reconexión por defecto sale en inglés', () => {
    render(<ConnectionBanner isVisible />);
    expect(screen.getByRole('alert')).toHaveTextContent('Reconnecting…');
  });
});
