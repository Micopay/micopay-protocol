import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SENDABLE_ASSETS, getAsset } from '../constants/assets';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { useQRScanner } from '../hooks/useQRScanner';
import { sendPayment, isValidStellarAddress, PaymentError, type SendResult } from '../services/payment';

interface SendPaymentProps {
  onBack: () => void;
  onDone: () => void;
}

type Step = 'form' | 'review' | 'sending' | 'done' | 'error';

/** Extract a Stellar G-address from a raw scanned string (plain address, URI, or JSON). */
function extractAddress(raw: string): string {
  const trimmed = raw.trim();
  if (isValidStellarAddress(trimmed)) return trimmed;
  const m = trimmed.match(/G[A-Z2-7]{55}/);
  return m ? m[0] : trimmed;
}

const SendPayment = ({ onBack, onDone }: SendPaymentProps) => {
  const { t } = useTranslation();
  const { tokens, loading: balLoading } = useWalletBalance();
  const { scan } = useQRScanner();

  const [assetCode, setAssetCode] = useState('MXNe');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const asset = getAsset(assetCode)!;
  const available = useMemo(
    () => tokens.find((t) => t.code.toLowerCase() === assetCode.toLowerCase())?.balance ?? 0,
    [tokens, assetCode],
  );

  const amountNum = parseFloat(amount);
  const destValid = isValidStellarAddress(destination);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overBalance = amountValid && amountNum > available;
  const canContinue = destValid && amountValid && !overBalance;

  const handleScan = async () => {
    setScanMsg(null);
    const res = await scan();
    if (res.value) {
      setDestination(extractAddress(res.value));
    } else if (res.error === 'scanner_unavailable') {
      setScanMsg(t('send.scannerUnavailable'));
    } else if (res.permState && res.permState !== 'granted') {
      setScanMsg(t('send.cameraPermission'));
    }
  };

  const handleSend = async () => {
    setStep('sending');
    setError(null);
    try {
      const r = await sendPayment({ destination, assetCode, amount, memo });
      setResult(r);
      setStep('done');
    } catch (e) {
      setError(e instanceof PaymentError ? e.message : 'No se pudo enviar el pago.');
      setStep('error');
    }
  };

  const reset = () => {
    setStep('form');
    setError(null);
    setResult(null);
  };

  // ── Result screens ──────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    return (
      <ResultScreen
        ok
        title={t('send.successTitle')}
        subtitle={t('send.successSubtitle', { amount, asset: assetCode })}
        hashUrl={result.explorerUrl}
        explorerLabel={t('send.viewExplorer')}
        onPrimary={onDone}
        primaryLabel={t('send.done')}
      />
    );
  }
  if (step === 'error') {
    return (
      <ResultScreen
        ok={false}
        title={t('send.errorTitle')}
        subtitle={error ?? 'Error desconocido'}
        onPrimary={reset}
        primaryLabel={t('send.retry')}
        onSecondary={onBack}
        secondaryLabel={t('send.cancel')}
      />
    );
  }

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/10">
        <button
          onClick={step === 'review' ? () => setStep('form') : onBack}
          aria-label="Volver"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors"
        >
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="font-headline font-bold text-lg">{step === 'review' ? t('send.confirmTitle') : t('send.title')}</h1>
      </header>

      <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-6 pb-28 max-w-md mx-auto w-full space-y-6">
        {step === 'form' ? (
          <>
            {/* Asset selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-2">{t('send.asset')}</label>
              <div className="grid grid-cols-4 gap-2">
                {SENDABLE_ASSETS.map((a) => (
                  <button
                    key={a.code}
                    onClick={() => setAssetCode(a.code)}
                    className={`py-2.5 rounded-xl font-bold text-sm border transition-all ${
                      assetCode === a.code ? 'text-white border-transparent' : 'bg-white text-on-surface-variant border-outline-variant/30'
                    }`}
                    style={assetCode === a.code ? { backgroundColor: a.color } : undefined}
                  >
                    {a.code}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-outline mt-2">
                {t('send.available')} <span className="font-bold text-on-surface">{balLoading ? '…' : available.toLocaleString('es-MX', { maximumFractionDigits: asset.decimals })} {asset.code}</span>
              </p>
            </div>

            {/* Destination */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-2">{t('send.recipient')}</label>
              <div className="flex gap-2">
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder={t('send.recipientPlaceholder')}
                  spellCheck={false}
                  autoCapitalize="none"
                  className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary transition-colors"
                />
                <button onClick={handleScan} aria-label="Escanear QR" className="w-12 flex-shrink-0 bg-primary/10 text-primary rounded-2xl flex items-center justify-center active:scale-95 transition-all">
                  <span className="material-symbols-outlined">qr_code_scanner</span>
                </button>
              </div>
              {destination && !destValid && <p className="text-[11px] text-error mt-1">{t('send.invalidAddress')}</p>}
              {scanMsg && <p className="text-[11px] text-outline mt-1">{scanMsg}</p>}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-2">{t('send.amount')}</label>
              <div className="relative">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3 text-2xl font-bold focus:outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={() => setAmount(String(available))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full"
                >
                  MÁX
                </button>
              </div>
              {overBalance && <p className="text-[11px] text-error mt-1">{t('send.insufficientBalance')}</p>}
            </div>

            {/* Memo */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-2">{t('send.memo')}</label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={28}
                placeholder={t('send.memoPlaceholder')}
                className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <button
              onClick={() => setStep('review')}
              disabled={!canContinue}
              className="w-full h-[52px] bg-primary text-white font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {t('send.continue')}
            </button>
          </>
        ) : (
          // ── Review step ───────────────────────────────────────────────────────
          <>
            <div className="bg-white rounded-[24px] border border-outline-variant/10 shadow-sm p-6 space-y-4">
              <div className="text-center pb-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant">{t('send.youWillSend')}</p>
                <p className="text-3xl font-headline font-extrabold mt-1" style={{ color: asset.color }}>
                  {amountNum.toLocaleString('es-MX', { maximumFractionDigits: asset.decimals })} {asset.code}
                </p>
              </div>
              <div className="h-px bg-outline-variant/10" />
              <Row label={t('send.to')} value={`${destination.slice(0, 8)}…${destination.slice(-6)}`} mono />
              {memo.trim() && <Row label={t('send.note')} value={memo.trim()} />}
              <Row label={t('send.network')} value={t('send.networkName')} />
              <Row label={t('send.fee')} value={t('send.feeValue')} />
            </div>
            <p className="text-[11px] text-outline text-center px-4">
              {t('send.warning')}
            </p>
            <button
              onClick={handleSend}
              disabled={step === 'sending'}
              className="w-full h-[52px] bg-primary text-white font-bold rounded-2xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {step === 'sending' ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  {t('send.sending')}
                </>
              ) : (
                t('send.confirmSend')
              )}
            </button>
          </>
        )}
      </main>
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className={`text-sm font-bold text-on-surface text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function ResultScreen({
  ok,
  title,
  subtitle,
  hashUrl,
  explorerLabel,
  onPrimary,
  primaryLabel,
  onSecondary,
  secondaryLabel,
}: {
  ok: boolean;
  title: string;
  subtitle: string;
  hashUrl?: string;
  explorerLabel?: string;
  onPrimary: () => void;
  primaryLabel: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
}) {
  return (
    <div className="bg-surface min-h-screen flex flex-col items-center justify-center px-8 text-center font-body">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${ok ? 'bg-[#E1F5EE]' : 'bg-error/10'}`}>
        <span className={`material-symbols-outlined text-4xl ${ok ? 'text-[#1D9E75]' : 'text-error'}`} style={{ fontVariationSettings: '"FILL" 1' }}>
          {ok ? 'check_circle' : 'error'}
        </span>
      </div>
      <h1 className="font-headline font-extrabold text-2xl text-on-surface mb-2">{title}</h1>
      <p className="text-on-surface-variant mb-8">{subtitle}</p>
      {hashUrl && (
        <a href={hashUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-bold text-sm flex items-center gap-1 mb-8">
          {explorerLabel ?? 'Ver en el explorador'} <span className="material-symbols-outlined text-[18px]">open_in_new</span>
        </a>
      )}
      <button onClick={onPrimary} className="w-full max-w-xs h-[52px] bg-primary text-white font-bold rounded-2xl active:scale-[0.98] transition-all">
        {primaryLabel}
      </button>
      {onSecondary && secondaryLabel && (
        <button onClick={onSecondary} className="mt-3 w-full max-w-xs h-[52px] text-on-surface-variant font-bold rounded-2xl">
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}

export default SendPayment;
