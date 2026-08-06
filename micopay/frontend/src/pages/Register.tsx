import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser, UserData } from '../services/api';
import { generateAndStoreKeypair, getPublicKey, exportSecretKey, keypairExists } from '../lib/keystore';
import { setBackupConfirmed, writeJSON } from '../services/secureStorage';

interface RegisterProps {
  onLoginSuccess?: (user: UserData, seller: UserData | null) => void;
}

export default function Register({ onLoginSuccess }: RegisterProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pubKey, setPubKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [copiedPub, setCopiedPub] = useState(false);
  const [copiedSec, setCopiedSec] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<UserData | null>(null);

  const handleRegister = async () => {
    if (!username.trim() || username.length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Solo letras, números y guiones bajos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Only generate a keypair if none exists — never overwrite an existing identity.
      if (!await keypairExists()) {
        await generateAndStoreKeypair();
      }
      const pub = await getPublicKey();
      const sec = await exportSecretKey();
      if (!pub || !sec) throw new Error('No se pudo generar tu identidad Stellar');

      const userData = await registerUser(username.trim());

      // Persist session immediately so the user is logged in after onboarding.
      await writeJSON('micopay_user', userData);
      setLoggedInUser(userData);
      setPubKey(pub);
      setSecretKey(sec);
      setShowOnboarding(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrarse';
      if (msg.includes('409') || msg.toLowerCase().includes('exists') || msg.toLowerCase().includes('already')) {
        setError('Ese nombre de usuario ya está registrado. Elige otro o inicia sesión si es tu cuenta.');
      } else if (msg.includes('Network') || msg.includes('fetch')) {
        setError('Sin conexión al servidor. Intenta en unos segundos.');
      } else {
        setError(`Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyPublicKey = () => {
    navigator.clipboard.writeText(pubKey);
    setCopiedPub(true);
    setTimeout(() => setCopiedPub(false), 2000);
  };

  const copySecretKey = () => {
    navigator.clipboard.writeText(secretKey);
    setCopiedSec(true);
    setTimeout(() => setCopiedSec(false), 2000);
  };

  const finishOnboarding = async () => {
    await setBackupConfirmed();
    if (loggedInUser && onLoginSuccess) {
      onLoginSuccess(loggedInUser, null);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-fondo flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md bg-papel rounded-sm p-8 space-y-6">
          <div className="text-center">
            <h1 className="font-extrabold text-2xl text-tinta">¡Tu Wallet está lista!</h1>
            <p className="text-sm text-gris mt-2">Hemos creado una billetera (wallet) no-custodial en tu dispositivo. Esto significa que solo tú tienes el control de tus fondos.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gris uppercase tracking-wider mb-1">
                Tu Dirección Pública
              </label>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-sm px-4 py-3">
                <span className="text-xs font-mono text-tinta truncate mr-2">{pubKey}</span>
                <button onClick={copyPublicKey} className="text-verde flex-shrink-0">
                  <span className="material-symbols-outlined text-lg">{copiedPub ? 'check' : 'content_copy'}</span>
                </button>
              </div>
              <p className="text-[11px] text-gris mt-1 ml-1">Puedes compartir esta dirección para recibir fondos.</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-sm p-4">
              <label className="block text-xs font-bold text-red-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">warning</span>
                Tu Llave Secreta (Backup)
              </label>
              <p className="text-[11px] text-red-700 mb-3 leading-relaxed">
                Esta es la única forma de recuperar tu cuenta si pierdes o cambias de dispositivo. <strong>NUNCA la compartas con nadie</strong>. Quien la tenga controla tus fondos.
              </p>
              <button
                onClick={copySecretKey}
                className="w-full bg-red-100 hover:bg-red-200 text-red-800 font-bold py-3 rounded-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-base">{copiedSec ? 'check' : 'content_copy'}</span>
                {copiedSec ? '¡Llave Secreta Copiada!' : 'Copiar Llave Secreta'}
              </button>
            </div>
          </div>

          <button
            onClick={finishOnboarding}
            className="w-full bg-verde text-papel font-bold py-3.5 rounded-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            Continuar y explorar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fondo flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-papel rounded-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl text-tinta">Crear cuenta</h1>
          <p className="text-sm text-gris mt-1">Tu identidad Stellar se genera en tu dispositivo</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-sm px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gris uppercase tracking-wider mb-1">
            Nombre de usuario
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            placeholder="mi_usuario"
            className="w-full px-4 py-3 rounded-sm border-2 border-tinta text-tinta text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={30}
          />
          <p className="text-[11px] text-gris mt-1 ml-1">Solo letras, números y guiones bajos</p>
        </div>

        <div className="bg-[#E8F5EE] rounded-sm p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-verde text-lg mt-0.5">key</span>
          <p className="text-xs text-verde leading-relaxed">
            Se generará un keypair Stellar en tu dispositivo. Tu clave privada <strong>nunca sale del teléfono</strong>. Guarda tu nombre de usuario — lo necesitarás para recuperar el acceso.
          </p>
        </div>

        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-verde text-papel font-bold py-3.5 rounded-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              Generando identidad…
            </>
          ) : (
            'Crear cuenta'
          )}
        </button>

        <p className="text-center text-sm text-gris">
          ¿Ya tienes cuenta?{' '}
          <button
            onClick={() => navigate('/login')}
            className="inline-flex min-h-12 items-center justify-center text-verde font-bold underline"
          >
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  );
}
