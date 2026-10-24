/**
 * AUTH-1 · Volver a entrar despues de cerrar sesion pide huella o PIN.
 *
 * EL HUECO
 * --------
 * Cerrar sesion borra `micopay_user` pero deja la llave en el almacenamiento
 * seguro, como debe. Login firmaba el reto con esa llave en cuanto alguien
 * tocaba "Entrar", y "Entrar a mi cuenta" en Register hacia lo mismo. Cerrar
 * sesion parecia bloquear la cuenta y no la bloqueaba: cualquiera con el
 * telefono desbloqueado veia saldo, historial y chats.
 *
 * Lo que se fija aqui:
 *   1. Con llave en el telefono se pregunta ANTES de pedir el token, siempre
 *      (`force`), aunque haya una firma reciente.
 *   2. Un "no" deja a la persona en la pantalla: no hay token ni sesion
 *      guardada, y el boton vuelve a funcionar para reintentar.
 *   3. Restaurar con llave secreta no pregunta: escribir la llave ya prueba
 *      que la cuenta es suya.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import Login from '../pages/Login';
import Register from '../pages/Register';
import { PresenceDeniedError } from '../lib/userPresence';
import { ApiError } from '../utils/apiError';

const mockPresence = vi.fn();
const mockGetAuthToken = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockRegisterUser = vi.fn();
const mockWriteJSON = vi.fn();
const mockKeypairExists = vi.fn();
const mockGenerate = vi.fn();
const mockImport = vi.fn();

vi.mock('../lib/userPresence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/userPresence')>()),
  requireUserPresence: (...a: unknown[]) => mockPresence(...a),
}));
vi.mock('../services/api', () => ({
  getAuthToken: (...a: unknown[]) => mockGetAuthToken(...a),
  getCurrentUser: (...a: unknown[]) => mockGetCurrentUser(...a),
  registerUser: (...a: unknown[]) => mockRegisterUser(...a),
}));
vi.mock('../services/secureStorage', () => ({
  writeJSON: (...a: unknown[]) => mockWriteJSON(...a),
  setBackupConfirmed: vi.fn(),
}));
vi.mock('../lib/keystore', () => ({
  keypairExists: (...a: unknown[]) => mockKeypairExists(...a),
  generateAndStoreKeypair: (...a: unknown[]) => mockGenerate(...a),
  importKeypair: (...a: unknown[]) => mockImport(...a),
  getPublicKey: vi.fn().mockResolvedValue('GPUB'),
  revealSecretKey: vi.fn().mockResolvedValue('SSECRET'),
}));

const DENIED = 'Necesitamos confirmar que eres tú para entrar.';

beforeEach(async () => {
  await i18n.changeLanguage('es');
  vi.clearAllMocks();
  mockPresence.mockResolvedValue(undefined);
  mockKeypairExists.mockResolvedValue(true);
  mockGetAuthToken.mockResolvedValue('tok');
  mockGetCurrentUser.mockResolvedValue({ id: 'u1', username: 'ana' });
  mockWriteJSON.mockResolvedValue(undefined);
});

function renderLogin(onLoginSuccess = vi.fn()) {
  render(
    <MemoryRouter>
      <Login onLoginSuccess={onLoginSuccess} />
    </MemoryRouter>,
  );
  return onLoginSuccess;
}

const entrar = () => screen.getByRole('button', { name: 'Entrar' });

describe('Login', () => {
  it('pregunta antes de pedir el token, sin ventana de gracia', async () => {
    const onLoginSuccess = renderLogin();
    fireEvent.click(entrar());

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(mockPresence).toHaveBeenCalledWith('login', true);
    expect(mockPresence.mock.invocationCallOrder[0])
      .toBeLessThan(mockGetAuthToken.mock.invocationCallOrder[0]);
    expect(mockWriteJSON).toHaveBeenCalledWith('micopay_user', { id: 'u1', username: 'ana', token: 'tok' });
  });

  it('si la persona cancela, no entra y puede reintentar', async () => {
    mockPresence.mockRejectedValueOnce(new PresenceDeniedError());
    const onLoginSuccess = renderLogin();
    fireEvent.click(entrar());

    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockWriteJSON).not.toHaveBeenCalled();
    expect(onLoginSuccess).not.toHaveBeenCalled();

    await waitFor(() => expect(entrar()).not.toBeDisabled());
    fireEvent.click(entrar());
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
  });

  it('sin llave en el telefono no hay nada que proteger: no pregunta', async () => {
    mockKeypairExists.mockResolvedValue(false);
    const onLoginSuccess = renderLogin();
    fireEvent.click(entrar());

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(mockGenerate).toHaveBeenCalled();
    expect(mockPresence).not.toHaveBeenCalled();
  });

  it('restaurar con llave secreta no pregunta', async () => {
    const onLoginSuccess = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /llave secreta/i }));
    fireEvent.change(screen.getByPlaceholderText('SABCD…'), { target: { value: 'S'.padEnd(56, 'A') } });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar cuenta' }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(mockImport).toHaveBeenCalled();
    expect(mockPresence).not.toHaveBeenCalled();
  });
});

describe('Register · Entrar a mi cuenta', () => {
  async function renderWithExistingAccount(onLoginSuccess = vi.fn()) {
    mockRegisterUser.mockRejectedValue(
      new ApiError({ message: 'ya registrada', error: 'ADDRESS_ALREADY_REGISTERED' }),
    );
    render(
      <MemoryRouter>
        <Register onLoginSuccess={onLoginSuccess} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByPlaceholderText('mi_usuario'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByRole('button', { name: /crear/i }));
    return { onLoginSuccess, button: await screen.findByRole('button', { name: 'Entrar a mi cuenta' }) };
  }

  it('pide la misma confirmacion antes de pedir el token', async () => {
    const { onLoginSuccess, button } = await renderWithExistingAccount();
    fireEvent.click(button);

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(mockPresence).toHaveBeenCalledWith('login', true);
    expect(mockPresence.mock.invocationCallOrder[0])
      .toBeLessThan(mockGetAuthToken.mock.invocationCallOrder[0]);
  });

  it('si la persona cancela, no entra', async () => {
    mockPresence.mockRejectedValueOnce(new PresenceDeniedError());
    const { onLoginSuccess, button } = await renderWithExistingAccount();
    fireEvent.click(button);

    expect(await screen.findByText(DENIED)).toBeInTheDocument();
    expect(mockGetAuthToken).not.toHaveBeenCalled();
    expect(mockWriteJSON).not.toHaveBeenCalled();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });
});
