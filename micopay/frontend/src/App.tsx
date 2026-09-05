import { useState, useEffect, createContext, useContext } from "react";
import { generateAndStoreKeypair, keypairExists, getPublicKey, exportSecretKey } from './lib/keystore';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import ErrorBoundary from './components/ErrorBoundary';

import Home from "./pages/Home";
import CashoutRequest from "./pages/CashoutRequest";
import DepositRequest from "./pages/DepositRequest";
import ExploreMap from "./pages/ExploreMap";
import TradeConfirmationPage from "./pages/TradeConfirmation";
import DepositMap from "./pages/DepositMap";
import ChatRoom from "./pages/ChatRoom";
import DepositChat from "./pages/DepositChat";
import QRReveal from "./pages/QRReveal";
import DepositQR from "./pages/DepositQR";
import SuccessScreen from "./pages/SuccessScreen";
import Explore from "./pages/Explore";
import History from "./pages/History";
import TradeDetail from "./pages/TradeDetail";
import CETESScreen from "./pages/CETESScreen";
import BlendScreen from "./pages/BlendScreen";
import KYCScreen from "./pages/KYCScreen";

import MerchantInbox from "./pages/MerchantInbox";
import PayHub from "./pages/PayHub";
import SendPayment from "./pages/SendPayment";
import ReceivePayment from "./pages/ReceivePayment";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Profile from "./pages/Profile";
import { SignatureApproval } from "./pages/SignatureApproval";
import ClaimQR from "./pages/ClaimQR";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MerchantSettings from "./pages/MerchantSettings";
import BottomNav from "./components/BottomNav";
import { ConnectionBanner } from "./components/ConnectionBanner";
import DebugOverlay from "./components/DebugOverlay";
import OfflineQueueStatus from "./components/OfflineQueueStatus";

import {
  registerUser,
  getAuthToken,
  getCurrentUser,
  createTrade,
  fetchTradeDetail,
  UserData,
  TradeData,
  TradeFlow,
  TradeHistoryItem,
} from "./services/api";
import { readJSON, writeJSON, removeKey, isBackupConfirmed, setBackupConfirmed } from "./services/secureStorage";
import { ApiError, mapApiError, type MappedApiError } from "./utils/apiError";
import { IS_DEMO_MODE } from "./utils/demoMode";

const USERS_STORAGE_KEY = "micopay_user";

/**
 * Re-authenticate using the device keypair when a stored session is orphaned
 * (e.g. the backend DB was reset). The device key is the identity, so we can
 * re-register (fresh DB) or re-auth (user still exists) without user friction.
 */
async function recoverSession(username: string): Promise<UserData> {
  try {
    return await registerUser(username);
  } catch (e: unknown) {
    // registerUser throws an ApiError, not a raw Axios error, so the old
    // `e.response.status === 409` check never matched and recovery fell
    // through to a rethrow. Match on the backend code instead.
    if (e instanceof ApiError && e.code === 'ADDRESS_ALREADY_REGISTERED') {
      // This device already has an account — refresh the token instead.
      const token = await getAuthToken();
      const profile = await getCurrentUser(token);
      return { ...(profile as any), token } as UserData;
    }
    throw e;
  }
}


type Flow = "cashout" | "deposit" | null;

export interface AppCtx {
  /**
   * CASH-7 (#160 follow-up): una persona, una sesion. Antes habia dos campos
   * con nombre de rol y todos los caminos de alta, login y recuperacion les
   * asignaban EL MISMO objeto. Esos nombres conservaban el modelo viejo de
   * "un telefono, dos roles" y hacian que el campo del vendedor, por el mero
   * hecho de tener valor, significara "esta persona es proveedora".
   *
   * El rol es por operacion, no por sesion: se deriva del trade cargado
   * comparando `sessionUser.id` con `seller_id`/`buyer_id`.
   */
  sessionUser: UserData | null;
  activeTrade: TradeData | null;
  lockTxHash: string | null;
  releaseTxHash: string | null;
  activeAmount: number;
  tradeLoading: boolean;
  tradeError: MappedApiError | null;
  flow: Flow;
  devicePublicKey: string | null;
  setActiveAmount: (n: number) => void;
  setFlow: (f: Flow) => void;
  setReleaseTxHash: (h: string | null) => void;
  handleOfferSelected: (offerId: string) => Promise<boolean>;
  handleDepositOfferSelected: (offerId: string) => Promise<boolean>;
  clearTradeError: () => void;
  retryTradeFlow: () => Promise<boolean>;
  handleAccountDeleted: () => void;
  resetTradeFlow: () => void;
  envName: string;
  backendUrl: string;
  isDemoMode: boolean;
  isMockStellar: boolean;
  backendConnected: boolean;
  backendHealth: any;
}

export const AppContext = createContext<AppCtx | null>(null);

function useAppCtx(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext missing");
  return ctx;
}

// ── Route wrappers ───────────────────────────────────────────────────────────

function HomeRoute() {
  const navigate = useNavigate();
  const { sessionUser, setFlow } = useAppCtx();
  return (
      <Home
          onNavigateCashout={() => { setFlow('cashout'); navigate('/cashout'); }}
          onNavigateDeposit={() => { setFlow('deposit'); navigate('/deposit'); }}
          onNavigateHistory={() => navigate('/history')}
          token={sessionUser?.token ?? null}
          merchantToken={sessionUser?.token ?? null}
          onNavigateInbox={() => navigate('/inbox')}
          username={sessionUser?.username ?? null}
      />
  );
}

function HistoryRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
      <History
          onBack={() => navigate('/')}
          onSelectTrade={(trade) => navigate(`/trade/${trade.id}`)}
          token={sessionUser?.token ?? null}
      />
  );
}

function TradeDetailRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
    <TradeDetail
      token={sessionUser?.token ?? null}
      userId={sessionUser?.id ?? null}
      onBack={() => navigate('/history')}
    />
  );
}

function InboxRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
      <MerchantInbox
          token={sessionUser?.token ?? null}
          onBack={() => navigate('/')}
      />
  );
}

function CashoutRoute() {
  const navigate = useNavigate();
  const { setActiveAmount } = useAppCtx();
  return (
      <CashoutRequest
          onBack={() => navigate('/')}
          onSearch={(amount) => {
            setActiveAmount(amount);
            navigate('/map');
          }}
      />
  );
}

function PayHubRoute() {
  const navigate = useNavigate();
  return (
      <PayHub
          onSend={() => navigate('/pay/send')}
          onReceive={() => navigate('/pay/receive')}
      />
  );
}

function SendPaymentRoute() {
  const navigate = useNavigate();
  return (
      <SendPayment
          onBack={() => navigate('/pay')}
          onDone={() => navigate('/')}
      />
  );
}

function ReceivePaymentRoute() {
  const navigate = useNavigate();
  const { devicePublicKey } = useAppCtx();
  return (
      <ReceivePayment
          address={devicePublicKey}
          onBack={() => navigate('/pay')}
      />
  );
}

function DepositRoute() {
  const navigate = useNavigate();
  const { setActiveAmount } = useAppCtx();
  return (
      <DepositRequest
          onBack={() => navigate('/')}
          onSearch={(amount) => {
            setActiveAmount(Number(amount) || 500);
            navigate('/map-deposit');
          }}
      />
  );
}

function MapDepositRoute() {
  const navigate = useNavigate();
  const { handleDepositOfferSelected, tradeLoading, tradeError, clearTradeError, retryTradeFlow } = useAppCtx();
  return (
      <DepositMap
          onBack={() => navigate('/deposit')}
          onSelectOffer={async (offerId) => {
            const ok = await handleDepositOfferSelected(offerId);
            if (ok) navigate('/chat-deposit');
          }}
          loading={tradeLoading}
          creationError={tradeError?.message ?? null}
          creationErrorAction={tradeError?.action}
          onDismissCreationError={clearTradeError}
          onRetryCreationError={async () => {
            const ok = await retryTradeFlow();
            if (ok) navigate('/chat-deposit');
          }}
      />
  );
}

function MapRoute() {
  const navigate = useNavigate();
  const { activeAmount, handleOfferSelected, tradeLoading, tradeError, clearTradeError, retryTradeFlow } = useAppCtx();
  return (
      <ExploreMap
          amount={activeAmount}
          loading={tradeLoading}
          onBack={() => navigate('/cashout')}
          onProceedToConfirm={(offer) => {
            navigate('/confirm', {
              state: {
                merchantId: offer.id,
                merchantName: offer.name,
                receiveMxn: offer.receiveMxn,
                commissionPct: offer.commissionPct,
                amountMxn: activeAmount,
                flow: 'cashout',
                nearbyCount: offer.nearbyCount,
              },
            });
          }}
          onSelectOffer={async (offerId) => {
            const ok = await handleOfferSelected(offerId);
            if (ok) navigate('/chat');
          }}
          creationError={tradeError?.message ?? null}
          creationErrorAction={tradeError?.action}
          onDismissCreationError={clearTradeError}
          onRetryCreationError={async () => {
            const ok = await retryTradeFlow();
            if (ok) navigate('/chat');
          }}
      />
  );
}

function ConfirmRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleOfferSelected, tradeLoading, tradeError, clearTradeError } = useAppCtx();
  const state = location.state as {
    merchantName: string;
    merchantId: string;
    receiveMxn: number;
    commissionPct: number;
    amountMxn: number;
    flow: 'cashout' | 'deposit';
    nearbyCount: number;
  } | null;

  if (!state?.merchantId) {
    return <Navigate to="/map" replace />;
  }

  return (
    <TradeConfirmationPage
      merchantName={state.merchantName}
      merchantId={state.merchantId}
      receiveMxn={state.receiveMxn}
      commissionPct={state.commissionPct}
      amountMxn={state.amountMxn}
      flow={state.flow ?? 'cashout'}
      nearbyCount={state.nearbyCount}
      loading={tradeLoading}
      errorMessage={tradeError?.message ?? null}
      onBack={() => navigate(-1)}
      onConfirm={async () => {
        const ok = await handleOfferSelected(state.merchantId);
        if (ok) navigate('/chat');
        return ok;
      }}
    />
  );
}

/** Counterparty display name and cash-out role for ChatRoom banners. */
function useTradeParticipantInfo(activeTrade: TradeData | null, sessionUser: UserData | null) {
  const [counterpartyName, setCounterpartyName] = useState<string | null>(null);
  const [isProvider, setIsProvider] = useState(false);

  useEffect(() => {
    if (!activeTrade || !sessionUser?.token) return;
    fetchTradeDetail(activeTrade.id, sessionUser.token)
      .then(({ trade, seller_username, buyer_username }) => {
        const isMeTheEscrowSeller = trade.seller_id === sessionUser.id;
        setCounterpartyName(isMeTheEscrowSeller ? buyer_username : seller_username);
        // Cash-out (/chat): the client locks crypto (escrow seller); the agent
        // hands over cash (escrow buyer). isProvider marks the agent view.
        setIsProvider(!isMeTheEscrowSeller);
      })
      .catch(() => {});
  }, [activeTrade, sessionUser?.token, sessionUser?.id]);

  return { counterpartyName, isProvider };
}

function ChatRoute() {
  const navigate = useNavigate();
  const { lockTxHash, activeTrade, sessionUser } = useAppCtx();
  const { counterpartyName, isProvider } = useTradeParticipantInfo(activeTrade, sessionUser);
  return (
      <ChatRoom
          tradeId={activeTrade?.id ?? ''}
          userId={sessionUser?.id ?? ''}
          token={sessionUser?.token}
          apiBaseUrl={import.meta.env.VITE_API_URL}
          lockTxHash={lockTxHash}
          counterpartyName={counterpartyName}
          isProvider={isProvider}
          onBack={() => navigate('/map')}
          onViewQR={() => navigate('/qr-reveal')}
      />
  );
}

function ChatDepositRoute() {
  const navigate = useNavigate();
  const { lockTxHash, activeTrade, sessionUser } = useAppCtx();
  const { counterpartyName } = useTradeParticipantInfo(activeTrade, sessionUser);
  return (
      <DepositChat
          tradeId={activeTrade?.id ?? ''}
          userId={sessionUser?.id ?? ''}
          token={sessionUser?.token}
          apiBaseUrl={import.meta.env.VITE_API_URL}
          lockTxHash={lockTxHash}
          counterpartyName={counterpartyName}
          onBack={() => navigate('/map-deposit')}
          onViewQR={() => navigate('/qr-deposit')}
      />
  );
}

function QRRevealRoute() {
  const navigate = useNavigate();
  const { activeTrade, sessionUser, activeAmount, setReleaseTxHash } = useAppCtx();
  const { counterpartyName } = useTradeParticipantInfo(activeTrade, sessionUser);

  return (
      <QRReveal
          activeTrade={activeTrade}
          token={sessionUser?.token ?? null}
          amount={activeAmount}
          counterpartyName={counterpartyName}
          ownName={sessionUser?.username ?? null}
          onBack={() => navigate('/chat')}
          onChat={() => navigate('/chat')}
          onSuccess={() => navigate('/success')}
      />
  );
}

function QRDepositRoute() {
  const navigate = useNavigate();
  const { activeTrade, sessionUser } = useAppCtx();
  return (
      <DepositQR
          activeTrade={activeTrade}
          buyerToken={sessionUser?.token ?? null}
          onBack={() => navigate('/chat-deposit')}
          onChat={() => navigate('/chat-deposit')}
          onSuccess={() => navigate('/success')}
      />
  );
}

function SuccessRoute() {
  const navigate = useNavigate();
  const { flow, activeTrade, lockTxHash, releaseTxHash, sessionUser, activeAmount, resetTradeFlow } = useAppCtx();
  const [tradeDetail, setTradeDetail] = useState<TradeHistoryItem | null>(null);
  const [sellerUsername, setSellerUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Block access if there is no real active trade
  useEffect(() => {
    if (!activeTrade) {
      navigate('/', { replace: true });
      return;
    }

    // Fetch real trade data from backend
    if (sessionUser?.token) {
      fetchTradeDetail(activeTrade.id, sessionUser.token)
        .then(({ trade, seller_username }) => {
          setTradeDetail({
            id: trade.id,
            status: trade.status,
            amount_mxn: trade.amount_mxn,
            platform_fee_mxn: trade.platform_fee_mxn ?? 0,
            lock_tx_hash: trade.lock_tx_hash ?? lockTxHash,
            release_tx_hash: trade.release_tx_hash ?? releaseTxHash,
            created_at: trade.created_at ?? new Date().toISOString(),
            completed_at: trade.completed_at ?? null,
            seller_id: trade.seller_id ?? '',
            buyer_id: trade.buyer_id ?? '',
            // CASH-1: prefer the canonical flow the backend persisted; fall
            // back to the UI flow only while the detail is still loading.
            flow: trade.flow ?? (flow ?? 'deposit'),
            provider_id: trade.provider_id ?? '',
          });
          setSellerUsername(seller_username);
        })
        .catch((e) => {
          console.warn('Could not fetch trade detail for receipt', e);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [activeTrade, sessionUser?.token, lockTxHash, releaseTxHash, navigate]);

  if (!activeTrade) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fondo">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Use fetched trade detail if available, otherwise build from context
  const trade: TradeHistoryItem & { completed_at: string | null } = tradeDetail ?? {
    id: activeTrade.id,
    status: activeTrade.status,
    amount_mxn: activeTrade.amount_mxn,
    platform_fee_mxn: 0,
    lock_tx_hash: lockTxHash,
    release_tx_hash: releaseTxHash,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    seller_id: '',
    buyer_id: '',
    flow: flow ?? 'deposit',
    provider_id: '',
  };

  return (
      <SuccessScreen
          type={flow === 'cashout' ? 'cashout' : 'deposit'}
          trade={{
            id: activeTrade?.id ?? 'demo',
            status: activeTrade?.status ?? 'completed',
            amount_mxn: activeAmount,
            platform_fee_mxn: flow === 'cashout' ? activeAmount * 0.01 : activeAmount * 0.008,
            lock_tx_hash: lockTxHash,
            release_tx_hash: null,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            // CASH-7: este recibo es el respaldo local que se pinta mientras
            // el detalle real no ha cargado. Con una sola sesion se ve que el
            // codigo anterior ponia el mismo id en los dos lados del escrow y
            // no decia nada. Lo honesto: la persona ocupa el lado que le toca
            // segun el flujo — vendedora en cash-out, compradora en deposito —
            // y la contraparte no se conoce aqui, asi que tampoco el proveedor.
            seller_id: flow === 'cashout' ? (sessionUser?.id ?? '') : '',
            buyer_id: flow === 'cashout' ? '' : (sessionUser?.id ?? ''),
            flow: flow ?? 'deposit',
            provider_id: '',
          }}
          agentName={sellerUsername ?? (flow === 'cashout' ? 'Farmacia Guadalupe' : 'Tienda Don Pepe')}
          onHome={() => {
            resetTradeFlow();
            navigate('/');
          }}
      />
  );
}

function ExploreRoute() {
  const navigate = useNavigate();
  const { isDemoMode, isMockStellar } = useAppCtx();
  const navMap: Record<string, string> = {
    home: "/",
    cashout: "/cashout",
    deposit: "/deposit",
    cetes: "/cetes",
    blend: "/blend",
    explore: "/explore",
    profile: "/profile",
    inbox: "/inbox",
    history: "/history",
  };
  return (
      <Explore
          onBack={() => navigate('/')}
          onNavigate={(page) => navigate(navMap[page] ?? '/')}
          // CETES buy/sell and Blend supply/borrow don't move real user funds yet
          // (platform-key-only simulation on mainnet, audit finding B2) — hidden
          // until a real user-signed implementation lands. Opt in with
          // VITE_ENABLE_DEFI_TRADING=true for internal/demo builds.
          // SPEI ramp (KYC + onramp + offramp) moves real funds (device keypair) —
          // enabled independently via VITE_ENABLE_SPEI_RAMP=true.
          showSpeiRamp={import.meta.env.VITE_ENABLE_SPEI_RAMP === 'true'}
          showDefi={import.meta.env.VITE_ENABLE_DEFI_TRADING === 'true'}
      />
  );
}

function CetesRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
      <CETESScreen
          onBack={() => navigate('/explore')}
          // "¿Sin cripto?" without approved KYC: KYC is the actual prerequisite
          // for the Etherfuse SPEI ramp (see canDepositSpei in CETESScreen), not
          // the P2P cash-agent flow at /deposit — that CTA used to send users
          // there by mistake.
          onBanco={() => navigate('/kyc')}
          userToken={sessionUser?.token}
          showDefi={import.meta.env.VITE_ENABLE_DEFI_TRADING === 'true'}
          showSpeiRamp={import.meta.env.VITE_ENABLE_SPEI_RAMP === 'true'}
      />
  );
}

export function KYCRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
      <KYCScreen
          token={sessionUser?.token ?? null}
          onApproved={() => {
            navigate('/cetes');
          }}
      />
  );
}

function KYCApprovedNextRoute() {
  const navigate = useNavigate();
  // After approved, continue to CETES + deposit flow.
  useEffect(() => {
    navigate('/cetes');
  }, [navigate]);
  return null;
}


function BlendRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
      <BlendScreen
          onBack={() => navigate('/explore')}
          userToken={sessionUser?.token}
      />
  );
}

function ProfileRoute() {
  const navigate = useNavigate();
  // devicePublicKey must be destructured here — referencing it from outer
  // scope would silently be undefined inside this component
  const { sessionUser, handleAccountDeleted, devicePublicKey } = useAppCtx();
  return (
      <Profile
          token={sessionUser?.token ?? null}
          username={sessionUser?.username ?? null}
          devicePublicKey={devicePublicKey}
          onBack={() => navigate('/')}
          onDeleted={() => {
            handleAccountDeleted();
            navigate('/');
          }}
          onLogout={() => {
            handleAccountDeleted();
            navigate('/login');
          }}
          onNavigatePrivacy={() => navigate('/privacy')}
          onNavigateTerms={() => navigate('/terms')}
      />
  );
}

function MerchantSettingsRoute() {
  const navigate = useNavigate();
  const { sessionUser } = useAppCtx();
  return (
    <MerchantSettings
      token={sessionUser?.token ?? null}
      onBack={() => navigate('/')}
    />
  );
}

function PrivacyRoute() {
  const navigate = useNavigate();
  return <Privacy onBack={() => navigate("/profile")} />;
}

function TermsRoute() {
  const navigate = useNavigate();
  return <Terms onBack={() => navigate("/profile")} />;
}

function SignatureApprovalRoute() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const location = useLocation();
  const { sessionUser } = useAppCtx();
  const searchParams = new URLSearchParams(location.search);
  const requestId = id || searchParams.get('id') || undefined;

  return (
    <SignatureApproval
      requestId={requestId}
      token={sessionUser?.token}
      onBack={() => navigate('/')}
      onResolved={() => {
        setTimeout(() => navigate('/'), 2000);
      }}
    />
  );
}

// ── Route wrappers (auth) ───────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { sessionUser } = useAppCtx();
  const location = useLocation();

  if (!sessionUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// ── BottomNav route adapter ──────────────────────────────────────────────────

const ROUTE_TO_PAGE: Record<string, string> = {
  "/": "home",
  "/pay": "pay",
  "/inbox": "inbox",
  "/explore": "explore",
  "/cetes": "cetes",
  "/profile": "profile",
};

const HIDE_BOTTOMNAV_ROUTES = new Set([
  "/login",
  "/register",
  "/merchant-settings",
  "/confirm",
  "/chat",
  "/chat-deposit",
  "/qr-reveal",
  "/qr-deposit",
  "/success",
  "/cashout",
  "/pay/send",
  "/pay/receive",
  "/blend",
  "/privacy",
  "/terms",
  "/sign-request",
]);

// Claim and sign-request screens also hide the bottom nav (standalone deep-link UI).
const HIDE_BOTTOMNAV_PREFIX = ['/claim/', '/sign-request/'];

function BottomNavAdapter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionUser } = useAppCtx();

  if (HIDE_BOTTOMNAV_ROUTES.has(location.pathname)) return null;

  const navMap: Record<string, string> = {
    home: "/",
    pay: "/pay",
    inbox: "/inbox",
    explore: "/explore",
    cetes: "/cetes",
    profile: "/profile",
  };

  return (
      <BottomNav
          currentPage={ROUTE_TO_PAGE[location.pathname] ?? location.pathname.slice(1)}
          onNavigate={(page) => navigate(navMap[page] ?? '/')}
          // CASH-7: la barra ya no infiere "es proveedora" de que exista
          // sesion. El nombre del prop es neutral y hoy se alimenta de la
          // sesion para NO cambiar la navegacion actual; RED-2 lo atara al
          // estado de inscripcion real en Red MicoPay.
          showProviderTab={!!sessionUser}
      />
  );
}

// ── Connection banner host ───────────────────────────────────────────────────
// Tracks browser/WebView online-offline state directly (navigator.onLine +
// the online/offline events) — deliberately independent of the merchant
// offline-mutation queue (services/offlineQueue*.ts), which is a different,
// narrower concern (queueing merchant config writes) than "is this device
// connected to the internet at all".
function ConnectionBannerHost() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return <ConnectionBanner isVisible={!isOnline} message="Sin conexión a internet" />;
}

// ── Root App ─────────────────────────────────────────────────────────────────

function App() {
  const [flow, setFlow] = useState<Flow>(null);
  const [sessionUser, setSessionUser] = useState<UserData | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeData | null>(null);
  const [lockTxHash, setLockTxHash] = useState<string | null>(null);
  const [releaseTxHash, setReleaseTxHash] = useState<string | null>(null);
  const [activeAmount, setActiveAmount] = useState(500);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<MappedApiError | null>(null);
  const [pendingSellerId, setPendingSellerId] = useState<string | null>(null);
  // CASH-1 (#372): the retried value is the product flow, not the escrow role.
  const [pendingFlow, setPendingFlow] = useState<TradeFlow>('deposit');
  const [authReady, setAuthReady] = useState(false);
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);

  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [pendingTradeContext, setPendingTradeContext] = useState<{ resolve: (val: boolean) => void, execute: () => Promise<boolean> } | null>(null);
  const [backupSecret, setBackupSecret] = useState<string>('');
  const [copiedBackup, setCopiedBackup] = useState(false);

  const [startupError, setStartupError] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [isMockStellar, setIsMockStellar] = useState(true);
  const [backendUrl, setBackendUrl] = useState("");
  const envName = import.meta.env.MODE;
  /** Modos que operan contra dinero real: nunca deben caer a mocks. */
  const STRICT_STARTUP_MODES = new Set(['production', 'mainnet']);

  useEffect(() => {
    const initUsers = async () => {
      // 1. Validate VITE_API_URL existence
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        setStartupError({
          title: "Configuración de API Faltante",
          message: "La variable de entorno VITE_API_URL no está configurada.",
          details: "El APK requiere VITE_API_URL para ubicar el backend. Asegúrate de configurar un archivo .env válido (ej. .env.testnet)."
        });
        setAuthReady(true);
        return;
      }

      setBackendUrl(apiUrl);

      // 2. Fetch backend health and validate contract config
      let connected = false;
      let mockStellarActive = true;
      try {
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        const health = await response.json();
        connected = true;
        setBackendConnected(true);
        setBackendHealth(health);
        
        mockStellarActive = health.mockStellar ?? false;
        setIsMockStellar(mockStellarActive);
        
        // If running in normal (non-mock) mode, verify critical configs
        if (!mockStellarActive) {
          const configCheck = health.configCheck ?? {};
          if (!configCheck.hasPlatformKey || !configCheck.hasContractId) {
            setStartupError({
              title: "Configuración del Contrato Incompleta",
              message: "El servidor de Micopay está en modo real (normal), pero le faltan configuraciones críticas de Stellar o contratos.",
              details: "Verifica que el backend tenga PLATFORM_SECRET_KEY y ESCROW_CONTRACT_ID configuradas y válidas."
            });
            setAuthReady(true);
            return;
          }
          setIsDemoMode(false);
        } else {
          setIsDemoMode(true);
        }
      } catch (err) {
        console.warn("Backend not reachable during startup:", err);
        setBackendConnected(false);
        
        // Bloquear si el backend está caído. `build:mainnet` compila con
        // --mode mainnet, así que MODE es 'mainnet', no 'production': sin
        // incluirlo, el APK de mainnet caía a mocks en silencio
        // (docs/AUDIT_MOBILE_MAINNET.md §3).
        if (STRICT_STARTUP_MODES.has(envName)) {
          setStartupError({
            title: "Servidor Inalcanzable",
            message: "No se pudo conectar al servidor de Micopay.",
            details: `La aplicación está en modo producción e intenta conectar a: ${apiUrl}. Por favor verifica tu conexión a internet o el estado del servidor.`
          });
          setAuthReady(true);
          return;
        } else {
          // Dev/Testnet builds fallback gracefully to local demo mocks if offline
          setIsDemoMode(true);
          setIsMockStellar(true);
        }
      }

      // 3. Authenticate and register user
      try {
        // Always load the keypair first — registerUser reads it to get the
        // Stellar address, so this must happen before any registerUser call.
        if (!await keypairExists()) {
          await generateAndStoreKeypair();
        }
        const pubKey = await getPublicKey();
        setDevicePublicKey(pubKey);

        const stored = await readJSON<UserData>(USERS_STORAGE_KEY);
        if (stored?.id && stored.token) {
          // Validate the stored session; self-heal if the backend no longer
          // knows this user (e.g. its DB was recreated → orphaned token → 401).
          try {
            const profile = await getCurrentUser(stored.token);
            // Self-heal stale sessions cached with the wrong id (older builds
            // stored the username as `id` instead of the real backend user id).
            const fresh: UserData = { id: profile.id, username: profile.username, token: stored.token };
            if (fresh.id !== stored.id) await writeJSON(USERS_STORAGE_KEY, fresh);
            setSessionUser(fresh);
            return;
          } catch (err: any) {
            const status = err?.response?.status;
            if (status !== 401 && status !== 403) {
              // Transient/network error — keep the cached session optimistically.
              setSessionUser(stored);
              return;
            }
            try {
              const recovered = await recoverSession(stored.username);
              await writeJSON(USERS_STORAGE_KEY, recovered);
              setSessionUser(recovered);
              return;
            } catch (re) {
              console.warn("Session recovery failed; clearing stale session", re);
              await removeKey(USERS_STORAGE_KEY);
              // fall through → empty session → ProtectedRoute redirects to login
            }
          }
        }

        // Demo builds auto-provision one throwaway user. In real mode we
        // leave the session empty so ProtectedRoute redirects to login/register.
        if (import.meta.env.VITE_DEMO_MODE === 'true') {
          const ts = Date.now() % 100000;
          const user = await registerUser(`demo_${ts}`);
          await writeJSON(USERS_STORAGE_KEY, user);
          setSessionUser(user);
        }
      } catch (e) {
        console.warn("Backend unavailable for registration, using local stub", e);
      } finally {
        setAuthReady(true);
      }
    };

    initUsers();
  }, []);

  const handleLoginSuccess = (user: UserData) => {
    setSessionUser(user);
    writeJSON(USERS_STORAGE_KEY, user);
  };

  const handleAccountDeleted = () => {
    setSessionUser(null);
    setActiveTrade(null);
    setLockTxHash(null);
    setReleaseTxHash(null);
    setFlow(null);
    void removeKey(USERS_STORAGE_KEY);
  };

  const resetTradeFlow = () => {
    setFlow(null);
    setActiveTrade(null);
    setLockTxHash(null);
    setReleaseTxHash(null);
  };

  const clearTradeError = () => setTradeError(null);

  const runTradeFlow = async (counterpartyId: string, tradeFlow: TradeFlow = 'deposit'): Promise<boolean> => {
    if (!sessionUser) return false;
    setPendingSellerId(counterpartyId);
    setPendingFlow(tradeFlow);
    setTradeLoading(true);
    setTradeError(null);
    try {
      const trade = await createTrade(counterpartyId, activeAmount, sessionUser.token, tradeFlow);
      setActiveTrade(trade);
      return true;
    } catch (e) {
      const mapped = mapApiError(e);
      setTradeError(mapped);
      if (IS_DEMO_MODE) {
        setActiveTrade({
          id: `demo-${Date.now()}`,
          status: 'locked',
          secret_hash: 'demo',
          amount_mxn: activeAmount,
          lock_tx_hash: 'mock_lock_hash',
        });
        setLockTxHash('mock_lock_hash');
        return true;
      }
      return false;
    } finally {
      setTradeLoading(false);
    }
  };

  const retryTradeFlow = async (): Promise<boolean> => {
    if (!pendingSellerId) return false;
    return runTradeFlow(pendingSellerId, pendingFlow);
  };

  const checkBackupGate = async (execute: () => Promise<boolean>): Promise<boolean> => {
    const confirmed = await isBackupConfirmed();
    if (confirmed) {
      return execute();
    }
    return new Promise<boolean>((resolve) => {
      setPendingTradeContext({ resolve, execute });
      setShowBackupPrompt(true);
    });
  };

  // Cashout ("convert crypto to cash"): the caller gives up crypto. CASH-1 —
  // we now send the product flow and let the backend derive the escrow roles
  // (caller as seller, since only sellers can lock funds and reveal the HTLC
  // secret) and the Red MicoPay provider from it.
  const handleOfferSelected = async (offerId: string) => checkBackupGate(() => runTradeFlow(offerId, 'cashout'));

  // Deposit ("buy crypto with cash"): the caller receives crypto and the
  // merchant locks funds as escrow seller. Same behaviour as before.
  const handleDepositOfferSelected = async (offerId: string) => checkBackupGate(() => runTradeFlow(offerId, 'deposit'));

  useEffect(() => {
    if (showBackupPrompt) {
      exportSecretKey().then(setBackupSecret).catch(console.error);
    }
  }, [showBackupPrompt]);

  const handleCopyBackup = async () => {
    navigator.clipboard.writeText(backupSecret);
    setCopiedBackup(true);
    await setBackupConfirmed();
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  const handleConfirmBackup = () => {
    setShowBackupPrompt(false);
    if (pendingTradeContext) {
      pendingTradeContext.execute().then(pendingTradeContext.resolve);
      setPendingTradeContext(null);
    }
  };

  const handleCancelBackup = () => {
    setShowBackupPrompt(false);
    if (pendingTradeContext) {
      pendingTradeContext.resolve(false);
      setPendingTradeContext(null);
    }
  };

  const ctx: AppCtx = {
    sessionUser,
    activeTrade,
    lockTxHash,
    releaseTxHash,
    activeAmount,
    tradeLoading,
    tradeError,
    flow,
    devicePublicKey,
    setActiveAmount,
    setFlow,
    setReleaseTxHash,
    handleOfferSelected,
    handleDepositOfferSelected,
    clearTradeError,
    retryTradeFlow,
    handleAccountDeleted,
    resetTradeFlow,
    envName,
    backendUrl,
    isDemoMode,
    isMockStellar,
    backendConnected,
    backendHealth,
  };

  if (startupError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F8] px-6 py-12">
        <div className="max-w-md w-full bg-papel rounded-sm p-8 border border-red-100 animate-fade-in font-['Manrope']">
          <div className="flex items-center justify-center w-16 h-16 rounded-sm bg-red-50 text-red-500 mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">warning</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
            {startupError.title}
          </h1>
          <p className="text-gray-600 text-center mb-6 text-xs leading-relaxed">
            {startupError.message}
          </p>
          {startupError.details && (
            <div className="bg-gray-50 rounded-sm p-4 border border-gray-100 mb-6">
              <p className="text-[10px] text-gray-500 font-mono break-words leading-normal">
                {startupError.details}
              </p>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-papel rounded-sm font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-fondo">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
  }

  return (
      <ErrorBoundary>
        <AppContext.Provider value={ctx}>
          <HashRouter>
            <div className="flex flex-col min-h-screen bg-fondo">
              <ConnectionBannerHost />
              {/* Se oculta solo cuando hay conexión y no hay nada pendiente. */}
              <OfflineQueueStatus token={sessionUser?.token ?? null} />
              <Routes>
                <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
                <Route path="/register" element={<Register onLoginSuccess={handleLoginSuccess} />} />
                <Route path="/" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><HistoryRoute /></ProtectedRoute>} />
                <Route path="/trade/:id" element={<ProtectedRoute><TradeDetailRoute /></ProtectedRoute>} />
                <Route path="/merchant-settings" element={<ProtectedRoute><MerchantSettingsRoute /></ProtectedRoute>} />
                <Route path="/inbox" element={<ProtectedRoute><InboxRoute /></ProtectedRoute>} />
                <Route path="/cashout" element={<ProtectedRoute><CashoutRoute /></ProtectedRoute>} />
                <Route path="/pay" element={<ProtectedRoute><PayHubRoute /></ProtectedRoute>} />
                <Route path="/pay/send" element={<ProtectedRoute><SendPaymentRoute /></ProtectedRoute>} />
                <Route path="/pay/receive" element={<ProtectedRoute><ReceivePaymentRoute /></ProtectedRoute>} />
                <Route path="/deposit" element={<ProtectedRoute><DepositRoute /></ProtectedRoute>} />
                <Route path="/map" element={<ProtectedRoute><MapRoute /></ProtectedRoute>} />
                <Route path="/confirm" element={<ProtectedRoute><ConfirmRoute /></ProtectedRoute>} />
                <Route path="/map-deposit" element={<ProtectedRoute><MapDepositRoute /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><ChatRoute /></ProtectedRoute>} />
                <Route path="/chat-deposit" element={<ProtectedRoute><ChatDepositRoute /></ProtectedRoute>} />
                <Route path="/qr-reveal" element={<ProtectedRoute><QRRevealRoute /></ProtectedRoute>} />
                <Route path="/qr-deposit" element={<ProtectedRoute><QRDepositRoute /></ProtectedRoute>} />
                <Route path="/success" element={<ProtectedRoute><SuccessRoute /></ProtectedRoute>} />
                <Route path="/explore" element={<ProtectedRoute><ExploreRoute /></ProtectedRoute>} />
                <Route path="/cetes" element={<ProtectedRoute><CetesRoute /></ProtectedRoute>} />
                <Route path="/kyc" element={<ProtectedRoute><KYCRoute /></ProtectedRoute>} />
                <Route path="/kyc-approved" element={<ProtectedRoute><KYCApprovedNextRoute /></ProtectedRoute>} />

                <Route path="/blend" element={<ProtectedRoute><BlendRoute /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfileRoute /></ProtectedRoute>} />
                <Route path="/privacy" element={<ProtectedRoute><PrivacyRoute /></ProtectedRoute>} />
                <Route path="/terms" element={<ProtectedRoute><TermsRoute /></ProtectedRoute>} />
                <Route path="/sign-request" element={<ProtectedRoute><SignatureApprovalRoute /></ProtectedRoute>} />
                <Route path="/sign-request/:id" element={<ProtectedRoute><SignatureApprovalRoute /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <BottomNavAdapter />

              {showBackupPrompt && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 animate-fade-in">
                  <div className="bg-papel rounded-sm w-full max-w-sm p-6 relative overflow-hidden">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-red-50 rounded-sm flex items-center justify-center mx-auto mb-4 text-red-500">
                        <span className="material-symbols-outlined text-3xl">shield_lock</span>
                      </div>
                      <h2 className="text-xl font-extrabold text-tinta">Respaldo Requerido</h2>
                      <p className="text-sm text-gris mt-2">Antes de iniciar una operación con fondos, debes respaldar tu llave secreta. Sin ella, podrías perder tus fondos.</p>
                    </div>

                    <div className="bg-red-50 border border-red-100 rounded-sm p-4 mb-6">
                      <label className="block text-xs font-bold text-red-800 uppercase tracking-wider mb-2">
                        Tu Llave Secreta
                      </label>
                      <button
                        onClick={handleCopyBackup}
                        className="w-full bg-red-100 hover:bg-red-200 text-red-800 font-bold py-3 rounded-sm flex items-center justify-center gap-2 transition-all active:translate-x-[2px] active:translate-y-[2px]"
                      >
                        <span className="material-symbols-outlined text-base">{copiedBackup ? 'check' : 'content_copy'}</span>
                        {copiedBackup ? '¡Copiada!' : 'Copiar Llave Secreta'}
                      </button>
                      <p className="text-[10px] text-red-600 mt-3 text-center leading-relaxed font-medium">NUNCA la compartas. Quien la tenga controla tus fondos.</p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelBackup}
                        className="flex-1 py-3 text-gris font-bold rounded-sm bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmBackup}
                        className="flex-1 py-3 text-papel font-bold rounded-sm bg-verde hover:bg-[#005740] transition-colors"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </HashRouter>
        </AppContext.Provider>
      </ErrorBoundary>
  );
}

export default App;