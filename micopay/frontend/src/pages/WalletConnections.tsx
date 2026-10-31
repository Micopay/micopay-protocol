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
      setError(err instanceof Error ? err.message : 'No se pudo conectar');
    }
  };

  const disconnect = async (topic: string) => {
    setError(null);
    try {
      await disconnectWalletSession(topic);
      setSessions(listWalletSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la conexión');
    }
  };

  return (
    <div className="min-h-screen p-5 space-y-4">
      <button type="button" aria-label="Volver" onClick={() => navigate(-1)}>←</button>
      <h1 className="text-xl font-bold">Conexiones web</h1>
      <p className="text-sm">
        Usa esta cuenta en tu computadora. La llave se queda en este teléfono y aquí apruebas cada firma.
      </p>

      {!enabled && <p className="text-sm" role="status">Las conexiones web todavía no están disponibles.</p>}
      {enabled && (
        <button
          type="button"
          className="w-full bg-tinta text-papel rounded-sm py-3 font-semibold"
          onClick={() => void connect()}
        >
          Escanear QR de la web
        </button>
      )}
      {error && <p className="text-sm text-rojo" role="alert">{error}</p>}

      {sessions.length === 0 && enabled && <p className="text-sm opacity-70">No tienes conexiones activas.</p>}
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
