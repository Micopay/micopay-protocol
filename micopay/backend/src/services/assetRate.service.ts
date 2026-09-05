/**
 * WP2 del plan de escrow multiactivo · La UNICA conversion peso -> activo.
 *
 * El peso es la denominacion del acuerdo: dos personas quedan por "quinientos
 * pesos", no por "159.9 XLM". El activo y su tasa son metadata de esa operacion.
 * Aqui vive la traduccion entre ambos, y **nadie mas multiplica**.
 *
 * EL FALLO QUE ESTO ARREGLA (2026-09-05)
 * --------------------------------------
 * El backend hacia `amount_stroops = amount_mxn * 10^7`, es decir, trataba
 * 1 MXN como 1 unidad del activo. Con el escrow bloqueando XLM a ~3.13 MXN,
 * una operacion de 500 pesos bloqueaba 500 XLM = ~1 563 pesos: el cliente
 * entregaba 3.13 veces lo que valia la operacion.
 *
 * No fue un descuido al escribirlo. `contracts/TESTNET.md` etiquetaba el
 * contrato del XLM nativo como "MXNe token contract"; el diagnostico WP0 de
 * julio leyo bien el token en cadena, lo comparo contra esa tabla y concluyo
 * —de forma razonable y equivocada— que el escrow guardaba un peso digital, con
 * lo que la conversion 1:1 parecia correcta. La verificacion fue real; la
 * referencia estaba mal.
 *
 * ARITMETICA
 * ----------
 * Sin floats encadenados. La tasa se escala a entero (7 decimales, igual que
 * los stroops) y toda la division se hace en BigInt. El redondeo es
 * **half-up**, definido aqui una sola vez y probado en los bordes.
 *
 * Se redondea al alza en el empate a proposito: el vendedor bloquea, como mucho,
 * un stroop de mas. Redondear a la baja podria dejar el escrow por debajo de lo
 * pactado, y quedarse corto en dinero ajeno es peor que pasarse por 0.0000001.
 */

import type { FastifyRequest } from 'fastify';
import { BadRequestError } from '../utils/errors.js';
import { getRateMxn } from '../routes/rate.js';

/** Decimales de un token Soroban estandar (y de XLM). */
const SCALE = 10_000_000n;

export interface AssetConversion {
  /** Cantidad del activo, en stroops (7 decimales). */
  stroops: bigint;
  /** MXN por 1 unidad del activo, congelada en la operacion. */
  rateMxn: string;
  /** De donde salio la tasa, para poder explicarla en una disputa. */
  rateSource: string;
  assetCode: SupportedAsset;
}

/**
 * Activos que el escrow sabe manejar hoy.
 *
 * XLM es el unico desplegado: el contrato `CB4M…` tiene como `TokenId` el
 * Stellar Asset Contract del nativo (verificado en cadena el 2026-09-05, y
 * confirmado ademas porque su `symbol()` devuelve "native").
 *
 * USDC y MXNe entran cuando WP3 despliegue sus instancias. La tabla existe ya
 * para que anadirlos no obligue a tocar la aritmetica, que es la parte delicada.
 */
const ASSETS = {
  XLM: { pair: 'xlm-mxn' as const, fixedRate: null },
  USDC: { pair: 'usdc-mxn' as const, fixedRate: null },
  /** Peso digital: 1 MXNe = 1 MXN por definicion, sin consultar a nadie. */
  MXNE: { pair: null, fixedRate: '1' },
} as const;

export type SupportedAsset = keyof typeof ASSETS;

export const DEFAULT_ASSET: SupportedAsset = 'XLM';

export function isSupportedAsset(code: string): code is SupportedAsset {
  return Object.prototype.hasOwnProperty.call(ASSETS, code);
}

/**
 * Convierte una tasa decimal ("3.126827") a entero escalado, sin pasar por
 * float. `parseFloat` sobre una tasa de 7 decimales ya introduce error, y ese
 * error acaba multiplicado por el monto.
 */
export function rateToScaled(rateMxn: string): bigint {
  const [whole, frac = ''] = String(rateMxn).trim().split('.');
  const padded = (frac + '0'.repeat(7)).slice(0, 7);
  const scaled = BigInt(whole || '0') * SCALE + BigInt(padded || '0');
  if (scaled <= 0n) {
    throw new BadRequestError(`Invalid exchange rate: ${rateMxn}`);
  }
  return scaled;
}

/**
 * Pesos -> stroops del activo, con redondeo half-up.
 *
 *     stroops = round(amountMxn * 10^7 / rateMxn)
 *
 * Con MXNE (tasa 1) devuelve exactamente `amountMxn * 10^7`, que es el
 * comportamiento historico: los montos de una operacion en pesos digitales no
 * cambian ni un stroop respecto a antes de este cambio.
 */
export function mxnToStroops(amountMxn: number, rateScaled: bigint): bigint {
  if (!Number.isInteger(amountMxn) || amountMxn < 0) {
    throw new BadRequestError(`Invalid MXN amount: ${amountMxn}`);
  }
  const numerator = BigInt(amountMxn) * SCALE * SCALE;
  // half-up: sumar la mitad del divisor antes de la division entera.
  return (numerator + rateScaled / 2n) / rateScaled;
}

/**
 * Resuelve la tasa viva del activo y convierte. La tasa devuelta se persiste en
 * la operacion: a partir de ese momento el acuerdo queda congelado y no lo
 * mueve una fluctuacion del mercado.
 */
export async function convertMxnToAsset(
  amountMxn: number,
  assetCode: string,
  request: FastifyRequest,
): Promise<AssetConversion> {
  const code = assetCode.toUpperCase();
  if (!isSupportedAsset(code)) {
    throw new BadRequestError(
      `Unsupported escrow asset: ${assetCode}. Supported: ${Object.keys(ASSETS).join(', ')}`,
    );
  }

  const spec = ASSETS[code];

  if (spec.fixedRate) {
    const rateScaled = rateToScaled(spec.fixedRate);
    return {
      stroops: mxnToStroops(amountMxn, rateScaled),
      rateMxn: spec.fixedRate,
      rateSource: 'fixed',
      assetCode: code,
    };
  }

  const { rate, source } = await getRateMxn(spec.pair!, request);
  const rateScaled = rateToScaled(rate);

  return {
    stroops: mxnToStroops(amountMxn, rateScaled),
    rateMxn: rate,
    rateSource: source,
    assetCode: code,
  };
}

/**
 * Reconstruye la conversion de una operacion YA CREADA usando su tasa
 * congelada. Es lo que deben usar el bloqueo y la verificacion del XDR: volver
 * a consultar la tasa viva ahi cambiaria el monto pactado por detras.
 */
export function stroopsAtFrozenRate(amountMxn: number, rateMxn: string): bigint {
  return mxnToStroops(amountMxn, rateToScaled(rateMxn));
}
