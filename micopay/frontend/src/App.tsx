import { useState, useEffect, createContext, useContext } from "react";
import { generateAndStoreKeypair, keypairExists, getPublicKey } from './lib/keystore';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
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
import CETESScreen from "./pages/CETESScreen";
import BlendScreen from "./pages/BlendScreen";
import MerchantInbox from "./pages/MerchantInbox";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Profile from "./pages/Profile";
import BottomNav from "./components/BottomNav";

import {
  registerUser,
  createTrade,
  lockTrade,
  revealTrade,
  UserData,
  TradeData,
} from "./services/api";
import { readJSON, writeJSON, removeKey } from "./services/secureStorage";

const USERS_STORAGE_KEY = "micopay_users";

interface StoredUsers { buyer: UserData; seller: UserData }

interface AppProps {
  initialTradeId?: string | null;
}

type Flow = 'cashout' | 'deposit' | null;

interface AppCtx {
  buyerUser: UserData | null;
  sellerUser: UserData | null;
  activeTrade: TradeData | null;
  lockTxHash: string | null;
  activeAmount: number;
  tradeLoading: boolean;
  flow: Flow;
  devicePublicKey: string | null;
  setActiveAmount: (n: number) => void;
  setFlow: (f: Flow) => void;
  handleOfferSelected: (offerId: string) => Promise<void>;
  handleDepositOfferSelected: (offerId: string) => Promise<void>;
  handleAccountDeleted: () => void;
  resetTradeFlow: () => void;
}

const AppContext = createContext<AppCtx | null>(null);

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
          onSelectTrade={() => {}}
          token={buyerUser?.token ?? null}
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
  const { handleDepositOfferSelected, tradeLoading } = useAppCtx();
  return (
      <DepositMap
          onBack={() => navigate('/deposit')}
          onSelectOffer={async (offerId) => {
            await handleDepositOfferSelected(offerId);
            navigate('/chat-deposit');
          }}
          loading={tradeLoading}
      />
  );
}

function MapRoute() {
  const navigate = useNavigate();
  const { activeAmount, handleOfferSelected, tradeLoading } = useAppCtx();
  return (
      <ExploreMap
          amount={activeAmount}
          loading={tradeLoading}
          onBack={() => navigate('/cashout')}
          onSelectOffer={async (offerId) => {
            await handleOfferSelected(offerId);
            navigate('/chat');
          }}
      />
  );
}

function ChatRoute() {
  const navigate = useNavigate();
  const { lockTxHash } = useAppCtx();
  return (
      <ChatRoom
          lockTxHash={lockTxHash}
          onBack={() => navigate('/map')}
          onViewQR={() => navigate('/qr-reveal')}
      />
  );
}

function ChatDepositRoute() {
  const navigate = useNavigate();
  const { lockTxHash } = useAppCtx();
  return (
      <DepositChat
          lockTxHash={lockTxHash}
          onBack={() => navigate('/map-deposit')}
          onViewQR={() => navigate('/qr-deposit')}
      />
  );
}

function QRRevealRoute() {
  const navigate = useNavigate();
  const { activeTrade, sellerUser, buyerUser, activeAmount } = useAppCtx();
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
  return (
      <DepositQR
          onBack={() => navigate('/chat-deposit')}
          onChat={() => navigate('/chat-deposit')}
          onSuccess={() => navigate('/success')}
      />
  );
}

function SuccessRoute() {
  const navigate = useNavigate();
  const { flow, activeAmount, activeTrade, lockTxHash, sellerUser, buyerUser, resetTradeFlow } = useAppCtx();
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
  const navMap: Record<string, string> = {
    home: '/',
    cashout: '/cashout',
    deposit: '/deposit',
    cetes: '/cetes',
    blend: '/blend',
    explore: '/explore',
    profile: '/profile',
    inbox: '/inbox',
    history: '/history',
  };
  return (
      <Explore
          onBack={() => navigate('/')}
          onNavigate={(page) => navigate(navMap[page] ?? '/')}
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
          onNavigatePrivacy={() => navigate('/privacy')}
          onNavigateTerms={() => navigate('/terms')}
      />
  );
}

function PrivacyRoute() {
  const navigate = useNavigate();
  return <Privacy onBack={() => navigate('/profile')} />;
}

function TermsRoute() {
  const navigate = useNavigate();
  return <Terms onBack={() => navigate('/profile')} />;
}

// ── BottomNav route adapter ──────────────────────────────────────────────────

const ROUTE_TO_PAGE: Record<string, string> = {
  '/': 'home',
  '/cashout': 'cashout',
  '/inbox': 'inbox',
  '/explore': 'explore',
  '/profile': 'profile',
};

const HIDE_BOTTOMNAV_ROUTES = new Set([
  '/chat',
  '/chat-deposit',
  '/qr-reveal',
  '/qr-deposit',
  '/success',
  '/cetes',
  '/blend',
  '/privacy',
  '/terms',
]);

function BottomNavAdapter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sellerUser } = useAppCtx();

  if (HIDE_BOTTOMNAV_ROUTES.has(location.pathname)) return null;

  const navMap: Record<string, string> = {
    home: '/',
    cashout: '/cashout',
    inbox: '/inbox',
    explore: '/explore',
    profile: '/profile',
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

function App({ initialTradeId: _initialTradeId = null }: AppProps) {
  const [flow, setFlow] = useState<Flow>(null);
  const [buyerUser, setBuyerUser] = useState<UserData | null>(null);
  const [sellerUser, setSellerUser] = useState<UserData | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeData | null>(null);
  const [lockTxHash, setLockTxHash] = useState<string | null>(null);
  const [activeAmount, setActiveAmount] = useState(500);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);

  useEffect(() => {
    const initUsers = async () => {
      try {
        // Always load the keypair first — registerUser reads it to get the
        // Stellar address, so this must happen before any registerUser call.
        if (!await keypairExists()) {
          await generateAndStoreKeypair();
        }
        const pubKey = await getPublicKey();
        setDevicePublicKey(pubKey);

        const stored = await readJSON<StoredUsers>(USERS_STORAGE_KEY);
        if (stored?.buyer && stored?.seller) {
          setBuyerUser(stored.buyer);
          setSellerUser(stored.seller);
          return;
        }

        const ts = Date.now() % 100000;
        const [buyer, seller] = await Promise.all([
          registerUser(`juan_${ts}`),
          registerUser(`farmacia_${ts}`),
        ]);

        await writeJSON(USERS_STORAGE_KEY, { buyer, seller });
        setBuyerUser(buyer);
        setSellerUser(seller);
      } catch (e) {
        console.warn("Backend not available, running in UI-only mode", e);
      } finally {
        setAuthReady(true);
      }
    };

    initUsers();
  }, []);

  const handleAccountDeleted = () => {
    setBuyerUser(null);
    setSellerUser(null);
    setActiveTrade(null);
    setLockTxHash(null);
    setFlow(null);
    void removeKey(USERS_STORAGE_KEY);
  };

  const resetTradeFlow = () => {
    setFlow(null);
    setActiveTrade(null);
    setLockTxHash(null);
  };

  const runTradeFlow = async () => {
    if (!buyerUser || !sellerUser) return;
    setTradeLoading(true);
    try {
      const trade = await createTrade(sellerUser.id, activeAmount, buyerUser.token);
      const { lock_tx_hash } = await lockTrade(trade.id, sellerUser.token);
      await revealTrade(trade.id, sellerUser.token);
      setActiveTrade(trade);
      setLockTxHash(lock_tx_hash);
    } catch (e) {
      console.error("Trade flow failed, continuing as demo", e);
    } finally {
      setTradeLoading(false);
    }
  };

  const handleOfferSelected = async (_offerId: string) => {
    await runTradeFlow();
  };

  const handleDepositOfferSelected = async (_offerId: string) => {
    await runTradeFlow();
  };

  const ctx: AppCtx = {
    buyerUser,
    sellerUser,
    activeTrade,
    lockTxHash,
    activeAmount,
    tradeLoading,
    flow,
    devicePublicKey,
    setActiveAmount,
    setFlow,
    handleOfferSelected,
    handleDepositOfferSelected,
    handleAccountDeleted,
    resetTradeFlow,
  };

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
                <Route path="/" element={<HomeRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/inbox" element={<InboxRoute />} />
                <Route path="/cashout" element={<CashoutRoute />} />
                <Route path="/deposit" element={<DepositRoute />} />
                <Route path="/map" element={<MapRoute />} />
                <Route path="/map-deposit" element={<MapDepositRoute />} />
                <Route path="/chat" element={<ChatRoute />} />
                <Route path="/chat-deposit" element={<ChatDepositRoute />} />
                <Route path="/qr-reveal" element={<QRRevealRoute />} />
                <Route path="/qr-deposit" element={<QRDepositRoute />} />
                <Route path="/success" element={<SuccessRoute />} />
                <Route path="/explore" element={<ExploreRoute />} />
                <Route path="/cetes" element={<CetesRoute />} />
                <Route path="/blend" element={<BlendRoute />} />
                <Route path="/profile" element={<ProfileRoute />} />
                <Route path="/privacy" element={<PrivacyRoute />} />
                <Route path="/terms" element={<TermsRoute />} />
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