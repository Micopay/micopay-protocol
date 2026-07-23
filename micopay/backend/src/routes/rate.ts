import type { FastifyInstance } from 'fastify';

const CACHE_TTL_MS = 60_000;
const TIMEOUT_MS = 5_000;
// Last-resort estimate only if every live source fails AND there's no cache.
const FALLBACK_RATE = Number(process.env.XLM_MXN_FALLBACK ?? 3.2);

interface CacheEntry {
  rate: number;
  source: string;
  fetchedAt: string;
}

let cache: CacheEntry | null = null;

/** @internal — exposed for testing */
export function __resetCache(): void {
  cache = null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

const j = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json', 'User-Agent': 'micopay/1.0' } }).then(
    (r) => {
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json() as Promise<any>;
    },
  );

/** USD→MXN from er-api (open, no key). */
async function getUsdMxn(): Promise<number> {
  const d = await j('https://open.er-api.com/v6/latest/USD');
  const v = Number(d?.rates?.MXN);
  if (!(v > 0)) throw new Error('er-api MXN missing');
  return v;
}

/**
 * Live XLM→MXN sources, ordered by reliability from a US datacenter egress
 * (Render). Coinbase/Kraken allow US/cloud IPs; Binance geo-blocks them;
 * CoinGecko rate-limits them. First source that returns a valid rate wins.
 */
const SOURCES: Array<() => Promise<CacheEntry>> = [
  // Coinbase XLM-USD × er-api USD-MXN
  async () => {
    const d = await j('https://api.coinbase.com/v2/prices/XLM-USD/spot');
    const xlmUsd = Number(d?.data?.amount);
    if (!(xlmUsd > 0)) throw new Error('coinbase bad');
    return { rate: round(xlmUsd * (await getUsdMxn())), source: 'coinbase+erapi', fetchedAt: new Date().toISOString() };
  },
  // Kraken XLMUSD × er-api USD-MXN
  async () => {
    const d = await j('https://api.kraken.com/0/public/Ticker?pair=XLMUSD');
    const xlmUsd = parseFloat(d?.result?.XXLMZUSD?.c?.[0]);
    if (!(xlmUsd > 0)) throw new Error('kraken bad');
    return { rate: round(xlmUsd * (await getUsdMxn())), source: 'kraken+erapi', fetchedAt: new Date().toISOString() };
  },
  // CoinGecko direct XLM→MXN
  async () => {
    const d = await j('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=mxn');
    const rate = Number(d?.stellar?.mxn);
    if (!(rate > 0)) throw new Error('coingecko bad');
    return { rate, source: 'coingecko', fetchedAt: new Date().toISOString() };
  },
  // Binance XLMUSDT × er-api (may be geo-blocked)
  async () => {
    const d = await j('https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT');
    const xlmUsd = parseFloat(d?.price);
    if (!(xlmUsd > 0)) throw new Error('binance bad');
    return { rate: round(xlmUsd * (await getUsdMxn())), source: 'binance+erapi', fetchedAt: new Date().toISOString() };
  },
];

export async function rateRoutes(app: FastifyInstance) {
  app.get('/rate/xlm-mxn', async (request) => {
    const now = Date.now();

    if (cache && now - new Date(cache.fetchedAt).getTime() < CACHE_TTL_MS) {
      return cache;
    }

    for (const source of SOURCES) {
      try {
        const fresh = await source();
        cache = fresh;
        return fresh;
      } catch (err) {
        request.log.warn({ err: err instanceof Error ? err.message : err, category: 'rate' }, '[rate] source failed, trying next');
      }
    }

    // Everything failed: serve last-known cache if any, else a marked estimate.
    if (cache) return { ...cache, stale: true };
    return { rate: FALLBACK_RATE, source: 'fallback', fetchedAt: new Date().toISOString(), stale: true };
  });
}
