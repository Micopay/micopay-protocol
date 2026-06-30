import {
  PLATFORM_FEE_PERCENT,
  platformFeeMxnFromAmount,
} from '../constants/trade';
import { effectiveFeePercent, MAX_EFFECTIVE_FEE_PERCENT } from '../services/api';

export interface TradeConfirmationPageProps {
  merchantName: string;
  merchantId: string;
  receiveMxn: number;
  commissionPct: number;
  amountMxn: number;
  flow: 'cashout' | 'deposit';
  nearbyCount: number;
  merchantOnline?: boolean;
  onBack: () => void;
  onConfirm: () => Promise<boolean>;
  loading?: boolean;
  errorMessage?: string | null;
  /** Effective-fee threshold (%) above which a warning is shown. Defaults to the shared guardrail. */
  maxEffectiveFeePercent?: number;
}

export default function TradeConfirmationPage({
  merchantName,
  receiveMxn,
  commissionPct,
  amountMxn,
  flow,
  nearbyCount,
  merchantOnline = true,
  onBack,
  onConfirm,
  loading = false,
  errorMessage,
  maxEffectiveFeePercent = MAX_EFFECTIVE_FEE_PERCENT,
}: TradeConfirmationPageProps) {
  const totalFee = amountMxn - receiveMxn;
  const platformFee = platformFeeMxnFromAmount(amountMxn);
  const providerFee = totalFee - platformFee;
  // Combined effective cost the user actually pays: provider commission + platform fee.
  const effectivePct = effectiveFeePercent(commissionPct);
  const exceedsThreshold = effectivePct > maxEffectiveFeePercent;

  const title = flow === 'cashout' ? 'Confirmar retiro' : 'Confirmar depósito';
  const agentType = flow === 'cashout' ? 'Agente de retiro' : 'Punto de depósito';

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body pb-28">
      <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-surface/90 backdrop-blur-md px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-surface-container-low text-primary transition-colors"
          aria-label="Volver al mapa"
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
          <h2 className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">
            Resumen de la operación
          </h2>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Agente</dt>
              <dd className="font-semibold text-right">{merchantName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Tipo</dt>
              <dd className="font-semibold text-right">{agentType}</dd>
            </div>

            <div className="flex justify-between gap-4 border-t border-outline-variant/15 pt-3">
              <dt className="text-on-surface-variant">Recibes (MXN)</dt>
              <dd className="font-bold text-lg text-primary">
                ${receiveMxn.toFixed(2)} MXN
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Fee total</dt>
              <dd className="font-semibold tabular-nums">${totalFee.toFixed(2)} MXN</dd>
            </div>

            <div className="text-xs text-on-surface-variant pl-2 border-l-2 border-outline-variant/20 ml-1 space-y-1">
              <div className="flex justify-between">
                <span>Comisión del agente ({commissionPct}%)</span>
                <span>${providerFee.toFixed(2)} MXN</span>
              </div>
              <div className="flex justify-between">
                <span>Comisión plataforma ({PLATFORM_FEE_PERCENT}%)</span>
                <span>${platformFee.toFixed(2)} MXN</span>
              </div>
            </div>

            <div className="flex justify-between gap-4 border-t border-outline-variant/15 pt-3">
              <dt className="text-on-surface-variant">Costo total efectivo</dt>
              <dd
                className={`font-bold tabular-nums ${exceedsThreshold ? 'text-error' : 'text-on-surface'}`}
              >
                {effectivePct.toFixed(1)}%
              </dd>
            </div>

            <div className="flex justify-between gap-4 border-t border-outline-variant/15 pt-3">
              <dt className="text-on-surface-variant">Estado del agente</dt>
              <dd className={`flex items-center gap-1.5 font-medium ${merchantOnline ? 'text-green-700' : 'text-red-600'}`}>
                <span className={`w-2 h-2 rounded-full inline-block ${merchantOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                {merchantOnline ? 'En línea' : 'Sin conexión'}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-on-surface-variant">Proveedores cerca</dt>
              <dd className="font-medium">
                {nearbyCount} disponible{nearbyCount !== 1 ? 's' : ''}
              </dd>
            </div>
          </dl>
        </section>

        {exceedsThreshold && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/5 px-4 py-3"
          >
            <span className="material-symbols-outlined text-error text-base leading-none">warning</span>
            <p className="text-sm font-medium text-error leading-snug">
              El costo total efectivo ({effectivePct.toFixed(1)}%) supera el {maxEffectiveFeePercent}% recomendado.
              Revísalo antes de confirmar, o vuelve al mapa para elegir otra oferta.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={async () => { await onConfirm(); }}
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-on-primary shadow-md hover:opacity-95 disabled:opacity-50 transition-opacity"
        >
          {loading ? 'Creando operación…' : 'Confirmar'}
        </button>

        <button
          type="button"
          disabled={loading}
          onClick={onBack}
          className="w-full rounded-xl border border-outline-variant/30 py-3.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
        >
          Cancelar
        </button>
      </main>
    </div>
  );
}
