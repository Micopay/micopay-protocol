import MapSim from '../components/MapSim';
import { useMerchantsAvailable } from '../hooks/useMerchantsAvailable';
import type { AvailableMerchant } from '../services/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function walkMinutes(km: number): number {
  return Math.max(1, Math.round((km / 5) * 60));
}

// ─── Offer shape used by the card renderer ───────────────────────────────────

interface Offer {
  id: string;
  name: string;
  icon: string;
  distance: string;
  walkMinutes: number;
  receiveMxn: number;
  commissionPct: number;
  badge?: string;
  isPrimary?: boolean;
}

function merchantToOffer(m: AvailableMerchant, index: number): Offer {
  return {
    id: m.seller_id,
    name: m.username,
    icon: 'storefront',
    distance: formatDistance(m.distance_km),
    walkMinutes: walkMinutes(m.distance_km),
    receiveMxn: m.payout_mxn,
    commissionPct: m.rate_percent,
    badge: m.address_text ?? undefined,
    isPrimary: index === 0,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen pb-24">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-white/80 backdrop-blur-md shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="ml-4 font-headline font-bold text-xl text-primary tracking-tight">
          Convertir a efectivo
        </h1>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto" aria-busy="true" aria-label="Cargando ofertas…">
        <section className="mb-10">
          <div className="w-full h-64 bg-surface-container-low rounded-[32px] animate-pulse" />
        </section>
        <div className="mb-6 space-y-2">
          <div className="h-7 w-56 bg-surface-container-low rounded-lg animate-pulse" />
          <div className="h-4 w-28 bg-surface-container-low rounded-lg animate-pulse" />
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="mb-4 bg-surface-container-low/40 rounded-[24px] p-6 space-y-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-container-high" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-surface-container-high rounded" />
                <div className="h-3 w-24 bg-surface-container-high rounded" />
              </div>
            </div>
            <div className="h-[48px] w-full rounded-xl bg-surface-container-high" />
          </div>
        ))}
      </main>
    </div>
  );
}

function LocationDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen pb-24">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-white/80 backdrop-blur-md shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="ml-4 font-headline font-bold text-xl text-primary tracking-tight">
          Convertir a efectivo
        </h1>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <span className="material-symbols-outlined text-5xl text-outline">location_off</span>
        <h2 className="font-headline font-bold text-xl text-on-surface">
          Necesitamos tu ubicación
        </h2>
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

function FetchError({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen pb-24">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-white/80 backdrop-blur-md shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="ml-4 font-headline font-bold text-xl text-primary tracking-tight">
          Convertir a efectivo
        </h1>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <span className="material-symbols-outlined text-5xl text-error">wifi_off</span>
        <h2 className="font-headline font-bold text-xl text-on-surface">
          No pudimos cargar las ofertas
        </h2>
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

function EmptyState({ onBack, amount }: { onBack: () => void; amount: number }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4 gap-4">
      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center">
        <span className="material-symbols-outlined text-outline text-3xl">location_off</span>
      </div>
      <h2 className="font-headline font-bold text-xl text-on-surface">
        Sin proveedores cerca ahora
      </h2>
      <p className="text-sm text-outline leading-snug max-w-[280px]">
        No hay nadie disponible en tu zona para ${amount} MXN en este momento. Prueba en unos minutos o ajusta el monto.
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

// ─── Offer card ───────────────────────────────────────────────────────────────

interface OfferCardProps {
  offer: Offer;
  amount: number;
  loading: boolean;
  onSelectOffer: (id: string) => void;
}

function PrimaryOfferCard({ offer, amount, loading, onSelectOffer }: OfferCardProps) {
  return (
    <article className="relative bg-surface p-6 rounded-[24px] border border-primary-container/10 shadow-[0_4px_24px_rgba(0,133,96,0.06)] overflow-hidden">
      <div className="flex gap-2 mb-4">
        <span className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded-full uppercase tracking-wider">
          Mejor oferta
        </span>
        {offer.badge && (
          <span className="px-3 py-1 bg-surface-container-high text-primary text-[11px] font-bold rounded-full uppercase tracking-wider truncate max-w-[160px]">
            {offer.badge}
          </span>
        )}
      </div>
      <div className="flex items-start justify-between mb-6">
        <div className="flex gap-4">
          <div className="w-14 h-14 bg-primary-container/10 rounded-2xl flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-3xl">{offer.icon}</span>
          </div>
          <div>
            <h3 className="font-headline font-bold text-lg text-on-surface">{offer.name}</h3>
            <p className="text-sm text-outline font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">directions_walk</span>
              {offer.distance} · {offer.walkMinutes} min
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-6 p-4 bg-white/50 rounded-2xl">
        <div>
          <p className="text-[11px] font-bold text-outline uppercase tracking-wider mb-1">Recibes</p>
          <p className="text-2xl font-headline font-extrabold text-[#5DCAA5]">
            ${offer.receiveMxn.toFixed(2)} MXN
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold text-outline uppercase tracking-wider mb-1">Comisión</p>
          <p className="text-sm font-bold text-on-surface">
            ${(amount - offer.receiveMxn).toFixed(2)} ({offer.commissionPct}%)
          </p>
        </div>
      </div>
      <button
        onClick={() => onSelectOffer(offer.id)}
        disabled={loading}
        className="w-full h-[52px] bg-gradient-to-r from-primary to-primary-container text-white font-headline font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Preparando escrow...
          </>
        ) : (
          'Ir con este agente'
        )}
      </button>
    </article>
  );
}

function SecondaryOfferCard({ offer, loading, onSelectOffer }: OfferCardProps) {
  return (
    <article className="bg-surface-container-low/30 p-5 rounded-[24px] border border-transparent hover:border-surface-container-high transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white rounded-full flex items-center justify-center border border-surface-container-high">
            <span className="material-symbols-outlined text-outline">{offer.icon}</span>
          </div>
          <div>
            <h3 className="font-headline font-bold text-on-surface">{offer.name}</h3>
            {offer.badge && (
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                {offer.badge}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-outline uppercase tracking-wider">Oferta</p>
          <p className="text-lg font-headline font-bold text-on-surface">
            ${offer.receiveMxn.toFixed(2)} MXN
          </p>
        </div>
      </div>
      <button
        onClick={() => onSelectOffer(offer.id)}
        disabled={loading}
        className="w-full py-3 border border-primary text-primary font-bold rounded-xl active:scale-95 transition-all disabled:opacity-70"
      >
        Ver oferta
      </button>
    </article>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ExploreMapProps {
  onBack: () => void;
  onSelectOffer: (offerId: string) => void;
  amount?: number;
  loading?: boolean;
}

const ExploreMap = ({
  onBack,
  onSelectOffer,
  amount = 500,
  loading = false,
}: ExploreMapProps) => {
  const { state, refetch } = useMerchantsAvailable({
    amount_mxn: amount,
    flow: 'cashout',
    radius_km: 5,
  });

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingSkeleton onBack={onBack} />;
  }

  if (state.status === 'location_denied') {
    return <LocationDenied onBack={onBack} />;
  }

  if (state.status === 'error') {
    return <FetchError onBack={onBack} onRetry={refetch} />;
  }

  const offers: Offer[] =
    state.status === 'success'
      ? state.merchants.map((m, i) => merchantToOffer(m, i))
      : [];

  return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen pb-24">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-white/80 backdrop-blur-md shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="ml-4 font-headline font-bold text-xl text-primary tracking-tight">
          Convertir a efectivo
        </h1>
      </header>

      <main className="pt-24 px-6 max-w-2xl mx-auto">
        {/* Map Section */}
        <section className="mb-10">
          <MapSim />
        </section>

        {offers.length === 0 ? (
          <EmptyState onBack={onBack} amount={amount} />
        ) : (
          <>
            {/* Results Header */}
            <div className="mb-6">
              <h2 className="font-headline font-bold text-2xl text-on-surface">
                {offers.length} {offers.length === 1 ? 'oferta' : 'ofertas'} para ${amount} MXN
              </h2>
              <div className="flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-primary text-sm">location_on</span>
                <p className="text-sm text-outline font-medium">Cerca de ti</p>
              </div>
            </div>

            {/* Offers List */}
            <div className="space-y-4">
              {offers.map((offer, idx) =>
                idx === 0 ? (
                  <PrimaryOfferCard
                    key={offer.id}
                    offer={offer}
                    amount={amount}
                    loading={loading}
                    onSelectOffer={onSelectOffer}
                  />
                ) : (
                  <SecondaryOfferCard
                    key={offer.id}
                    offer={offer}
                    amount={amount}
                    loading={loading}
                    onSelectOffer={onSelectOffer}
                  />
                ),
              )}
            </div>

            {/* Footer Note */}
            <footer className="mt-10 mb-8 p-6 text-center">
              <p className="text-[12px] leading-relaxed text-outline font-medium">
                Tu saldo se bloquea en garantía hasta que confirmes la recepción del efectivo.
                Operación segura y protegida por MicoPay Smart Escrow.
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
};

export default ExploreMap;
