import { useState, useSyncExternalStore } from 'react';
import {
  approvePending,
  getPendingWalletItem,
  rejectPending,
  subscribeWallet,
} from '../services/walletConnect';
import type { EscrowIntent } from '../services/walletIntent';

const ACTIONS: Record<EscrowIntent['action'], string> = {
  lock: 'Bloquear fondos en garantía',
  release: 'Liberar fondos',
  decline: 'Devolver fondos',
};

const short = (address: string | null) => (address ? `${address.slice(0, 6)}…${address.slice(-6)}` : 'Sin dato');

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="opacity-70">{label}</span>
      <span className="font-semibold text-right break-all">{value}</span>
    </div>
  );
}

/** Aprobacion global: aparece sobre cualquier pantalla cuando una web pide algo. */
export default function WalletRequestSheet() {
  const item = useSyncExternalStore(subscribeWallet, getPendingWalletItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!item) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full bg-papel text-tinta border-t-2 border-tinta p-5 space-y-3">
        <h2 className="text-lg font-bold">
          {item.kind === 'proposal' && '¿Conectar esta página?'}
          {item.kind === 'webAuth' && 'Iniciar sesión en la web'}
          {item.kind === 'request' && ACTIONS[item.intent.action]}
        </h2>
        <Row label="Página" value={item.origin} />
        {item.kind === 'proposal' && (
          <p className="text-sm">
            Podrá pedirte firmas. Cada firma te pedirá confirmación y tu llave nunca sale de este teléfono.
          </p>
        )}
        {item.kind === 'webAuth' && (
          <>
            <Row label="Sitio" value={item.homeDomain} />
            <Row label="Cuenta" value={short(item.account)} />
            <p className="text-sm">Esta firma solo abre tu sesión. No mueve dinero.</p>
          </>
        )}
        {item.kind === 'request' && (
          <>
            <Row label="Monto" value={`$${item.intent.amountMxn} MXN`} />
            <Row label="Activo" value={item.intent.assetCode ?? 'Sin dato'} />
            <Row label="Envía" value={short(item.intent.seller)} />
            <Row label="Recibe" value={short(item.intent.buyer)} />
            <Row label="Contrato" value={short(item.intent.contractId)} />
          </>
        )}
        {error && <p className="text-sm text-rojo" role="alert">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            className="flex-1 border-2 border-tinta rounded-sm py-3 font-semibold"
            onClick={() => void run(rejectPending)}
          >
            Rechazar
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 bg-tinta text-papel rounded-sm py-3 font-semibold"
            onClick={() => void run(approvePending)}
          >
            {item.kind === 'proposal' && 'Conectar'}
            {item.kind === 'webAuth' && 'Iniciar sesión'}
            {item.kind === 'request' && 'Firmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
