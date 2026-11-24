/** WP7 · #22 aviso de pruebas en Retirar a banco; #26 frase de recuperación al conectar. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BankWithdrawScreen from '../pages/BankWithdrawScreen';
import WalletLogin from '../pages/WalletLogin';
import DepositQR from '../pages/DepositQR';

vi.mock('../services/api', () => ({
  confirmBankWithdrawOrder: vi.fn(),
  createBankWithdrawQuote: vi.fn(),
  fetchBankWithdrawOrders: vi.fn().mockResolvedValue([]),
  fetchBankWithdrawStatus: vi.fn().mockResolvedValue({ stage: 'kyc_review' }),
  registerBankAccount: vi.fn(),
  relaunchBankKyc: vi.fn(),
  startBankKyc: vi.fn(),
  getAuthToken: vi.fn(),
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
  getTrade: vi.fn().mockResolvedValue(null),
  completeTrade: vi.fn(),
}));
vi.mock('../lib/keystore', () => ({ getPublicKey: vi.fn() }));
vi.mock('../services/stellarRamp', () => ({
  getStellarAssetBalance: vi.fn(),
  signAndSubmitBankWithdrawPathPayment: vi.fn(),
  WithdrawTxMismatchError: class extends Error {},
}));
vi.mock('../lib/signer/externalSigner', () => ({ connectWallet: vi.fn(), disconnectWallet: vi.fn() }));

describe('WP7 · avisos', () => {
  it('#22: Retirar a banco avisa que es un entorno de pruebas', () => {
    render(<BankWithdrawScreen onBack={vi.fn()} onVerifyIdentity={vi.fn()} userToken="tok" />);
    expect(screen.getByText(/Entorno de pruebas: no se envía dinero a ningún banco/)).toBeInTheDocument();
  });

  it('#26: al conectar la billetera recuerda guardar la frase de recuperación', () => {
    render(
      <MemoryRouter>
        <WalletLogin onLoginSuccess={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Guarda la frase de recuperación de tu billetera/)).toBeInTheDocument();
  });

  it('el depósito no muestra mensajes que el agente no escribió', () => {
    render(
      <DepositQR activeTrade={null} buyerToken={null} onBack={() => {}} onChat={() => {}} onSuccess={() => {}} />,
    );
    expect(screen.queryByText(/Ya recibí tu solicitud/)).toBeNull();
  });
});
