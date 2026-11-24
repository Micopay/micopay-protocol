import { strictEqual, deepStrictEqual } from 'node:assert';
import { applySlippageBps, quoteStrictSendPath } from '../services/stellarDex.service.js';

async function main() {
  strictEqual(applySlippageBps('563.8114263', 100), '558.1733120');
  strictEqual(applySlippageBps('1', 0), '1.0000000');

  let requested = '';
  const fakeFetch: typeof fetch = async (input) => {
    requested = String(input);
    return new Response(JSON.stringify({
      _embedded: {
        records: [
          { source_amount: '10.0000000', destination_amount: '162.8040000', path: [] },
          { source_amount: '10.0000000', destination_amount: '563.8114263', path: [{ asset_type: 'native' }] },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const quote = await quoteStrictSendPath(
    { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
    '10',
    { code: 'CETES', issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4' },
    fakeFetch,
  );
  strictEqual(quote.destinationAmount, '563.8114263');
  deepStrictEqual(quote.path, [{ code: 'XLM' }]);
  strictEqual(requested.includes('/paths/strict-send?'), true);
  strictEqual(requested.includes('source_asset_code=USDC'), true);
  strictEqual(requested.includes('destination_assets=CETES%3AGC3'), true);

  console.log('All Stellar DEX quote tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
