import { useEffect, useRef } from 'react';
import { getMerchantTrades, type MerchantTrade } from '../services/api';
import i18n from '../i18n';

// Textos que no pasan por el hook: el arbol se vuelve a pintar al cambiar de idioma.
const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

export const INCOMING_POLL_MS = 30_000;

/**
 * WP8: en la PC el agente no recibe avisos push. La bandeja solo se refrescaba
 * con la pestaña a la vista, asi que una operacion nueva pasaba inadvertida si
 * el agente estaba en otra pestaña. Esto consulta tambien en segundo plano y,
 * si llega una solicitud nueva, suena y lo dice en el titulo de la pestaña.
 */
export function pickNewTrades(seen: Set<string>, trades: MerchantTrade[]): MerchantTrade[] {
  return trades.filter((trade) => !seen.has(trade.id));
}

export function alertTitle(baseTitle: string, count: number): string {
  return count > 0 ? `(${count}) ${tr('incomingAlert.title')} · ${baseTitle}` : baseTitle;
}

/** Dos tonos cortos. Sin AudioContext (o bloqueado por el navegador) no suena. */
export function playIncomingSound(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      const start = ctx.currentTime + i * 0.2;
      osc.start(start);
      osc.stop(start + 0.15);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch {
    // Un aviso sin sonido es mejor que romper la pantalla.
  }
}

const isWatching = () => document.visibilityState === 'visible' && document.hasFocus();

export function useIncomingTradeAlert(token: string | null, enabled: boolean): void {
  const seen = useRef<Set<string> | null>(null);
  const unread = useRef(0);
  const baseTitle = useRef(document.title);

  useEffect(() => {
    if (!enabled || !token) return;
    let stopped = false;
    seen.current = null;
    baseTitle.current = document.title.replace(/^\(\d+\) .* · /, '');

    const clear = () => {
      if (!isWatching() || unread.current === 0) return;
      unread.current = 0;
      document.title = baseTitle.current;
    };

    const poll = async () => {
      try {
        const trades = await getMerchantTrades(token, 'pending');
        if (stopped) return;
        // La primera lectura solo marca lo que ya habia: no se avisa de eso.
        if (!seen.current) {
          seen.current = new Set(trades.map((trade) => trade.id));
          return;
        }
        const fresh = pickNewTrades(seen.current, trades);
        fresh.forEach((trade) => seen.current?.add(trade.id));
        if (fresh.length === 0) return;
        playIncomingSound();
        if (!isWatching()) {
          unread.current += fresh.length;
          document.title = alertTitle(baseTitle.current, unread.current);
        }
      } catch {
        // Sin red se reintenta en la siguiente vuelta.
      }
    };

    void poll();
    // Sin pausar con la pestaña oculta: justo ahi es cuando hace falta.
    const interval = setInterval(() => void poll(), INCOMING_POLL_MS);
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('focus', clear);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('focus', clear);
      if (unread.current > 0) document.title = baseTitle.current;
      unread.current = 0;
    };
  }, [token, enabled]);
}

/** Sin interfaz: se monta una vez en la app web para el agente activo. */
export default function IncomingTradeAlert({ token }: { token: string | null }) {
  useIncomingTradeAlert(token, true);
  return null;
}
