import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchTradeDetail,
  completeTrade,
  cancelTradeRequest,
  TradeDetailResponse,
} from '../services/api';
import { readJSON } from '../services/secureStorage';

type TradeDetailData = TradeDetailResponse['trade'] & {
  platform_fee_mxn?: number;
  release_tx_hash?: string | null;
  completed_at?: string | null;
};

interface TradeDetailProps {
  buyerToken: string | null;
  sellerToken: string | null;
  onBack: () => void;
}

async function getStoredToken(): Promise<string | null> {
  try {
    const stored = await readJSON<{ buyer?: { token: string }; seller?: { token: string } }>('micopay_users');
    return stored?.buyer?.token ?? stored?.seller?.token ?? null;
  } catch {
    return null;
  }
}

const TRADE_POLL_INTERVAL = 5000;
const SUPPORT_EMAIL = 'support@micopay.io';

const ACTIVE_STATES = ['pending', 'locked', 'revealing'];

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pendiente', color: '#f59e0b', icon: 'hourglass_top' },
  locked: { label: 'Bloqueado', color: '#3b82f6', icon: 'lock' },
  revealing: { label: 'Revelando', color: '#8b5cf6', icon: 'qr_code' },
  revealed: { label: 'Revelado', color: '#06b6d4', icon: 'visibility' },
  completed: { label: 'Completado', color: '#22c55e', icon: 'check_circle' },
  cancelled: { label: 'Cancelado', color: '#ef4444', icon: 'cancel' },
  expired: { label: 'Expirado', color: '#6b7280', icon: 'schedule' },
};

function TradeStateBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        background: `${config.color}20`,
        border: `1px solid ${config.color}40`,
      }}
    >
      <span className="material-symbols-outlined text-sm" style={{ color: config.color, fontVariationSettings: '"FILL" 1' }}>
        {config.icon}
      </span>
      <span className="text-sm font-semibold" style={{ color: config.color }}>
        {config.label}
      </span>
    </div>
  );
}

function SupportLink() {
  return (
    <div className="mt-8 text-center">
      <p className="text-sm text-on-surface-variant">
        ¿Necesitas ayuda?{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-semibold hover:underline">
          Contactar soporte
        </a>
      </p>
    </div>
  );
}

// ── State-specific views ────────────────────────────────────────────────────

function PendingView({ trade, onCancel }: { trade: TradeDetailData; onCancel: () => void }) {
  const countdown = useCountdown(trade.expires_at ?? null);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-amber-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          hourglass_top
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Esperando al vendedor</h2>
      <p className="text-on-surface-variant mb-6">
        El vendedor aún no ha bloqueado los fondos. Tu operación está segura en escrow.
      </p>

      <div className="bg-surface-container-low rounded-xl p-4 w-full mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-on-surface-variant">Monto</span>
          <span className="font-bold text-on-surface">${trade.amount_mxn} MXN</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-on-surface-variant">Comisión</span>
          <span className="text-sm text-on-surface">${trade.platform_fee_mxn} MXN</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-on-surface-variant">Expira en</span>
          <span className="text-sm font-semibold text-primary">{countdown}</span>
        </div>
      </div>

      <button
        onClick={onCancel}
        className="w-full py-3 rounded-xl border border-error text-error font-semibold hover:bg-error/5 transition-colors"
      >
        Cancelar operación
      </button>
    </div>
  );
}

function LockedView({ trade }: { trade: TradeDetailData }) {
  const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-blue-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          lock
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Fondos bloqueados</h2>
      <p className="text-on-surface-variant mb-6">
        Los fondos están seguros en el contrato inteligente. Esperando confirmación del vendedor.
      </p>

      {trade.lock_tx_hash && (
        <a
          href={`${STELLAR_EXPLORER}/${trade.lock_tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm font-semibold hover:underline mb-6 flex items-center gap-1"
        >
          Ver transacción en Stellar
          <span className="material-symbols-outlined text-sm">open_in_new</span>
        </a>
      )}

      <button className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity">
        Abrir chat con el vendedor
      </button>
    </div>
  );
}

function RevealingView({ trade }: { trade: TradeDetailData }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-purple-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          qr_code
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Mostrar tu QR</h2>
      <p className="text-on-surface-variant mb-6">
        El vendedor confirmó el pago. Muestra tu código QR para completar la operación.
      </p>

      <button className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity mb-4">
        Ver mi QR de intercambio
      </button>

      <button className="w-full py-3 rounded-xl border border-primary text-primary font-semibold hover:bg-primary/5 transition-colors">
        Abrir chat
      </button>
    </div>
  );
}

function RevealedView({ trade, onComplete, token }: { trade: TradeDetailData; onComplete: () => void; token: string | null }) {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      const effectiveToken = token ?? (await getStoredToken());
      if (effectiveToken) {
        await completeTrade(trade.id, effectiveToken);
      }
    } catch (e) {
      console.warn('Could not complete trade on backend', e);
    } finally {
      setTimeout(() => onComplete(), 1500);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-cyan-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          visibility
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Confirmar recepción</h2>
      <p className="text-on-surface-variant mb-6">
        ¿Ya recibiste el efectivo? Confirma para liberar los fondos al vendedor.
      </p>

      {!isConfirming ? (
        <button
          onClick={handleConfirm}
          className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>
            check_circle
          </span>
          Ya recibí el efectivo
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 border-4 border-surface-container-high rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-sm font-medium text-outline">Confirmando intercambio…</p>
        </div>
      )}
    </div>
  );
}

function CompletedView({ trade }: { trade: TradeDetailData }) {
  const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-green-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          check_circle
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">¡Operación completada!</h2>
      <p className="text-on-surface-variant mb-6">Tu intercambio fue exitoso.</p>

      <div className="bg-surface-container-low rounded-xl p-4 w-full mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-on-surface-variant">Monto</span>
          <span className="font-bold text-on-surface">${trade.amount_mxn} MXN</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-on-surface-variant">Fecha</span>
          <span className="text-sm text-on-surface">
            {trade.completed_at ? new Date(trade.completed_at).toLocaleString('es-MX') : '-'}
          </span>
        </div>
      </div>

      {trade.release_tx_hash && (
        <a
          href={`${STELLAR_EXPLORER}/${trade.release_tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm font-semibold hover:underline mb-6 flex items-center gap-1"
        >
          Ver transacción en Stellar
          <span className="material-symbols-outlined text-sm">open_in_new</span>
        </a>
      )}

      <Link
        to="/"
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity text-center"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

function CancelledView() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-red-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          cancel
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Operación cancelada</h2>
      <p className="text-on-surface-variant mb-6">
        Esta operación fue cancelada. Tus fondos están seguros.
      </p>

      <Link
        to="/"
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity text-center"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

function ExpiredView() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-gray-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          schedule
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Operación expirada</h2>
      <p className="text-on-surface-variant mb-6">
        El tiempo para completar esta operación ha expirado. Tus fondos fueron devueltos.
      </p>

      <Link
        to="/"
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity text-center"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

// ── Error views ─────────────────────────────────────────────────────────────

function NotFoundError() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-red-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          search_off
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Trade no encontrado</h2>
      <p className="text-on-surface-variant mb-6">
        La operación que buscas no existe o fue eliminada.
      </p>

      <Link
        to="/"
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity text-center"
      >
        Volver al inicio
      </Link>

      <SupportLink />
    </div>
  );
}

function ForbiddenError() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-red-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          lock_person
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Sin acceso</h2>
      <p className="text-on-surface-variant mb-6">
        No tienes permiso para ver esta operación. Solo los participantes pueden acceder.
      </p>

      <Link
        to="/"
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity text-center"
      >
        Volver al inicio
      </Link>

      <SupportLink />
    </div>
  );
}

function NetworkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-orange-600 text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          wifi_off
        </span>
      </div>
      <h2 className="text-2xl font-bold text-on-surface mb-2">Error de conexión</h2>
      <p className="text-on-surface-variant mb-6">
        No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.
      </p>

      <button
        onClick={onRetry}
        className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity mb-4"
      >
        Reintentar
      </button>

      <SupportLink />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function TradeDetailContent({ buyerToken, sellerToken, onBack }: TradeDetailProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trade, setTrade] = useState<TradeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'forbidden' | 'network' | null>(null);
  const [token, setToken] = useState<string | null>(buyerToken ?? sellerToken ?? null);

  useEffect(() => {
    if (token) return;
    getStoredToken().then(t => setToken(t ?? null));
  }, [token]);

  const fetchTrade = useCallback(async () => {
    if (!id) return;

    const effectiveToken = token ?? (await getStoredToken());
    if (!effectiveToken) {
      navigate('/');
      return;
    }

    try {
      const data = await fetchTradeDetail(id, effectiveToken);
      setTrade(data.trade as TradeDetailData);
      setError(null);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        setError('not_found');
      } else if (status === 403) {
        setError('forbidden');
      } else {
        setError('network');
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate, token]);

  // Fetch on mount
  useEffect(() => {
    fetchTrade();
  }, [fetchTrade]);

  // Poll for active states
  useEffect(() => {
    if (!trade || !ACTIVE_STATES.includes(trade.status)) return;

    const interval = setInterval(fetchTrade, TRADE_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [trade?.status, fetchTrade]);

  // Handle cancel
  const handleCancel = async () => {
    if (!trade) return;

    const effectiveToken = token ?? (await getStoredToken());
    if (!effectiveToken) return;

    try {
      await cancelTradeRequest(trade.id, effectiveToken);
      fetchTrade(); // Refresh trade state
    } catch (e) {
      console.error('Failed to cancel trade', e);
    }
  };

  // Handle complete (navigate to success)
  const handleComplete = () => {
    fetchTrade(); // Refresh to get completed state
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-surface-container-high border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-on-surface-variant text-sm">Cargando operación…</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error === 'not_found') {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center px-6">
        <NotFoundError />
      </div>
    );
  }

  if (error === 'forbidden') {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center px-6">
        <ForbiddenError />
      </div>
    );
  }

  if (error === 'network') {
    return (
      <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center px-6">
        <NetworkError onRetry={fetchTrade} />
      </div>
    );
  }

  if (!trade) {
    return null;
  }

  // Render state-specific view
  const renderStateView = () => {
    switch (trade.status) {
      case 'pending':
        return <PendingView trade={trade} onCancel={handleCancel} />;
      case 'locked':
        return <LockedView trade={trade} />;
      case 'revealing':
        return <RevealingView trade={trade} />;
      case 'revealed':
        return <RevealedView trade={trade} onComplete={handleComplete} token={token} />;
      case 'completed':
        return <CompletedView trade={trade} />;
      case 'cancelled':
        return <CancelledView />;
      case 'expired':
        return <ExpiredView />;
      default:
        return <PendingView trade={trade} onCancel={handleCancel} />;
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest font-body text-on-surface">
      {/* TopAppBar */}
      <header className="sticky top-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md border-b border-surface-container pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-primary"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <h1 className="font-headline font-bold text-lg text-on-surface">Detalle de operación</h1>
              <p className="text-xs text-on-surface-variant font-mono truncate max-w-[200px]">
                ID: {trade.id.substring(0, 12)}…
              </p>
            </div>
          </div>
          <TradeStateBadge status={trade.status} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-6 py-8">
        {renderStateView()}

        {/* Support link visible in all states */}
        {trade.status !== 'completed' && trade.status !== 'cancelled' && trade.status !== 'expired' && (
          <SupportLink />
        )}
      </main>
    </div>
  );
}

export default function TradeDetail(props: TradeDetailProps) {
  return <TradeDetailContent {...props} />;
}
