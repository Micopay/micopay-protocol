import { useState, useEffect, createContext, useContext } from "react";
import { generateAndStoreKeypair, keypairExists, getPublicKey } from './lib/keystore';
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
import MerchantInbox from "./pages/MerchantInbox";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Profile from "./pages/Profile";
import ClaimQR from "./pages/ClaimQR";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MerchantSettings from "./pages/MerchantSettings";
import BottomNav from "./components/BottomNav";
import DebugOverlay from "./components/DebugOverlay";

import {
  registerUser,
  createTrade,
  fetchTradeDetail,
  UserData,
  TradeData,
  TradeHistoryItem,
} from "./services/api";
import { readJSON, writeJSON, removeKey } from "./services/secureStorage";
import { mapApiError, type MappedApiError } from "./utils/apiError";
import { IS_DEMO_MODE } from "./utils/demoMode";

const USERS_STORAGE_KEY = "micopay_user";


type Flow = "cashout" | "deposit" | null;

interface AppCtx {
  buyerUser: UserData | null;
  sellerUser: UserData | null;
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
  setDebugOpen: (b: boolean) => void;
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
  const { buyerUser, sellerUser, setFlow } = useAppCtx();
  return (
      <Home
          onNavigateCashout={() => { setFlow('cashout'); navigate('/cashout'); }}
          onNavigateDeposit={() => { setFlow('deposit'); navigate('/deposit'); }}
          onNavigateHistory={() => navigate('/history')}
          token={buyerUser?.token ?? null}
          merchantToken={sellerUser?.token ?? null}
          onNavigateInbox={() => navigate('/inbox')}
      />
  );
}

function HistoryRoute() {
  const navigate = useNavigate();
  const { buyerUser } = useAppCtx();
  return (
      <History
          onBack={() => navigate('/')}
          onSelectTrade={(trade) => navigate(`/trade/${trade.id}`)}
          token={buyerUser?.token ?? null}
      />
  );
}

function TradeDetailRoute() {
  const navigate = useNavigate();
  const { buyerUser, sellerUser } = useAppCtx();
  return (
    <TradeDetail
      buyerToken={buyerUser?.token ?? null}
      sellerToken={sellerUser?.token ?? null}
      onBack={() => navigate('/history')}
    />
  );
}

function InboxRoute() {
  const navigate = useNavigate();
  const { sellerUser } = useAppCtx();
  return (
      <MerchantInbox
          token={sellerUser?.token ?? null}
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

function ChatRoute() {
  const navigate = useNavigate();
  const { lockTxHash, activeTrade, buyerUser } = useAppCtx();
  return (
      <ChatRoom
          tradeId={activeTrade?.id ?? ''}
          userId={buyerUser?.id ?? ''}
          lockTxHash={lockTxHash}
          onBack={() => navigate('/map')}
          onViewQR={() => navigate('/qr-reveal')}
      />
  );
}

function ChatDepositRoute() {
  const navigate = useNavigate();
  const { lockTxHash, activeTrade, buyerUser } = useAppCtx();
  return (
      <DepositChat
          tradeId={activeTrade?.id ?? ''}
          userId={buyerUser?.id ?? ''}
          lockTxHash={lockTxHash}
          onBack={() => navigate('/map-deposit')}
          onViewQR={() => navigate('/qr-deposit')}
      />
  );
}

function QRRevealRoute() {
  const navigate = useNavigate();
  const { activeTrade, sellerUser, buyerUser, activeAmount, setReleaseTxHash } = useAppCtx();
  return (
      <QRReveal
          activeTrade={activeTrade}
          sellerToken={sellerUser?.token ?? null}
          buyerToken={buyerUser?.token ?? null}
          amount={activeAmount}
          onBack={() => navigate('/chat')}
          onChat={() => navigate('/chat')}
          onSuccess={() => navigate('/success')}
      />
  );
}

function QRDepositRoute() {
  const navigate = useNavigate();
  const { activeTrade, buyerUser } = useAppCtx();
  return (
      <DepositQR
          activeTrade={activeTrade}
          buyerToken={buyerUser?.token ?? null}
          onBack={() => navigate('/chat-deposit')}
          onChat={() => navigate('/chat-deposit')}
          onSuccess={() => navigate('/success')}
      />
  );
}

function SuccessRoute() {
  const navigate = useNavigate();
  const { flow, activeTrade, lockTxHash, releaseTxHash, buyerUser, sellerUser, activeAmount, resetTradeFlow } = useAppCtx();
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
    if (buyerUser?.token) {
      fetchTradeDetail(activeTrade.id, buyerUser.token)
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
  }, [activeTrade, buyerUser?.token, lockTxHash, releaseTxHash, navigate]);

  if (!activeTrade) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4FAFF]">
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
            seller_id: sellerUser?.id ?? '',
            buyer_id: buyerUser?.id ?? '',
          }}
          agentName={flow === 'cashout' ? 'Farmacia Guadalupe' : 'Tienda Don Pepe'}
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
          showDefi={!isDemoMode || !isMockStellar}
      />
  );
}

function CetesRoute() {
  const navigate = useNavigate();
  const { buyerUser } = useAppCtx();
  return (
      <CETESScreen
          onBack={() => navigate('/explore')}
          onBanco={() => navigate('/deposit')}
          userToken={buyerUser?.token}
      />
  );
}

function BlendRoute() {
  const navigate = useNavigate();
  const { buyerUser } = useAppCtx();
  return (
      <BlendScreen
          onBack={() => navigate('/explore')}
          userToken={buyerUser?.token}
      />
  );
}

function ProfileRoute() {
  const navigate = useNavigate();
  // devicePublicKey must be destructured here — referencing it from outer
  // scope would silently be undefined inside this component
  const { buyerUser, handleAccountDeleted, devicePublicKey } = useAppCtx();
  return (
      <Profile
          token={buyerUser?.token ?? null}
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
  const { sellerUser } = useAppCtx();
  return (
    <MerchantSettings
      token={sellerUser?.token ?? null}
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

// ── Route wrappers (auth) ───────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { buyerUser } = useAppCtx();
  const location = useLocation();

  if (!buyerUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// ── BottomNav route adapter ──────────────────────────────────────────────────

const ROUTE_TO_PAGE: Record<string, string> = {
  "/": "home",
  "/cashout": "cashout",
  "/inbox": "inbox",
  "/explore": "explore",
  "/profile": "profile",
};

const HIDE_BOTTOMNAV_ROUTES = new Set([
  "/login",
  "/register",
  "/merchant-settings",
  "/chat",
  "/chat-deposit",
  "/qr-reveal",
  "/qr-deposit",
  "/success",
  "/cetes",
  "/blend",
  "/privacy",
  "/terms",
]);

// Claim screens also hide the bottom nav (standalone deep-link UI).
const HIDE_BOTTOMNAV_PREFIX = ['/claim/'];

function BottomNavAdapter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sellerUser } = useAppCtx();

  if (HIDE_BOTTOMNAV_ROUTES.has(location.pathname)) return null;
  if (HIDE_BOTTOMNAV_PREFIX.some((p) => location.pathname.startsWith(p))) return null;

  const navMap: Record<string, string> = {
    home: "/",
    cashout: "/cashout",
    inbox: "/inbox",
    explore: "/explore",
    profile: "/profile",
  };

  return (
      <BottomNav
          currentPage={ROUTE_TO_PAGE[location.pathname] ?? location.pathname.slice(1)}
          onNavigate={(page) => navigate(navMap[page] ?? '/')}
          isMerchant={!!sellerUser}
      />
  );
}

// ── Root App ─────────────────────────────────────────────────────────────────

function App() {
  const [flow, setFlow] = useState<Flow>(null);
  const [buyerUser, setBuyerUser] = useState<UserData | null>(null);
  const [sellerUser, setSellerUser] = useState<UserData | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeData | null>(null);
  const [lockTxHash, setLockTxHash] = useState<string | null>(null);
  const [releaseTxHash, setReleaseTxHash] = useState<string | null>(null);
  const [activeAmount, setActiveAmount] = useState(500);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<MappedApiError | null>(null);
  const [pendingSellerId, setPendingSellerId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);

  const [startupError, setStartupError] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [isMockStellar, setIsMockStellar] = useState(true);
  const [backendUrl, setBackendUrl] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const envName = import.meta.env.MODE;

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
        
        // In production, force-block if backend is down.
        if (envName === 'production') {
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
        if (stored?.id) {
          setBuyerUser(stored);
          setSellerUser(stored);
          return;
        }

        // Demo builds auto-provision one throwaway user. In real mode we
        // leave the session empty so ProtectedRoute redirects to login/register.
        if (import.meta.env.VITE_DEMO_MODE === 'true') {
          const ts = Date.now() % 100000;
          const user = await registerUser(`demo_${ts}`);
          await writeJSON(USERS_STORAGE_KEY, user);
          setBuyerUser(user);
          setSellerUser(user);
        }
      } catch (e) {
        console.warn("Backend unavailable for registration, using local stub", e);
      } finally {
        setAuthReady(true);
      }
    };

    initUsers();
  }, []);

  const handleLoginSuccess = (user: UserData, _seller: UserData | null = null) => {
    setBuyerUser(user);
    setSellerUser(user);
    writeJSON(USERS_STORAGE_KEY, user);
  };

  const handleAccountDeleted = () => {
    setBuyerUser(null);
    setSellerUser(null);
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

  const runTradeFlow = async (sellerId: string): Promise<boolean> => {
    if (!buyerUser) return false;
    setPendingSellerId(sellerId);
    setTradeLoading(true);
    setTradeError(null);
    try {
      const trade = await createTrade(sellerId, activeAmount, buyerUser.token);
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
    return runTradeFlow(pendingSellerId);
  };

  const handleOfferSelected = async (offerId: string) => runTradeFlow(offerId);

  const handleDepositOfferSelected = async (offerId: string) => runTradeFlow(offerId);

  const ctx: AppCtx = {
    buyerUser,
    sellerUser,
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
    setDebugOpen,
  };

  if (startupError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFF8F8] px-6 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100 animate-fade-in font-['Manrope']">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-50 text-red-500 mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">warning</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
            {startupError.title}
          </h1>
          <p className="text-gray-600 text-center mb-6 text-xs leading-relaxed">
            {startupError.message}
          </p>
          {startupError.details && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6">
              <p className="text-[10px] text-gray-500 font-mono break-words leading-normal">
                {startupError.details}
              </p>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold text-xs transition-all duration-200 shadow-md flex items-center justify-center gap-2"
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
        <div className="min-h-screen flex items-center justify-center bg-[#F4FAFF]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
  }

  return (
      <ErrorBoundary>
        <AppContext.Provider value={ctx}>
          <HashRouter>
            <div className="flex flex-col min-h-screen bg-[#F4FAFF]">
              <Routes>
                <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
                <Route path="/register" element={<Register />} />
                <Route path="/" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><HistoryRoute /></ProtectedRoute>} />
                <Route path="/trade/:id" element={<ProtectedRoute><TradeDetailRoute /></ProtectedRoute>} />
                <Route path="/merchant-settings" element={<ProtectedRoute><MerchantSettingsRoute /></ProtectedRoute>} />
                <Route path="/inbox" element={<ProtectedRoute><InboxRoute /></ProtectedRoute>} />
                <Route path="/cashout" element={<ProtectedRoute><CashoutRoute /></ProtectedRoute>} />
                <Route path="/deposit" element={<ProtectedRoute><DepositRoute /></ProtectedRoute>} />
                <Route path="/map" element={<ProtectedRoute><MapRoute /></ProtectedRoute>} />
                <Route path="/map-deposit" element={<ProtectedRoute><MapDepositRoute /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><ChatRoute /></ProtectedRoute>} />
                <Route path="/chat-deposit" element={<ProtectedRoute><ChatDepositRoute /></ProtectedRoute>} />
                <Route path="/qr-reveal" element={<ProtectedRoute><QRRevealRoute /></ProtectedRoute>} />
                <Route path="/qr-deposit" element={<ProtectedRoute><QRDepositRoute /></ProtectedRoute>} />
                <Route path="/success" element={<ProtectedRoute><SuccessRoute /></ProtectedRoute>} />
                <Route path="/explore" element={<ProtectedRoute><ExploreRoute /></ProtectedRoute>} />
                <Route path="/cetes" element={<ProtectedRoute><CetesRoute /></ProtectedRoute>} />
                <Route path="/blend" element={<ProtectedRoute><BlendRoute /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfileRoute /></ProtectedRoute>} />
                <Route path="/privacy" element={<ProtectedRoute><PrivacyRoute /></ProtectedRoute>} />
                <Route path="/terms" element={<ProtectedRoute><TermsRoute /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <BottomNavAdapter />
            </div>
          </HashRouter>
        </AppContext.Provider>
      </ErrorBoundary>
  );
}

export default App;