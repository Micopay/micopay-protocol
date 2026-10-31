import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as keystore from '../lib/keystore';
import WalletLogin from '../pages/WalletLogin';
import Welcome from '../pages/Welcome';
import { ApiError } from '../utils/apiError';
// @ts-expect-error El Worker es JavaScript plano.
import worker from '../../web/worker.js';

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getAuthToken: vi.fn(),
  getCurrentUser: vi.fn(),
  registerUser: vi.fn(),
}));

vi.mock('../lib/signer/mode', () => ({ IS_EXTERNAL_SIGNER: true }));
vi.mock('../lib/signer/externalSigner', () => ({
  connectWallet: mocks.connectWallet,
  disconnectWallet: mocks.disconnectWallet,
  getConnectedAddress: () => 'GCONECTADA',
}));
vi.mock('../services/api', () => ({
  getAuthToken: mocks.getAuthToken,
  getCurrentUser: mocks.getCurrentUser,
  registerUser: mocks.registerUser,
}));

describe('llaves en modo web', () => {
  it.each([
    ['generar', () => keystore.generateAndStoreKeypair()],
    ['importar', () => keystore.importKeypair('S')],
    ['exportar', () => keystore.exportSecretKey()],
    ['revelar', () => keystore.revealSecretKey()],
    ['firmar texto', () => keystore.signChallenge('reto')],
    ['borrar', () => keystore.deleteKeypair()],
  ])('no se puede %s', async (_name, action) => {
    await expect(action()).rejects.toThrow('no crea ni lee llaves');
  });

  it('la cuenta es la de la billetera', async () => {
    await expect(keystore.getPublicKey()).resolves.toBe('GCONECTADA');
    await expect(keystore.keypairExists()).resolves.toBe(true);
  });
});

describe('Conectar billetera', () => {
  const onLoginSuccess = vi.fn();
  const open = () => render(<MemoryRouter><WalletLogin onLoginSuccess={onLoginSuccess} /></MemoryRouter>);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectWallet.mockResolvedValue('GCUENTA');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  it('una cuenta existente entra directo', async () => {
    mocks.getAuthToken.mockResolvedValue('jwt');
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1', username: 'ana' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar billetera' }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith({ id: 'u1', username: 'ana', token: 'jwt' }));
  });

  it('una cuenta nueva solo elige nombre, sin frase ni respaldo', async () => {
    mocks.getAuthToken.mockRejectedValue(new ApiError({ error: 'USER_NOT_FOUND', message: 'x' }));
    mocks.registerUser.mockResolvedValue({ id: 'u2', username: 'beto', token: 'jwt' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar billetera' }));
    const name = await screen.findByLabelText('Nombre de usuario');
    fireEvent.change(name, { target: { value: 'beto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(mocks.registerUser).toHaveBeenCalledWith('beto', undefined);
    expect(document.body.textContent).not.toMatch(/llave secreta|respald/i);
  });

  it('avisa si la cuenta no existe en la red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    mocks.getAuthToken.mockRejectedValue(new ApiError({ error: 'USER_NOT_FOUND', message: 'x' }));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Conectar billetera' }));
    expect(await screen.findByText(/todavía no existe en la red/)).toBeTruthy();
  });
});

describe('Bienvenida en la web', () => {
  it('habla de la billetera y no pide respaldar una llave del telefono', () => {
    render(<Welcome username="ana" onDone={() => {}} />);
    expect(screen.getByText(/Paso 1 de 4/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/tu billetera/);
    expect(document.body.textContent).not.toMatch(/teléfono|dispositivo/);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByText('Respalda tu llave')).toBeNull();
  });
});

describe('Worker de la web', () => {
  const env = (key: string) => ({
    NETWORK_PASSPHRASE: 'red',
    WEB_AUTH_ENDPOINT: 'https://api.micopay.app/auth/sep10',
    SEP10_SIGNING_KEY: key,
    ASSETS: { fetch: async () => new Response('<html>', { status: 200 }) },
  });

  it('publica stellar.toml con CORS abierto', async () => {
    const res = await worker.fetch(new Request('https://app.micopay.com.mx/.well-known/stellar.toml'), env('GSERVER'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const text = await res.text();
    expect(text).toContain('SIGNING_KEY="GSERVER"');
    expect(text).toContain('WEB_AUTH_ENDPOINT="https://api.micopay.app/auth/sep10"');
  });

  it('sin llave, stellar.toml no existe', async () => {
    const res = await worker.fetch(new Request('https://app.micopay.com.mx/.well-known/stellar.toml'), env(''));
    expect(res.status).toBe(404);
  });

  it('agrega las cabeceras de seguridad a la app', async () => {
    const res = await worker.fetch(new Request('https://app.micopay.com.mx/'), env(''));
    expect(res.headers.get('Content-Security-Policy-Report-Only')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
