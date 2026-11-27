#!/usr/bin/env bash
# Demo completa con Docker (Git Bash en Windows o Linux). No toca la red.
#   1. tests del circuito          -> nargo en contenedor
#   2. prueba real de Lupe          -> bb prove + bb verify off-chain
#   3. tests del contrato           -> verifica ESA prueba dentro de Soroban
# Uso: bash micopay/circuits/agent_tier_v1/scripts/demo.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."   # -> micopay/
ROOT=$(pwd -W 2>/dev/null || pwd)
export MSYS_NO_PATHCONV=1

docker image inspect micopay-zk-toolchain >/dev/null 2>&1 \
  || docker build -t micopay-zk-toolchain circuits/agent_tier_v1/toolchain

echo "== 1. Circuito agent_tier_v1 =="
docker run --rm -v "$ROOT:/work" -w /work/circuits/agent_tier_v1 micopay-zk-toolchain nargo test

echo "== 2. Prueba real (Lupe prueba Plata sin revelar 37 ops / 97 %) =="
docker run --rm -v "$ROOT:/work" micopay-zk-toolchain bash /work/circuits/agent_tier_v1/scripts/build_proof.sh \
  | grep -E "verified|OFFCHAIN|proof|vk|public_inputs"

echo "== 3. Contrato Soroban verificando la prueba =="
docker run --rm -v "$ROOT:/work" -v micopay-cargo-cache:/usr/local/cargo/registry \
  -v micopay-cargo-git:/usr/local/cargo/git -w /work/contracts/agent-tier rust:1 \
  bash -c 'cargo test -q -- --test-threads=1 --nocapture 2>&1 | grep -E "CPU|test result|FAILED"'
