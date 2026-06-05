import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerUser } from '../services/api';
import { generateAndStoreKeypair, getPublicKey } from '../lib/keystore';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      // Generate keypair first — registerUser reads the public key from SecureStorage.
      await generateAndStoreKeypair();
      const pubKey = await getPublicKey();
      if (!pubKey) throw new Error('No se pudo generar tu identidad Stellar');

      await registerUser(username.trim());
      // Registration succeeded — go to login so the user gets a real JWT.
      navigate('/login', { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al registrarse';
      setError(msg.includes('409') || msg.toLowerCase().includes('exists')
        ? 'Ese nombre de usuario ya está en uso. Elige otro.'
        : `No se pudo registrar: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4FAFF] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl text-[#0B1E26]">Crear cuenta</h1>
          <p className="text-sm text-[#67808C] mt-1">Tu identidad Stellar se genera en tu dispositivo</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#67808C] uppercase tracking-wider mb-1">
            Nombre de usuario
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            placeholder="mi_usuario"
            className="w-full px-4 py-3 rounded-2xl border border-[#D7E3EA] text-[#0B1E26] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={30}
          />
          <p className="text-[11px] text-[#67808C] mt-1 ml-1">Solo letras, números y guiones bajos</p>
        </div>

        <div className="bg-[#E8F5EE] rounded-2xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#00694C] text-lg mt-0.5">key</span>
          <p className="text-xs text-[#00694C] leading-relaxed">
            Se generará un keypair Stellar en tu dispositivo. Tu clave privada <strong>nunca sale del teléfono</strong>. Guarda tu nombre de usuario — lo necesitarás para recuperar el acceso.
          </p>
        </div>

        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-[#00694C] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
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

        <p className="text-center text-sm text-[#67808C]">
          ¿Ya tienes cuenta?{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-[#00694C] font-bold hover:underline"
          >
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  );
}
