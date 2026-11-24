import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

// Central registry of the assets the wallet can hold / send / receive.
// Issuers come from env so testnet/mainnet swap without code changes.

/* Sin campo `color`: en el sistema "Mercado / Rótulo" el color significa
   digital-vs-efectivo, no "qué token". El activo se distingue por su CÓDIGO.
   Ver §4.3 y D-5 de docs/PLAN_REDISENO_VISUAL_APK_2026-08.md. */
export interface AssetDef {
  /** Asset code as it appears on-chain (e.g. 'XLM', 'USDC', 'CETES'). */
  code: string;
  /** Human label shown in the UI. */
  label: string;
  /** True for the native Lumens asset. */
  native: boolean;
  /** Classic-asset issuer (undefined for native). */
  issuer?: string;
  /** Display decimals. */
  decimals: number;
  /** Short note shown on the receive screen. */
  note?: string;
}

const USDC_ISSUER = import.meta.env.VITE_USDC_ISSUER as string | undefined;
const CETES_ISSUER = import.meta.env.VITE_CETES_ISSUER as string | undefined;

// Los textos son getters: se leen al pintar, asi siguen el idioma activo.
export const ASSETS: AssetDef[] = [
  { code: 'USDC', label: 'USD Coin', native: false, issuer: USDC_ISSUER, decimals: 2, get note() { return tr('assets.usdcNote'); } },
  { code: 'CETES', get label() { return tr('assets.cetesLabel'); }, native: false, issuer: CETES_ISSUER, decimals: 2, get note() { return tr('assets.cetesNote'); } },
  { code: 'XLM', label: 'Stellar Lumens', native: true, decimals: 4, get note() { return tr('assets.xlmNote'); } },
];

export function getAsset(code: string): AssetDef | undefined {
  return ASSETS.find((a) => a.code.toLowerCase() === code.toLowerCase());
}

/** Assets that are actually configured (have an issuer, or are native). */
export const SENDABLE_ASSETS: AssetDef[] = ASSETS.filter((a) => a.native || !!a.issuer);
