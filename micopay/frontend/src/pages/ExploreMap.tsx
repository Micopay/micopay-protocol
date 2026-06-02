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
    distance: '180 m',
    walkMinutes: 3,
    receiveMxn: 495,
    commissionPct: 1,
    badge: 'Negocio verificado',
    verified: true,
    isPrimary: true,
  },
  {
    id: 'offer_2',
    name: 'Usuario @carlos_g',
    icon: 'person',
    distance: '320 m',
    walkMinutes: 5,
    receiveMxn: 490,
    commissionPct: 2,
    rating: '⭐ 4.9 · 87 operaciones',
  },
  {
    id: 'offer_3',
    name: 'Lavandería El Sol',
    icon: 'laundry',
    distance: '450 m',
    walkMinutes: 7,
    receiveMxn: 485,
    commissionPct: 3,
    badge: 'Verificado',
  },
];

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
              {offers.map((offer, idx) => {
                const isPrimary = offer.isPrimary ?? idx === 0;
                if (isPrimary) {
                  return (
                    <article
                      key={offer.id}
                      className="relative bg-surface p-6 rounded-[24px] border border-primary-container/10 shadow-[0_4px_24px_rgba(0,133,96,0.06)] overflow-hidden"
                    >
                      <div className="flex gap-2 mb-4">
                        <span className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded-full uppercase tracking-wider">
                          Mejor oferta
                        </span>
                        {offer.badge && (
                          <span className="px-3 py-1 bg-surface-container-high text-primary text-[11px] font-bold rounded-full uppercase tracking-wider">
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
                            Preparando garantía...
                          </>
                        ) : (
                          'Ir con este agente'
                        )}
                      </button>
                    </article>
                  );
                }

                return (
                  <article
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
                Tu saldo se bloquea en garantía hasta que confirmes la recepción del efectivo. Operación segura y protegida por la garantía inteligente de MicoPay.
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
};

export default ExploreMap;
