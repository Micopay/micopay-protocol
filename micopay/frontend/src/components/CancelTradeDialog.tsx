/**
 * Two-step destructive confirmation for POST /trades/:id/cancel (issue #20).
 *
 * Step 1 — intent: short warning so mis-taps do not immediately hit the API.
 * Step 2 — consequence: explicit USDC / "no lock yet" copy before the final confirm button.
 */
import { useEffect, useState } from 'react';
import { extractApiErrorPayload } from '../utils/apiError';

export type CancelConsequenceKind = 'no_lock' | 'refund_usdc';

export interface CancelTradeDialogProps {
  open: boolean;
  /** Drives which consequence block we render in step 2. */
  consequence: CancelConsequenceKind;
  onClose: () => void;
  onConfirmCancel: () => Promise<void>;
}

type Step = 1 | 2;

export default function CancelTradeDialog({
  open,
  consequence,
  onClose,
  onConfirmCancel,
}: CancelTradeDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Whenever the parent re-opens the sheet, start from step 1 so stale errors never linger.
  useEffect(() => {
    if (open) {
      setStep(1);
      setRequestError(null);
    }
  }, [open]);

  if (!open) return null;

  const resetAndClose = () => {
    setStep(1);
    setRequestError(null);
    onClose();
  };

  const handleFinalConfirm = async () => {
    setSubmitting(true);
    setRequestError(null);
    try {
      // On success the parent usually navigates away — do not call `resetAndClose` here to avoid setState after unmount.
      await onConfirmCancel();
    } catch (e) {
      const payload = extractApiErrorPayload(e);
      const msg = payload.support_code
        ? `${payload.message} (código: ${payload.support_code})`
        : payload.message;
      setRequestError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-trade-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-outline-variant/20">
        {step === 1 ? (
          <>
            <h2 id="cancel-trade-title" className="font-headline text-lg font-bold text-on-surface">
              ¿Cancelar esta operación?
            </h2>
            <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
              Si continúas, te pediremos una segunda confirmación con el detalle de qué pasa con tu USDC o garantía.
            </p>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-container-low"
                onClick={resetAndClose}
              >
                Volver
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
                onClick={() => setStep(2)}
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-headline text-lg font-bold text-on-surface">Confirmar cancelación</h2>
            {consequence === 'refund_usdc' ? (
              <p className="mt-3 text-sm text-on-surface leading-relaxed">
                <strong>Tu USDC será reembolsado</strong> desde la garantía según el estado de la operación y la red Stellar /
                Soroban. Los tiempos pueden variar; recibirás el hash de reembolso en tu historial cuando exista.
              </p>
            ) : (
              <p className="mt-3 text-sm text-on-surface leading-relaxed">
                <strong>No hay fondos bloqueados aún</strong> en cadena para esta operación (o no aplica reembolso USDC en
                este estado). La operación se marcará como cancelada sin espera de reembolso.
              </p>
            )}
            {requestError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>{requestError}</p>
                <p className="mt-2 text-xs">
                  <a href="mailto:soporte@micopay.app" className="font-semibold underline">
                    Contactar soporte
                  </a>
                </p>
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-container-low"
                onClick={() => {
                  setRequestError(null);
                  setStep(1);
                }}
              >
                Atrás
              </button>
              <button
                type="button"
                disabled={submitting}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void handleFinalConfirm()}
              >
                {submitting ? 'Cancelando…' : 'Sí, cancelar operación'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
