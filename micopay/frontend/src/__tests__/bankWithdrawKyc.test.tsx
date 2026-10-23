// Retirar a banco: las etapas de KYC deben dar una salida. Sin Didit hay un
// boton que lo abre; si Etherfuse espera algo del usuario, un boton reabre /idv.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BankWithdrawScreen from '../pages/BankWithdrawScreen';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  confirmBankWithdrawOrder: vi.fn(),
  createBankWithdrawQuote: vi.fn(),
  fetchBankWithdrawOrders: vi.fn(),
  fetchBankWithdrawStatus: vi.fn(),
  registerBankAccount: vi.fn(),
  relaunchBankKyc: vi.fn(),
  startBankKyc: vi.fn(),
}));
vi.mock('../lib/keystore', () => ({ getPublicKey: vi.fn() }));
vi.mock('../services/stellarRamp', () => ({
  signAndSubmitPreparedWithdrawTx: vi.fn(),
  WithdrawTxMismatchError: class extends Error {},
}));

const mockStatus = vi.mocked(api.fetchBankWithdrawStatus);
const mockRelaunch = vi.mocked(api.relaunchBankKyc);

function renderScreen(onVerifyIdentity = vi.fn()) {
  render(<BankWithdrawScreen onBack={vi.fn()} onVerifyIdentity={onVerifyIdentity} userToken="tok" />);
  return onVerifyIdentity;
}

describe('BankWithdrawScreen, etapas de KYC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('al abrir pide el estado con detalle', async () => {
    mockStatus.mockResolvedValue({ stage: 'kyc_review' });
    renderScreen();
    await waitFor(() => expect(mockStatus).toHaveBeenCalledWith('tok', { detail: true }));
  });

  it('needs_didit: el boton abre la verificacion', async () => {
    mockStatus.mockResolvedValue({ stage: 'needs_didit' });
    const onVerify = renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Verificar mi identidad' }));
    expect(onVerify).toHaveBeenCalledTimes(1);
  });

  it('kyc_action: muestra el mensaje de Etherfuse y reabre /idv con un launch nuevo', async () => {
    mockStatus.mockResolvedValue({ stage: 'kyc_action', kycMessage: 'Sube una identificacion vigente.' });
    mockRelaunch.mockResolvedValue({ url: 'https://sandbox.etherfuse.com/auth/launch', fields: { assertion: 'jwt' } });
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    renderScreen();
    expect(await screen.findByText('Sube una identificacion vigente.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar en Etherfuse' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(mockRelaunch).toHaveBeenCalledWith('tok');
    expect(await screen.findByRole('button', { name: 'Abrir de nuevo' })).toBeTruthy();
    submit.mockRestore();
  });

  it('kyc_action sin mensaje: texto por omision', async () => {
    mockStatus.mockResolvedValue({ stage: 'kyc_action', kycMessage: null });
    renderScreen();
    expect(await screen.findByText(/termines o corrijas tu verificacion/)).toBeTruthy();
  });

  it('al volver a la app se re-lee con detalle', async () => {
    mockStatus.mockResolvedValue({ stage: 'kyc_action' });
    renderScreen();
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(1));
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(mockStatus).toHaveBeenCalledTimes(2));
    expect(mockStatus).toHaveBeenLastCalledWith('tok', { detail: true });
  });
});
