import { useState, useEffect, useCallback } from 'react';
import { Logo } from '../components/Logo';
import ErrorBanner from '../components/ErrorBanner';
import {
  getTradeHistory,
  getAccountBalance,
  getMerchantTrades,
  getXlmMxnRate,
  TradeHistoryItem,
  getCurrentUser,
} from '../services/api';
import { mapApiError, type MappedApiError } from '../utils/apiError';

const EXPLORER = "https://stellar.expert/explorer/testnet/tx";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  completed: { label: "Completado", color: "text-[#1D9E75]" },
  locked: { label: "Bloqueado", color: "text-primary" },
  revealing: { label: "Revelando", color: "text-primary" },
  pending: { label: "Pendiente", color: "text-outline" },
  cancelled: { label: "Cancelado", color: "text-error" },
  refunded: { label: "Reembolsado", color: "text-outline" },
};

interface HomeProps {
  onNavigateCashout: () => void;
  onNavigateDeposit: () => void;
  onNavigateHistory?: () => void;
  token: string | null;
  merchantToken: string | null;
  onNavigateInbox: () => void;
}

const Home = ({
  onNavigateCashout,
  onNavigateDeposit,
  onNavigateHistory,
  token,
  merchantToken,
  onNavigateInbox,
}: HomeProps) => {
  const [trades, setTrades] = useState<TradeHistoryItem[]>([]);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [stellarAddress, setStellarAddress] = useState<string>("");
  const [pendingCount, setPendingCount] = useState(0);
  const [xlmMxnRate, setXlmMxnRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [rateError, setRateError] = useState(false);
  const [balanceError, setBalanceError] = useState<MappedApiError | null>(null);
  const [historyError, setHistoryError] = useState<MappedApiError | null>(null);
  const [pendingError, setPendingError] = useState<MappedApiError | null>(null);

  const loadBalance = useCallback(() => {
    setBalanceError(null);
    getAccountBalance()
      .then(({ xlm, address }) => {
        setXlmBalance(
          parseFloat(xlm).toLocaleString("es-MX", { maximumFractionDigits: 2 }),
        );
        setStellarAddress(address);
      })
      .catch((e) => setBalanceError(mapApiError(e)));
  }, []);

  const loadHistory = useCallback(() => {
    if (!token) return;
    setHistoryError(null);
    getTradeHistory(token)
      .then(setTrades)
      .catch((e) => {
        setHistoryError(mapApiError(e));
        setTrades([]);
      });
  }, [token]);

  const loadPendingCount = useCallback(() => {
    if (!merchantToken) return;
    setPendingError(null);
    getMerchantTrades(merchantToken, 'pending')
      .then((items) => setPendingCount(items.length))
      .catch((e) => setPendingError(mapApiError(e)));
  }, [merchantToken]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  useEffect(() => {
    let cancelled = false;
    setRateLoading(true);
    setRateError(false);
    getXlmMxnRate()
      .then((data) => {
        if (!cancelled) {
          setXlmMxnRate(data.rate);
          setRateLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRateError(true);
          setRateLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const rawXlm = xlmBalance ? parseFloat(xlmBalance.replace(/,/g, "")) : 0;
  const mxnBalance = !xlmBalance
    ? "—"
    : rateLoading
      ? "—"
      : rateError
        ? `~${(rawXlm * 20).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`
        : (rawXlm * (xlmMxnRate ?? 0)).toLocaleString("es-MX", { maximumFractionDigits: 2 });

  const today = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const [availability, setAvailabilityState] = useState<
    "online" | "offline" | "paused"
  >("online");

  useEffect(() => {
    if (!merchantToken) return;
    getCurrentUser(merchantToken)
      .then((user: any) => {
        const status = user.verification_status;
        setAvailabilityState(
          status === "verified"
            ? "online"
            : status === "paused"
              ? "paused"
              : "offline",
        );
      })
      .catch(() => {});
  }, [merchantToken]);

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90">
        <Logo />
        <div className="flex items-center gap-4">
          <button
            onClick={onNavigateInbox}
            className="relative p-2 rounded-full hover:bg-surface-container-low transition-colors"
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-primary"
            >
              notifications
            </span>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-error text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
          <div className="w-10 h-10 rounded-full border-2 border-primary-container bg-surface-container-low flex items-center justify-center">
            <svg
              fill="none"
              height="20"
              viewBox="0 0 24 24"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="7" cy="7" r="3" stroke="#1A2830" strokeWidth="2" />
              <circle cx="17" cy="17" r="3" stroke="#1D9E75" strokeWidth="2" />
              <path
                d="M10 10L14 14"
                stroke="#00694C"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </header>

      <main className="flex-1 mt-20 px-6 pb-32">
        {availability === "paused" && (
          <div className="mb-6 bg-error/10 border border-error/20 rounded-2xl p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-error">
              pause_circle
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-error">
                Operaciones pausadas
              </p>
              <p className="text-[11px] text-error/80">
                No aparecerás en el mapa hasta que reanudes.
              </p>
            </div>
          </div>
        )}
        {/* Saludo */}
        <section className="mb-8">
          <h1 className="font-headline font-extrabold text-3xl text-on-surface leading-tight mb-1">
            Hola, Juan 👋
          </h1>
          <p className="text-on-surface-variant font-medium opacity-70 capitalize">
            {today}
          </p>
        </section>

        {balanceError ? (
          <ErrorBanner
            message={balanceError.message}
            action={balanceError.action}
            onRetry={loadBalance}
            onDismiss={() => setBalanceError(null)}
            supportState="HOME_BALANCE"
            className="mb-4"
          />
        ) : null}

        {/* Balance Card */}
        <div className="bg-primary rounded-[24px] p-6 relative overflow-hidden mb-8 shadow-xl shadow-primary/20">
          <div className="absolute -right-8 -bottom-8 opacity-20 pointer-events-none text-white">
            <svg
              fill="none"
              height="180"
              viewBox="0 0 24 24"
              width="180"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="7"
                cy="7"
                r="3"
                stroke="#D4E4EC"
                strokeWidth="1.5"
              ></circle>
              <circle
                cx="17"
                cy="17"
                r="3"
                stroke="#D4E4EC"
                strokeWidth="1.5"
              ></circle>
              <path d="M10 10L14 14" stroke="#D4E4EC" strokeWidth="1.5"></path>
            </svg>
          </div>
          <div className="flex justify-between items-start relative z-10 mb-6">
            <p className="text-[10px] font-bold tracking-[0.15em] text-white/70 uppercase">
              SALDO MXN · STELLAR TESTNET
            </p>
            <div className="flex items-center justify-center bg-white/10 rounded-full p-1">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-white text-sm"
              >
                rocket_launch
              </span>
            </div>
          </div>
          <div className="relative z-10 mb-4">
            <h2 className="text-[36px] font-headline font-extrabold text-white tracking-tight">
              ${mxnBalance} MXN
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#5DCAA5] animate-pulse shadow-[0_0_8px_#5DCAA5]"></span>
              <p className="text-[#5DCAA5] text-sm font-bold">
                {balanceError
                  ? 'No disponible'
                  : xlmBalance
                    ? `${xlmBalance} XLM · Testnet`
                    : 'Cargando balance…'}
              </p>
            </div>
          </div>
        </div>

        {/* Activos */}
        <section className="mb-8">
          <h2 className="text-[11px] font-bold text-outline-variant uppercase tracking-[0.15em] mb-4">
            Activos
          </h2>
          <div className="bg-white rounded-[20px] border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
            {/* XLM */}
            <div className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-full bg-[#7B61FF]/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[#7B61FF] font-black text-sm">XLM</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-on-surface text-sm">
                  Stellar Lumens
                </p>
                <p className="text-[11px] text-outline truncate font-mono">
                  {stellarAddress
                    ? `${stellarAddress.substring(0, 8)}…${stellarAddress.slice(-6)}`
                    : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-on-surface text-sm">
                  {xlmBalance ?? "—"} XLM
                </p>
                <p className="text-[11px] text-outline">${mxnBalance} MXN</p>
              </div>
            </div>
            {/* MXNE placeholder */}
            <div className="flex items-center gap-4 p-4 opacity-40">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-primary font-black text-xs">MXNE</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-on-surface text-sm">
                  Peso Digital (MXNE)
                </p>
                <p className="text-[11px] text-outline">
                  Mainnet · próximamente
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-on-surface text-sm">— MXN</p>
              </div>
            </div>
          </div>
        </section>

        {pendingError ? (
          <ErrorBanner
            message={pendingError.message}
            action={pendingError.action}
            onRetry={loadPendingCount}
            onDismiss={() => setPendingError(null)}
            supportState="HOME_PENDING"
            className="mb-4"
          />
        ) : null}

        {/* Actividad */}
        <section className="mb-8">
          <h2 className="text-[11px] font-bold text-outline-variant uppercase tracking-[0.15em] mb-4">
            Actividad reciente
          </h2>

          {historyError ? (
            <ErrorBanner
              message={historyError.message}
              action={historyError.action}
              onRetry={loadHistory}
              onDismiss={() => setHistoryError(null)}
              supportState="HOME_HISTORY"
            />
          ) : trades.length === 0 ? (
            <div className="bg-white rounded-[20px] border border-outline-variant/10 shadow-sm p-6 text-center">
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-outline-variant text-3xl mb-2 block"
              >
                receipt_long
              </span>
              <p className="text-sm text-outline font-medium">
                Sin transacciones aún
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[20px] border border-outline-variant/10 shadow-sm divide-y divide-outline-variant/10">
              {trades.map((trade) => {
                const s = STATUS_LABEL[trade.status] ?? {
                  label: trade.status,
                  color: "text-outline",
                };
                const date = new Date(trade.created_at).toLocaleString(
                  "es-MX",
                  {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                );
                return (
                  <div key={trade.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span
                            aria-hidden="true"
                            className="material-symbols-outlined text-primary text-base"
                          >
                            swap_horiz
                          </span>
                        </div>
                        <div>
                          <p className="font-bold text-on-surface text-sm">
                            ${trade.amount_mxn.toLocaleString("es-MX")} MXN
                          </p>
                          <p className="text-[11px] text-outline">{date}</p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold ${s.color}`}>
                        {s.label}
                      </span>
                    </div>

                    {/* TX links */}
                    <div className="flex flex-col gap-1 pl-12">
                      {trade.lock_tx_hash &&
                        !trade.lock_tx_hash.startsWith("mock") && (
                          <a
                            href={`${EXPLORER}/${trade.lock_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary font-mono flex items-center gap-1 hover:underline"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[12px]"
                            >
                              lock
                            </span>
                            lock · {trade.lock_tx_hash.substring(0, 14)}…
                          </a>
                        )}
                      {trade.release_tx_hash &&
                        !trade.release_tx_hash.startsWith("mock") && (
                          <a
                            href={`${EXPLORER}/${trade.release_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#1D9E75] font-mono flex items-center gap-1 hover:underline"
                          >
                            <span
                              aria-hidden="true"
                              className="material-symbols-outlined text-[12px]"
                            >
                              lock_open
                            </span>
                            release · {trade.release_tx_hash.substring(0, 14)}…
                          </a>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CTAs */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={onNavigateCashout}
            aria-label="Convertir a efectivo"
            className="w-full h-[56px] bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-xl shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              payments
            </span>
            Convertir a efectivo
          </button>
          <button
            onClick={onNavigateDeposit}
            aria-label="Depositar efectivo"
            className="w-full h-[56px] bg-gradient-to-r from-[#1D9E75] to-[#14815F] text-white font-bold rounded-xl shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              add_circle
            </span>
            Depositar efectivo
          </button>
          <p className="text-sm text-on-surface-variant font-medium opacity-60">
            Encuentra a alguien cerca en minutos
          </p>
        </div>
      </main>
    </div>
  );
};

export default Home;
