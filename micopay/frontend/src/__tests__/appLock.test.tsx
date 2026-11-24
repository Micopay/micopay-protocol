/**
 * AUTH-2 · Pedir huella o PIN al abrir la app con la sesion abierta.
 *
 * EL HUECO
 * --------
 * Con la sesion abierta, quien tomara el telefono desbloqueado y abriera
 * MicoPay entraba directo a la cuenta: `initUsers` leia `micopay_user` y
 * llamaba `setSessionUser` sin preguntar, y volver de segundo plano tampoco
 * preguntaba. Las firmas ya pedian huella; mirar la cuenta, no.
 *
 * LO QUE ESTA SUITE FIJA
 * ----------------------
 *  1. Arranque en frio con sesion -> bloqueo y dialogo del sistema, y ningun
 *     dato de la cuenta en el DOM mientras tanto.
 *  2. Desbloqueo exitoso -> la app se ve.
 *  3. Cancelar (`PresenceDeniedError`) -> sigue bloqueada, sin cerrar sesion,
 *     y el boton vuelve a preguntar.
 *  4. Mas de 1 minuto en segundo plano bloquea; menos, no.
 *  5. "Cerrar sesión" lleva a /login y borra la sesion.
 *  6. Abrir desde un aviso: primero desbloquear, luego la pantalla del aviso.
 *  7. En web, o sin huella ni bloqueo de pantalla, no hay bloqueo.
 *  8. Tras desbloquear, una firma dentro de 60 s no vuelve a preguntar.
 *
 * Lo que NO fija: el comportamiento real del dialogo de Android. Eso queda
 * para la prueba manual en APK que pide la issue.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Plataforma y biometria ──────────────────────────────────────────────────
let isNative = true;
const mockAuthenticate = vi.fn();
const mockCheckBiometry = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNative,
    getPlatform: () => (isNative ? 'android' : 'web'),
  },
  // Plugins nativos que la app registra al importar: aqui no hacen nada.
  registerPlugin: () => new Proxy({}, { get: () => () => Promise.resolve({}) }),
}));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    authenticate: (...a: unknown[]) => mockAuthenticate(...a),
    checkBiometry: (...a: unknown[]) => mockCheckBiometry(...a),
  },
}));

type StateListener = (s: { isActive: boolean }) => void;
const appStateListeners: StateListener[] = [];
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (event: string, cb: StateListener) => {
      if (event === 'appStateChange') appStateListeners.push(cb);
      return Promise.resolve({
        remove: () => {
          const i = appStateListeners.indexOf(cb);
          if (i >= 0) appStateListeners.splice(i, 1);
        },
      });
    },
    exitApp: vi.fn(),
  },
}));

// ── Avisos push: se captura `onOpen` para simular tocar una notificacion ─────
let pushOnOpen: ((route: string) => void) | null = null;
vi.mock('../lib/push', () => ({
  PUSH_PERMISSION_GRANTED_EVENT: 'micopay:push-granted',
  startPush: (h: { onOpen: (route: string) => void }) => {
    pushOnOpen = h.onOpen;
    return Promise.resolve(() => {});
  },
}));

// ── Sesion guardada y backend ───────────────────────────────────────────────
const SESSION = { id: 'u1', username: 'ana', token: 'tok' };
let storedSession: typeof SESSION | null = SESSION;
const mockRemoveKey = vi.fn();

vi.mock('../services/secureStorage', () => ({
  readJSON: vi.fn((key: string) => Promise.resolve(
    key === 'micopay_user' ? storedSession
      // Onboarding ya visto: si no, Home redirige a /welcome.
      : key.includes('onboarding') ? { seen: true }
      : null,
  )),
  writeJSON: vi.fn().mockResolvedValue(undefined),
  removeKey: (...a: unknown[]) => mockRemoveKey(...a),
  isBackupConfirmed: vi.fn().mockResolvedValue(true),
  setBackupConfirmed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/keystore', () => ({
  keypairExists: vi.fn().mockResolvedValue(true),
  generateAndStoreKeypair: vi.fn(),
  importKeypair: vi.fn(),
  getPublicKey: vi.fn().mockResolvedValue('GPUB'),
  revealSecretKey: vi.fn().mockResolvedValue('SSECRET'),
  signTransactionXdr: vi.fn(),
}));
vi.mock('../services/api', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const stubbed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(real)) {
    stubbed[k] = typeof v === 'function' ? vi.fn().mockResolvedValue(null) : v;
  }
  stubbed.getCurrentUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'ana' });
  stubbed.registerPushToken = vi.fn().mockResolvedValue(undefined);
  return stubbed;
});

// Las pantallas reales piden muchos datos; aqui basta con saber cual se ve.
vi.mock('../pages/Home', () => ({ default: () => <div>Saldo de ana: $1,234</div> }));
vi.mock('../pages/History', () => ({ default: () => <div>Pantalla de historial</div> }));

beforeEach(() => {
  vi.clearAllMocks();
  isNative = true;
  storedSession = SESSION;
  pushOnOpen = null;
  appStateListeners.length = 0;
  mockCheckBiometry.mockResolvedValue({ isAvailable: true, deviceIsSecure: true });
  mockAuthenticate.mockResolvedValue(undefined);
  vi.stubEnv('VITE_API_URL', 'http://api.test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ mockStellar: true }),
  }));
  window.location.hash = '#/';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function renderApp() {
  vi.resetModules();
  const { default: i18n } = await import('../i18n');
  await i18n.changeLanguage('es');
  const { default: App } = await import('../App');
  const presence = await import('../lib/userPresence');
  render(<App />);
  return presence;
}

const lockTitle = () => screen.queryByText('MicoPay está bloqueada');
const HOME = /Saldo de ana/;

/** Simula salir a segundo plano y volver tras `ms`. */
async function backgroundFor(presence: typeof import('../lib/userPresence'), ms: number) {
  const now = Date.now();
  presence.markBackgrounded(now - ms);
  await act(async () => {
    for (const cb of [...appStateListeners]) cb({ isActive: true });
  });
}

describe('AUTH-2 · arranque en frío con sesión abierta', () => {
  it('bloquea y pide huella antes de mostrar cualquier dato de la cuenta', async () => {
    let finishPrompt: () => void = () => {};
    mockAuthenticate.mockImplementationOnce(() => new Promise<void>((r) => { finishPrompt = r; }));
    await renderApp();

    await waitFor(() => expect(lockTitle()).toBeInTheDocument());
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    expect(mockAuthenticate.mock.calls[0][0]).toMatchObject({ reason: 'Confirma que eres tú para abrir MicoPay' });
    expect(screen.queryByText(HOME)).not.toBeInTheDocument();

    await act(async () => finishPrompt());
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    expect(lockTitle()).not.toBeInTheDocument();
  });

  it('si la persona cancela, sigue bloqueada, no cierra sesión y puede reintentar', async () => {
    const { PresenceDeniedError } = await import('../lib/userPresence');
    mockAuthenticate.mockRejectedValueOnce(new PresenceDeniedError());
    await renderApp();

    expect(await screen.findByText(/No se confirmó/)).toBeInTheDocument();
    expect(lockTitle()).toBeInTheDocument();
    expect(screen.queryByText(HOME)).not.toBeInTheDocument();
    expect(mockRemoveKey).not.toHaveBeenCalledWith('micopay_user');

    const boton = screen.getByRole('button', { name: 'Desbloquear' });
    await waitFor(() => expect(boton).not.toBeDisabled());
    fireEvent.click(boton);
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
  });

  it('"Cerrar sesión" borra la sesión y lleva a /login', async () => {
    const { PresenceDeniedError } = await import('../lib/userPresence');
    mockAuthenticate.mockRejectedValueOnce(new PresenceDeniedError());
    await renderApp();

    const salir = await screen.findByRole('button', { name: 'Cerrar sesión' });
    await waitFor(() => expect(salir).not.toBeDisabled());
    fireEvent.click(salir);

    await waitFor(() => expect(window.location.hash).toBe('#/login'));
    expect(mockRemoveKey).toHaveBeenCalledWith('micopay_user');
    expect(lockTitle()).not.toBeInTheDocument();
  });

  it('sin sesión guardada no hay bloqueo: va directo al login', async () => {
    storedSession = null;
    await renderApp();
    await waitFor(() => expect(window.location.hash).toBe('#/login'));
    expect(lockTitle()).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});

describe('AUTH-2 · web y teléfonos sin bloqueo de pantalla', () => {
  it('en web no aparece el bloqueo', async () => {
    isNative = false;
    await renderApp();
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    expect(lockTitle()).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('sin huella ni PIN configurados no aparece el bloqueo', async () => {
    mockCheckBiometry.mockResolvedValue({ isAvailable: false, deviceIsSecure: false });
    await renderApp();
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    expect(lockTitle()).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});

describe('AUTH-2 · volver de segundo plano', () => {
  it('más de 1 minuto fuera bloquea; menos de 1 minuto, no', async () => {
    const presence = await renderApp();
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    mockAuthenticate.mockClear();

    // 59 s: salir a copiar algo no cuesta una huella.
    await backgroundFor(presence, presence.LOCK_AFTER_MS - 1_000);
    expect(lockTitle()).not.toBeInTheDocument();
    expect(mockAuthenticate).not.toHaveBeenCalled();

    // 61 s: bloquea y pregunta.
    let finishPrompt: () => void = () => {};
    mockAuthenticate.mockImplementationOnce(() => new Promise<void>((r) => { finishPrompt = r; }));
    await backgroundFor(presence, presence.LOCK_AFTER_MS + 1_000);
    await waitFor(() => expect(lockTitle()).toBeInTheDocument());
    expect(screen.queryByText(HOME)).not.toBeInTheDocument();

    await act(async () => finishPrompt());
    expect(await screen.findByText(HOME)).toBeInTheDocument();
  });
});

describe('AUTH-2 · abrir desde un aviso', () => {
  it('primero desbloquea y después navega a la pantalla del aviso', async () => {
    let finishPrompt: () => void = () => {};
    mockAuthenticate.mockImplementationOnce(() => new Promise<void>((r) => { finishPrompt = r; }));
    await renderApp();
    await waitFor(() => expect(lockTitle()).toBeInTheDocument());
    await waitFor(() => expect(pushOnOpen).not.toBeNull());

    await act(async () => pushOnOpen!('/history'));
    // La ruta cambia, pero detras del bloqueo no se pinta nada.
    expect(lockTitle()).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de historial')).not.toBeInTheDocument();

    await act(async () => finishPrompt());
    expect(await screen.findByText('Pantalla de historial')).toBeInTheDocument();
  });
});

describe('AUTH-2 · la compuerta de presencia', () => {
  it('tras desbloquear, firmar dentro de 60 s no vuelve a preguntar', async () => {
    const presence = await renderApp();
    expect(await screen.findByText(HOME)).toBeInTheDocument();
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);

    await presence.requireUserPresence('payment');
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
  });

  it('un PIN lento no vuelve a bloquear la app al desbloquearla', async () => {
    vi.resetModules();
    const presence = await import('../lib/userPresence');
    // Mientras el dialogo esta abierto Android manda la app a segundo plano.
    mockAuthenticate.mockImplementationOnce(async () => {
      presence.markBackgrounded(Date.now() - 5 * presence.LOCK_AFTER_MS);
    });
    await presence.requireUserPresence('unlock', true);
    expect(presence.shouldLockOnResume()).toBe(false);
  });

  it('cada salida cuenta una sola vez', async () => {
    vi.resetModules();
    const presence = await import('../lib/userPresence');
    presence.markBackgrounded(Date.now() - 2 * presence.LOCK_AFTER_MS);
    expect(presence.shouldLockOnResume()).toBe(true);
    expect(presence.shouldLockOnResume()).toBe(false);
  });
});
