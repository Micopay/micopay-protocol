/** WP2 · #13: los campos numéricos se pueden vaciar y un error dice su causa. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MerchantSettings from '../pages/MerchantSettings';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  getMerchantConfig: vi.fn().mockResolvedValue({ rate_percent: 1, min_trade_mxn: 100, max_trade_mxn: 50000, daily_cap_mxn: 250000, max_provider_fee_percent: 5.2 }),
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'u', username: 'u', stellar_address: 'G', availability: 'online' }),
  updateMerchantConfigWithOfflineSupport: vi.fn(),
  updateMerchantLocation: vi.fn(),
  setAvailability: vi.fn(),
}));
vi.mock('../hooks/useOfflineQueue', () => ({ useOfflineQueue: () => ({ queueMutationAsync: vi.fn() }) }));
vi.mock('../hooks/useGeolocation', () => ({ useGeolocation: () => ({}) }));
vi.mock('../components/MapReal', () => ({ default: () => null }));
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
});

async function minField() {
  render(<MerchantSettings token="tok" onBack={() => {}} />);
  const label = await screen.findByText('Monto mínimo (MXN)');
  return label.parentElement!.querySelector('input') as HTMLInputElement;
}

beforeEach(() => vi.clearAllMocks());

describe('#13 · configuración del agente', () => {
  it('a numeric field can be emptied (no stuck 0)', async () => {
    const input = await minField();
    await waitFor(() => expect(input.value).toBe('100'));
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
  });

  it('saving with an empty field explains what is missing and does not call the server', async () => {
    const input = await minField();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/Completa la tasa, el mínimo, el máximo y el tope diario/)).toBeInTheDocument();
    expect(api.updateMerchantConfigWithOfflineSupport).not.toHaveBeenCalled();
  });

  it('a server rejection shows its real cause', async () => {
    vi.mocked(api.updateMerchantConfigWithOfflineSupport).mockRejectedValue({
      response: { status: 400, data: { message: 'rate_percent must be between 0 and 5.2' } },
    });
    await minField();
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/rate_percent must be between 0 and 5.2/)).toBeInTheDocument();
  });
});
