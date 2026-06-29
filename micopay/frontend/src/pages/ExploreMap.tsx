import { useEffect, useRef, useState, type ReactNode } from 'react';
import MapSim from '../components/MapSim';
import { useMerchantsAvailable } from '../hooks/useMerchantsAvailable';
import type { AvailableMerchant } from '../services/api';
import ErrorBanner from '../components/ErrorBanner';
import type { ApiErrorAction } from '../utils/apiError';

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
    isPrimary: index === 0,
  };
}

export interface OfferConfirmData {
  id: string;
  name: string;
  receiveMxn: number;
  commissionPct: number;
  nearbyCount: number;
}

interface ExploreMapProps {
  onBack: () => void;
  onSelectOffer: (offerId: string) => void;
  onProceedToConfirm?: (offer: OfferConfirmData) => void;
  amount?: number;
  loading?: boolean;
  creationError?: string | null;
  creationErrorAction?: ApiErrorAction;
  onDismissCreationError?: () => void;
  onRetryCreationError?: () => void;
}

const ExploreMap = ({
  onBack,
  onSelectOffer,
  onProceedToConfirm,
  amount = 500,
  loading = false,
  creationError,
  creationErrorAction = 'retry',
  onDismissCreationError,
  onRetryCreationError,
}: ExploreMapProps) => {
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const selectedOfferRef = useRef<HTMLElement | null>(null);
  const { state, refetch } = useMerchantsAvailable({
    amount_mxn: amount,
    flow: 'cashout',
    radius_km: 5,
  });

  useEffect(() => {
    selectedOfferRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedMerchantId]);

  if (state.status === 'loading' || state.status === 'idle') {
    return <LoadingSkeleton onBack={onBack} />;
  }

  if (state.status === 'location_denied') {
    return <LocationDenied onBack={onBack} />;
  }

  if (state.status === 'error') {
    return <FetchError onBack={onBack} onRetry={refetch} />;
  }

  const merchants = state.status === 'success' ? state.merchants : [];
  const offers: Offer[] = merchants.map((m, i) => merchantToOffer(m, i));

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
        {creationError ? (
          <ErrorBanner
            message={creationError}
            action={creationErrorAction}
            onRetry={onRetryCreationError}
            onDismiss={onDismissCreationError}
            supportState="TRADE_CREATE"
            className="mb-6"
          />
        ) : null}

        {/* Map Section */}
        <section className="mb-10">
          <MapSim
            merchants={merchants}
            selectedMerchantId={selectedMerchantId}
            onSelectMerchant={setSelectedMerchantId}
          />
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
                const isSelected = selectedMerchantId === offer.id;
                if (isPrimary) {
                  return (
                    <article
                      key={offer.id}
                      ref={isSelected ? selectedOfferRef : null}
                      className={`relative bg-surface p-6 rounded-[24px] border shadow-[0_4px_24px_rgba(0,133,96,0.06)] overflow-hidden transition-all ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-primary-container/10'}`}
                    >
                      <div className="flex gap-2 mb-4">
                        <span className="px-3 py-1 bg-primary text-white text-[11px] font-bold rounded-full uppercase tracking-wider">
                          Mejor oferta
                        </span>
                        {isSelected && (
                          <span className="px-3 py-1 bg-primary/10 text-primary text-[11px] font-bold rounded-full uppercase tracking-wider">
                            Seleccionado en mapa
                          </span>
                        )}
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
                        onClick={() => {
                          if (onProceedToConfirm) {
                            onProceedToConfirm({
                              id: offer.id,
                              name: offer.name,
                              receiveMxn: offer.receiveMxn,
                              commissionPct: offer.commissionPct,
                              nearbyCount: offers.length,
                            });
                          } else {
                            onSelectOffer(offer.id);
                          }
                        }}
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
                    ref={isSelected ? selectedOfferRef : null}
                    className={`bg-surface-container-low/30 p-5 rounded-[24px] border transition-all ${isSelected ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'border-transparent hover:border-surface-container-high'}`}
                  >
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
                          {isSelected && (
                            <span className="ml-2 text-[11px] font-bold text-primary bg-white px-2 py-0.5 rounded-md">
                              Seleccionado en mapa
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
                      onClick={() => {
                        if (onProceedToConfirm) {
                          onProceedToConfirm({
                            id: offer.id,
                            name: offer.name,
                            receiveMxn: offer.receiveMxn,
                            commissionPct: offer.commissionPct,
                            nearbyCount: offers.length,
                          });
                        } else {
                          onSelectOffer(offer.id);
                        }
                      }}
                      disabled={loading}
                      className="w-full py-3 border border-primary text-primary font-bold rounded-xl active:scale-95 transition-all disabled:opacity-70"
                    >
                      Ver oferta
                    </button>
                  </article>
                );
              })}
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

// ─── State screens ───────────────────────────────────────────────────────────

function StateHeader({ onBack }: { onBack: () => void }) {
  return (
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
  );
}

function StateShell({
  onBack,
  icon,
  title,
  children,
  spin = false,
}: {
  onBack: () => void;
  icon: string;
  title: string;
  children?: ReactNode;
  spin?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest text-on-surface font-body min-h-screen pb-24">
      <StateHeader onBack={onBack} />
      <main className="pt-24 px-6 max-w-2xl mx-auto flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-primary-container/10 rounded-2xl flex items-center justify-center mt-16 mb-6">
          <span className={`material-symbols-outlined text-primary text-4xl ${spin ? 'animate-spin' : ''}`}>
            {icon}
          </span>
        </div>
        <h2 className="font-headline font-bold text-xl text-on-surface mb-2">{title}</h2>
        {children}
      </main>
    </div>
  );
}

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <StateShell onBack={onBack} icon="progress_activity" title="Buscando ofertas cerca de ti" spin>
      <p className="text-sm text-outline font-medium max-w-xs">
        Localizando agentes disponibles para tu monto…
      </p>
    </StateShell>
  );
}

function LocationDenied({ onBack }: { onBack: () => void }) {
  return (
    <StateShell onBack={onBack} icon="location_off" title="Necesitamos tu ubicación">
      <p className="text-sm text-outline font-medium max-w-xs mb-6">
        Activa los permisos de ubicación para encontrar agentes cerca de ti.
      </p>
      <button
        onClick={onBack}
        className="px-6 py-3 border border-primary text-primary font-bold rounded-xl active:scale-95 transition-all"
      >
        Volver
      </button>
    </StateShell>
  );
}

function FetchError({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  return (
    <StateShell onBack={onBack} icon="cloud_off" title="No pudimos cargar las ofertas">
      <p className="text-sm text-outline font-medium max-w-xs mb-6">
        Revisa tu conexión e intenta de nuevo.
      </p>
      <button
        onClick={onRetry}
        className="px-6 py-3 bg-primary text-white font-bold rounded-xl active:scale-95 transition-all"
      >
        Reintentar
      </button>
    </StateShell>
  );
}

function EmptyState({ onBack, amount }: { onBack: () => void; amount: number }) {
  return (
    <StateShell onBack={onBack} icon="search_off" title="No hay agentes disponibles">
      <p className="text-sm text-outline font-medium max-w-xs mb-6">
        Ningún agente cercano puede atender ${amount} MXN ahora mismo. Intenta con otro monto o más tarde.
      </p>
      <button
        onClick={onBack}
        className="px-6 py-3 border border-primary text-primary font-bold rounded-xl active:scale-95 transition-all"
      >
        Cambiar monto
      </button>
    </StateShell>
  );
}

export default ExploreMap;
