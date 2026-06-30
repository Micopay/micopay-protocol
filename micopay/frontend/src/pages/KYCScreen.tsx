import { useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';


import { startKYC, getKYCStatus, type KYCStatus, type KYCStatusResponse } from '../services/api';
import { readJSON, writeJSON } from '../services/secureStorage';

const SECURE_STORAGE_KEY = 'kyc_status';

function StatusLine({ status }: { status: KYCStatus }) {
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3">
        <span className="material-symbols-outlined text-primary">hourglass_top</span>
        <div>
          <p className="font-bold text-on-surface">Verificando identidad…</p>
          <p className="text-xs text-on-surface-variant">Esto puede tardar unos segundos.</p>
        </div>
      </div>
    );
  }
  if (status === 'approved') {
    return (
      <div className="flex items-center gap-3 bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3">
        <span className="material-symbols-outlined text-[#1D9E75]">check_circle</span>
        <div>
          <p className="font-bold text-on-surface">Identidad verificada</p>
          <p className="text-xs text-on-surface-variant">¡Listo! Continuaremos con el flujo de inversión.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
      <span className="material-symbols-outlined text-error">error</span>
      <div>
        <p className="font-bold text-on-surface">No se pudo verificar</p>
        <p className="text-xs text-on-surface-variant">Revisa el motivo y vuelve a intentar.</p>
      </div>
    </div>
  );
}

type KYCScreenProps = {
  onApproved: () => void;
};

export default function KYCScreen({ onApproved }: KYCScreenProps) {
  const [status, setStatus] = useState<KYCStatus>('pending');
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [startingToken, setStartingToken] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [statusPollingError, setStatusPollingError] = useState<string | null>(null);

  const loadCachedStatus = async () => {
    const cached = await readJSON<{ status: KYCStatus; reason?: string | null }>(SECURE_STORAGE_KEY);
    if (cached?.status === 'approved') {
      setStatus('approved');
      setReason(null);
      onApproved();
    }
  };

  useEffect(() => {
    void loadCachedStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenHostedFlow = async () => {
    setStatusPollingError(null);
    setReason(null);
    setLoading(true);

    try {
      // IMPORTANT: URL expires in ~15 minutes => generate on touch.
      const { onboardingUrl } = await startKYC();

      startedAtRef.current = Date.now();
      setStartingToken(onboardingUrl);
      setStatus('pending');

      // Open in system browser (not an in-app webview).
      if (CapApp && (CapApp as any)) {
        // no-op; keeps capacitor import used.
      }

      // Open in system browser (preferred: Capacitor Browser plugin).
      // We lazy-load to avoid hard dependency on TS typings.
      try {
        const mod = await import('@capacitor/browser');
        const BrowserPlugin = (mod as any).Browser;
        if (BrowserPlugin?.open) {
          await BrowserPlugin.open({ url: onboardingUrl });
        } else {
          window.open(onboardingUrl, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // Fallback for web builds / when plugin is not present.
        window.open(onboardingUrl, '_blank', 'noopener,noreferrer');
      }




    } finally {
      setLoading(false);
    }
  };

  const applyStatus = async (res: KYCStatusResponse) => {
    setStatus(res.status);
    setReason(res.reason ?? null);
    setStatusPollingError(null);

    if (res.status === 'approved') {
      await writeJSON(SECURE_STORAGE_KEY, { status: 'approved' });
      onApproved();
    }
  };

  const pollOnce = async () => {
    setStatusPollingError(null);
    try {
      const res = await getKYCStatus();
      await applyStatus(res);
      return res;
    } catch (e: any) {
      const message = e?.message ?? 'Error al consultar el estado de verificación.';
      setStatusPollingError(message);
      return null;
    }
  };

  useEffect(() => {
    let intervalId: number | undefined;
    let cancelled = false;

    const startPolling = () => {
      intervalId = window.setInterval(async () => {
        if (cancelled) return;
        if (status !== 'pending') return;
        await pollOnce();
      }, 5000);
    };

    // Always attempt polling when mounted; will return pending/approved from stub.
    if (status === 'pending') {
      // Kick off immediately
      void pollOnce().then(() => {
        if (cancelled) return;
        startPolling();
      });
    }

    const sub = CapApp.addListener('appStateChange', (state) => {
      if (cancelled) return;
      if (state?.isActive && status === 'pending') {
        void pollOnce();
      }
    });

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      (sub as any)?.remove?.();

    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);


  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md border-b border-surface-container p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onApproved}
            className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-primary"
            aria-label="Continuar"
          >
            <span className="material-symbols-outlined">verified</span>
          </button>
          <div>
            <h1 className="font-headline font-bold text-lg">Verificación de identidad</h1>
            <p className="text-xs text-on-surface-variant">Paso único con Etherfuse</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 pb-8 pt-6">
        <section className="space-y-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-[24px] p-5 border border-primary/10">
            <h2 className="font-headline font-extrabold text-xl">Tu identidad será verificada con Etherfuse</h2>
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
              Este proceso es <span className="font-bold">una sola vez</span> y se hace en la página
              hospedada de Etherfuse. No recopilamos ni almacenamos datos sensibles en esta app.
            </p>
          </div>

          <StatusLine status={status} />

          {status === 'rejected' && reason && (
            <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-error">Motivo</p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{reason}</p>
            </div>
          )}

          {statusPollingError && (
            <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-error">No se pudo consultar</p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{statusPollingError}</p>
            </div>
          )}
        </section>

        <div className="mt-6 space-y-4">
          <button
            onClick={handleOpenHostedFlow}
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                Abriendo Etherfuse…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">verified_user</span>
                Verify my identity
              </>
            )}
          </button>

          {status === 'rejected' && (
            <button
              onClick={handleOpenHostedFlow}
              disabled={loading}
              className="w-full bg-white border border-error/30 text-error font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined">refresh</span>
              Retry verification
            </button>
          )}

          <p className="text-center text-xs text-outline pt-2">
            Tu sesión de verificación expira en ~15 minutos.
          </p>
        </div>
      </main>
    </div>
  );
}

