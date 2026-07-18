import { useState, useEffect, useCallback } from 'react';
import { getPublicKey } from '../lib/keystore';

export interface UseWalletBalanceResult {
  balance: string | null;
  xlmBalance: string | null;
  stellarAddress: string | null;
  loading: boolean;
  error: any;
  refresh: () => void;
}

export function useWalletBalance(): UseWalletBalanceResult {
  const [balance, setBalance] = useState<string | null>(null);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [stellarAddress, setStellarAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<any>(null);
  const [trigger, setTrigger] = useState<number>(0);

  const refresh = useCallback(() => {
    setTrigger((prev) => prev + 1);
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
          setBalance("0.00 MXNe");
          setXlmBalance("0.00");
          setLoading(false);
          return;
        }

        setStellarAddress(address);

        const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
        if (!active) return;

        if (res.status === 404) {
          setBalance("0.00 MXNe");
          setXlmBalance("0.00");
        } else if (!res.ok) {
          throw new Error(`Horizon returned status ${res.status}`);
        } else {
          const data = await res.json();
          if (!active) return;

          const issuerAddress = import.meta.env.VITE_MXNE_ISSUER_ADDRESS;
          const mxneAsset = data.balances?.find(
            (b: any) => b.asset_code === 'MXNe' && b.asset_issuer === issuerAddress
          );
          const mxneVal = mxneAsset ? parseFloat(mxneAsset.balance) : 0;

          const xlmAsset = data.balances?.find(
            (b: any) => b.asset_type === 'native'
          );
          const xlmVal = xlmAsset ? parseFloat(xlmAsset.balance) : 0;

          setBalance(
            mxneVal.toLocaleString("es-MX", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) + " MXNe"
          );

          setXlmBalance(
            xlmVal.toLocaleString("es-MX", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          );
        }
      } catch (err) {
        if (active) {
          setError(err);
          setBalance(null);
          setXlmBalance(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchBalance();

    return () => {
      active = false;
    };
  }, [trigger]);

  return { balance, xlmBalance, stellarAddress, loading, error, refresh };
}
