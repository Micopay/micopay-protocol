#!/usr/bin/env bash
# Revision L0: labs/ vive aparte y nunca llega a produccion.
#
# Uso: bash labs/ci/guard.sh <base> <es_pr_de_labs>
#   <base>            commit contra el que se compara el PR (p. ej. origin/main)
#   <es_pr_de_labs>   true si el titulo o la rama del PR dicen "labs"
#
# 1. Un PR de labs solo cambia labs/ y este workflow. Las unicas bajas fuera de
#    labs/ permitidas son las del codigo que se muda a labs/ (R1, agent-tier).
# 2. En todo PR: la app, los manifiestos, los despliegues y los scripts no
#    mencionan labs/, un WASM de labs ni un ID de contrato de labs.
set -euo pipefail

BASE="${1:?falta la base}"
IS_LABS="${2:-false}"
fail=0

if [ "$IS_LABS" = "true" ]; then
  outside=$(git diff --name-only --diff-filter=d "$BASE"...HEAD \
    | grep -v -E '^labs/' \
    | grep -v -x -F '.github/workflows/labs.yml' || true)
  deleted=$(git diff --name-only --diff-filter=D "$BASE"...HEAD \
    | grep -v -E '^labs/' \
    | grep -v -E '^micopay/contracts/agent-tier/|^micopay/circuits/agent_tier_v1/' || true)
  if [ -n "$outside$deleted" ]; then
    echo "::error::Un PR de labs solo puede cambiar labs/. Archivos fuera de labs/:"
    printf '%s\n' "$outside" "$deleted" | sed '/^$/d'
    fail=1
  fi
fi

# Lo que forma parte de la app o de su despliegue.
APP_PATHS=(micopay/backend micopay/frontend micopay/sql micopay/scripts deploy docker-compose.yml .github/workflows/ci.yml)

# labs/ como ruta (no "@lit-labs/"), el nombre del crate o del WASM.
PATTERN='(^|[^A-Za-z0-9@_-])labs/|micopay[-_]labs[-_]'
hits=$(git grep -n -I -E "$PATTERN" -- "${APP_PATHS[@]}" || true)

# IDs de contratos de labs desplegados en testnet, uno por linea.
if [ -f labs/contract-ids.txt ]; then
  while read -r id; do
    case "$id" in ''|'#'*) continue ;; esac
    found=$(git grep -n -I -F "$id" -- "${APP_PATHS[@]}" || true)
    hits="$hits${found:+$'\n'$found}"
  done < labs/contract-ids.txt
fi

hits=$(printf '%s\n' "$hits" | sed '/^$/d')
if [ -n "$hits" ]; then
  echo "::error::La app o su despliegue mencionan labs. Nada de labs/ va a produccion:"
  printf '%s\n' "$hits"
  fail=1
fi

if [ "$fail" -eq 0 ]; then echo "labs/ esta aislado."; fi
exit "$fail"
