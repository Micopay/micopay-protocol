import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserData, registerUser, getAuthToken } from '../services/api';
import { writeJSON } from '../services/secureStorage';
import { generateAndStoreKeypair, keypairExists } from '../lib/keystore';

const USERS_STORAGE_KEY = 'micopay_users';

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

  const ensureKeypair = async () => {
    if (!await keypairExists()) {
      await generateAndStoreKeypair();
    }
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError('Ingresa tu nombre de usuario.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await ensureKeypair();
      const token = await getAuthToken(username.trim());
      const user: UserData = { id: username.trim(), username: username.trim(), token };
      await writeJSON(USERS_STORAGE_KEY, { buyer: user, seller: null });
      onLoginSuccess(user, null);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar sesión';
      setError(msg.includes('401') || msg.includes('challenge')
        ? 'Usuario o clave incorrectos. Si eres nuevo, regístrate primero.'
        : `No se pudo conectar: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FAFF] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl text-[#0B1E26]">MicoPay</h1>
          <p className="text-sm text-[#67808C] mt-1">Ingresa a tu cuenta</p>
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
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="tu_usuario"
              className="w-full px-4 py-3 rounded-2xl border border-[#D7E3EA] text-[#0B1E26] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-[#00694C] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              Entrando…
            </>
          ) : (
            'Entrar'
          )}
        </button>

        <p className="text-center text-sm text-[#67808C]">
          ¿No tienes cuenta?{' '}
          <button
            onClick={() => navigate('/register')}
            className="text-[#00694C] font-bold hover:underline"
          >
            Regístrate
          </button>
        </p>
      </div>
    </div>
  );
}
