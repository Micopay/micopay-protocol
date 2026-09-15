import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ESCROW_ASSET_OPTIONS,
  getEscrowAssetOption,
  type EscrowAssetOption,
} from '../constants/escrowAssets';
import { getEscrowAssetRate, type TradeFlow } from '../services/api';

/* WP-C del plan de selector de activo (docs/PLAN_SELECTOR_ACTIVO_2026-09-14.md).

   Con que activo se respalda la operacion, elegido en la pantalla de monto.
   Lo elige siempre el cliente: en cash-out es lo que entrega; en deposito, lo
   que recibe (ahi bloquea el agente).

   Tres reglas que no son de estilo:

   1. El peso es el numero principal. Aqui solo aparece el equivalente
      ESTIMADO, rotulado como tal. La tasa vinculante la congela el servidor al
      crear la operacion; esta nunca se envia.

   2. Las opciones sin escrow son radios nativos con `disabled`. `aria-disabled`
      solo no impide activarlas con teclado.

   3. Un fallo de la tasa oculta el equivalente y lo dice, pero NO bloquea
      continuar: la operacion se puede crear igual y el servidor fija la tasa.

   Sin color por token: en Mercado/Rotulo el color significa digital frente a
   efectivo. El activo se distingue por su codigo. */

/** El monto minimo de una operacion (backend: POST /trades). */
const MIN_AMOUNT_MXN = 100;

type RateState =
  | { status: 'loading' }
  | { status: 'ready'; rate: number }
  | { status: 'error' };

export interface AssetSelectorProps {
  flow: TradeFlow;
  /** Monto en pesos tal como esta escrito; null/NaN si no es un numero. */
  amountMxn: number | null;
  /** Clave de `ESCROW_ASSET_OPTIONS`. */
  value: string;
  onChange: (key: string) => void;
  /** Inyectable para pruebas. */
  fetchRate?: (code: string) => Promise<{ rate: number }>;
}

function formatUnits(value: number, decimals: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function AssetSelector({
  flow,
  amountMxn,
  value,
  onChange,
  fetchRate = getEscrowAssetRate,
}: AssetSelectorProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'es-MX';
  const selected = getEscrowAssetOption(value);
  const [rate, setRate] = useState<RateState>({ status: 'loading' });

  // La tasa se pide al montar y al cambiar de activo, no por tecla: el
  // equivalente se recalcula localmente con el monto. `cancelled` descarta la
  // respuesta de un activo que ya no esta seleccionado.
  useEffect(() => {
    if (!selected?.enabled) return;
    let cancelled = false;
    setRate({ status: 'loading' });
    fetchRate(selected.code)
      .then((r) => {
        if (cancelled) return;
        setRate(Number.isFinite(r.rate) && r.rate > 0 ? { status: 'ready', rate: r.rate } : { status: 'error' });
      })
      .catch(() => {
        if (!cancelled) setRate({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.code, selected?.enabled, fetchRate]);

  const title = flow === 'cashout' ? t('escrowAsset.payWith') : t('escrowAsset.receiveIn');
  const hasAmount = amountMxn !== null && Number.isFinite(amountMxn) && amountMxn >= MIN_AMOUNT_MXN;

  const renderEstimate = (option: EscrowAssetOption) => {
    if (rate.status === 'error') {
      return <p className="text-[13px] text-gris" role="status">{t('escrowAsset.rateUnavailable')}</p>;
    }
    if (!hasAmount) return null;
    if (rate.status === 'loading') {
      return <p className="text-[13px] text-gris" aria-busy="true">{t('escrowAsset.rateLoading')}</p>;
    }
    return (
      <p className="num text-[13px] text-gris" data-testid="asset-estimate">
        {t('escrowAsset.estimate', {
          units: formatUnits(amountMxn! / rate.rate, option.displayDecimals, locale),
          code: option.code,
          rate: formatUnits(rate.rate, 2, locale),
        })}
      </p>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] font-bold text-gris">{title}</legend>
      <div className="flex flex-col divide-y-2 divide-tinta rounded-sm border-2 border-tinta bg-papel">
        {ESCROW_ASSET_OPTIONS.map((option) => {
          const id = `escrow-asset-${option.key.replace(':', '-')}`;
          const checked = option.key === value;
          return (
            <label
              key={option.key}
              htmlFor={id}
              className={`flex min-h-12 items-start gap-3 px-3 py-3 ${
                option.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
              }`}
            >
              <input
                id={id}
                type="radio"
                name="escrow-asset"
                value={option.key}
                checked={checked}
                disabled={!option.enabled}
                onChange={() => option.enabled && onChange(option.key)}
                className="mt-1 h-4 w-4 accent-tinta"
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold text-tinta">
                    {option.code} <span className="font-normal text-gris">· {option.networkLabel}</span>
                  </span>
                  {!option.enabled ? (
                    <span className="text-[11px] font-bold uppercase tracking-[.1em] text-gris">
                      {t('escrowAsset.comingSoon')}
                    </span>
                  ) : null}
                </span>
                {checked && option.enabled ? renderEstimate(option) : null}
              </span>
            </label>
          );
        })}
      </div>
      {/* Con la tasa caida, `rateUnavailable` ya dice que se fija al crear. */}
      {selected?.enabled && rate.status !== 'error' ? (
        <p className="text-[12px] text-gris">{t('escrowAsset.rateLocksOnCreate')}</p>
      ) : null}
    </fieldset>
  );
}
