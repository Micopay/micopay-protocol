// Central registry of the assets the wallet can hold / send / receive.
// Issuers come from env so testnet/mainnet swap without code changes.

export interface AssetDef {
  /** Asset code as it appears on-chain (e.g. 'XLM', 'MXNe', 'USDC', 'CETES'). */
  code: string;
  /** Human label shown in the UI. */
  label: string;
  /** True for the native Lumens asset. */
  native: boolean;
  /** Classic-asset issuer (undefined for native). */
  issuer?: string;
  /** Display decimals. */
  decimals: number;
  /** Accent colour for chips/avatars. */
  color: string;
  /** Short note shown on the receive screen. */
  note?: string;
}

const MXNE_ISSUER = import.meta.env.VITE_MXNE_ISSUER_ADDRESS as string | undefined;
const USDC_ISSUER = import.meta.env.VITE_USDC_ISSUER as string | undefined;
const CETES_ISSUER = import.meta.env.VITE_CETES_ISSUER as string | undefined;

export const ASSETS: AssetDef[] = [
  { code: 'MXNe', label: 'Peso Digital', native: false, issuer: MXNE_ISSUER, decimals: 2, color: '#00694C', note: 'Peso mexicano digital 1:1' },
  { code: 'USDC', label: 'USD Coin', native: false, issuer: USDC_ISSUER, decimals: 2, color: '#2775CA', note: 'Dólar digital' },
  { code: 'CETES', label: 'CETES tokenizados', native: false, issuer: CETES_ISSUER, decimals: 2, color: '#B8860B', note: 'Bono del Gobierno de México' },
  { code: 'XLM', label: 'Stellar Lumens', native: true, decimals: 4, color: '#7B61FF', note: 'Token de red (gas)' },
];

export function getAsset(code: string): AssetDef | undefined {
  return ASSETS.find((a) => a.code.toLowerCase() === code.toLowerCase());
}

/** Assets that are actually configured (have an issuer, or are native). */
export const SENDABLE_ASSETS: AssetDef[] = ASSETS.filter((a) => a.native || !!a.issuer);
