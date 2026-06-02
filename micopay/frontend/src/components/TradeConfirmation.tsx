/**
 * Pre-flight summary before the user hits the map / POST /trades (issue #17).
 *
 * Renders the **exact** numeric fields the backend will persist (`amount_mxn`, fee at 0.8%, timeout)
 * so the user has meaningful friction before any escrow step.
 */
import {
  PLATFORM_FEE_PERCENT,
  TRADE_DEFAULT_TIMEOUT_MINUTES,
  platformFeeMxnFromAmount,
} from '../constants/trade';

export type TradeConfirmationFlow = 'cashout' | 'deposit';

export interface TradeConfirmationProps {
  flow: TradeConfirmationFlow;
  /** Integer MXN face amount — must already satisfy 100..50_000 (caller validates). */
  amountMxn: number;
  /** Merchant / agent label (demo uses registered seller username when available). */
  merchantDisplayName: string;
  /** Human-readable FX line — informational only until live quotes exist. */
  exchangeRateLabel: string;
  onBack: () => void;
  /** Fires when the user accepts — parent typically routes to the map; trade is NOT created here. */
  onConfirm: () => void;
  /** True while parent is calling POST /trades + lock + reveal after map selection (optional use). */
  loading?: boolean;
  /** Non-blocking error from a prior POST /trades attempt (parent can clear on dismiss). */
  errorMessage?: string | null;
}

export default function TradeConfirmation({
  flow,
  amountMxn,
  merchantDisplayName,
  exchangeRateLabel,
  onBack,
  onConfirm,
  loading = false,
  errorMessage,
}: TradeConfirmationProps) {
  // Fee line must match backend rounding exactly (see `constants/trade.ts`).
  const platformFeeMxn = platformFeeMxnFromAmount(amountMxn);

  const title = flow === 'cashout' ? 'Confirmar retiro en efectivo' : 'Confirmar depósito en efectivo';
  const primaryExplainer =
    flow === 'cashout'
      ? 'Al continuar, buscarás un agente en el mapa. Al aceptar una oferta se creará la operación y se solicitará el bloqueo USDC en garantía según el flujo del protocolo.'
      : 'Al continuar, buscarás un punto de depósito. Al aceptar una oferta se creará la operación y se solicitará el bloqueo USDC en garantía según el flujo del protocolo.';

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body pb-28">
      <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-surface/90 backdrop-blur-md px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-surface-container-low text-primary transition-colors"
          aria-label="Volver sin perder el monto"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline font-bold text-lg text-primary truncate">{title}</h1>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-5">
        {errorMessage ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-outline-variant/20 bg-surface p-5 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Resumen</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Monto de la operación (MXN)</dt>
              <dd className="font-semibold tabular-nums">${amountMxn.toLocaleString('es-MX')} MXN</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Comisión plataforma ({PLATFORM_FEE_PERCENT}%)</dt>
              <dd className="font-semibold tabular-nums text-primary">${platformFeeMxn.toLocaleString('es-MX')} MXN</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-outline-variant/15 pt-3">
              <dt className="text-on-surface-variant">Comerciante / agente (ejemplo)</dt>
              <dd className="font-medium text-right">{merchantDisplayName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Tipo de cambio (referencial)</dt>
              <dd className="text-right text-on-surface/80">{exchangeRateLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Tiempo máximo de la operación</dt>
              <dd className="font-medium">{TRADE_DEFAULT_TIMEOUT_MINUTES} minutos</dd>
            </div>
          </dl>
          <p className="text-xs text-on-surface-variant leading-relaxed border-t border-outline-variant/15 pt-3">
            La comisión del <strong>{PLATFORM_FEE_PERCENT}%</strong> es la misma que calcula el backend; no hay cargos
            ocultos en esta pantalla.
          </p>
        </section>

        <p className="text-sm text-on-surface-variant leading-relaxed">{primaryExplainer}</p>

        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-on-primary shadow-md hover:opacity-95 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Procesando…' : 'Buscar en el mapa'}
        </button>
      </main>
    </div>
  );
}
