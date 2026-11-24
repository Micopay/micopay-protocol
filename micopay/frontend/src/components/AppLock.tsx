/**
 * Pantalla de bloqueo con la sesion abierta (AUTH-2).
 *
 * EL HUECO
 * --------
 * Con la sesion abierta, quien tomara el telefono desbloqueado y abriera
 * MicoPay entraba directo a saldo, historial, chats y perfil. Las firmas ya
 * pedian huella; mirar la cuenta, no.
 *
 * LO QUE ESTO ES, Y LO QUE NO
 * ---------------------------
 * App.tsx pinta esta pantalla EN LUGAR de las rutas, no encima: mientras esta
 * bloqueada no hay datos de la cuenta en el DOM. Por eso este componente no
 * recibe ni muestra nada de la cuenta.
 *
 * Cancelar no cierra la sesion: la app se queda bloqueada y el boton vuelve a
 * funcionar. "Cerrar sesión" es para quien quiera entrar con otra cuenta.
 *
 * No decide CUANDO bloquear (eso es App.tsx con `canLockDevice` y
 * `shouldLockOnResume`), solo como desbloquear.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PresenceDeniedError, requireUserPresence } from '../lib/userPresence';

interface AppLockProps {
  /** La persona confirmo: App quita el bloqueo. */
  onUnlocked: () => void;
  /** Cerrar sesion desde el bloqueo: App borra la sesion y lleva a /login. */
  onLogout: () => void;
}

export default function AppLock({ onUnlocked, onLogout }: AppLockProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  // StrictMode monta dos veces en desarrollo: sin esto el dialogo del sistema
  // saldria dos veces seguidas al abrir.
  const autoPrompted = useRef(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setDenied(false);
    try {
      // `force`: abrir la app siempre pregunta, aunque haya una firma reciente.
      // Al confirmar empieza la ventana de gracia de 60 s, asi que firmar justo
      // despues no vuelve a preguntar.
      await requireUserPresence('unlock', true);
      onUnlocked();
    } catch (err) {
      // Un "no" o un fallo del sistema dejan la app bloqueada. Nunca se trata
      // un error como permiso.
      if (!(err instanceof PresenceDeniedError)) console.warn('[app-lock] Falló la confirmación', err);
      setDenied(true);
    } finally {
      setBusy(false);
    }
  }, [onUnlocked]);

  // Al aparecer se pide de una vez: abrir la app ya es la intencion de entrar.
  useEffect(() => {
    if (autoPrompted.current) return;
    autoPrompted.current = true;
    void unlock();
  }, [unlock]);

  return (
    <div
      className="min-h-screen bg-fondo flex flex-col items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-title"
    >
      <div className="w-full max-w-sm bg-papel rounded-sm p-8 space-y-6 text-center">
        <span className="material-symbols-outlined text-5xl text-primary" aria-hidden="true">lock</span>
        <div>
          <p className="font-extrabold text-2xl text-tinta">MicoPay</p>
          <h1 id="app-lock-title" className="text-base text-tinta mt-2">{t('appLock.title')}</h1>
          {denied && <p className="text-sm text-gris mt-2" role="status">{t('appLock.retryHint')}</p>}
        </div>
        <button
          type="button"
          onClick={() => void unlock()}
          disabled={busy}
          className="w-full bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60"
        >
          {t('appLock.unlock')}
        </button>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          className="text-sm text-gris underline disabled:opacity-60"
        >
          {t('appLock.logout')}
        </button>
      </div>
    </div>
  );
}
