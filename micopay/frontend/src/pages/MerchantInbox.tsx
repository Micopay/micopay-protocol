import { useState, useEffect, useCallback } from 'react';
import { useQRScanner } from '../hooks/useQRScanner';
import { usePushNotifications } from '../hooks/usePushNotifications';

// ── Status display config ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  locked: 'bg-blue-100 text-blue-800',
  revealing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  locked: 'Bloqueado',
  revealing: 'Revelando',
  completed: 'Completado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const STATUS_ICONS: Record<string, string> = {
  pending: 'hourglass_top',
  locked: 'lock',
  revealing: 'qr_code',
  completed: 'check_circle',
  cancelled: 'cancel',
  refunded: 'undo',
};

// ── Countdown hook ─────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('Expirado');
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

// ── Scan state machine ─────────────────────────────────────────────────────

type ScanView =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'parse_error'; message: string }
  | { type: 'api_error'; message: string; tradeId?: string }
  | { type: 'confirmation'; data: MerchantConfirmResult };

// ── Trade confirmation screen ──────────────────────────────────────────────

function TradeConfirmationCard({
  data,
  onDismiss,
}: {
  data: MerchantConfirmResult;
  onDismiss: () => void;
}) {
  const countdown = useCountdown(data.expires_at);
  const statusColor = STATUS_COLORS[data.status] || 'bg-gray-100 text-gray-800';
  const statusLabel = STATUS_LABELS[data.status] || data.status;
  const statusIcon = STATUS_ICONS[data.status] || 'info';

  return (
    <div className="bg-white rounded-2xl shadow-md border border-emerald-200 overflow-hidden">
      {/* Header */}
      <div className="bg-emerald-50 px-5 py-4 flex items-center gap-3 border-b border-emerald-100">
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <span
            className="material-symbols-outlined text-emerald-600"
            style={{ fontVariationSettings: '"FILL" 1' }}
          >
            verified
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-emerald-900">QR verificado</p>
          <p className="text-xs text-emerald-700">Trade confirmado por el servidor</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Cerrar"
          className="material-symbols-outlined text-emerald-600 text-base hover:bg-emerald-100 rounded-full p-1 transition-colors"
        >
          close
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Amount */}
        <div className="text-center">
          <p className="text-3xl font-extrabold text-on-surface">
            ${data.amount_mxn.toLocaleString('es-MX')}{' '}
            <span className="text-base font-medium text-gray-400">MXN</span>
          </p>
          {data.platform_fee_mxn > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Comisión plataforma: ${data.platform_fee_mxn} MXN
            </p>
          )}
        </div>

        {/* Details */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Comprador</span>
            <span className="font-semibold text-on-surface">{data.buyer_handle}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Estado</span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}
            >
              <span
                className="material-symbols-outlined text-xs"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                {statusIcon}
              </span>
              {statusLabel}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Expira en</span>
            <span className="font-semibold text-primary">{countdown}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Creado</span>
            <span className="text-on-surface">
              {new Date(data.created_at).toLocaleString('es-MX', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          </div>
          {data.lock_tx_hash && (
            <div className="flex justify-between items-start">
              <span className="text-gray-500">Lock TX</span>
              <span className="font-mono text-xs text-primary break-all text-right max-w-[180px]">
                {data.lock_tx_hash.slice(0, 16)}…
              </span>
            </div>
          )}
          {data.release_tx_hash && (
            <div className="flex justify-between items-start">
              <span className="text-gray-500">Release TX</span>
              <span className="font-mono text-xs text-emerald-600 break-all text-right max-w-[180px]">
                {data.release_tx_hash.slice(0, 16)}…
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Trade ID</span>
            <span className="font-mono text-xs text-gray-400">
              {data.trade_id.slice(0, 12)}…
            </span>
          </div>
        </div>

        {/* Security note */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-800 leading-relaxed">
            <span className="font-bold">🔒 Verificado on-chain.</span> La información fue
            validada por el servidor. No muestra datos crudos del QR.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 flex justify-center">
        <SupportLink state={data.status} tradeId={data.trade_id} />
      </div>
    </div>
  );
}

// ── Error card ─────────────────────────────────────────────────────────────

function ScanErrorCard({
  message,
  tradeId,
  onDismiss,
}: {
  message: string;
  tradeId?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-red-200 overflow-hidden">
      <div className="bg-red-50 px-5 py-4 flex items-center gap-3 border-b border-red-100">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <span
            className="material-symbols-outlined text-red-600"
            style={{ fontVariationSettings: '"FILL" 1' }}
          >
            error
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-red-900">Error al verificar QR</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Cerrar"
          className="material-symbols-outlined text-red-600 text-base hover:bg-red-100 rounded-full p-1 transition-colors"
        >
          close
        </button>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-red-800 font-medium">{message}</p>
        {tradeId && (
          <p className="text-xs text-gray-400 font-mono">Trade ID: {tradeId.slice(0, 12)}…</p>
        )}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
          <p className="text-xs text-amber-800 leading-relaxed">
            Verifica que el código QR sea de MicoPay, que el intercambio no esté expirado y que
            seas participante del trade.
          </p>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex justify-center">
        <SupportLink state="SCAN_ERROR" tradeId={tradeId} />
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface MerchantInboxProps {
  token: string | null;
  onBack: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────

const MerchantInbox = ({ token, onBack }: MerchantInboxProps) => {
  const [trades, setTrades] = useState<MerchantTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [scanView, setScanView] = useState<ScanView>({ type: 'idle' });
  const { scan } = useQRScanner();

  // Initialize push notifications for merchant
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const { isEnabled: pushEnabled } = usePushNotifications({
    isMerchant: !!token,
    userToken: token,
    apiUrl,
  });

  const handleScan = async () => {
    setScanError(null);
    setScannedPayload(null);
    const { value, error } = await scan();

    if (error) {
      setScanView({ type: 'parse_error', message: error });
      return;
    }

  const fetchTrades = async (state: string = 'all') => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/merchants/me/trades?state=${state}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return;
    }

    if (!tradeId) {
      setScanView({ type: 'parse_error', message: 'No se encontró un ID de trade en el QR' });
      return;
    }

    // Step 3: Validate with backend
    setScanView({ type: 'loading' });

    try {
      const result = await merchantConfirmScan(tradeId, token);
      setScanView({ type: 'confirmation', data: result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error al verificar el intercambio';
      setScanView({ type: 'api_error', message, tradeId });
    }
  }, [token, scan]);

  // ── Dismiss scan result ────────────────────────────────────────────────
  const dismissScan = useCallback(() => {
    setScanView({ type: 'idle' });
  }, []);

  // ── Fetch trades ───────────────────────────────────────────────────────
  const fetchTrades = useCallback(
    async (state: string = 'all') => {
      if (!token) return;
      setLoading(true);
      try {
        const result = await getMerchantTrades(token, state);
        setTrades(result);
      } catch (e) {
        console.error('Failed to fetch merchant trades', e);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  // Main effect: fetch trades on filter change
  useEffect(() => {
    fetchTrades(activeFilter);
  }, [activeFilter, fetchTrades]);

  // Polling fallback when push notifications are disabled
  useEffect(() => {
    if (pushEnabled || !token) {
      return; // No polling needed if push works
    }

    const pollInterval = setInterval(() => {
      // Only poll when the tab is visible
      if (document.visibilityState === 'visible') {
        fetchTrades(activeFilter).catch(() => {
          // Ignore polling errors silently
        });
      }
    }, 30_000); // Poll every 30 seconds

    return () => clearInterval(pollInterval);
  }, [pushEnabled, token, activeFilter]);

  const filters = [
    { key: 'all', label: 'Todos' },
    { key: 'pending', label: 'Pendientes' },
    { key: 'locked', label: 'Bloqueados' },
    { key: 'revealing', label: 'Revelando' },
    { key: 'completed', label: 'Completados' },
  ];

  return (
    <div className="min-h-screen bg-[#F4FAFF]">
      <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-md px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center gap-4">
        <button onClick={onBack} className="material-symbols-outlined text-primary">
          arrow_back
        </button>
        <h1 className="font-headline font-bold text-lg flex-1">Bandeja de entrada</h1>
        <button
          onClick={handleScan}
          aria-label="Escanear QR del cliente"
          className="flex items-center gap-1 bg-primary text-white px-3 py-2 rounded-full text-xs font-bold shadow active:scale-95"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            qr_code_scanner
          </span>
          Escanear
        </button>
      </header>

      <main className="pt-24 px-6 pb-32">
        {/* Push notification disabled banner with polling fallback */}
        {!pushEnabled && token && (
          <div className="mb-4 rounded-2xl p-4 bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600">notifications_off</span>
              <div className="flex-1">
                <p className="text-sm text-amber-900 font-medium">
                  Las notificaciones están deshabilitadas. La bandeja se actualiza automáticamente cada 30 segundos.
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  <a href="#" onClick={(e) => { e.preventDefault(); }} className="underline">
                    Habilitar notificaciones
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}

        {(scannedPayload || scanError) && (
          <div className={`mb-4 rounded-2xl p-4 ${scanError ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <div className="flex items-start gap-3">
              <span className={`material-symbols-outlined ${scanError ? 'text-red-600' : 'text-emerald-600'}`}>
                {scanError ? 'error' : 'qr_code_2'}
              </span>
              <div className="flex-1 min-w-0">
                {scanError ? (
                  <p className="text-sm text-red-800 font-medium">{scanError}</p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">QR escaneado</p>
                    <p className="text-xs text-emerald-900 font-mono break-all">{scannedPayload}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => { setScannedPayload(null); setScanError(null); }}
                aria-label="Cerrar"
                className="material-symbols-outlined text-on-surface-variant text-base"
              >
                close
              </button>
            </div>
          </div>
        )}

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeFilter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-white text-primary border border-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Trade list ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">inbox</span>
            <p className="text-gray-500">No hay operaciones {activeFilter !== 'all' ? `con estado "${STATUS_LABELS[activeFilter]}"` : ''}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade) => (
              <div key={trade.id} className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-on-surface">{trade.buyer_handle}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(trade.created_at).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      STATUS_COLORS[trade.status] || 'bg-gray-100'
                    }`}
                  >
                    {STATUS_LABELS[trade.status] || trade.status}
                  </span>
                </div>
                <p className="font-bold text-lg">${trade.amount_mxn} MXN</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MerchantInbox;
