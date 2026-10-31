import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { connectWallet, disconnectWallet } from '../lib/signer/externalSigner';
import { hashPhone } from '../lib/phoneHash';
import { getAuthToken, getCurrentUser, registerUser, type UserData } from '../services/api';
import { writeJSON } from '../services/secureStorage';
import { ApiError } from '../utils/apiError';

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';

interface WalletLoginProps {
  onLoginSuccess: (user: UserData) => void;
}

const buttonClass =
  'w-full min-h-12 bg-naranja text-papel border-2 border-tinta shadow-solida font-bold py-3.5 rounded-sm transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-solida-xs disabled:opacity-60';

/** Entrada de la web: la billetera es la cuenta, sin frase ni respaldo. */
export default function WalletLogin({ onLoginSuccess }: WalletLoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [address, setAddress] = useState<string | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [notFunded, setNotFunded] = useState(false);
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enter = async (user: UserData) => {
    await writeJSON('micopay_user', user);
    onLoginSuccess(user);
    navigate(from, { replace: true });
  };

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const account = await connectWallet();
      setAddress(account);
      const onNetwork = await fetch(`${HORIZON_URL}/accounts/${account}`).then((res) => res.status !== 404).catch(() => true);
      setNotFunded(!onNetwork);

      const token = await getAuthToken();
      const profile = await getCurrentUser(token);
      await enter({ id: profile.id, username: profile.username, token });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'USER_NOT_FOUND') setNeedsAccount(true);
      else setError(e instanceof Error ? e.message : 'No se pudo conectar tu billetera');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setError('Usa de 3 a 30 letras, números o guiones bajos.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const phoneHash = phone.trim() ? await hashPhone(phone.trim()) : undefined;
      await enter(await registerUser(username.trim(), phoneHash));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === 'USERNAME_TAKEN') setError('Ese nombre de usuario ya está ocupado. Elige otro.');
      else setError(e instanceof Error ? e.message : 'No se pudo crear tu cuenta');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeWallet = async () => {
    await disconnectWallet();
    setAddress(null);
    setNeedsAccount(false);
    setNotFunded(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-fondo flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm bg-papel rounded-sm p-8 space-y-6">
        <div className="text-center">
          <h1 className="font-extrabold text-2xl text-tinta">MicoPay</h1>
          <p className="text-sm text-gris mt-1">
            {needsAccount ? 'Elige tu nombre de usuario' : 'Conecta tu billetera'}
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-sm px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {notFunded && (
          <div role="status" className="border-2 border-tinta bg-verde-suave rounded-sm px-4 py-3">
            <p className="text-sm text-tinta">
              Esta cuenta todavía no existe en la red. Necesita recibir XLM antes de poder operar.
            </p>
          </div>
        )}

        {!needsAccount && (
          <>
            <p className="text-sm text-gris text-center">
              Tu llave se queda en tu billetera. MicoPay te pedirá firmar y nunca la verá.
            </p>
            <button type="button" onClick={handleConnect} disabled={loading} className={buttonClass}>
              {loading ? 'Esperando tu billetera…' : 'Conectar billetera'}
            </button>
          </>
        )}

        {needsAccount && (
          <>
            <p className="font-mono text-xs text-tinta break-all bg-fondo rounded-sm p-3">{address}</p>
            <div>
              <label htmlFor="wallet-username" className="block text-xs font-bold text-gris uppercase tracking-wider mb-1">
                Nombre de usuario
              </label>
              <input
                id="wallet-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-4 py-3 rounded-sm border-2 border-tinta text-tinta text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label htmlFor="wallet-phone" className="block text-xs font-bold text-gris uppercase tracking-wider mb-1">
                Teléfono <span className="font-normal normal-case">(opcional)</span>
              </label>
              <input
                id="wallet-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-sm border-2 border-tinta text-tinta text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-[11px] text-gris mt-1">El número nunca se envía al servidor.</p>
            </div>
            <button type="button" onClick={handleRegister} disabled={loading} className={buttonClass}>
              {loading ? 'Esperando tu billetera…' : 'Crear cuenta'}
            </button>
            <button type="button" onClick={handleChangeWallet} className="w-full min-h-12 text-sm text-verde font-bold underline">
              Usar otra billetera
            </button>
          </>
        )}
      </div>
    </div>
  );
}
