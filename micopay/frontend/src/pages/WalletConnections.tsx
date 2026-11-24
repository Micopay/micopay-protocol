import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQRScanner } from '../hooks/useQRScanner';
import {
  disconnectWalletSession,
  isWalletConnectEnabled,
  listWalletSessions,
  pairWallet,
  subscribeWallet,
  type WalletSession,
} from '../services/walletConnect';
import i18n from '../i18n';

// Textos que no pasan por el hook: el arbol se vuelve a pintar al cambiar de idioma.
const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

/** Conexiones de esta APK con la web: escanear el QR y cerrarlas. */
export default function WalletConnections() {
  const navigate = useNavigate();
  const { scan } = useQRScanner();
  const [sessions, setSessions] = useState<WalletSession[]>(() => listWalletSessions());
  const [error, setError] = useState<string | null>(null);
  const enabled = isWalletConnectEnabled();

  useEffect(() => subscribeWallet(() => setSessions(listWalletSessions())), []);

  const connect = async () => {
    setError(null);
    const result = await scan();
    if (!result.value) {
      if (result.error) setError(result.error);
      return;
    }
    try {
      await pairWallet(result.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('walletConnections.s1'));
    }
  };

  const disconnect = async (topic: string) => {
    setError(null);
    try {
      await disconnectWalletSession(topic);
      setSessions(listWalletSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('walletConnections.s2'));
    }
  };

  return (
    <div className="min-h-screen p-5 space-y-4">
      <button type="button" aria-label="Volver" onClick={() => navigate(-1)}>←</button>
      <h1 className="text-xl font-bold">Conexiones web</h1>
      <p className="text-sm">{tr('walletConnections.s3')}
      </p>

      {!enabled && <p className="text-sm" role="status">{tr('walletConnections.s4')}</p>}
      {enabled && (
        <button
          type="button"
          className="w-full bg-tinta text-papel rounded-sm py-3 font-semibold"
          onClick={() => void connect()}
        >{tr('walletConnections.s5')}
        </button>
      )}
      {error && <p className="text-sm text-rojo" role="alert">{error}</p>}

      {sessions.length === 0 && enabled && <p className="text-sm opacity-70">{tr('walletConnections.s6')}</p>}
      <ul className="space-y-2">
        {sessions.map((session) => (
          <li key={session.topic} className="flex items-center justify-between gap-3 border-2 border-tinta rounded-sm p-3">
            <span className="text-sm font-semibold break-all">{session.origin}</span>
            <button type="button" className="text-sm font-semibold underline" onClick={() => void disconnect(session.topic)}>
              Cerrar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
