/**
 * Terminal screen after a successful POST /trades/:id/cancel (issue #20).
 *
 * Separates "cancelled with refund in flight" vs "cancelled before any lock" so trust cues stay honest.
 */
const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';
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
  // ETA copy: mock Stellar vs production could diverge — keep conservative, human-readable.
  const refundEta = refundExpected
    ? 'Los reembolsos de USDC en testnet suelen reflejarse en minutos; en producción puede tomar hasta 24 h según la red.'
    : null;

  return (
    <div className="min-h-screen bg-[#F4FAFF] text-on-surface font-body flex flex-col">
      <header className="px-4 pt-14 pb-4 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <span className="material-symbols-outlined text-3xl">undo</span>
        </div>
        <h1 className="font-headline text-2xl font-bold text-primary">Operación cancelada</h1>
        <p className="mt-2 text-sm text-on-surface-variant max-w-sm mx-auto">
          La operación <span className="font-mono text-xs">{tradeId.slice(0, 8)}…</span> quedó en estado{' '}
          <strong>cancelada</strong>. Monto referido: <strong>${amountMxn} MXN</strong>.
        </p>
      </header>

      <main className="flex-1 px-4 max-w-md mx-auto w-full space-y-4 pb-28">
        <section className="rounded-2xl bg-white border border-outline-variant/20 p-5 shadow-sm space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Qué pasó con tu USDC
          </h2>
          {refundExpected ? (
            <>
              <p className="text-sm leading-relaxed">
                Había un bloqueo en cadena asociado. <strong>Tu USDC será devuelto</strong> al flujo de reembolso de la
                garantía (misma política que una cancelación posterior al bloqueo en el backend).
              </p>
              {lockTxHash ? (
                <a
                  href={`${STELLAR_EXPLORER}/${lockTxHash}`}
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
          className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-on-primary shadow-md"
        >
          Volver al inicio
        </button>
      </main>
    </div>
  );
}
