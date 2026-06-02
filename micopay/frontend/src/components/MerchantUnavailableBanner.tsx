/**
 * Issue #31 — shown when `merchant_unavailable` is true on the polled trade payload.
 * "Cancel and re-match" is distinct from the general cancel flow (#20) which lands on `TradeCancelled`.
 */
interface MerchantUnavailableBannerProps {
  onWait: () => void;
  onCancelRematch: () => void;
  cancelLoading?: boolean;
}

export default function MerchantUnavailableBanner({
  onWait,
  onCancelRematch,
  cancelLoading = false,
}: MerchantUnavailableBannerProps) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <span
          className="material-symbols-outlined shrink-0 text-amber-700"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          pause_circle
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold leading-snug">Este comerciante no está disponible por ahora</p>
          <p className="text-xs text-amber-900/80 leading-relaxed">
            Puedes esperar a que vuelva o cancelar esta operación y elegir otro comerciante. Tu monto se mantiene
            igual cuando regreses a la lista.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onWait}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100/80 transition-colors"
            >
              Esperar
            </button>
            <button
              type="button"
              disabled={cancelLoading}
              onClick={onCancelRematch}
              className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-60 transition-colors"
            >
              {cancelLoading ? 'Cancelando…' : 'Cancelar y buscar otro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
