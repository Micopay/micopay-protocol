import { useState } from 'react';
import TradeStateBadge, { getTradeStateDebugOverride, TradeState } from '../components/TradeStateBadge';

export interface DepositRequestProps {
  onBack: () => void;
  onSearch: (amount: string) => void;
}

const DepositRequest = ({ onBack, onSearch }: DepositRequestProps) => {
  const [amount, setAmount] = useState('500');
  const state: TradeState = getTradeStateDebugOverride('pending_cash');

  return (
    <div className="bg-[#f4faff] min-h-screen text-on-surface font-body">
      <header className="w-full top-0 sticky bg-[#F4FAFF] shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-40 transition-colors duration-300 pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between px-6 py-4 w-full">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              aria-label="Volver"
              className="text-[#00694C] hover:opacity-80 transition-opacity active:scale-95 duration-200 focus:outline-none focus:ring-2 focus:ring-primary rounded-full p-1"
            >
              <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
            </button>
            <div className="flex flex-col">
              <span className="font-headline font-extrabold text-[#00694C] tracking-tight text-xs uppercase opacity-60">MicoPay</span>
              <h1 className="font-headline font-bold text-xl text-[#00694C]">Depositar efectivo</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pt-12 pb-24">
        <div className="flex flex-col space-y-8">
          <TradeStateBadge
            state={state}
            onRecover={() => onSearch(amount || '500')}
            recoverLabel="Buscar nueva opción"
          />

          <div className="space-y-6">
            <label htmlFor="deposit-amount" className="font-medium text-[10px] tracking-wide uppercase text-on-surface-variant/70">
              ¿CUÁNTO QUIERES DEPOSITAR?
            </label>
            <div className="relative group">
              <div className="flex items-baseline space-x-2 border-b border-outline-variant/20 group-focus-within:border-primary transition-all duration-300 pb-2">
                <span className="text-4xl font-headline font-bold text-primary">$</span>
                <input
                  id="deposit-amount"
                  className="w-full bg-transparent border-none p-0 text-5xl font-headline font-extrabold text-on-surface focus:ring-0 placeholder:text-surface-container-highest"
                  placeholder="500"
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <span className="text-xl font-headline font-bold text-on-surface-variant">MXN</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="px-3 py-1 bg-surface-container-low rounded-full">
                <p className="text-xs font-medium text-on-surface-variant">
                  Disponible: <span className="text-primary font-bold">$1,240.00 MXN</span>
                </p>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0_8px_24px_rgba(11,30,38,0.02)] space-y-4">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <span aria-hidden="true" className="material-symbols-outlined text-primary">travel_explore</span>
              </div>
              <div className="flex-1">
                <p className="text-on-surface font-medium leading-relaxed">
                  Buscaremos comerciantes cercanos que tengan saldo disponible para acreditarte.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <button
              onClick={() => onSearch(amount)}
              aria-label="Buscar ofertas de depósito"
              className="w-full bg-[linear-gradient(135deg,#00694c_0%,#008560_100%)] text-white h-[56px] rounded-xl font-headline font-bold text-lg shadow-lg shadow-primary/20 active:scale-95 transition-all duration-200 flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <span>Buscar opciones de depósito</span>
              <span aria-hidden="true" className="material-symbols-outlined text-xl">chevron_right</span>
            </button>
          </div>
        </div>

        <div className="fixed -bottom-12 -right-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </main>
    </div>
  );
};

export default DepositRequest;
