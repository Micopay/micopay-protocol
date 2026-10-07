#!/usr/bin/env bash
# Despliega la instancia del escrow de MAINNET, que bloquea USDC de Circle.
#
# Requisitos:
#   - Llave de plataforma en el CLI de stellar con el alias de abajo, fondeada
#     con XLM real (~10 XLM: despliegue, reserva de la trustline y comisiones).
#   - Ejecutar desde micopay/contracts.
#
# Pasos (cada uno se puede repetir sin romper nada, salvo initialize, que el
# contrato rechaza una segunda vez):
#   1. trustline de USDC en la cuenta de plataforma (recibe la comision en release)
#   2. build + deploy del WASM
#   3. initialize(admin, token USDC, wallet de plataforma)
set -euo pipefail

SOURCE="${SOURCE:-micopay-platform-mainnet}"
RPC_URL="${RPC_URL:-https://mainnet.sorobanrpc.com}"
PASSPHRASE="${PASSPHRASE:-Public Global Stellar Network ; September 2015}"
HORIZON="${HORIZON:-https://horizon.stellar.org}"
USDC_ASSET="${USDC_ASSET:-USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN}"
# SAC de USDC en mainnet: Asset('USDC', GA5Z…).contractId(Networks.PUBLIC),
# verificado en cadena el 2026-10-07 (ejecutable = Stellar Asset).
USDC_SAC="${USDC_SAC:-CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75}"
# Las variables de arriba se pueden sobrescribir para ensayar en testnet.

NET=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE")
PLATFORM="$(stellar keys address "$SOURCE")"
echo "Plataforma: $PLATFORM"

echo "1/3 Trustline de USDC en la cuenta de plataforma…"
# Se busca el EMISOR, no solo el codigo: cualquiera puede emitir un "USDC".
if curl -s "$HORIZON/accounts/$PLATFORM" | grep -q "\"asset_issuer\": \"${USDC_ASSET#*:}\""; then
  echo "    ya existe"
else
  stellar tx new change-trust --source "$SOURCE" --line "$USDC_ASSET" "${NET[@]}"
fi

echo "2/3 Build y deploy…"
(cd escrow && stellar contract build)
CONTRACT_ID="$(stellar contract deploy \
  --wasm escrow/target/wasm32v1-none/release/micopay_escrow.wasm \
  --source "$SOURCE" "${NET[@]}")"
echo "    contrato: $CONTRACT_ID"

echo "3/3 initialize…"
stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" "${NET[@]}" -- \
  initialize --admin "$PLATFORM" --token_id "$USDC_SAC" --platform_wallet "$PLATFORM"

cat <<EOF

Listo. Registra el contrato en MAINNET.md y en la task definition de mainnet:
  ESCROW_CONTRACT_ID=$CONTRACT_ID
  ESCROW_ASSET=USDC
  STELLAR_NETWORK=PUBLIC
  STELLAR_RPC_URL=$RPC_URL
EOF
