/**
 * Publica MicoPay web. Los assets y el respaldo de SPA los da Cloudflare; aqui
 * solo se agregan cabeceras y `stellar.toml`.
 *
 * La CSP sale en report-only: se pasa a bloqueo cuando un recorrido completo con
 * Varial y WalletConnect no reporte violaciones.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://explorer-api.walletconnect.com",
  "connect-src 'self' https://api.micopay.app https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org https://*.basemaps.cartocdn.com https://rpc.walletconnect.org https://verify.walletconnect.org wss://relay.walletconnect.org https://relay.walletconnect.org",
  "worker-src 'self' blob:",
  "frame-src https://verify.walletconnect.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy-Report-Only': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function stellarToml(env) {
  return [
    `NETWORK_PASSPHRASE="${env.NETWORK_PASSPHRASE}"`,
    `WEB_AUTH_ENDPOINT="${env.WEB_AUTH_ENDPOINT}"`,
    `SIGNING_KEY="${env.SEP10_SIGNING_KEY}"`,
    '',
  ].join('\n');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/.well-known/stellar.toml') {
      if (!env.SEP10_SIGNING_KEY) return new Response('Not found', { status: 404 });
      return new Response(stellarToml(env), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    const secured = new Response(response.body, response);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
    return secured;
  },
};
