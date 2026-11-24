export interface StellarAssetRef {
  code: string;
  issuer?: string;
}

export interface StrictSendPathQuote {
  sourceAmount: string;
  destinationAmount: string;
  path: StellarAssetRef[];
}

interface HorizonPathAsset {
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
}

interface HorizonStrictSendRecord {
  source_amount: string;
  destination_amount: string;
  path: HorizonPathAsset[];
}

function horizonUrl(): string {
  if (process.env.HORIZON_URL) return process.env.HORIZON_URL.replace(/\/$/, '');
  return process.env.STELLAR_NETWORK === 'PUBLIC'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

function assetType(asset: StellarAssetRef): 'native' | 'credit_alphanum4' | 'credit_alphanum12' {
  if (asset.code === 'XLM') return 'native';
  return asset.code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12';
}

function assetString(asset: StellarAssetRef): string {
  if (asset.code === 'XLM') return 'native';
  if (!asset.issuer) throw new Error(`stellarDex: falta issuer para ${asset.code}`);
  return `${asset.code}:${asset.issuer}`;
}

function fromHorizonAsset(asset: HorizonPathAsset): StellarAssetRef {
  if (asset.asset_type === 'native') return { code: 'XLM' };
  if (!asset.asset_code || !asset.asset_issuer) throw new Error('stellarDex: activo incompleto en Horizon');
  return { code: asset.asset_code, issuer: asset.asset_issuer };
}

function decimalToStroops(value: string): bigint {
  if (!/^[0-9]+(?:\.[0-9]{1,7})?$/.test(value)) throw new Error(`stellarDex: cantidad invalida ${value}`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
}

function stroopsToDecimal(value: bigint): string {
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, '0');
  return `${whole}.${fraction}`;
}

/** Reduce el destino para que un strict-receive tolere movimiento del DEX. */
export function applySlippageBps(amount: string, bps: number): string {
  if (!Number.isInteger(bps) || bps < 0 || bps >= 10_000) throw new Error('stellarDex: slippage bps invalido');
  const adjusted = decimalToStroops(amount) * BigInt(10_000 - bps) / 10_000n;
  if (adjusted <= 0n) throw new Error('stellarDex: resultado menor a un stroop');
  return stroopsToDecimal(adjusted);
}

/**
 * Cotiza una cantidad fija de entrada. La ejecución posterior usa
 * pathPaymentStrictReceive con el destino reducido por slippage: Etherfuse
 * recibe una cantidad exacta y el usuario nunca gasta más del sendMax.
 */
export async function quoteStrictSendPath(
  source: StellarAssetRef,
  sourceAmount: string,
  destination: StellarAssetRef,
  fetchImpl: typeof fetch = fetch,
): Promise<StrictSendPathQuote> {
  const params = new URLSearchParams({
    source_asset_type: assetType(source),
    source_amount: sourceAmount,
    destination_assets: assetString(destination),
  });
  if (source.code !== 'XLM') {
    if (!source.issuer) throw new Error(`stellarDex: falta issuer para ${source.code}`);
    params.set('source_asset_code', source.code);
    params.set('source_asset_issuer', source.issuer);
  }

  const res = await fetchImpl(`${horizonUrl()}/paths/strict-send?${params.toString()}`, {
    headers: { Accept: 'application/hal+json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`stellarDex: Horizon respondio ${res.status}`);
  const body = await res.json() as { _embedded?: { records?: HorizonStrictSendRecord[] } };
  const records = body._embedded?.records ?? [];
  if (records.length === 0) throw new Error(`stellarDex: no hay ruta ${source.code}->${destination.code}`);

  const best = records.reduce((a, b) => decimalToStroops(b.destination_amount) > decimalToStroops(a.destination_amount) ? b : a);
  return {
    sourceAmount: best.source_amount,
    destinationAmount: best.destination_amount,
    path: best.path.map(fromHorizonAsset),
  };
}
