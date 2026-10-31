import { useEffect } from 'react';
import { assertWalletReady, onWalletLost } from '../lib/signer/externalSigner';

export const WEB_IDLE_LIMIT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/** Cierra la sesion web si cambia la billetera o si nadie la usa. */
export default function WebSessionGuard({ onExpired }: { onExpired: () => void }) {
  useEffect(() => {
    const stopLost = onWalletLost(onExpired);
    const recheck = () => void assertWalletReady().catch(() => undefined);
    window.addEventListener('focus', recheck);

    let timer = window.setTimeout(onExpired, WEB_IDLE_LIMIT_MS);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onExpired, WEB_IDLE_LIMIT_MS);
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, restart, { passive: true }));

    return () => {
      stopLost();
      window.removeEventListener('focus', recheck);
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, restart));
    };
  }, [onExpired]);

  return null;
}
