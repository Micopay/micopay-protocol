/**
 * WP-B del plan de selector de activo (docs/PLAN_SELECTOR_ACTIVO_2026-09-14.md).
 *
 * Los activos con los que se puede RESPALDAR una operacion de efectivo. No es el
 * catalogo de la cartera (`constants/assets.ts`): aquel lista lo que la cartera
 * tiene y envia, incluido CETES; este, lo que un escrow puede bloquear.
 *
 * Solo XLM en Stellar esta habilitado: es el unico con escrow desplegado. La
 * misma politica vive en el backend (`ENABLED_ESCROW_ASSETS`), que rechaza con
 * 422 cualquier otro activo; `enabled` aqui solo decide que se puede elegir en
 * la pantalla, nunca que se pueda operar.
 *
 * LIMITE (D4 del plan): `key` = red + codigo identifica una opcion del catalogo,
 * no un token on-chain. Un activo emitido (USDC, MXNe) necesita ademas issuer o
 * contrato; eso se resuelve cuando se habilite el primero (WP3).
 *
 * Sin campo de color: en Mercado/Rotulo el color significa digital frente a
 * efectivo, no "que token". El activo se distingue por su codigo.
 */

export type EscrowNetwork = 'stellar' | 'xrpl' | 'solana';

export interface EscrowAssetOption {
  /** Clave estable de catalogo: `<network>:<code>`. */
  key: string;
  /** Lo que viaja como `asset_code` en `POST /trades`. */
  code: string;
  network: EscrowNetwork;
  /** Nombre de la red para la UI. */
  networkLabel: string;
  /** Se puede elegir. Solo los activos con escrow desplegado. */
  enabled: boolean;
  /**
   * Decimales para MOSTRAR el equivalente. No es la precision del token: las
   * cifras reales llegan del servidor en unidades minimas.
   */
  displayDecimals: number;
}

export const ESCROW_ASSET_OPTIONS: readonly EscrowAssetOption[] = [
  { key: 'stellar:XLM', code: 'XLM', network: 'stellar', networkLabel: 'Stellar', enabled: true, displayDecimals: 2 },
  { key: 'stellar:USDC', code: 'USDC', network: 'stellar', networkLabel: 'Stellar', enabled: false, displayDecimals: 2 },
  { key: 'stellar:MXNE', code: 'MXNe', network: 'stellar', networkLabel: 'Stellar', enabled: false, displayDecimals: 2 },
  { key: 'xrpl:XRP', code: 'XRP', network: 'xrpl', networkLabel: 'XRPL', enabled: false, displayDecimals: 2 },
  { key: 'solana:USDC', code: 'USDC', network: 'solana', networkLabel: 'Solana', enabled: false, displayDecimals: 2 },
];

export const DEFAULT_ESCROW_ASSET_KEY = 'stellar:XLM';

export function getEscrowAssetOption(key: string): EscrowAssetOption | undefined {
  return ESCROW_ASSET_OPTIONS.find((o) => o.key === key);
}

/**
 * La opcion por defecto. El test del catalogo fija que existe y esta
 * habilitada; si alguien la rompe, esto falla fuerte en vez de mandar un
 * activo que el backend rechazaria.
 */
export function getDefaultEscrowAsset(): EscrowAssetOption {
  const option = getEscrowAssetOption(DEFAULT_ESCROW_ASSET_KEY);
  if (!option || !option.enabled) {
    throw new Error(`Default escrow asset ${DEFAULT_ESCROW_ASSET_KEY} is missing or disabled`);
  }
  return option;
}
