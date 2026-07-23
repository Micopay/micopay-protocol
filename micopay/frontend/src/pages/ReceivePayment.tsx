import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { ASSETS } from '../constants/assets';

interface ReceivePaymentProps {
  address: string | null;
  onBack: () => void;
}

const ReceivePayment = ({ address, onBack }: ReceivePaymentProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/10">
        <button onClick={onBack} aria-label={t('send.cancel')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined text-primary">arrow_back</span>
        </button>
        <h1 className="font-headline font-bold text-lg">{t('receive.title')}</h1>
      </header>

      <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-6 pb-24 flex flex-col items-center max-w-md mx-auto w-full">
        <p className="text-sm text-on-surface-variant text-center mb-6">
          {t('receive.subtitle')}
        </p>

        {address ? (
          <div className="bg-white p-6 rounded-[28px] border border-outline-variant/10 shadow-sm flex flex-col items-center">
            <QRCodeSVG value={address} size={216} bgColor="transparent" fgColor="#0B1E26" level="M" />
          </div>
        ) : (
          <div className="bg-surface-container-low p-8 rounded-[28px] text-center text-sm text-outline">
            {t('profile.noKeyGenerated')}
          </div>
        )}

        {address && (
          <>
            <div className="mt-6 w-full bg-surface-container-low rounded-2xl p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-1">{t('receive.yourAddress')}</p>
              <p className="font-mono text-xs text-on-surface break-all select-all">{address}</p>
            </div>

            <button
              onClick={handleCopy}
              className="mt-4 w-full h-12 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-lg">{copied ? 'check' : 'content_copy'}</span>
              {copied ? t('receive.copied') : t('receive.copy')}
            </button>
          </>
        )}

        <div className="mt-8 w-full bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-outline-variant mb-3">{t('receive.accepts')}</p>
          <div className="flex flex-wrap gap-2">
            {ASSETS.map((a) => (
              <span key={a.code} className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: `${a.color}1A`, color: a.color }}>
                {a.code}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-outline mt-3 leading-relaxed">
            {t('receive.scanTip')}
          </p>
        </div>
      </main>
    </div>
  );
};

export default ReceivePayment;
