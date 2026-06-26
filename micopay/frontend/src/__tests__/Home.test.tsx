import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '../pages/Home';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  getTradeHistory: vi.fn(),
  getAccountBalance: vi.fn(),
  getCurrentUser: vi.fn(),
  getMerchantTrades: vi.fn(),
  getXlmMxnRate: vi.fn(),
}));

const mockGetTradeHistory = vi.mocked(api.getTradeHistory);
const mockGetAccountBalance = vi.mocked(api.getAccountBalance);
const mockGetCurrentUser = vi.mocked(api.getCurrentUser);
const mockGetMerchantTrades = vi.mocked(api.getMerchantTrades);
const mockGetXlmMxnRate = vi.mocked(api.getXlmMxnRate);

function createProps(overrides = {}) {
  return {
    onNavigateCashout: vi.fn(),
    onNavigateDeposit: vi.fn(),
    onNavigateHistory: vi.fn(),
    token: 'buyer-token',
    merchantToken: 'merchant-token',
    onNavigateInbox: vi.fn(),
    ...overrides,
  };
}

describe('Home — pending-trades badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountBalance.mockResolvedValue({ xlm: '250', address: 'GA7ABCDEF12345' });
    mockGetTradeHistory.mockResolvedValue([]);
    mockGetCurrentUser.mockResolvedValue({ verification_status: 'verified' } as any);
    mockGetMerchantTrades.mockResolvedValue([]);
    mockGetXlmMxnRate.mockResolvedValue({ rate: 18.42, source: 'coingecko', fetchedAt: '2026-06-25T12:00:00Z' });
  });

  it('calls getMerchantTrades with merchantToken and "pending"', async () => {
    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(mockGetMerchantTrades).toHaveBeenCalledWith('merchant-token', 'pending');
    });
  });

  it('does NOT call getMerchantTrades when merchantToken is null', async () => {
    render(<Home {...createProps({ merchantToken: null })} />);

    await waitFor(() => {
      expect(mockGetAccountBalance).toHaveBeenCalled();
    });

    expect(mockGetMerchantTrades).not.toHaveBeenCalled();
  });

  it('shows the badge with the correct count when there are pending trades', async () => {
    mockGetMerchantTrades.mockResolvedValue([
      { id: 't1', buyer_handle: 'alice', amount_mxn: 100, status: 'pending', created_at: '2024-06-01T10:00:00Z' },
      { id: 't2', buyer_handle: 'bob', amount_mxn: 200, status: 'pending', created_at: '2024-06-01T11:00:00Z' },
    ]);

    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('does NOT show the badge when there are zero pending trades', async () => {
    mockGetMerchantTrades.mockResolvedValue([]);

    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(mockGetMerchantTrades).toHaveBeenCalled();
    });

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('handles API error gracefully — no badge, no crash', async () => {
    mockGetMerchantTrades.mockRejectedValue(new Error('Network error'));

    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(mockGetMerchantTrades).toHaveBeenCalled();
    });

    expect(screen.getByText(/hola, juan/i)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('Home — XLM→MXN rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccountBalance.mockResolvedValue({ xlm: '250', address: 'GA7ABCDEF12345' });
    mockGetTradeHistory.mockResolvedValue([]);
    mockGetCurrentUser.mockResolvedValue({ verification_status: 'verified' } as any);
    mockGetMerchantTrades.mockResolvedValue([]);
  });

  it('displays MXN value computed with the fetched rate', async () => {
    mockGetXlmMxnRate.mockResolvedValue({ rate: 18.42, source: 'coingecko', fetchedAt: '2026-06-25T12:00:00Z' });

    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/4,605/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows tilde prefix when rate fetch fails', async () => {
    mockGetXlmMxnRate.mockRejectedValue(new Error('Network error'));

    render(<Home {...createProps()} />);

    await waitFor(() => {
      expect(screen.getAllByText(/~5,000/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
