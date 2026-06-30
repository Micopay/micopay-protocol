import { useState, useEffect } from 'react';
import { 
  getCETESRate, 
  buyCETES, 
  sellCETES, 
  CETESRate, 
  CETESTxResult,
  getMyProfile,
  UserProfile,
  RampQuote,
  getOfframpQuote,
  createOfframpOrder,
  regenerateOfframpTx,
  getRampOrder
} from '../services/api';
import { sendCETESToEtherfuse } from '../services/stellarRamp';
import { extractApiErrorPayload } from '../utils/apiError';

interface CETESScreenProps {
  onBack: () => void;
  onBanco?: () => void;
  userToken?: string;
}

type Tab = 'buy' | 'sell';
type SourceAsset = 'XLM' | 'USDC' | 'MXNe';
type ReceiveMethod = 'wallet' | 'spei';

const CETESScreen = ({ onBack, onBanco, userToken }: CETESScreenProps) => {
  const [tab, setTab] = useState<Tab>('buy');
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>('wallet');
  const [amount, setAmount] = useState('');
  const [sourceAsset, setSourceAsset] = useState<SourceAsset>('XLM');
  
  const [rate, setRate] = useState<CETESRate | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [txResult, setTxResult] = useState<CETESTxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [quote, setQuote] = useState<RampQuote | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [rampOrderId, setRampOrderId] = useState<string | null>(null);
  const [orderState, setOrderState] = useState<string>('');

  useEffect(() => {
    getCETESRate()
      .then(setRate)
      .catch(() => {})
      .finally(() => setRateLoading(false));

    if (userToken) {
      getMyProfile(userToken).then(setProfile).catch(() => {});
    }
  }, [userToken]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && quote) {
      setQuote(null);
      setError("La cotización ha expirado. Por favor, solicita una nueva.");
    }
  }, [countdown, quote]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (rampOrderId && (orderState === 'pending' || orderState === 'funded') && userToken) {
      interval = setInterval(async () => {
        try {
          const o = await getRampOrder(rampOrderId, userToken);
          setOrderState(o.status);
          if (o.status === 'completed' || o.status === 'refunded') {
            clearInterval(interval);
            setTxLoading(false);
          }
        } catch (e) {
          console.error(e);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [rampOrderId, orderState, userToken]);

  const cetesPreview = (): string => {
    if (!amount || isNaN(parseFloat(amount))) return '—';
    const num = parseFloat(amount);
    if (tab === 'buy') {
      if (sourceAsset === 'XLM') {
        const xlmPerUsdc = rate?.xlmPerUsdc ?? 17.24;
        const usdc = num / xlmPerUsdc;
        const mxn = usdc * 17.5;
        const cetes = mxn / (rate?.cesPriceMxn ?? 10);
        return cetes.toFixed(2);
      }
      if (sourceAsset === 'USDC') {
        const mxn = num * 17.5;
        return (mxn / (rate?.cesPriceMxn ?? 10)).toFixed(2);
      }
      return (num / (rate?.cesPriceMxn ?? 10)).toFixed(2);
    } else {
      const mxn = num * (rate?.cesPriceMxn ?? 10);
      if (sourceAsset === 'XLM') {
        const xlmPerUsdc = rate?.xlmPerUsdc ?? 17.24;
        return ((mxn / 17.5) * xlmPerUsdc).toFixed(2);
      }
      if (sourceAsset === 'USDC') return (mxn / 17.5).toFixed(2);
      return mxn.toFixed(2);
    }
  };

  const handleTx = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setTxLoading(true);
    setError(null);
    setTxResult(null);
    try {
      const result =
        tab === 'buy'
          ? await buyCETES(amount, sourceAsset)
          : await sellCETES(amount, sourceAsset);
      setTxResult(result);
      setAmount('');
    } catch (err: unknown) {
      setError(extractApiErrorPayload(err).message);
    } finally {
      setTxLoading(false);
    }
  };

  const handleGetQuote = async () => {
    if (!amount || parseFloat(amount) <= 0 || !userToken) return;
    setTxLoading(true);
    setError(null);
    try {
      const q = await getOfframpQuote(amount, userToken);
      setQuote(q);
      setCountdown(120);
    } catch (err: unknown) {
      setError(extractApiErrorPayload(err).message);
    } finally {
      setTxLoading(false);
    }
  };

  const handleConfirmSPEI = async () => {
    if (!quote || !userToken || !rate?.cetesIssuer) {
      setError("Información incompleta para confirmar el retiro.");
      return;
    }
    
    setTxLoading(true);
    setError(null);
    
    try {
      let order = await createOfframpOrder(quote.id, userToken);
      
      const executeTx = async (orderData: any) => {
        return await sendCETESToEtherfuse(
          amount,
          orderData.withdrawAnchorAccount,
          orderData.withdrawMemo,
          rate.cetesIssuer
        );
      };

      let result;
      try {
        result = await executeTx(order);
      } catch (e: any) {
        if (e.message === 'tx_too_late') {
          order = await regenerateOfframpTx(order.id, userToken);
          result = await executeTx(order);
        } else {
          throw e;
        }
      }

      setTxResult({
        hash: result.hash,
        status: 'success',
        simulated: false,
        amount,
        explorerUrl: result.explorerUrl
      });
      
      setRampOrderId(order.id);
      setOrderState(order.status || 'pending');
    } catch (err: unknown) {
      setError(extractApiErrorPayload(err).message);
      setTxLoading(false);
    }
  };

  const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h);
  const canUseSpei = profile?.kyc_status === 'approved' && !!profile?.clabe;

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col pb-10">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/10">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="font-headline font-bold text-lg leading-tight">CETES Tokenizados</h1>
          <p className="text-[11px] text-on-surface-variant">Bonos del Gobierno de México · Etherfuse</p>
        </div>
        <div className="ml-auto bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
          <span className="text-primary font-bold text-sm">{rate?.apy ?? 11.45}% anual</span>
        </div>
      </header>

      <main className="flex-1 mt-20 px-4 pt-4 space-y-5">
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-[24px] p-5 border border-primary/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-primary">trending_up</span>
            </div>
            <div>
              <p className="font-bold text-on-surface text-base">Tasa de rendimiento</p>
              {rateLoading ? (
                <p className="text-xs text-outline">Cargando…</p>
              ) : (
                <p className="text-xs text-on-surface-variant">{rate?.note}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/60 rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-primary">{rate?.apy ?? 11.45}%</p>
              <p className="text-xs text-on-surface-variant mt-1">Rendimiento anual</p>
            </div>
            <div className="bg-white/60 rounded-2xl p-3 text-center">
              <p className="text-2xl font-extrabold text-on-surface">
                {rateLoading ? '…' : `${(rate?.apy ?? 11.45) / 12}`.slice(0, 4)}%
              </p>
              <p className="text-xs text-on-surface-variant mt-1">Rendimiento mensual</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-surface-container-low rounded-2xl p-1">
          <div className="flex gap-2">
            {(['buy', 'sell'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setTxResult(null); setError(null); setQuote(null); setRampOrderId(null); }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  tab === t ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant'
                }`}
              >
                {t === 'buy' ? 'Comprar CETES' : 'Vender CETES'}
              </button>
            ))}
          </div>

          {tab === 'sell' && (
            <div className="flex gap-2 mt-1 px-1 pb-1">
              <button
                onClick={() => { setReceiveMethod('wallet'); setQuote(null); setTxResult(null); setError(null); }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  receiveMethod === 'wallet' ? 'bg-white text-primary shadow-sm border border-outline-variant/10' : 'text-on-surface-variant'
                }`}
              >
                A Wallet (DEX)
              </button>
              {canUseSpei && (
                <button
                  onClick={() => { setReceiveMethod('spei'); setQuote(null); setTxResult(null); setError(null); setAmount(''); }}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-all ${
                    receiveMethod === 'spei' ? 'bg-white text-primary shadow-sm border border-outline-variant/10' : 'text-on-surface-variant'
                  }`}
                >
                  A Cuenta SPEI
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[24px] p-5 border border-outline-variant/10 shadow-sm space-y-4">
          
          {tab === 'sell' && receiveMethod === 'spei' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wide">
                  Cantidad de CETES a vender
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setQuote(null); }}
                  disabled={!!quote || txLoading || !!rampOrderId}
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3 text-xl font-bold text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                />
              </div>

              {quote && (
                <div className="bg-primary/5 rounded-2xl px-4 py-3 flex flex-col items-center">
                  <span className="text-sm text-on-surface-variant">Recibirás en tu cuenta SPEI</span>
                  <span className="text-2xl font-extrabold text-primary">${quote.amount_out.toFixed(2)} MXN</span>
                  {!rampOrderId && (
                    <span className="text-xs text-error mt-2 font-bold">
                      La cotización expira en: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              )}

              {orderState && (
                <div className={`border rounded-2xl px-4 py-3 space-y-2 text-center ${
                  orderState === 'refunded' ? 'bg-error/10 border-error/20' : 'bg-[#e6f9f1] border-[#1D9E75]/20'
                }`}>
                  {orderState === 'pending' && <p className="font-bold text-[#1D9E75] animate-pulse">Enviando CETES a Etherfuse...</p>}
                  {orderState === 'funded' && <p className="font-bold text-[#1D9E75] animate-pulse">CETES recibidos, procesando SPEI...</p>}
                  {orderState === 'completed' && <p className="font-bold text-[#1D9E75]">MXN depositados en tu cuenta SPEI</p>}
                  {orderState === 'refunded' && <p className="font-bold text-error">Operación rechazada, CETES devueltos.</p>}
                  
                  {txResult && (
                    <a href={txResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex justify-center items-center gap-1 text-xs text-primary font-bold">
                      Ver envío on-chain <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
                  <p className="text-sm text-error font-medium">{error}</p>
                </div>
              )}

              {!quote && !rampOrderId ? (
                <button
                  onClick={handleGetQuote}
                  disabled={txLoading || !amount || parseFloat(amount) <= 0}
                  className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
                >
                  {txLoading ? 'Cotizando...' : 'Cotizar Retiro'}
                </button>
              ) : !rampOrderId ? (
                <button
                  onClick={handleConfirmSPEI}
                  disabled={txLoading}
                  className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all"
                >
                  {txLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      Procesando transacción…
                    </>
                  ) : 'Confirmar Retiro'}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wide">
                  {tab === 'buy' ? 'Pagar con' : 'Recibir en'}
                </label>
                <div className="flex gap-2">
                  {(['XLM', 'USDC', 'MXNe'] as SourceAsset[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setSourceAsset(a)}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm border transition-all ${
                        sourceAsset === a
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-on-surface-variant border-outline-variant/30'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wide">
                  {tab === 'buy' ? `Cantidad en ${sourceAsset}` : 'Cantidad en CETES'}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3 text-xl font-bold text-on-surface focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {amount && parseFloat(amount) > 0 && (
                <div className="bg-primary/5 rounded-2xl px-4 py-3 flex justify-between items-center">
                  <span className="text-sm text-on-surface-variant">
                    {tab === 'buy' ? 'Recibirás ~' : 'Recibirás ~'}
                  </span>
                  <span className="font-bold text-on-surface">
                    {cetesPreview()} {tab === 'buy' ? 'CETES' : sourceAsset}
                  </span>
                </div>
              )}

              {error && (
                <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3">
                  <p className="text-sm text-error font-medium">{error}</p>
                </div>
              )}

              {txResult && (
                <div className="bg-[#e6f9f1] border border-[#1D9E75]/20 rounded-2xl px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1D9E75] text-xl">check_circle</span>
                    <p className="font-bold text-[#1D9E75]">
                      {txResult.simulated ? '¡Prueba simulada!' : '¡Operación enviada!'}
                    </p>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Hash: <span className="font-mono">{shortHash(txResult.hash)}</span>
                  </p>
                  {txResult.cetesReceived && (
                    <p className="text-sm font-bold text-on-surface">
                      +{txResult.cetesReceived} CETES acreditados
                    </p>
                  )}
                  <a
                    href={txResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary font-bold"
                  >
                    Ver en el explorador Stellar
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                </div>
              )}

              <button
                onClick={handleTx}
                disabled={txLoading || !amount || parseFloat(amount) <= 0}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {txLoading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                    Procesando…
                  </>
                ) : tab === 'buy' ? (
                  <>
                    Comprar CETES
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </>
                ) : (
                  <>
                    Vender CETES
                    <span className="material-symbols-outlined text-lg">swap_horiz</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <button
          onClick={onBanco}
          className="w-full bg-white border border-outline-variant/20 rounded-[24px] p-5 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all text-left"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-on-surface text-sm">¿Sin cripto?</p>
            <p className="text-xs text-on-surface-variant">Conecta tu banco vía SPEI para empezar</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
        </button>

        <p className="text-center text-xs text-outline pb-4">
          CETES tokenizados por Etherfuse · Red Stellar · {rate?.network ?? 'TESTNET'}
        </p>
      </main>
    </div>
  );
};

export default CETESScreen;