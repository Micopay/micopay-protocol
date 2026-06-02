const TRADE_STATES = [
  'locked',
  'pending_cash',
  'revealed',
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

const TRADE_STATE_COPY: Record<TradeState, TradeStateCopy> = {
  locked: {
    label: 'Operación bloqueada',
    happened: 'La operación ya se abrió y los fondos quedaron en garantía.',
    next: 'Comparte o presenta el código para continuar con la entrega de efectivo.',
    safe: 'Tu saldo sigue protegido en contrato hasta que el proceso termine.',
    tone: {
      container: 'bg-primary/5 border-primary/20',
      iconBg: 'bg-primary/10',
      icon: 'text-primary',
    },
    icon: 'lock',
  },
  pending_cash: {
    label: 'Esperando efectivo',
    happened: 'La operación está activa y esperando confirmación de entrega.',
    next: 'Cuando recibas el efectivo, confirma para liberar los fondos.',
    safe: 'Si algo falla o se vence el tiempo, el flujo regresa tus fondos según estado.',
    tone: {
      container: 'bg-secondary-container/30 border-secondary/20',
      iconBg: 'bg-secondary-container/50',
      icon: 'text-secondary',
    },
    icon: 'payments',
  },
  revealed: {
    label: 'Código revelado',
    happened: 'El secreto ya fue revelado y el cobro puede completarse.',
    next: 'Muestra el QR al agente y confirma cuando recibas el efectivo.',
    safe: 'El proceso queda trazado y sólo se libera cuando se completa correctamente.',
    tone: {
      container: 'bg-primary-container/20 border-primary/25',
      iconBg: 'bg-primary/10',
      icon: 'text-primary',
    },
    icon: 'qr_code_2',
  },
  completed: {
    label: 'Operación completada',
    happened: 'La operación se confirmó y el movimiento quedó cerrado.',
    next: 'Puedes volver al inicio o revisar el historial de actividad.',
    safe: 'Tus fondos ya se movieron al destino final de esta operación.',
    tone: {
      container: 'bg-[#1D9E75]/10 border-[#1D9E75]/30',
      iconBg: 'bg-[#1D9E75]/15',
      icon: 'text-[#1D9E75]',
    },
    icon: 'check_circle',
  },
  cancelled: {
    label: 'Operación cancelada',
    happened: 'La operación se detuvo antes de completarse.',
    next: 'Inicia una nueva solicitud cuando quieras intentarlo de nuevo.',
    safe: 'Tus fondos no se pierden: quedan asegurados para devolución o reintento.',
    tone: {
      container: 'bg-surface-container-low border-outline-variant/30',
      iconBg: 'bg-surface-container-high',
      icon: 'text-on-surface-variant',
    },
    icon: 'cancel',
    recoveryLabel: 'Crear nueva solicitud',
  },
  expired: {
    label: 'Tiempo agotado',
    happened: 'La operación venció por tiempo sin confirmarse.',
    next: 'Puedes iniciar otra operación para continuar.',
    safe: 'El sistema protege tu saldo y procede a liberar o reembolsar.',
    tone: {
      container: 'bg-surface-container-low border-outline-variant/30',
      iconBg: 'bg-surface-container-high',
      icon: 'text-on-surface-variant',
    },
    icon: 'schedule',
    recoveryLabel: 'Intentar de nuevo',
  },
  refunded: {
    label: 'Fondos reembolsados',
    happened: 'La operación se cerró y el saldo regresó a tu cuenta.',
    next: 'Puedes crear una nueva solicitud cuando te convenga.',
    safe: 'Tus fondos ya están de vuelta y disponibles.',
    tone: {
      container: 'bg-surface-container-low border-outline-variant/30',
      iconBg: 'bg-surface-container-high',
      icon: 'text-on-surface-variant',
    },
    icon: 'undo',
    recoveryLabel: 'Hacer otra solicitud',
  },
};

function isTradeState(value: string): value is TradeState {
  return (TRADE_STATES as readonly string[]).includes(value);
}

export function normalizeTradeState(value: string | null | undefined, fallback: TradeState): TradeState {
  if (!value) return fallback;
  return isTradeState(value) ? value : fallback;
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
  state: TradeState;
  onRecover?: () => void;
  recoverLabel?: string;
  className?: string;
}

const RECOVERY_STATES: TradeState[] = ['expired', 'cancelled', 'refunded'];

const TradeStateBadge = ({ state, onRecover, recoverLabel, className = '' }: TradeStateBadgeProps) => {
  const copy = TRADE_STATE_COPY[state];
  const showRecovery = RECOVERY_STATES.includes(state);
  const buttonLabel = recoverLabel ?? copy.recoveryLabel ?? 'Volver a intentar';

  return (
    <section className={`rounded-2xl border p-4 ${copy.tone.container} ${className}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${copy.tone.iconBg}`}>
          <span className={`material-symbols-outlined text-base ${copy.tone.icon}`}>{copy.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-on-surface">{copy.label}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{copy.happened}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-on-surface-variant">{copy.next}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-on-surface">{copy.safe}</p>
          {showRecovery && onRecover && (
            <button
              onClick={onRecover}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
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
