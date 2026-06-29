import {
  PLATFORM_FEE_PERCENT,
  platformFeeMxnFromAmount,
} from '../constants/trade';

export interface TradeConfirmationPageProps {
  merchantName: string;
  merchantId: string;
  receiveMxn: number;
  commissionPct: number;
  amountMxn: number;
  flow: 'cashout' | 'deposit';
  nearbyCount: number;
  onBack: () => void;
  onConfirm: () => Promise<boolean>;
  loading?: boolean;
  errorMessage?: string | null;
}

export default function TradeConfirmationPage({
  merchantName,
  receiveMxn,
  commissionPct,
  amountMxn,
  flow,
  nearbyCount,
  onBack,
  onConfirm,
  loading = false,
  errorMessage,
}: TradeConfirmationPageProps) {
  const totalFee = amountMxn - receiveMxn;
  const platformFee = platformFeeMxnFromAmount(amountMxn);
  const providerFee = totalFee - platformFee;

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
              <dt className="text-on-surface-variant">Estado del agente</dt>
              <dd className="flex items-center gap-1.5 text-green-700 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                En línea
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

        <button
          type="button"
          disabled={loading}
          onClick={() => { onConfirm(); }}
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
