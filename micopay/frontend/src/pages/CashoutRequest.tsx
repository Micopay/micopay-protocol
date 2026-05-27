import { useState } from 'react';
import TradeStateBadge, { getTradeStateDebugOverride, TradeState } from '../components/TradeStateBadge';

export interface CashoutRequestProps {
  onBack: () => void;
  onSearch: (amount: number) => void;
}

const CashoutRequest = ({ onBack, onSearch }: CashoutRequestProps) => {
  const [amount, setAmount] = useState('500');
  const state: TradeState = getTradeStateDebugOverride('pending_cash');

  return (
    <div className="text-on-surface antialiased overflow-x-hidden min-h-screen bg-surface-container-low">
      <header className="fixed top-0 w-full z-50 bg-surface-container-low backdrop-blur-xl shadow-[0_32px_32px_rgba(0,105,76,0.04)] pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              aria-label="Volver"
              className="text-primary active:scale-95 duration-200 p-2 hover:bg-primary/10 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined font-bold">arrow_back</span>
            </button>
            <h1 className="font-headline font-bold text-xl tracking-tight text-primary">
              Convertir a efectivo
            </h1>
          </div>
          <div className="w-10"></div>
        </div>
        <div className="bg-outline-variant/30 h-[1px] w-full self-end"></div>
      </header>

      <main className="pt-24 pb-32 px-6 flex flex-col min-h-screen max-w-md mx-auto">
        <TradeStateBadge
          state={state}
          onRecover={() => onSearch(Number(amount) || 500)}
          recoverLabel="Buscar una nueva oferta"
          className="mb-6"
        />
        <div className="mt-8 mb-4">
          <label htmlFor="cashout-amount" className="font-label text-xs font-bold tracking-[0.15em] text-on-surface-variant opacity-70">
            ¿CUÁNTO QUIERES EN EFECTIVO?
          </label>
        </div>

        <div className="relative group mb-8 py-10 px-4 bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 flex flex-col items-center">
          <div className="flex items-center justify-center gap-3 w-full">
            <span className="text-headline text-4xl font-extrabold text-on-surface">$</span>
            <input
              id="cashout-amount"
              className="w-32 text-headline text-5xl font-extrabold text-on-surface bg-transparent border-none focus:ring-0 p-0 text-center"
              placeholder="0"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="text-label text-xl font-bold text-primary px-3 py-1 bg-primary/5 rounded-lg">
              MXN
            </span>
          </div>
          <div className="mt-8 flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full border border-primary/10">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-sm font-bold" style={{ fontVariationSettings: '"FILL" 1' }}>
              account_balance_wallet
            </span>
            <span className="text-label text-[13px] font-bold text-primary">
              Disponible: $1,240.00 MXN
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-surface-container-low rounded-2xl border-l-4 border-primary/20">
            <div className="flex gap-4">
              <span aria-hidden="true" className="material-symbols-outlined text-primary opacity-60">info</span>
              <p className="text-body text-[14px] leading-relaxed text-on-surface-variant font-medium">
                Ingresa el monto que deseas recibir. Buscaremos a los comerciantes verificados más cercanos con liquidez inmediata.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-highest/30 p-4 rounded-2xl flex flex-col gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-primary">location_on</span>
              <span className="text-xs font-bold text-on-surface-variant">UBICACIÓN</span>
              <span className="text-sm font-semibold text-on-surface">Cerca de ti</span>
            </div>
            <div className="bg-surface-container-highest/30 p-4 rounded-2xl flex flex-col gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-primary">speed</span>
              <span className="text-xs font-bold text-on-surface-variant">TIEMPO</span>
              <span className="text-sm font-semibold text-on-surface">&lt; 15 mins</span>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-10 pb-6">
          <button
            onClick={() => onSearch(Number(amount))}
            aria-label="Buscar ofertas de efectivo"
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-body font-semibold py-4 rounded-xl shadow-[0_12px_24px_rgba(0,105,76,0.2)] active:scale-95 duration-200 transition-all flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span>Buscar opciones de efectivo</span>
            <span aria-hidden="true" className="material-symbols-outlined text-lg">search</span>
          </button>
        </div>
      </main>

      <div className="fixed top-0 right-0 -z-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
      <div className="fixed bottom-0 left-0 -z-10 w-96 h-96 bg-primary-container/5 rounded-full blur-3xl -ml-48 -mb-48" />
    </div>
  );
};

export default CashoutRequest;
