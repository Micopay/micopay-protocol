import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const IS_PUBLIC = ['PUBLIC', 'MAINNET'].includes(String(import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET').toUpperCase());

/** Siempre visible en la web: firmar en la red equivocada es el error que importa aqui. */
export default function NetworkBanner() {
  return (
    <div role="status" className="bg-tinta text-papel text-xs font-bold text-center py-1 px-4">
      {IS_PUBLIC ? tr('networkBanner.mainnet') : tr('networkBanner.testnet')}
    </div>
  );
}
