import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SupportLink from '../components/SupportLink';
import { resolveErrorMessage } from '../constants/errorMap';

const PROTOCOL_API = (import.meta as any).env?.VITE_PROTOCOL_API_URL ?? 'http://localhost:3000';

interface CashRequest {
  request_id: string;
  status: 'pending' | 'accepted' | 'completed' | 'expired';
  merchant_name: string;
  amount_mxn: number;
  amount_usdc: string;
  htlc_tx_hash: string;
  expires_at: string;
}

interface ClaimQRProps {
  requestId: string;
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expirado'); return; }
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

const STATUS_LABEL: Record<string, { text: string; color: string; icon: string }> = {
  pending:   { text: 'Esperando al comerciante',  color: '#f59e0b', icon: '⏳' },
  accepted:  { text: 'Comerciante listo',          color: '#3b82f6', icon: '✅' },
  completed: { text: '¡Efectivo entregado!',    color: '#22c55e', icon: '🎉' },
  expired:   { text: 'Solicitud expirada',      color: '#ef4444', icon: '❌' },
};

export default function ClaimQR({ requestId }: ClaimQRProps) {
  const [data, setData] = useState<CashRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(data?.expires_at ?? null);

  // Build the QR payload from the request data
  const qrPayload = data
    ? `micopay://claim?request_id=${data.request_id}&amount_mxn=${data.amount_mxn}&htlc=${data.htlc_tx_hash}`
    : '';

  // Poll status every 4 seconds
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${PROTOCOL_API}/api/v1/cash/request/${requestId}`);
        if (!res.ok) { setError(resolveErrorMessage({ response: { status: res.status } }).message); return; }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(resolveErrorMessage({ message: 'backend_not_available' }).message);
      }
    };

    poll();
    const id = setInterval(() => {
      if (data?.status === 'completed' || data?.status === 'expired') return;
      poll();
    }, 4000);

    return () => { cancelled = true; clearInterval(id); };
  }, [requestId, data?.status]);

  const status = data ? (STATUS_LABEL[data.status] ?? STATUS_LABEL.pending) : null;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!data && !error) {
    return (
      <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4faff', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #e0e0e0', borderTopColor: '#1976d2', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#666', fontSize: 14 }}>Cargando solicitud…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff0f0', fontFamily: 'sans-serif', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <p style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: 16 }}>{error}</p>
          <p style={{ color: '#999', fontSize: 13, marginTop: 8 }}>ID: {requestId}</p>
          <div style={{ marginTop: 16 }}>
            <SupportLink state="ERROR" tradeId={requestId} />
          </div>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  const done = data!.status === 'completed' || data!.status === 'expired';

  return (
    <div style={{ minHeight: '100svh', background: '#f4faff', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 40px' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 400, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🍄</span>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1a1a2e' }}>MicoPay</span>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Muestra este QR al comerciante para recibir tu efectivo</p>
      </div>

      {/* Status pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: status!.color + '20', border: `1px solid ${status!.color}40`,
        borderRadius: 999, padding: '6px 14px', marginBottom: 24,
        fontSize: 13, fontWeight: 600, color: status!.color,
      }}>
        {status!.icon} {status!.text}
      </div>

      {/* QR Card */}
      <div style={{
        background: 'white', borderRadius: 24, padding: 28,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
        width: '100%', maxWidth: 380,
        opacity: done ? 0.4 : 1,
        transition: 'opacity 0.4s',
      }}>
        {done && data!.status === 'completed' ? (
          <div style={{ padding: '40px 0' }}>
            <div style={{ fontSize: 64 }}>🎉</div>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#16a34a', marginTop: 12 }}>¡Efectivo entregado!</p>
            <p style={{ color: '#888', fontSize: 13 }}>La operación fue completada con éxito.</p>
          </div>
        ) : (
          <>
            <QRCodeSVG
              value={qrPayload}
              size={220}
              bgColor="transparent"
              fgColor="#1a1a2e"
              level="M"
              style={{ borderRadius: 12 }}
            />
            <div style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 800, fontSize: 28, color: '#1a1a2e', margin: '0 0 2px' }}>
                ${data!.amount_mxn} <span style={{ fontSize: 16, fontWeight: 500, color: '#888' }}>MXN</span>
              </p>
              <p style={{ color: '#555', fontSize: 13, margin: 0 }}>{data!.merchant_name}</p>
              <p style={{ color: '#aaa', fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>
                {data!.amount_usdc} USDC bloqueados · Soroban HTLC
              </p>
            </div>
          </>
        )}
      </div>

      {/* Timer + ID */}
      {!done && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
            Expira en <span style={{ fontWeight: 700, color: '#1976d2' }}>{countdown}</span>
          </p>
        </div>
      )}

      <div style={{ marginTop: 12, textAlign: 'center' }}>
        <p style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace' }}>ID: {requestId}</p>
      </div>

      {/* Security note */}
      <div style={{
        marginTop: 28, maxWidth: 380, width: '100%',
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 12, padding: '12px 16px',
      }}>
        <p style={{ fontSize: 12, color: '#15803d', margin: 0, lineHeight: 1.6 }}>
          🔒 <strong>Tus fondos están seguros.</strong> El USDC solo se libera cuando el comercio escanea este QR. Si no cobras, tu dinero regresa automáticamente al expirar.
        </p>
      </div>

      {/* Support link for risky states */}
      {data!.status === 'expired' && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <SupportLink state="TRADE_EXPIRED" tradeId={requestId} />
        </div>
      )}
    </div>
  );
}
