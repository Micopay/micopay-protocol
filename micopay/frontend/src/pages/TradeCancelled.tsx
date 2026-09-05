import { buildTxUrl } from '../utils/stellarExplorer';

/**
 * Terminal screen after a successful POST /trades/:id/cancel (issue #20).
 *
 * Separates "cancelled with refund in flight" vs "cancelled before any lock" so trust cues stay honest.
 */
const SUPPORT_HREF = 'mailto:soporte@micopay.app';

export interface TradeCancelledProps {
  tradeId: string;
  amountMxn: number;
  /** From API `refund_expected` — true when a lock tx existed. */
  refundExpected: boolean;
  lockTxHash: string | null;
  onContinue: () => void;
}

export default function TradeCancelled({
  tradeId,
  amountMxn,
  refundExpected,
  lockTxHash,
  onContinue,
}: TradeCancelledProps) {
  // CASH-2: este texto decia que el reembolso "suele reflejarse en minutos",
  // lo que presenta la cancelacion como una liquidacion on-chain inmediata.
  // No lo es: cancelar detiene el flujo de la app, no toca el contrato. Sin un
  // `decline` —que producto decidio no implementar todavia— los fondos vuelven
  // al vencer el plazo, y esa es la unica via.
  const refundEta = refundExpected
    ? 'Cancelar detiene la operación en la app, pero no libera el contrato. Tu USDC se devuelve cuando vence el plazo; a partir de ese momento puedes reclamarlo desde el detalle de la operación.'
    : null;

  return (
    <div className="min-h-screen bg-fondo text-on-surface font-body flex flex-col">
      <header className="border-b-2 border-tinta px-4 pt-14 pb-4 text-center">
        {/* `cancelled` es un estado NEUTRO (§4.4): fondo, linea y gris.
            Estaba en `bg-amber-100 text-amber-800`, que ni es del sistema ni
            corresponde — el ambar es advertencia, no cancelacion. */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-linea bg-fondo text-gris">
          <span className="material-symbols-outlined text-3xl">undo</span>
        </div>
        <h1 className="font-headline text-2xl font-bold text-tinta">Operación cancelada</h1>
        <p className="mt-2 text-sm text-on-surface-variant max-w-sm mx-auto">
          La operación <span className="font-mono text-xs">{tradeId.slice(0, 8)}…</span> quedó en estado{' '}
          <strong>cancelada</strong>. Monto referido: <strong>${amountMxn} MXN</strong>.
        </p>
      </header>

      <main className="flex-1 px-4 max-w-md mx-auto w-full space-y-4 pb-28">
        <section className="rounded-sm bg-papel border-2 border-tinta p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Qué pasó con tu USDC
          </h2>
          {refundExpected ? (
            <>
              <p className="text-sm leading-relaxed">
                Había un bloqueo en cadena asociado. <strong>Tu USDC sigue en la garantía</strong> y se
                devuelve al vencer el plazo, no en este momento.
              </p>
              {lockTxHash ? (
                <a
                  href={buildTxUrl(lockTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline break-all"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  Ver transacción de bloqueo
                </a>
              ) : null}
              {refundEta ? <p className="text-xs text-on-surface-variant leading-relaxed">{refundEta}</p> : null}
            </>
          ) : (
            <p className="text-sm leading-relaxed">
              <strong>No se había registrado un bloqueo aún</strong> para esta operación (o estaba en estado previo al
              bloqueo). No hay USDC en garantía que reembolsar desde esta cancelación.
            </p>
          )}
        </section>

        <p className="text-center text-xs text-on-surface-variant">
          ¿Necesitas ayuda?{' '}
          <a href={SUPPORT_HREF} className="font-semibold text-primary underline">
            Contactar soporte
          </a>
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-sm bg-primary py-3.5 text-sm font-semibold text-on-primary "
        >
          Volver al inicio
        </button>
      </main>
    </div>
  );
}
