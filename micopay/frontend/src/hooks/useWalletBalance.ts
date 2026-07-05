import { useState, useEffect, useCallback } from 'react';
import { getPublicKey } from '../lib/keystore';

const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';

export interface TokenBalance {
  code: string;
  balance: number;
  issuer?: string;
}

export interface UseWalletBalanceResult {
  balance: string | null;       // MXNe formatted (legacy)
  xlmBalance: string | null;    // XLM formatted (legacy)
  stellarAddress: string | null;
  loading: boolean;
  error: any;
  refresh: () => void;
  tokens: TokenBalance[];       // all assets
  usdMxnRate: number | null;
}

// Peso-pegged assets: treat 1 token = 1 MXN
const MXN_PEGGED = new Set(['MXNE', 'MXNe', 'CETES', 'GTOKEN', 'MXN']);

async function fetchUsdMxnRate(): Promise<number> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=mxn',
    { signal: AbortSignal.timeout(8000) }
  );
  const data = await res.json();
  return data['usd-coin']?.mxn ?? 17.5;
}

export function useWalletBalance(): UseWalletBalanceResult {
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [stellarAddress, setStellarAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  const [usdMxnRate, setUsdMxnRate] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<number>(0);

  const refresh = useCallback(() => setTrigger((p) => p + 1), []);

  useEffect(() => {
    fetchUsdMxnRate().then(setUsdMxnRate).catch(() => setUsdMxnRate(17.5));
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchBalance() {
      try {
        setLoading(true);
        setError(null);

        const address = await getPublicKey();
        if (!active) return;

        if (!address) {
          setStellarAddress(null);
          setTokens([]);
          setLoading(false);
          return;
        }

        setStellarAddress(address);

        const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
        if (!active) return;

        if (res.status === 404) {
          setTokens([{ code: 'XLM', balance: 0 }]);
        } else if (!res.ok) {
          throw new Error(`Horizon returned status ${res.status}`);
        } else {
          const data = await res.json();
          if (!active) return;

          const parsed: TokenBalance[] = (data.balances ?? []).map((b: any) => ({
            code: b.asset_type === 'native' ? 'XLM' : b.asset_code,
            balance: parseFloat(b.balance ?? '0'),
            issuer: b.asset_issuer,
          }));
          setTokens(parsed);
        }
      } catch (err) {
        if (active) {
          setError(err);
          setTokens([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchBalance();
    return () => { active = false; };
  }, [trigger]);

  // Legacy fields derived from tokens
  const xlmToken = tokens.find((t) => t.code === 'XLM');
  const mxneToken = tokens.find((t) => t.code === 'MXNe' || t.code === 'MXNE');

  const xlmBalance = xlmToken != null
    ? xlmToken.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  const balance = mxneToken != null
    ? mxneToken.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXNe'
    : '0.00 MXNe';

  return { balance, xlmBalance, stellarAddress, loading, error, refresh, tokens, usdMxnRate };
}
