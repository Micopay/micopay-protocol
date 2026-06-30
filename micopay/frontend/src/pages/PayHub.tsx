import { useTranslation } from 'react-i18next';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { ASSETS } from '../constants/assets';

interface PayHubProps {
  onSend: () => void;
  onReceive: () => void;
}

const PayHub = ({ onSend, onReceive }: PayHubProps) => {
  const { t } = useTranslation();
  const { tokens, loading } = useWalletBalance();

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col pb-28">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/10">
        <h1 className="font-headline font-bold text-xl text-primary">{t('pay.title')}</h1>
      </header>

      <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-6 space-y-6 max-w-md mx-auto w-full">
        <p className="text-on-surface-variant font-medium opacity-70 pt-2">{t('pay.subtitle')}</p>

        {/* Primary actions */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onSend}
            className="bg-primary text-white rounded-[24px] p-6 flex flex-col items-start gap-3 shadow-lg shadow-primary/20 active:scale-[0.97] transition-all"
          >
            <span className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">arrow_upward</span>
            </span>
            <span className="font-headline font-bold text-lg">{t('pay.send')}</span>
            <span className="text-[12px] text-white/80 text-left leading-snug">{t('pay.sendDesc')}</span>
          </button>

          <button
            onClick={onReceive}
            className="bg-white border border-outline-variant/10 rounded-[24px] p-6 flex flex-col items-start gap-3 shadow-sm active:scale-[0.97] transition-all"
          >
            <span className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl text-primary">qr_code_2</span>
            </span>
            <span className="font-headline font-bold text-lg text-on-surface">{t('pay.receive')}</span>
            <span className="text-[12px] text-on-surface-variant text-left leading-snug">{t('pay.receiveDesc')}</span>
          </button>
        </div>

        {/* Balances */}
        <section>
          <h2 className="text-[11px] font-bold text-outline-variant uppercase tracking-[0.15em] mb-3">{t('pay.yourAssets')}</h2>
          <div className="bg-white rounded-[20px] border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
            {ASSETS.map((a) => {
              const bal = tokens.find((t) => t.code.toLowerCase() === a.code.toLowerCase())?.balance ?? 0;
              return (
                <div key={a.code} className="flex items-center gap-3 p-4">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs" style={{ backgroundColor: `${a.color}1A`, color: a.color }}>
                    {a.code === 'XLM' ? 'XLM' : a.code.slice(0, 4)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-on-surface text-sm">{a.label}</p>
                    <p className="text-[11px] text-outline">{a.code}</p>
                  </div>
                  <p className="font-bold text-on-surface text-sm whitespace-nowrap">
                    {loading ? '…' : bal.toLocaleString('es-MX', { maximumFractionDigits: a.decimals })}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default PayHub;
