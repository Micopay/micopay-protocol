import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';

/**
 * CASH-5A · Los estados canónicos, y solo esos.
 *
 * Esta lista es exactamente la de `trades.status` en `micopay/sql/init.sql`,
 * que es la fuente autoritativa. Antes esta constante inventaba `pending_cash`
 * y `revealed` —que ningún backend emite— y omitía `pending` y `revealing`,
 * que sí ocurren. El resultado era que un estado real caía en la vista de
 * respaldo y la pantalla mostraba una etiqueta que no correspondía.
 *
 * Las dos invenciones colapsan en `revealing`: era el mismo momento del flujo
 * descrito dos veces, el secreto ya revelado esperando la entrega de efectivo.
 */
export const TRADE_STATES = [
  'pending',
  'locked',
  'revealing',
  'completed',
  'cancelled',
  'expired',
  'refunded',
] as const;

export type TradeState = (typeof TRADE_STATES)[number];

type TradeStateCopy = {
  label: string;
  happened: string;
  next: string;
  safe: string;
  tone: {
    container: string;
    iconBg: string;
    icon: string;
  };
  icon: string;
  recoveryLabel?: string;
};

/**
 * Estos textos ya estaban escritos para personas —"Esperando la entrega",
 * "Muestra el codigo al agente"— pero solo los usaba la insignia de estado.
 * `ChatRoom` mantenia su propia lista con `locked` y `pending`, y cualquier otro
 * estado caia a "Operacion: revealing", el nombre interno del sistema.
 *
 * Se exporta para que exista UNA sola redaccion por estado. Dos listas paralelas
 * garantizan que una se quede atras, y la que se quedo atras fue la que ve el
 * usuario en mitad de una operacion con su dinero dentro.
 */
export const TRADE_STATE_COPY: Record<TradeState, TradeStateCopy> = {
  locked: {
    get label() { return i18n.t('tradeState.locked.label'); },
    get happened() { return i18n.t('tradeState.locked.happened'); },
    get next() { return i18n.t('tradeState.locked.next'); },
    get safe() { return i18n.t('tradeState.locked.safe'); },
    tone: {
      container: 'bg-verde-suave border-tinta',
      iconBg: 'bg-verde',
      icon: 'text-papel',
    },
    icon: 'lock',
  },
  pending: {
    get label() { return i18n.t('tradeState.pending.label'); },
    get happened() { return i18n.t('tradeState.pending.happened'); },
    get next() { return i18n.t('tradeState.pending.next'); },
    get safe() { return i18n.t('tradeState.pending.safe'); },
    tone: {
      container: 'bg-fondo border-tinta',
      iconBg: 'bg-gris',
      icon: 'text-papel',
    },
    icon: 'hourglass_top',
  },
  revealing: {
    get label() { return i18n.t('tradeState.revealing.label'); },
    get happened() { return i18n.t('tradeState.revealing.happened'); },
    get next() { return i18n.t('tradeState.revealing.next'); },
    get safe() { return i18n.t('tradeState.revealing.safe'); },
    tone: {
      container: 'bg-naranja-suave border-tinta',
      iconBg: 'bg-naranja',
      icon: 'text-papel',
    },
    icon: 'qr_code_2',
  },
  completed: {
    get label() { return i18n.t('tradeState.completed.label'); },
    get happened() { return i18n.t('tradeState.completed.happened'); },
    get next() { return i18n.t('tradeState.completed.next'); },
    get safe() { return i18n.t('tradeState.completed.safe'); },
    tone: {
      container: 'bg-verde-suave border-tinta',
      iconBg: 'bg-verde-claro',
      icon: 'text-papel',
    },
    icon: 'check_circle',
  },
  cancelled: {
    get label() { return i18n.t('tradeState.cancelled.label'); },
    get happened() { return i18n.t('tradeState.cancelled.happened'); },
    get next() { return i18n.t('tradeState.cancelled.next'); },
    get safe() { return i18n.t('tradeState.cancelled.safe'); },
    tone: {
      container: 'bg-fondo border-tinta',
      iconBg: 'bg-gris',
      icon: 'text-papel',
    },
    icon: 'cancel',
    get recoveryLabel() { return i18n.t('tradeState.cancelled.recovery'); },
  },
  expired: {
    get label() { return i18n.t('tradeState.expired.label'); },
    get happened() { return i18n.t('tradeState.expired.happened'); },
    get next() { return i18n.t('tradeState.expired.next'); },
    get safe() { return i18n.t('tradeState.expired.safe'); },
    tone: {
      container: 'bg-fondo border-tinta',
      iconBg: 'bg-gris',
      icon: 'text-papel',
    },
    icon: 'schedule',
    get recoveryLabel() { return i18n.t('tradeState.expired.recovery'); },
  },
  refunded: {
    get label() { return i18n.t('tradeState.refunded.label'); },
    get happened() { return i18n.t('tradeState.refunded.happened'); },
    get next() { return i18n.t('tradeState.refunded.next'); },
    get safe() { return i18n.t('tradeState.refunded.safe'); },
    tone: {
      container: 'bg-verde-suave border-tinta',
      iconBg: 'bg-verde',
      icon: 'text-papel',
    },
    icon: 'undo',
    get recoveryLabel() { return i18n.t('tradeState.refunded.recovery'); },
  },
};

export function isTradeState(value: string): value is TradeState {
  return (TRADE_STATES as readonly string[]).includes(value);
}

/**
 * CASH-5A: devuelve el estado canónico, o `null` si el backend mandó algo que
 * no está en el contrato. Devolver `null` en vez de un respaldo silencioso es
 * lo que permite que la pantalla lo muestre en vez de inventar una transición.
 */
export function parseTradeState(value: string | null | undefined): TradeState | null {
  if (!value) return null;
  return isTradeState(value) ? value : null;
}

export function normalizeTradeState(value: string | null | undefined, fallback: TradeState): TradeState {
  return parseTradeState(value) ?? fallback;
}

export function getTradeStateDebugOverride(fallback: TradeState): TradeState {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const queryState = params.get('trade_state');
  if (queryState && isTradeState(queryState)) return queryState;
  const localStorageState = window.localStorage.getItem('micopay_trade_state_override');
  if (localStorageState && isTradeState(localStorageState)) return localStorageState;
  return fallback;
}

interface TradeStateBadgeProps {
  /**
   * CASH-5A: acepta `string` a propósito. Un backend que emita un estado
   * fuera del contrato no puede quedar oculto tras un respaldo silencioso:
   * se dibuja de forma visible y, sobre todo, no habilita ninguna acción.
   */
  state: TradeState | string;
  onRecover?: () => void;
  recoverLabel?: string;
  className?: string;
}

const RECOVERY_STATES: TradeState[] = ['expired', 'cancelled', 'refunded'];

const TradeStateBadge = ({ state, onRecover, recoverLabel, className = '' }: TradeStateBadgeProps) => {
  // Los textos se leen al dibujar: con el hook, cambiar de idioma vuelve a pintar.
  const { t } = useTranslation();
  const canonical = parseTradeState(state);

  // Estado fuera del contrato: se dice, no se disfraza. Sin acción de
  // recuperación, para que un valor desconocido no pueda desbloquear nada.
  if (!canonical) {
    return (
      <section
        data-testid="trade-state-unknown"
        className={`rounded-sm border-2 border-tinta bg-fondo p-4 ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-sm border-2 border-tinta bg-gris flex items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined text-base text-papel">help</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-tinta">{t('tradeState.unknown.title')}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-gris">
              <Trans
                i18nKey="tradeState.unknown.body"
                values={{ state: String(state) }}
                components={{ code: <span className="font-mono" /> }}
              />
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-on-surface">
              {t('tradeState.unknown.safe')}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const copy = TRADE_STATE_COPY[canonical];
  const showRecovery = RECOVERY_STATES.includes(canonical);
  const buttonLabel = recoverLabel ?? copy.recoveryLabel ?? t('tradeState.retry');

  return (
    <section className={`rounded-sm border-2 p-4 ${copy.tone.container} ${className}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-sm border-2 border-tinta flex items-center justify-center ${copy.tone.iconBg}`}>
          <span className={`material-symbols-outlined text-base ${copy.tone.icon}`}>{copy.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm text-tinta`}>{copy.label}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-gris">{copy.happened}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-gris">{copy.next}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-on-surface">{copy.safe}</p>
          {showRecovery && onRecover && (
            <button
              onClick={onRecover}
              className="mt-3 inline-flex items-center gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default TradeStateBadge;
