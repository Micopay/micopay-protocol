/**
 * El desglose de comisiones de una operacion, en UN solo sitio.
 *
 * Antes se calculaba en dos, con criterios distintos, y no cuadraban:
 *
 *   · El descubrimiento anunciaba `payout = monto * (1 - tarifa)` e ignoraba la
 *     comision de plataforma por completo.
 *   · La pantalla de confirmacion deducia la parte del agente RESTANDO la de
 *     plataforma de ese total, con lo que un agente al 1.5% acababa cobrando
 *     0.7% sin enterarse.
 *   · Y `trades` no guardaba la comision del agente en ninguna columna, asi que
 *     al liquidar no habia numero que dijera cuanto le tocaba.
 *
 * DECISION DE PRODUCTO (2026-09-05): el cliente paga las dos. El agente cobra
 * su tarifa integra y la plataforma la suya aparte.
 *
 *     monto             500.00
 *     comision agente    -7.50   (1.5%)
 *     comision MicoPay   -4.00   (0.8%)
 *     ---------------------------------
 *     el cliente recibe 488.50
 *
 * El redondeo va SIEMPRE a favor de quien recibe la comision (`ceil`) y el
 * cliente absorbe los centavos. Es la convencion menos sorprendente: nadie
 * cobra de menos por un decimal, y el neto del cliente nunca sale mayor de lo
 * anunciado.
 */

/** Comision de MicoPay. El backend es la fuente de verdad; el frontend la espeja. */
export const PLATFORM_FEE_PERCENT = 0.8;

export interface TradeFeeBreakdown {
  amountMxn: number;
  /** Comision del agente, en MXN. */
  providerFeeMxn: number;
  /** Tarifa del agente vigente al calcular, congelada en la operacion. */
  providerRatePercent: number;
  /** Comision de MicoPay, en MXN. */
  platformFeeMxn: number;
  /** Lo que el cliente recibe limpio. */
  payoutMxn: number;
  /** Coste total sobre el monto, en %. Lo que de verdad le cuesta al cliente. */
  effectivePercent: number;
}

/**
 * @param amountMxn monto de la operacion
 * @param providerRatePercent tarifa del agente (`merchant_configs.rate_percent`)
 */
export function computeTradeFees(
  amountMxn: number,
  providerRatePercent: number,
): TradeFeeBreakdown {
  const rate = Number.isFinite(providerRatePercent) ? Math.max(0, providerRatePercent) : 0;

  // Con montos minusculos los DOS redondeos al alza pueden superar el
  // principal: 1 MXN al 0.3% da 1 de comision de agente y 1 de plataforma, o
  // sea 2 de comision sobre 1 de monto. Recortar solo el neto a cero dejaba la
  // suma sin cuadrar, y un desglose que no suma es un desglose que miente.
  //
  // Se topan las comisiones, en este orden: primero cobra el agente, que es
  // quien hace el trabajo, y la plataforma se queda con lo que reste. Asi las
  // tres partes suman SIEMPRE el monto.
  //
  // En la practica `min_trade_mxn` es 100, asi que este caso no ocurre; pero la
  // funcion tiene que ser coherente igualmente.
  const providerFeeMxn = Math.min(Math.ceil((amountMxn * rate) / 100), amountMxn);
  const platformFeeMxn = Math.min(
    Math.ceil((amountMxn * PLATFORM_FEE_PERCENT) / 100),
    amountMxn - providerFeeMxn,
  );

  const payoutMxn = amountMxn - providerFeeMxn - platformFeeMxn;

  const effectivePercent =
    amountMxn > 0
      ? Math.round(((providerFeeMxn + platformFeeMxn) / amountMxn) * 10000) / 100
      : 0;

  return {
    amountMxn,
    providerFeeMxn,
    providerRatePercent: rate,
    platformFeeMxn,
    payoutMxn,
    effectivePercent,
  };
}
