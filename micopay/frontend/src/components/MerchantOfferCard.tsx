/**
 * Tarjeta de agente, compartida por los dos flujos.
 *
 * Habia DOS tarjetas distintas para lo mismo. La de cash-out venia del sistema
 * ANTERIOR al rediseño y sobrevivio ahi: borde de 1 px casi invisible
 * (`border-primary-container/10`), sin sombra, insignias en pildora
 * `rounded-full` y un `ring-2` difuminado. La de deposito ya seguia
 * "Mercado / Rotulo": borde de 2 px de tinta, `shadow-solida`, insignias
 * rectangulares de canto vivo y el desplazamiento al pulsar.
 *
 * Se conserva la de deposito y se usa en ambos. Una sola tarjeta significa que
 * la proxima mejora llega a los dos flujos, en vez de arreglarse en uno y
 * quedar pendiente en el otro — que es como se llego a esta situacion.
 *
 * Lo unico que cambia entre flujos es la DIRECCION del intercambio: en deposito
 * entregas efectivo y recibes saldo; en cash-out al reves. Eso son dos etiquetas,
 * no dos componentes.
 */

import { effectiveFeePercent, type AvailableMerchant } from '../services/api';
import { PLATFORM_FEE_PERCENT } from '../constants/trade';

export type OfferFlow = 'cashout' | 'deposit';

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}


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
      <div className="flex items-center justify-between gap-2 border-t border-linea pt-3">
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
          className="flex items-start gap-2 rounded-sm border border-error/30 bg-error/5 px-3 py-2"
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

interface MerchantCardProps {
  merchant: AvailableMerchant;
  amount: number;
  loading: boolean;
  isBest: boolean;
  /**
   * Recibe el agente ENTERO, no solo su id. Cash-out necesita el desglose de
   * comisiones para la pantalla de confirmacion; deposito solo el id. Pasar el
   * objeto deja que cada pantalla decida, en vez de que la tarjeta lo suponga.
   */
  onChoose: (merchant: AvailableMerchant) => void;
  maxEffectiveFeePercent: number;
  /** Unica diferencia real entre los dos flujos: la direccion del intercambio. */
  flow: OfferFlow;
}

/** Que entrega y que recibe la persona, segun el flujo. */
const EXCHANGE_LABELS: Record<OfferFlow, { gives: string; gets: string }> = {
  // Entregas billetes al agente y tu saldo digital sube.
  deposit: { gives: 'Entregas en efectivo', gets: 'Recibes en tu saldo' },
  // Entregas saldo digital y el agente te da billetes.
  cashout: { gives: 'Entregas de tu saldo', gets: 'Recibes en efectivo' },
};

export default function MerchantOfferCard({
  merchant,
  amount,
  loading,
  isBest,
  onChoose,
  maxEffectiveFeePercent,
  flow,
}: MerchantCardProps) {
  const labels = EXCHANGE_LABELS[flow];
  const commissionMxn = (amount - merchant.payout_mxn).toFixed(2);
  const distanceLabel = formatDistance(merchant.distance_km);
  const platformFeePct = merchant.platform_fee_pct ?? PLATFORM_FEE_PERCENT;

  if (isBest) {
    return (
      <div className="relative group">
        <div className="absolute -top-3 left-6 z-10">
          <span className="bg-naranja text-papel text-[10px] font-bold px-2 py-0.5 rounded-sm border-[1.5px] border-tinta uppercase tracking-[.1em] ">
            Mejor oferta
          </span>
        </div>
        <div className="bg-papel rounded-sm border-2 border-tinta shadow-solida p-5 flex flex-col gap-5">
          <div className="flex justify-between items-start gap-3">
            <div className="flex gap-4 min-w-0">
              <div className="w-12 h-12 bg-verde-suave rounded-sm flex items-center justify-center text-verde flex-shrink-0">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  storefront
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <h3 className="font-bold text-lg truncate">{merchant.username}</h3>
                  <span
                    className="material-symbols-outlined text-accent text-sm flex-shrink-0"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    verified
                  </span>
                </div>
                <div className="mt-1 text-sm text-on-surface-variant flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{merchant.completion_rate ? `${Math.round(merchant.completion_rate)}% completitud` : 'Sin historial'}</span>
                  <span>·</span>
                  <span>{merchant.trades_completed ?? 0} ops</span>
                  {merchant.tier && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] rounded-sm border-[1.5px] border-tinta bg-verde-suave text-verde">{merchant.tier}</span>}
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-sm ${((merchant.seller_type === 'business') || merchant.is_business) ? 'bg-tinta text-papel' : 'bg-papel text-tinta'}`}>
                    {((merchant.seller_type === 'business') || merchant.is_business) ? 'Negocio' : 'Individuo'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-on-surface-variant text-xs">
                  <span className="material-symbols-outlined text-xs">near_me</span>
                  <span>{distanceLabel} de distancia</span>
                </div>
                {/* RED-3: aquí se pintaba `address_text`, texto libre que
                    podía ser un domicilio y que viajaba en un endpoint
                    anónimo. La copia de descubrimiento solo muestra la zona
                    pública, o la dirección del local si el proveedor
                    consintió publicarla. El punto de encuentro exacto se pide
                    aparte, ya dentro de una operación aceptada. */}
                {(merchant.storefront_address ?? merchant.area_label) && (
                  <p className="text-xs text-gris mt-0.5 truncate max-w-[200px]">
                    {merchant.storefront_address ?? merchant.area_label}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="block text-xs text-on-surface-variant font-label uppercase">Comisión</span>
              <span className="num text-verde font-bold whitespace-nowrap">${commissionMxn} MXN</span>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-sm p-4 flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-[10px] text-gris uppercase font-bold tracking-[.1em]">{labels.gives}</p>
              <p className="num font-bold text-naranja">${amount} MXN</p>
            </div>
            <span className="material-symbols-outlined text-gris">trending_flat</span>
            <div className="space-y-1 text-right">
              <p className="text-[10px] text-gris uppercase font-bold tracking-[.1em]">{labels.gets}</p>
              {/* En MXN, no "MXNe": la cifra es el valor pactado en pesos. El
                  activo que respalda la operacion lo decide el escrow —hoy XLM—
                  y nombrarlo aqui seria adelantar un dato que ni siquiera era
                  cierto: decia MXNe cuando el escrow bloquea XLM. */}
              <p className="num font-bold text-verde text-lg">${merchant.payout_mxn.toFixed(2)} MXN</p>
            </div>
          </div>

          <EffectiveFeeNote
            commissionPct={merchant.rate_percent}
            platformFeePct={platformFeePct}
            maxPct={maxEffectiveFeePercent}
          />

          <button
            onClick={() => onChoose(merchant)}
            disabled={loading}
            className="w-full h-[46px] bg-naranja text-papel border-2 border-tinta shadow-solida font-semibold rounded-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-solida-xs transition-[transform,box-shadow] disabled:opacity-50 disabled:cursor-wait"
          >
            {loading ? 'Conectando con el agente…' : 'Elegir este agente'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-sm p-6 ring-1 ring-outline-variant/5 flex flex-col gap-4">
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-4 min-w-0">
          <div className="w-12 h-12 bg-surface-container-highest rounded-sm flex items-center justify-center text-gris flex-shrink-0">
            <span className="material-symbols-outlined">storefront</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-lg truncate">{merchant.username}</h3>
            <div className="mt-1 text-sm text-on-surface-variant flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{merchant.completion_rate ? `${Math.round(merchant.completion_rate)}%` : 'Sin historial'}</span>
              <span>·</span>
              <span>{merchant.trades_completed ?? 0} ops</span>
              {merchant.tier && <span className="px-2 py-0.5 text-[10px] rounded-sm bg-surface-container-high text-verde">{merchant.tier}</span>}
              <span className={`px-2 py-0.5 text-[10px] rounded-sm ${((merchant.seller_type === 'business') || merchant.is_business) ? 'bg-tinta text-papel' : 'bg-papel text-tinta'}`}>
                {((merchant.seller_type === 'business') || merchant.is_business) ? 'Negocio' : 'Individuo'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant text-xs">
              <span className="material-symbols-outlined text-xs">near_me</span>
              <span>{distanceLabel}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="block text-xs text-on-surface-variant font-label uppercase">Recibes</span>
          <span className="num text-on-surface font-bold whitespace-nowrap">${merchant.payout_mxn.toFixed(2)} MXN</span>
        </div>
      </div>
      <EffectiveFeeNote
        commissionPct={merchant.rate_percent}
        platformFeePct={platformFeePct}
        maxPct={maxEffectiveFeePercent}
      />
      <div className="flex justify-between items-center border-t border-linea pt-4">
        <p className="text-xs text-on-surface-variant">{distanceLabel} de distancia</p>
        <button
          onClick={() => onChoose(merchant)}
          disabled={loading}
          className="text-verde font-bold text-sm px-4 py-2 hover:bg-primary/5 rounded-sm transition-colors disabled:opacity-50"
        >
          Ver detalles
        </button>
      </div>
    </div>
  );
}

