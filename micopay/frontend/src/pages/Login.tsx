import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserData, getAuthToken, getCurrentUser } from '../services/api';
import { writeJSON } from '../services/secureStorage';
import { generateAndStoreKeypair, keypairExists, importKeypair } from '../lib/keystore';

const USERS_STORAGE_KEY = 'micopay_user';

interface LoginProps {
  onLoginSuccess: (buyer: UserData, seller: UserData | null) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [secretKey, setSecretKey] = useState('');

  const handleLogin = async () => {
    if (!username.trim()) {
      setError('Ingresa tu nombre de usuario.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (!await keypairExists()) {
        await generateAndStoreKeypair();
      }
      const token = await getAuthToken(username.trim());
      const profile = await getCurrentUser(token);
      const user: UserData = { id: profile.id, username: profile.username, token };
      await writeJSON(USERS_STORAGE_KEY, user);
      onLoginSuccess(user, null);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar sesión';
      if (msg.includes('404') || msg.includes('USER_NOT_FOUND') || msg.includes('no encontrado')) {
        setError('No encontré tu cuenta en este dispositivo. Si cambiaste de teléfono o reinstalaste la app, usa "Restaurar con llave secreta".');
      } else if (msg.includes('Network') || msg.includes('fetch')) {
        setError('Sin conexión al servidor. Intenta en unos segundos.');
      } else {
        setError(`Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!username.trim()) {
      setError('Ingresa tu nombre de usuario primero.');
      return;
    }
    if (!secretKey.trim().startsWith('S') || secretKey.trim().length < 56) {
      setError('La llave secreta debe empezar con "S" y tener 56 caracteres.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await importKeypair(secretKey.trim());
      const token = await getAuthToken(username.trim());
      const profile = await getCurrentUser(token);
      const user: UserData = { id: profile.id, username: profile.username, token };
      await writeJSON(USERS_STORAGE_KEY, user);
      onLoginSuccess(user, null);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al restaurar';
      if (msg.includes('Invalid') || msg.includes('secret') || msg.includes('fromSecret')) {
        setError('Llave secreta inválida. Verifica que la copiaste completa.');
      } else if (msg.includes('404') || msg.includes('USER_NOT_FOUND')) {
        setError('Esta llave no corresponde a ninguna cuenta con ese username.');
      } else {
        setError(`Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FAFF] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl text-[#0B1E26]">MicoPay</h1>
          <p className="text-sm text-[#67808C] mt-1">
            {showRestore ? 'Restaura tu cuenta con tu llave secreta' : 'Ingresa a tu cuenta'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#67808C] uppercase tracking-wider mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => !showRestore && e.key === 'Enter' && handleLogin()}
              placeholder="tu_usuario"
              className="w-full px-4 py-3 rounded-2xl border border-[#D7E3EA] text-[#0B1E26] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          {showRestore && (
            <div>
              <label className="block text-xs font-bold text-[#67808C] uppercase tracking-wider mb-1">
                Llave secreta (empieza con S…)
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="SABCD…"
                className="w-full px-4 py-3 rounded-2xl border border-[#D7E3EA] text-[#0B1E26] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <button
          onClick={showRestore ? handleRestore : handleLogin}
          disabled={loading}
          className="w-full bg-[#00694C] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              {showRestore ? 'Restaurando…' : 'Entrando…'}
            </>
          ) : (
            showRestore ? 'Restaurar cuenta' : 'Entrar'
          )}
        </button>

        <div className="flex flex-col gap-2 text-center text-sm text-[#67808C]">
          <button
            onClick={() => { setShowRestore(!showRestore); setError(null); setSecretKey(''); }}
            className="text-[#00694C] font-bold hover:underline"
          >
            {showRestore ? '← Volver al login normal' : 'Restaurar con llave secreta'}
          </button>
          {!showRestore && (
            <span>
              ¿No tienes cuenta?{' '}
              <button onClick={() => navigate('/register')} className="text-[#00694C] font-bold hover:underline">
                Regístrate
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
