import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { KYCRoute, AppContext, type AppCtx } from '../App';
import * as api from '../services/api';
import * as secureStorage from '../services/secureStorage';

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve({ remove: vi.fn() })),
  },
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('../services/api', () => ({
  startKYC: vi.fn(),
  getKYCStatus: vi.fn(),
}));

vi.mock('../services/secureStorage', () => ({
  readJSON: vi.fn(),
  writeJSON: vi.fn(),
  removeKey: vi.fn(),
}));

const mockGetKYCStatus = vi.mocked(api.getKYCStatus);
const mockReadJSON = vi.mocked(secureStorage.readJSON);
const mockWriteJSON = vi.mocked(secureStorage.writeJSON);

function createMockAppCtx(overrides: Partial<AppCtx> = {}): AppCtx {
  return {
    buyerUser: {
      id: 'buyer-1',
      token: 'mock-buyer-token',
      username: 'testbuyer',
    } as any,
    sellerUser: null,
    activeTrade: null,
    lockTxHash: null,
    releaseTxHash: null,
    activeAmount: 0,
    tradeLoading: false,
    tradeError: null,
    flow: null,
    devicePublicKey: 'GXXXXXX',
    setActiveAmount: vi.fn(),
    setFlow: vi.fn(),
    setReleaseTxHash: vi.fn(),
    handleOfferSelected: vi.fn().mockResolvedValue(true),
    handleDepositOfferSelected: vi.fn().mockResolvedValue(true),
    clearTradeError: vi.fn(),
    retryTradeFlow: vi.fn().mockResolvedValue(true),
    handleAccountDeleted: vi.fn(),
    resetTradeFlow: vi.fn(),
    envName: 'test',
    backendUrl: 'http://localhost:3000',
    isDemoMode: false,
    isMockStellar: true,
    backendConnected: true,
    backendHealth: {},
    setDebugOpen: vi.fn(),
    ...overrides,
  };
}

function LocationTracker() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

describe('KYCRoute — Route navigation on KYC approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJSON.mockResolvedValue(null);
    mockGetKYCStatus.mockResolvedValue({ status: 'pending' });
  });

  it('navigates to /cetes and renders CETES route when cached status is approved', async () => {
    mockReadJSON.mockResolvedValue({ status: 'approved' });

    render(
      <AppContext.Provider value={createMockAppCtx()}>
        <MemoryRouter initialEntries={['/kyc']}>
          <LocationTracker />
          <Routes>
            <Route path="/kyc" element={<KYCRoute />} />
            <Route path="/cetes" element={<div data-testid="cetes-screen">CETES Screen Content</div>} />
            <Route path="/" element={<div data-testid="home-screen">Home Screen</div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </AppContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cetes-screen')).toBeInTheDocument();
      expect(screen.getByTestId('location-path')).toHaveTextContent('/cetes');
    });

    expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
  });

  it('navigates to /cetes when status polling resolves to approved', async () => {
    mockReadJSON.mockResolvedValue({ status: 'pending' });
    mockGetKYCStatus.mockResolvedValue({ status: 'approved' });

    render(
      <AppContext.Provider value={createMockAppCtx()}>
        <MemoryRouter initialEntries={['/kyc']}>
          <LocationTracker />
          <Routes>
            <Route path="/kyc" element={<KYCRoute />} />
            <Route path="/cetes" element={<div data-testid="cetes-screen">CETES Screen Content</div>} />
            <Route path="/" element={<div data-testid="home-screen">Home Screen</div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </AppContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cetes-screen')).toBeInTheDocument();
      expect(screen.getByTestId('location-path')).toHaveTextContent('/cetes');
    });

    expect(mockWriteJSON).toHaveBeenCalledWith('kyc_status_etherfuse', { status: 'approved' });
    expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
  });

  it('navigates to /cetes when user clicks verified/continue button in header', async () => {
    mockReadJSON.mockResolvedValue({ status: 'pending' });
    mockGetKYCStatus.mockResolvedValue({ status: 'pending' });

    render(
      <AppContext.Provider value={createMockAppCtx()}>
        <MemoryRouter initialEntries={['/kyc']}>
          <LocationTracker />
          <Routes>
            <Route path="/kyc" element={<KYCRoute />} />
            <Route path="/cetes" element={<div data-testid="cetes-screen">CETES Screen Content</div>} />
            <Route path="/" element={<div data-testid="home-screen">Home Screen</div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </AppContext.Provider>
    );

    expect(screen.getByTestId('location-path')).toHaveTextContent('/kyc');
    expect(screen.queryByTestId('cetes-screen')).not.toBeInTheDocument();

    const continueBtn = screen.getByRole('button', { name: 'kyc.continue' });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByTestId('cetes-screen')).toBeInTheDocument();
      expect(screen.getByTestId('location-path')).toHaveTextContent('/cetes');
    });
  });
});

describe('KYCRoute — HashRouter and URL hash integrity', () => {
  const loc = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadJSON.mockResolvedValue({ status: 'approved' });
    loc.hash = '#/kyc';
  });

  afterEach(() => {
    loc.hash = '';
  });

  it('sets URL hash to #/cetes without duplicated #/#/cetes and does not fall through to wildcard', async () => {
    render(
      <AppContext.Provider value={createMockAppCtx()}>
        <HashRouter>
          <LocationTracker />
          <Routes>
            <Route path="/kyc" element={<KYCRoute />} />
            <Route path="/cetes" element={<div data-testid="cetes-screen">CETES Screen Content</div>} />
            <Route path="/" element={<div data-testid="home-screen">Home Screen</div>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AppContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cetes-screen')).toBeInTheDocument();
      expect(screen.getByTestId('location-path')).toHaveTextContent('/cetes');
    });

    expect(loc.hash).toBe('#/cetes');
    expect(loc.hash).not.toContain('#/#');
    expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
  });
});
