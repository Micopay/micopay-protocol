import { Capacitor } from '@capacitor/core';
import type { WalletKitTypes, IWalletKit } from '@reown/walletkit';
import { getPublicKey, signTransactionXdr } from '../lib/keystore';
import { getActiveTrades, getTrade } from './api';
import { resolveEscrowIntent, type EscrowIntent } from './walletIntent';
import {
  WALLET_SIGN_METHOD,
  WalletRequestRejected,
  assertWalletProposal,
  assertWalletRequestOrigin,
  chainIdForPassphrase,
  isSep10Challenge,
  parseEscrowRequest,
  parseSep10Request,
  type WalletPolicy,
} from './walletRequest';

/**
 * La APK como billetera: una web pide firmas por WalletConnect y la llave nunca
 * sale de `StellarKeyVault`. Cada firma pasa por la huella; una sesion conectada
 * no firma sola, y con la app cerrada la solicitud espera a que se abra.
 */

export type PendingWalletItem =
  | { kind: 'proposal'; id: number; origin: string; proposal: WalletKitTypes.SessionProposal }
  | { kind: 'webAuth'; id: number; topic: string; origin: string; xdr: string; expiry: number; homeDomain: string; account: string }
  | { kind: 'request'; id: number; topic: string; origin: string; xdr: string; expiry: number; intent: EscrowIntent };

export interface WalletSession {
  topic: string;
  origin: string;
}

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
const OFFICIAL_ORIGIN = (import.meta.env.VITE_WALLET_OFFICIAL_ORIGIN as string | undefined) || 'https://app.micopay.com.mx';
const ALLOWED_CONTRACTS = String(import.meta.env.VITE_ESCROW_ALLOWED_CONTRACTS || '')
  .split(',').map((id) => id.trim()).filter(Boolean);
const IS_PUBLIC = ['PUBLIC', 'MAINNET'].includes(String(import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET').toUpperCase());
const SEP10_SIGNING_KEY = import.meta.env.VITE_SEP10_SIGNING_KEY as string | undefined;
const SEP10_WEB_AUTH_DOMAIN = (import.meta.env.VITE_SEP10_WEB_AUTH_DOMAIN as string | undefined) || 'api.micopay.app';
const USER_REJECTED = { code: 5000, message: 'Rechazado' };

let kit: IWalletKit | null = null;
let starting: Promise<IWalletKit> | null = null;
let authToken: string | null = null;
let pending: PendingWalletItem | null = null;
const seen = new Set<string>();
const listeners = new Set<() => void>();

export function isWalletConnectEnabled(): boolean {
  return Capacitor.getPlatform() === 'android' && Boolean(PROJECT_ID) && ALLOWED_CONTRACTS.length > 0;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function setPending(item: PendingWalletItem | null): void {
  pending = item;
  notify();
}

export function subscribeWallet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPendingWalletItem = (): PendingWalletItem | null => pending;

async function networkPassphrase(): Promise<string> {
  const { Networks } = await import('@stellar/stellar-sdk');
  return IS_PUBLIC ? Networks.PUBLIC : Networks.TESTNET;
}

async function policy(): Promise<WalletPolicy> {
  const account = await getPublicKey();
  if (!account) throw new WalletRequestRejected('no hay cuenta en este teléfono');
  return {
    officialOrigin: OFFICIAL_ORIGIN,
    chainId: chainIdForPassphrase(IS_PUBLIC),
    networkPassphrase: await networkPassphrase(),
    account,
    allowedContracts: ALLOWED_CONTRACTS,
    now: Math.floor(Date.now() / 1000),
    sep10SigningKey: SEP10_SIGNING_KEY,
    sep10HomeDomain: new URL(OFFICIAL_ORIGIN).hostname,
    sep10WebAuthDomain: SEP10_WEB_AUTH_DOMAIN,
  };
}

async function respondError(topic: string, id: number, message: string): Promise<void> {
  await kit?.respondSessionRequest({
    topic,
    response: { id, jsonrpc: '2.0', error: { code: 5000, message } },
  });
}

async function onProposal(proposal: WalletKitTypes.SessionProposal): Promise<void> {
  const verified = proposal.verifyContext.verified;
  const required = proposal.params.requiredNamespaces?.stellar;
  try {
    assertWalletProposal({
      verifiedOrigin: verified.origin,
      validation: verified.validation,
      isScam: verified.isScam ?? undefined,
      requiredMethods: required?.methods ?? [],
      requiredChains: required?.chains ?? [],
    }, await policy());
    setPending({ kind: 'proposal', id: proposal.id, origin: verified.origin, proposal });
  } catch {
    await kit?.rejectSession({ id: proposal.id, reason: USER_REJECTED });
  }
}

async function onRequest(event: WalletKitTypes.SessionRequest): Promise<void> {
  const { id, topic, params, verifyContext } = event;
  const request = params.request as { method: string; params?: { xdr?: unknown }; expiryTimestamp?: number };
  const expiry = request.expiryTimestamp ?? Math.floor(Date.now() / 1000) + 300;
  try {
    if (!authToken) throw new WalletRequestRejected('abre MicoPay e inicia sesión');
    const current = await policy();
    const xdr = request.params?.xdr;
    assertWalletRequestOrigin({
      id,
      topic,
      verifiedOrigin: verifyContext.verified.origin,
      validation: verifyContext.verified.validation,
      isScam: verifyContext.verified.isScam ?? undefined,
      chainId: params.chainId,
      method: request.method,
      expiry,
      xdr,
    }, current, seen);
    const origin = verifyContext.verified.origin;
    if (isSep10Challenge(xdr, current)) {
      const { homeDomain } = parseSep10Request(xdr as string, current);
      setPending({ kind: 'webAuth', id, topic, origin, xdr: xdr as string, expiry, homeDomain, account: current.account });
      return;
    }
    const summary = parseEscrowRequest(xdr, current);
    const intent = await resolveEscrowIntent(xdr as string, current.networkPassphrase, summary, authToken, {
      listActive: getActiveTrades,
      getTrade,
    });
    setPending({ kind: 'request', id, topic, origin, xdr: xdr as string, expiry, intent });
  } catch (err) {
    await respondError(topic, id, err instanceof Error ? err.message : 'Solicitud rechazada');
  }
}

/** Arranca una sola vez y solo importa WalletKit cuando esta habilitado. */
export async function startWalletConnect(token: string): Promise<void> {
  authToken = token;
  if (!isWalletConnectEnabled() || kit) return;
  if (!starting) {
    starting = (async () => {
      const [{ Core }, { WalletKit }] = await Promise.all([
        import('@walletconnect/core'),
        import('@reown/walletkit'),
      ]);
      const instance = await WalletKit.init({
        core: new Core({ projectId: PROJECT_ID as string }),
        metadata: {
          name: 'MicoPay',
          description: 'Firma tus operaciones de MicoPay',
          url: 'https://micopay.com.mx',
          icons: [],
        },
      });
      instance.on('session_proposal', (proposal) => void onProposal(proposal));
      instance.on('session_request', (request) => void onRequest(request));
      instance.on('session_delete', notify);
      kit = instance;
      notify();
      return instance;
    })();
  }
  await starting;
}

export function stopWalletRequests(): void {
  authToken = null;
  setPending(null);
}

async function requireKit(): Promise<IWalletKit> {
  if (kit) return kit;
  if (starting) return starting;
  throw new WalletRequestRejected('la conexión no está disponible');
}

export async function pairWallet(uri: string): Promise<void> {
  if (!uri.startsWith('wc:')) throw new WalletRequestRejected('el QR no es de una conexión');
  await (await requireKit()).pair({ uri });
}

export function listWalletSessions(): WalletSession[] {
  if (!kit) return [];
  return Object.values(kit.getActiveSessions()).map((session) => ({
    topic: session.topic,
    origin: session.peer.metadata.url,
  }));
}

export async function disconnectWalletSession(topic: string): Promise<void> {
  await (await requireKit()).disconnectSession({ topic, reason: USER_REJECTED });
  notify();
}

export async function approvePending(): Promise<void> {
  const item = pending;
  if (!item) return;
  const client = await requireKit();
  if (item.kind === 'proposal') {
    const current = await policy();
    await client.approveSession({
      id: item.id,
      namespaces: {
        stellar: {
          chains: [current.chainId],
          methods: [WALLET_SIGN_METHOD],
          events: [],
          accounts: [`${current.chainId}:${current.account}`],
        },
      },
    });
    setPending(null);
    return;
  }

  if (item.expiry <= Math.floor(Date.now() / 1000)) {
    await respondError(item.topic, item.id, 'Solicitud vencida');
    setPending(null);
    return;
  }
  const reason = item.kind === 'webAuth' ? 'web_auth' : item.intent.action;
  const signedXDR = await signTransactionXdr(item.xdr, await networkPassphrase(), reason);
  await client.respondSessionRequest({
    topic: item.topic,
    response: { id: item.id, jsonrpc: '2.0', result: { signedXDR } },
  });
  setPending(null);
}

export async function rejectPending(): Promise<void> {
  const item = pending;
  if (!item) return;
  const client = await requireKit();
  if (item.kind === 'proposal') await client.rejectSession({ id: item.id, reason: USER_REJECTED });
  else await respondError(item.topic, item.id, 'Rechazado por el usuario');
  setPending(null);
}
