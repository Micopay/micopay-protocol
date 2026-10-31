import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Firmador de la web. La billetera es de la persona: aqui solo se recuerda que
 * cuenta conecto, y cualquier cambio de cuenta o de red invalida la sesion.
 */

export interface WalletBackend {
  /** Abre el selector y devuelve la cuenta elegida. */
  connect(): Promise<string>;
  /** Cuenta activa en la billetera, o null si no se puede saber (bloqueada, por ejemplo). */
  currentAddress(): Promise<string | null>;
  /** Passphrase activa, o null si la billetera no la informa (WalletConnect la fija en la sesion). */
  networkPassphrase(): Promise<string | null>;
  sign(xdr: string, options: { networkPassphrase: string; address: string }): Promise<string>;
  disconnect(): Promise<void>;
  onChange(listener: (change: { address?: string; networkPassphrase?: string; disconnected?: boolean }) => void): void;
}

const ADDRESS_KEY = 'micopay_wallet_address';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;

let backendPromise: Promise<WalletBackend> | null = null;
let loadBackend = async (): Promise<WalletBackend> => (await import('./stellarKit')).createKitBackend();
const lostListeners = new Set<(reason: string) => void>();

/** Solo pruebas. */
export function useWalletBackendForTests(backend: WalletBackend): void {
  loadBackend = async () => backend;
  backendPromise = null;
}

export function getConnectedAddress(): string | null {
  try {
    return sessionStorage.getItem(ADDRESS_KEY);
  } catch {
    return null;
  }
}

function rememberAddress(address: string | null): void {
  try {
    if (address) sessionStorage.setItem(ADDRESS_KEY, address);
    else sessionStorage.removeItem(ADDRESS_KEY);
  } catch {
    // Sin sessionStorage la sesion dura lo que la pestana; no cambia nada mas.
  }
}

function walletLost(reason: string): void {
  rememberAddress(null);
  lostListeners.forEach((listener) => listener(reason));
}

function backend(): Promise<WalletBackend> {
  if (!backendPromise) {
    backendPromise = loadBackend().then((loaded) => {
      loaded.onChange((change) => {
        const connected = getConnectedAddress();
        if (!connected) return;
        if (change.disconnected) walletLost('Tu billetera se desconectó.');
        else if (change.address && change.address !== connected) walletLost('Cambiaste de cuenta en tu billetera.');
        else if (change.networkPassphrase && change.networkPassphrase !== NETWORK_PASSPHRASE) {
          walletLost('Cambiaste de red en tu billetera.');
        }
      });
      return loaded;
    });
  }
  return backendPromise;
}

export function onWalletLost(listener: (reason: string) => void): () => void {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

function networkError(): Error {
  return new Error(`Tu billetera está en otra red. Cámbiala a ${NETWORK_PASSPHRASE === Networks.PUBLIC ? 'Mainnet' : 'Testnet'}.`);
}

export async function connectWallet(): Promise<string> {
  rememberAddress(null);
  const wallet = await backend();
  const address = await wallet.connect();
  const passphrase = await wallet.networkPassphrase();
  if (passphrase && passphrase !== NETWORK_PASSPHRASE) throw networkError();
  rememberAddress(address);
  return address;
}

/** Compuerta previa a cada firma: billetera conectada, misma cuenta y misma red. */
export async function assertWalletReady(): Promise<string> {
  const connected = getConnectedAddress();
  if (!connected) throw new Error('Conecta tu billetera para continuar.');
  const wallet = await backend();
  const [current, passphrase] = await Promise.all([wallet.currentAddress(), wallet.networkPassphrase()]);
  if (current && current !== connected) {
    walletLost('Cambiaste de cuenta en tu billetera.');
    throw new Error('Cambiaste de cuenta en tu billetera. Inicia sesión de nuevo.');
  }
  if (passphrase && passphrase !== NETWORK_PASSPHRASE) {
    walletLost('Cambiaste de red en tu billetera.');
    throw networkError();
  }
  return connected;
}

/** La billetera solo puede agregar su firma: si cambia la transaccion, no se usa. */
function assertSameTransaction(unsigned: string, signed: string, address: string, passphrase: string): void {
  const before = TransactionBuilder.fromXDR(unsigned, passphrase);
  const after = TransactionBuilder.fromXDR(signed, passphrase);
  const hash = after.hash();
  if (!before.hash().equals(hash)) throw new Error('La billetera devolvió una transacción distinta.');

  const signer = Keypair.fromPublicKey(address);
  const verified = after.signatures.some(
    (signature) => signature.hint().equals(signer.signatureHint()) && signer.verify(hash, signature.signature()),
  );
  if (!verified) throw new Error('La billetera no firmó con la cuenta conectada.');
}

export async function signWithWallet(xdr: string, networkPassphrase: string): Promise<string> {
  if (networkPassphrase !== NETWORK_PASSPHRASE) throw networkError();
  const address = await assertWalletReady();
  const signed = await (await backend()).sign(xdr, { networkPassphrase, address });
  assertSameTransaction(xdr, signed, address, networkPassphrase);
  return signed;
}

export async function disconnectWallet(): Promise<void> {
  rememberAddress(null);
  if (backendPromise) await (await backendPromise).disconnect().catch(() => undefined);
}
