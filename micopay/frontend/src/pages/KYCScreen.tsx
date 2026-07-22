import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';

import { startKYC, getKYCStatus, type KYCProvider, type KYCStatus, type KYCStatusResponse } from '../services/api';
import { readJSON, writeJSON } from '../services/secureStorage';

const PROVIDER_NAMES: Record<KYCProvider, string> = {
  etherfuse: 'Etherfuse',
  didit: 'Didit',
};

// Cache key is per-provider so a Didit verification (#314/#315's tiered gate)
// and an Etherfuse verification (CETES-only) never clobber each other's
// cached status for the same user.
function secureStorageKey(provider: KYCProvider): string {
  return `kyc_status_${provider}`;
}

function StatusLine({ status }: { status: KYCStatus }) {
  const { t } = useTranslation();
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3">
        <span className="material-symbols-outlined text-primary">hourglass_top</span>
        <div>
          <p className="font-bold text-on-surface">{t('kyc.verifyingIdentity')}</p>
          <p className="text-xs text-on-surface-variant">{t('kyc.verifyingDesc')}</p>
        </div>
      </div>
    );
  }
  if (status === 'approved') {
    return (
      <div className="flex items-center gap-3 bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3">
        <span className="material-symbols-outlined text-[#1D9E75]">check_circle</span>
        <div>
          <p className="font-bold text-on-surface">{t('kyc.identityVerified')}</p>
          <p className="text-xs text-on-surface-variant">{t('kyc.identityVerifiedDesc')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
      <span className="material-symbols-outlined text-error">error</span>
      <div>
        <p className="font-bold text-on-surface">{t('kyc.couldNotVerify')}</p>
        <p className="text-xs text-on-surface-variant">{t('kyc.couldNotVerifyDesc')}</p>
      </div>
    </div>
  );
}

type KYCScreenProps = {
  onApproved: () => void;
  token: string | null;
  /** Defaults to 'etherfuse' so the existing CETES onboarding call site is unaffected. */
  provider?: KYCProvider;
};

export default function KYCScreen({ onApproved, token, provider = 'etherfuse' }: KYCScreenProps) {
  const { t } = useTranslation();
  const providerName = PROVIDER_NAMES[provider];
  const [status, setStatus] = useState<KYCStatus>('pending');
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [startingToken, setStartingToken] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const [statusPollingError, setStatusPollingError] = useState<string | null>(null);

  const loadCachedStatus = async () => {
    const cached = await readJSON<{ status: KYCStatus; reason?: string | null }>(secureStorageKey(provider));
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
    if (!token) {
      setStatusPollingError(t('kyc.sessionError'));
      return;
    }
    setStatusPollingError(null);
    setReason(null);
    setLoading(true);

    try {
      const { onboardingUrl } = await startKYC(token, provider);

      startedAtRef.current = Date.now();
      setStartingToken(onboardingUrl);
      setStatus('pending');

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
      await writeJSON(secureStorageKey(provider), { status: 'approved' });
      onApproved();
    }
  };

  const pollOnce = async () => {
    if (!token) return null;
    setStatusPollingError(null);
    try {
      const res = await getKYCStatus(token, provider);
      await applyStatus(res);
      return res;
    } catch (e: any) {
      const message = e?.message ?? t('kyc.pollError');
      setStatusPollingError(message);
      return null;
    }
  };

  useEffect(() => {
    if (!token) return;
    let intervalId: number | undefined;
    let cancelled = false;

    const startPolling = () => {
      intervalId = window.setInterval(async () => {
        if (cancelled) return;
        if (status !== 'pending') return;
        await pollOnce();
      }, 5000);
    };

    if (status === 'pending') {
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
  }, [status, token]);

  if (!token) {
    return (
      <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <span className="material-symbols-outlined text-error text-4xl mb-3">lock</span>
        <h1 className="font-headline font-bold text-lg mb-2">{t('kyc.sessionNotAvailable')}</h1>
        <p className="text-sm text-on-surface-variant">
          {t('kyc.sessionNotAvailableDesc')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md border-b border-surface-container p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onApproved}
            className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-primary"
            aria-label={t('kyc.continue')}
          >
            <span className="material-symbols-outlined">verified</span>
          </button>
          <div>
            <h1 className="font-headline font-bold text-lg">{t('kyc.identityVerification')}</h1>
            <p className="text-xs text-on-surface-variant">{t('kyc.oneStepWithProvider', { provider: providerName })}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 pb-8 pt-6">
        <section className="space-y-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-[24px] p-5 border border-primary/10">
            <h2 className="font-headline font-extrabold text-xl">{t('kyc.identityVerifiedWith', { provider: providerName })}</h2>
            <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
              {t('kyc.oneTimeProcess', { provider: providerName })}
            </p>
          </div>

          <StatusLine status={status} />

          {status === 'rejected' && reason && (
            <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-error">{t('kyc.reason')}</p>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{reason}</p>
            </div>
          )}

          {statusPollingError && (
            <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
              <p className="text-sm font-bold text-error">{t('kyc.couldNotQuery')}</p>
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
                {t('kyc.openingProvider', { provider: providerName })}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">verified_user</span>
                {t('kyc.verifyIdentity')}
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
              {t('kyc.retryVerification')}
            </button>
          )}

          <p className="text-center text-xs text-outline pt-2">
            {t('kyc.sessionExpires')}
          </p>
        </div>
      </main>
    </div>
  );
}
