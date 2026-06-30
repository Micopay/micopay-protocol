import MapSim from '../components/MapSim';
import { useMerchantsAvailable } from '../hooks/useMerchantsAvailable';
import {
  effectiveFeePercent,
  MAX_EFFECTIVE_FEE_PERCENT,
  type AvailableMerchant,
} from '../services/api';
import { PLATFORM_FEE_PERCENT } from '../constants/trade';
import ErrorBanner from '../components/ErrorBanner';
import type { ApiErrorAction } from '../utils/apiError';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DepositMapProps {
  onBack: () => void;
  onSelectOffer: (offerId: string) => void;
  loading?: boolean;
  amount?: number;
  creationError?: string | null;
  creationErrorAction?: ApiErrorAction;
  onDismissCreationError?: () => void;
  onRetryCreationError?: () => void;
  /** Effective-fee threshold (%) above which a warning is shown. Defaults to the shared guardrail. */
  maxEffectiveFeePercent?: number;
}

// ─── Effective cost (provider + platform) + over-threshold warning ────────────

function EffectiveFeeNote({
  commissionPct,
  platformFeePct,
  maxPct,
}: {
  commissionPct: number;
  platformFeePct: number;
  maxPct: number;
}) {
  const totalPct = effectiveFeePercent(commissionPct, platformFeePct);
  const exceeds = totalPct > maxPct;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
        <span className="text-xs text-on-surface-variant font-label uppercase">
          Costo total efectivo
        </span>
        <span className={`text-sm font-bold tabular-nums ${exceeds ? 'text-error' : 'text-on-surface'}`}>
          {totalPct.toFixed(1)}%
        </span>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Plataforma {platformFeePct}% + proveedor {commissionPct}%
      </p>
      {exceeds && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2"
        >
          <span className="material-symbols-outlined text-error text-base leading-none">warning</span>
          <p className="text-[12px] font-medium text-error leading-snug">
            El costo total supera el {maxPct}%. Compara con otra oferta antes de continuar.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton({ onBack, amount }: { onBack: () => void; amount: number }) {
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-24">
      <header className="w-full top-0 sticky bg-[#E7F6FF] shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-50 pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-[#00694C] active:scale-95 duration-200">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="font-headline font-bold text-xl text-[#00694C]">Ofertas de depósito</h1>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-8 space-y-8" aria-busy="true" aria-label="Cargando ofertas…">
        <section className="space-y-2">
          <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">
            Solicitud de depósito
          </span>
          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">${amount}</h2>
            <span className="text-xl font-headline font-bold text-on-surface-variant">MXN</span>
          </div>
          <p className="text-on-surface-variant text-sm font-body">Localizando agentes cerca de ti...</p>
        </section>

        <section>
          <div className="w-full h-64 bg-surface-container-low rounded-[32px] animate-pulse" />
        </section>

        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-surface-container-lowest rounded-xl p-6 ring-1 ring-outline-variant/10 space-y-4 animate-pulse"
            >
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-surface-container-high rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-surface-container-high rounded" />
                  <div className="h-3 w-24 bg-surface-container-high rounded" />
                </div>
              </div>
              <div className="h-[46px] w-full rounded-lg bg-surface-container-high" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

// ─── Location denied state ────────────────────────────────────────────────────

function LocationDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-24">
      <header className="w-full top-0 sticky bg-[#E7F6FF] shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-50 pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center px-6 py-4">
          <button onClick={onBack} className="text-[#00694C] active:scale-95 duration-200">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="ml-4 font-headline font-bold text-xl text-[#00694C]">Ofertas de depósito</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <span className="material-symbols-outlined text-5xl text-outline">location_off</span>
        <h2 className="font-headline font-bold text-xl text-on-surface">Necesitamos tu ubicación</h2>
        <p className="text-sm text-outline font-medium max-w-xs leading-snug">
          Para mostrarte agentes cercanos, activa el permiso de ubicación en Ajustes de tu dispositivo.
        </p>
        <button
          onClick={onBack}
          className="mt-2 px-6 py-3 border-2 border-primary text-primary font-bold rounded-xl active:scale-95 transition-all"
        >
          Volver
        </button>
      </main>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function FetchError({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="bg-surface text-on-surface min-h-screen pb-24">
      <header className="w-full top-0 sticky bg-[#E7F6FF] shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-50 pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center px-6 py-4">
          <button onClick={onBack} className="text-[#00694C] active:scale-95 duration-200">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="ml-4 font-headline font-bold text-xl text-[#00694C]">Ofertas de depósito</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <span className="material-symbols-outlined text-5xl text-error">wifi_off</span>
        <h2 className="font-headline font-bold text-xl text-on-surface">No pudimos cargar las ofertas</h2>
        <p className="text-sm text-outline font-medium max-w-xs">
          Revisa tu conexión e intenta de nuevo.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-primary text-white font-bold rounded-xl active:scale-95 transition-all"
          >
            Reintentar
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 border border-outline text-on-surface font-bold rounded-xl active:scale-95 transition-all"
          >
            Volver
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onBack, amount }: { onBack: () => void; amount: number }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4 gap-4">
      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center">
        <span className="material-symbols-outlined text-outline text-3xl">location_off</span>
      </div>
      <h2 className="font-headline font-bold text-xl text-on-surface">Sin agentes disponibles</h2>
      <p className="text-sm text-outline leading-snug max-w-[280px]">
        No hay agentes disponibles en tu zona para ${amount} MXN en este momento. Intenta más tarde.
      </p>
      <button
        onClick={onBack}
        className="mt-2 h-[48px] px-8 border-2 border-primary text-primary font-bold rounded-xl active:scale-95 transition-all duration-200 flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-sm">tune</span>
        Cambiar monto
      </button>
    </div>
  );
}

// ─── Merchant offer cards ─────────────────────────────────────────────────────

interface MerchantCardProps {
  merchant: AvailableMerchant;
  amount: number;
  loading: boolean;
  isBest: boolean;
  onSelectOffer: (id: string) => void;
  maxEffectiveFeePercent: number;
}

function MerchantOfferCard({
  merchant,
  amount,
  loading,
  isBest,
  onSelectOffer,
  maxEffectiveFeePercent,
}: MerchantCardProps) {
  const commissionMxn = (amount - merchant.payout_mxn).toFixed(2);
  const distanceLabel = formatDistance(merchant.distance_km);
  const platformFeePct = merchant.platform_fee_pct ?? PLATFORM_FEE_PERCENT;

  if (isBest) {
    return (
      <div className="relative group">
        <div className="absolute -top-3 left-6 z-10">
          <span className="bg-primary text-on-primary text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">
            Mejor oferta
          </span>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0px_32px_32px_rgba(11,30,38,0.04)] ring-1 ring-outline-variant/10 flex flex-col gap-5 transition-transform hover:scale-[1.01] duration-300">
          <div className="flex justify-between items-start">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-primary-fixed rounded-xl flex items-center justify-center text-primary">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  storefront
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h3 className="font-bold text-lg">{merchant.username}</h3>
                  <span
                    className="material-symbols-outlined text-accent text-sm"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    verified
                  </span>
                </div>
                <div className="mt-1 text-sm text-on-surface-variant flex items-center gap-2">
                  <span>{merchant.completion_rate !== undefined ? `${Math.round(merchant.completion_rate * 100)}% completitud` : '— completitud'}</span>
                  <span>·</span>
                  <span>{merchant.trades_completed ?? 0} trades</span>
                  {merchant.tier && <span className="ml-2 px-2 py-0.5 text-[11px] font-bold rounded-md bg-surface-container-high text-primary">{merchant.tier}</span>}
                  <span className={`ml-2 px-2 py-0.5 text-[11px] font-bold rounded-md ${((merchant.seller_type === 'business') || merchant.is_business) ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {((merchant.seller_type === 'business') || merchant.is_business) ? 'Negocio establecido' : 'Individuo'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-on-surface-variant text-xs">
                  <span className="material-symbols-outlined text-xs">near_me</span>
                  <span>{distanceLabel} de distancia</span>
                </div>
                {merchant.address_text && (
                  <p className="text-xs text-outline mt-0.5 truncate max-w-[200px]">
                    {merchant.address_text}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="block text-xs text-on-surface-variant font-label uppercase">Comisión</span>
              <span className="text-primary font-bold">${commissionMxn} MXN</span>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-lg p-4 flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tight">Envías</p>
              <p className="font-bold text-on-surface">${amount} MXN</p>
            </div>
            <span className="material-symbols-outlined text-outline-variant">trending_flat</span>
            <div className="space-y-1 text-right">
              <p className="text-[10px] text-accent uppercase font-bold tracking-tight">Recibes</p>
              <p className="font-bold text-on-surface text-lg">${merchant.payout_mxn.toFixed(2)} MXN</p>
            </div>
          </div>

          <EffectiveFeeNote
            commissionPct={merchant.rate_percent}
            platformFeePct={platformFeePct}
            maxPct={maxEffectiveFeePercent}
          />

          <button
            onClick={() => onSelectOffer(merchant.seller_id)}
            disabled={loading}
            className="w-full h-[46px] bg-gradient-to-r from-primary to-primary-container text-white font-semibold rounded-lg shadow-md active:scale-95 duration-200 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-wait"
          >
            {loading ? 'Bloqueando fondos…' : 'Aceptar esta oferta'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-xl p-6 ring-1 ring-outline-variant/5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-surface-container-highest rounded-xl flex items-center justify-center text-outline">
            <span className="material-symbols-outlined">storefront</span>
          </div>
          <div>
            <h3 className="font-bold text-lg">{merchant.username}</h3>
            <div className="mt-1 text-sm text-on-surface-variant flex items-center gap-2">
              <span>{merchant.completion_rate !== undefined ? `${Math.round(merchant.completion_rate * 100)}%` : '—'}</span>
              <span>·</span>
              <span>{merchant.trades_completed ?? 0} trades</span>
              {merchant.tier && <span className="ml-2 px-2 py-0.5 text-[10px] rounded-md bg-surface-container-high text-primary">{merchant.tier}</span>}
              <span className={`ml-2 px-2 py-0.5 text-[10px] rounded-md ${((merchant.seller_type === 'business') || merchant.is_business) ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {((merchant.seller_type === 'business') || merchant.is_business) ? 'Negocio' : 'Individuo'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant text-xs">
              <span className="material-symbols-outlined text-xs">near_me</span>
              <span>{distanceLabel}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-xs text-on-surface-variant font-label uppercase">Recibes</span>
          <span className="text-on-surface font-bold">${merchant.payout_mxn.toFixed(2)} MXN</span>
        </div>
      </div>
      <EffectiveFeeNote
        commissionPct={merchant.rate_percent}
        platformFeePct={platformFeePct}
        maxPct={maxEffectiveFeePercent}
      />
      <div className="flex justify-between items-center border-t border-outline-variant/10 pt-4">
        <p className="text-xs text-on-surface-variant">{distanceLabel} de distancia</p>
        <button
          onClick={() => onSelectOffer(merchant.seller_id)}
          disabled={loading}
          className="text-primary font-bold text-sm px-4 py-2 hover:bg-primary/5 rounded-lg transition-colors disabled:opacity-50"
        >
          Ver detalles
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DepositMap = ({
  onBack,
  onSelectOffer,
  loading = false,
  amount = 500,
  creationError,
  creationErrorAction = 'retry',
  onDismissCreationError,
  onRetryCreationError,
  maxEffectiveFeePercent = MAX_EFFECTIVE_FEE_PERCENT,
}: DepositMapProps) => {
  const { state, refetch } = useMerchantsAvailable({
    amount_mxn: amount,
    flow: 'deposit',
    radius_km: 5,
  });

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingSkeleton onBack={onBack} amount={amount} />;
  }

  if (state.status === 'location_denied') {
    return <LocationDenied onBack={onBack} />;
  }

  if (state.status === 'error') {
    return <FetchError onBack={onBack} onRetry={refetch} />;
  }

  const merchants = state.status === 'success' ? state.merchants : [];

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-24">
      {/* TopAppBar */}
      <header className="w-full top-0 sticky bg-[#E7F6FF] transition-colors duration-300 shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-50 pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-[#00694C] active:scale-95 duration-200"
              aria-label="Volver"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 className="font-headline font-bold text-xl text-[#00694C]">Ofertas de depósito</h1>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
        {creationError && (
          <ErrorBanner
            message={creationError}
            action={creationErrorAction}
            onRetry={onRetryCreationError}
            onDismiss={onDismissCreationError}
            supportState="TRADE_CREATE"
          />
        )}

        {/* Summary Context */}
        <section className="space-y-2">
          <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">
            Solicitud de depósito
          </span>
          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">
              ${amount}
            </h2>
            <span className="text-xl font-headline font-bold text-on-surface-variant">MXN</span>
          </div>
          <p className="text-on-surface-variant text-sm font-body">
            {merchants.length > 0
              ? `${merchants.length} ${merchants.length === 1 ? 'agente disponible' : 'agentes disponibles'} cerca de ti.`
              : 'Buscando agentes y usuarios verificados cerca de ti.'}
          </p>
        </section>

        {/* Map View Section */}
        <section>
          <MapSim type="deposit" merchants={merchants} />
        </section>

        {/* Offers List */}
        {merchants.length === 0 ? (
          <EmptyState onBack={onBack} amount={amount} />
        ) : (
          <div className="space-y-6">
            {merchants.map((merchant, idx) => (
              <MerchantOfferCard
                key={merchant.seller_id}
                merchant={merchant}
                amount={amount}
                loading={loading}
                isBest={idx === 0}
                onSelectOffer={onSelectOffer}
                maxEffectiveFeePercent={maxEffectiveFeePercent}
              />
            ))}
          </div>
        )}

        {/* Informative note */}
        <div className="bg-surface-container-low rounded-2xl p-6 border border-primary/10">
          <div className="flex gap-4">
            <span className="material-symbols-outlined text-primary">info</span>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Las ofertas están basadas en la tasa de cambio actual y la cercanía de los agentes.
              Todas las transacciones están protegidas por el contrato de depósito en garantía de MicoPay.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DepositMap;
