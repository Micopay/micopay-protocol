import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import { KitEventType, Networks, type ModuleInterface } from '@creit.tech/stellar-wallets-kit/types';
import { VarialModule } from '@creit.tech/stellar-wallets-kit/modules/varial';
import type { WalletBackend } from './externalSigner';
import { waitForModule } from './waitForModule';
import i18n from '../../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
const OFFICIAL_ORIGIN = (import.meta.env.VITE_WALLET_OFFICIAL_ORIGIN as string | undefined) || 'https://app.micopay.com.mx';
const IS_PUBLIC = ['PUBLIC', 'MAINNET'].includes(String(import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET').toUpperCase());

let walletConnectModule: ModuleInterface | null = null;

/** Solo estos modulos: `defaultModules` traeria Ledger, Trezor y otras dependencias. */
async function walletModules(): Promise<ModuleInterface[]> {
  const modules: ModuleInterface[] = [new VarialModule()];
  if (PROJECT_ID) {
    const { WalletConnectModule, WalletConnectTargetChain } = await import(
      '@creit.tech/stellar-wallets-kit/modules/wallet-connect'
    );
    walletConnectModule = new WalletConnectModule({
      projectId: PROJECT_ID,
      metadata: {
        name: 'MicoPay',
        description: tr('signerErrors.walletDescription'),
        url: OFFICIAL_ORIGIN,
        icons: [],
      },
      allowedChains: [IS_PUBLIC ? WalletConnectTargetChain.PUBLIC : WalletConnectTargetChain.TESTNET],
      // Prefijo propio: sin el, el SignClient del Kit y el del modal de AppKit
      // comparten el mismo Core global y el del modal se queda con la
      // aprobacion de la billetera ("No matching key"), asi que la web nunca
      // se entera de que la APK aprobo.
      signClientOptions: { customStoragePrefix: 'micopay-kit' },
    });
    modules.push(walletConnectModule);
  }
  return modules;
}

export async function createKitBackend(): Promise<WalletBackend> {
  StellarWalletsKit.init({
    modules: await walletModules(),
    network: IS_PUBLIC ? Networks.PUBLIC : Networks.TESTNET,
  });

  return {
    connect: async () => {
      await waitForModule(walletConnectModule);
      return (await StellarWalletsKit.authModal()).address;
    },
    currentAddress: () => StellarWalletsKit.fetchAddress().then(({ address }) => address).catch(() => null),
    networkPassphrase: () => StellarWalletsKit.getNetwork()
      .then(({ networkPassphrase }) => networkPassphrase)
      .catch(() => null),
    sign: async (xdr, options) => (await StellarWalletsKit.signTransaction(xdr, options)).signedTxXdr,
    disconnect: () => StellarWalletsKit.disconnect(),
    onChange: (listener) => {
      StellarWalletsKit.on(KitEventType.STATE_UPDATED, ({ payload }) => listener(payload));
      StellarWalletsKit.on(KitEventType.DISCONNECT, () => listener({ disconnected: true }));
    },
  };
}
