# MicoPay — paso a mainnet (escrow en USDC)

Guía para el día en que la cuenta de plataforma tenga XLM. Todo lo que no
necesita fondos ya está hecho y probado (ver "Ensayo").

## Valores fijos

| Qué | Valor |
|---|---|
| Cuenta de plataforma (mainnet) | `GBJBANDW2HTOTULIDH4CWSIEXXSGVTJTR2IFEIRJCQDX3NXDP63KQ6DK` (alias `micopay-platform-mainnet` del CLI `stellar`, solo en la PC de Eric) |
| USDC (Circle) | `USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| SAC de USDC | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` (verificado en cadena 2026-10-07) |
| RPC | `https://mainnet.sorobanrpc.com` (respaldo: `https://soroban-rpc.mainnet.stellar.gateway.fm`, `https://rpc.lightsail.network`) |
| Escrow (mainnet) | _pendiente: lo imprime `deploy-mainnet.sh`_ |

## 1. Contrato

Requiere el fix de `lock` (PR #420) en main.

```bash
cd micopay/contracts
bash deploy-mainnet.sh   # trustline USDC de la plataforma, deploy, initialize
```

## 2. Backend (dos servicios, la misma imagen)

| | testnet | mainnet |
|---|---|---|
| Dominio | `api-testnet.micopay.app` | `api.micopay.app` |
| Base | `micopay` (la actual) | `micopay_mainnet` (mismo RDS) |
| `STELLAR_NETWORK` | `TESTNET` | `PUBLIC` |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | RPC de arriba |
| `ESCROW_CONTRACT_ID` | `CB4M…LO3HZ` | el del paso 1 |
| `ESCROW_ASSET` | `XLM` | `USDC` |
| `SEED_DEMO_DATA` | `true` | `false` |
| Secretos SSM | `/micopay/prod/*` | `/micopay/mainnet/*`: `DATABASE_URL`, `JWT_SECRET` y `SECRET_ENCRYPTION_KEY` nuevos, `PLATFORM_SECRET_KEY` de mainnet |

`MXNE_CONTRACT_ID` ya es opcional. Pasos: crear la base y migrarla, los
parametros SSM, la task definition `micopay-backend-mainnet`, el target group
y la regla por host en el listener 443 de `micopay-alb`, el servicio, y el DNS
de `api-testnet` en Cloudflare.

## 3. Agente de la demo

```bash
cd micopay/backend
MICOPAY_NETWORK=mainnet npx tsx scripts/demo-agent/bot.ts setup   # imprime la direccion a fondear
# mandarle ~3 XLM, volver a correr setup (crea la trustline de USDC)
# activar el KYC por SQL en micopay_mainnet, como agente_demo_rgjo
MICOPAY_NETWORK=mainnet npx tsx scripts/demo-agent/bot.ts run
```

## 4. APK

`npm run build:mainnet` en `micopay/frontend` (`.env.mainnet`: `PUBLIC`,
`VITE_ESCROW_ASSET_CODE=USDC`, `api.micopay.app`). La billetera del cliente
necesita XLM, trustline de USDC y los USDC a retirar.

## Ensayo (testnet, 2026-10-07)

`backend/scripts/ensayo-usdc/ensayo.ts` emite un "USDC" propio en testnet,
despliega el escrow con `deploy-mainnet.sh` y recorre un retiro de $500 por la
API contra el backend local con `ESCROW_ASSET=USDC`. Resultado: lock, QR,
merchant-confirm y release confirmados; el agente recibio 27.8111295 USDC, la
plataforma 0.2224890 y el cliente pago 28.0336185 (tasa 17.978).
Release: https://stellar.expert/explorer/testnet/tx/2e54495a55d108ca12b77623106bcdf0b503ff17a3123b241d07d91824ae73eb

Pendiente conocido: H5, el contrato no cobra la comision del agente
(`docs/PLAN_COMISIONES_EFECTIVO_2026-09-24.md`).
