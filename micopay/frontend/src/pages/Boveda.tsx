import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  Transaction,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { Networks as KitNetworks } from '@creit.tech/stellar-wallets-kit/types';
import { VarialModule } from '@creit.tech/stellar-wallets-kit/modules/varial';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';

/**
 * Reto exprés "Bóveda" (Ship It, BAF x Stellar).
 *
 * Contrato en testnet que retiene 5,555 XLM y solo los libera a quien
 * presente el código secreto. La pantalla es pública: no pide sesión de
 * MicoPay, solo una wallet de testnet.
 *
 * El código nunca viaja al contrato en claro: el contrato guarda su sha256.
 */

const CONTRACT_ID =
  (import.meta.env.VITE_BOVEDA_CONTRACT_ID as string | undefined) ||
  // Contrato desplegado para el reto (testnet, 26 nov 2026).
  'CCS5EVJT5ZQK736L7JGWWYKLX673RGHVC6PIUYSXYAVAVMSJPI5HXXU5';
const RPC_URL =
  (import.meta.env.VITE_SOROBAN_RPC_URL as string | undefined) || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const EXPLORER = `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;
const STROOPS = 10_000_000;

type BovedaState = {
  amount: number;
  balance: number;
  claimed: boolean;
  claimedBy: string | null;
};

type Phase = 'idle' | 'connecting' | 'claiming' | 'done';

let kitReady = false;
function ensureKit() {
  if (kitReady) return;
  StellarWalletsKit.init({
    modules: [new VarialModule(), new AlbedoModule()],
    network: KitNetworks.TESTNET,
  });
  kitReady = true;
}

const server = new rpc.Server(RPC_URL);

function toXlm(value: unknown): number {
  if (typeof value === 'bigint') return Number(value) / STROOPS;
  if (typeof value === 'number') return value / STROOPS;
  return 0;
}

async function loadState(account: string): Promise<BovedaState> {
  const contract = new Contract(CONTRACT_ID);
  const source = await server.getAccount(account);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('state'))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error('No pude leer el estado de la bóveda.');
  }
  const raw = scValToNative(sim.result.retval) as {
    amount: bigint;
    balance: bigint;
    claimed: boolean;
    claimed_by?: string | null;
  };
  return {
    amount: toXlm(raw.amount),
    balance: toXlm(raw.balance),
    claimed: Boolean(raw.claimed),
    claimedBy: raw.claimed_by ?? null,
  };
}

async function accountExists(address: string): Promise<boolean> {
  try {
    await server.getAccount(address);
    return true;
  } catch {
    return false;
  }
}

async function fundWithFriendbot(address: string) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error('Friendbot no respondió. Intenta de nuevo.');
}

const Boveda = () => {
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<BovedaState | null>(null);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [funding, setFunding] = useState(false);

  const configured = Boolean(CONTRACT_ID);

  const refresh = useCallback(async (account: string) => {
    try {
      const next = await loadState(account);
      setState(next);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    if (!address || !configured) return;
    void refresh(address);
  }, [address, configured, refresh]);

  const connect = async () => {
    setError(null);
    setPhase('connecting');
    try {
      ensureKit();
      const { address: chosen } = await StellarWalletsKit.authModal();
      setAddress(chosen);
      setNeedsFunding(!(await accountExists(chosen)));
      await refresh(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar la wallet.');
    } finally {
      setPhase('idle');
    }
  };

  const fund = async () => {
    if (!address) return;
    setFunding(true);
    setError(null);
    try {
      await fundWithFriendbot(address);
      setNeedsFunding(false);
      await refresh(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo fondear la cuenta.');
    } finally {
      setFunding(false);
    }
  };

  const claim = async () => {
    if (!address || !code.trim()) return;
    setError(null);
    setTxHash(null);
    setPhase('claiming');
    try {
      const contract = new Contract(CONTRACT_ID);
      const source = await server.getAccount(address);
      const built = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          contract.call(
            'claim',
            Address.fromString(address).toScVal(),
            xdr.ScVal.scvBytes(Buffer.from(code.trim(), 'utf8')),
          ),
        )
        .setTimeout(60)
        .build();

      const prepared = await server.prepareTransaction(built);
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(prepared.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });

      const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE) as Transaction;
      const sent = await server.sendTransaction(signed);
      if (sent.status === 'ERROR') {
        throw new Error('La red rechazó la transacción.');
      }

      setTxHash(sent.hash);
      let result = await server.getTransaction(sent.hash);
      for (let i = 0; i < 20 && result.status === rpc.Api.GetTransactionStatus.NOT_FOUND; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await server.getTransaction(sent.hash);
      }

      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error('La transacción no se confirmó. Revisa stellar.expert.');
      }

      setPhase('done');
      await refresh(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reclamar.');
      setPhase('idle');
    }
  };

  const short = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-6)}` : null),
    [address],
  );

  const balance = state ? state.balance : 5555;

  return (
    <div className="bg-surface text-on-surface font-body min-h-screen px-5 py-8 pb-32">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-papel rounded-sm border-2 border-tinta flex items-center justify-center">
              <span aria-hidden="true" className="material-symbols-outlined text-primary text-2xl">
                lock
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
                Ship It · BAF × Stellar
              </p>
              <h1 className="font-headline font-extrabold text-2xl leading-tight">Bóveda</h1>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest border-2 border-tinta bg-papel px-2 py-1 rounded-sm">
            Testnet
          </span>
        </div>

        <div className="border-2 border-tinta bg-papel rounded-sm p-5 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-1">
            En custodia
          </p>
          <p className="font-headline font-extrabold text-4xl tabular-nums">
            {balance.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
            <span className="text-lg font-bold ml-2">XLM</span>
          </p>
          <p className="text-xs text-on-surface-variant mt-2">
            {state?.claimed
              ? `Reclamados por ${state.claimedBy ? `${state.claimedBy.slice(0, 6)}…${state.claimedBy.slice(-6)}` : 'alguien'}`
              : 'El contrato los libera a quien presente el código.'}
          </p>
        </div>

        {!configured && (
          <div className="border-2 border-tinta bg-surface-container rounded-sm p-4 mb-4 text-sm">
            Falta configurar <code className="font-mono">VITE_BOVEDA_CONTRACT_ID</code>. El contrato
            aún no está desplegado.
          </div>
        )}

        {configured && (
          <div className="border-2 border-tinta bg-surface-container rounded-sm p-5 space-y-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-2">
                1 · Conecta tu wallet de testnet
              </p>
              {address ? (
                <div className="flex items-center justify-between gap-3 border-2 border-tinta bg-papel rounded-sm px-3 py-2">
                  <span className="font-mono text-sm">{short}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddress(null);
                      setState(null);
                      setTxHash(null);
                      setPhase('idle');
                    }}
                    className="text-xs font-bold underline underline-offset-2"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={connect}
                  disabled={phase === 'connecting'}
                  className="w-full min-h-12 border-2 border-tinta bg-primary text-on-primary font-bold py-3 px-6 rounded-sm disabled:opacity-60"
                >
                  {phase === 'connecting' ? 'Abriendo wallets…' : 'Conectar wallet'}
                </button>
              )}
              {needsFunding && address && (
                <button
                  type="button"
                  onClick={fund}
                  disabled={funding}
                  className="mt-2 w-full min-h-10 border-2 border-tinta bg-papel font-bold text-sm py-2 rounded-sm disabled:opacity-60"
                >
                  {funding ? 'Fondeando…' : 'Fondear con Friendbot (10,000 XLM de prueba)'}
                </button>
              )}
            </div>

            <div>
              <label
                htmlFor="boveda-code"
                className="block text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-2"
              >
                2 · Escribe el código
              </label>
              <input
                id="boveda-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Ship It"
                autoComplete="off"
                spellCheck={false}
                className="w-full min-h-12 border-2 border-tinta bg-papel rounded-sm px-3 font-mono text-base"
              />
              <p className="text-xs text-on-surface-variant mt-2">
                Exactamente como te lo dieron, con mayúscula y espacio.
              </p>
            </div>

            <button
              type="button"
              onClick={claim}
              disabled={!address || !code.trim() || phase === 'claiming' || state?.claimed}
              className="w-full min-h-12 border-2 border-tinta bg-tinta text-papel font-bold py-3 px-6 rounded-sm disabled:opacity-50"
            >
              {phase === 'claiming'
                ? 'Firmando y enviando…'
                : state?.claimed
                  ? 'Ya fue reclamada'
                  : 'Reclamar 5,555 XLM'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 border-2 border-tinta bg-surface-container rounded-sm p-4 text-sm">
            <p className="font-bold mb-1">No se pudo completar</p>
            <p className="text-on-surface-variant break-words">{error}</p>
          </div>
        )}

        {phase === 'done' && txHash && (
          <div className="mt-4 border-2 border-tinta bg-papel rounded-sm p-4 text-sm">
            <p className="font-bold mb-1">¡Reclamado!</p>
            <p className="text-on-surface-variant mb-2">
              Los 5,555 XLM ya están en tu wallet de testnet.
            </p>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 break-all font-mono text-xs"
            >
              Ver transacción en stellar.expert
            </a>
          </div>
        )}

        {configured && (
          <a
            href={EXPLORER}
            target="_blank"
            rel="noreferrer"
            className="mt-6 block text-center text-xs font-bold underline underline-offset-2 text-on-surface-variant"
          >
            Ver el contrato en stellar.expert
          </a>
        )}
      </div>
    </div>
  );
};

export default Boveda;
