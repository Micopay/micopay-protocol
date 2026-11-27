# labs/

Experimentos de MicoPay en Soroban, **solo en testnet**. Nada de esta carpeta va a producción.

- El escrow de producción vive en `micopay/contracts/escrow/` y no se toca desde aquí.
- `labs/escrow-v2/` es una copia para experimentar con más funciones en cadena. **No es un plan de migración:** el escrow real se queda simple y se mejora por separado.
- La app (backend y frontend), sus manifiestos, los despliegues y los scripts **no usan nada de `labs/`**.

## Proyectos

| Carpeta | Qué es |
|---|---|
| `escrow-v2/` | Copia experimental del escrow, con más reglas en cadena (L1) |
| `agent-tier/` | Reputación privada de agentes con prueba ZK (trabajo de Raúl, R1) |

## Reglas

1. Solo testnet. Los scripts exigen la passphrase de testnet y se detienen si el RPC dice otra.
2. Sin secretos en el repo.
3. Un PR de labs (con `labs` en el título o en la rama) solo cambia `labs/`.
4. Cada función entra en su propio PR, con sus pruebas, y se fusiona con merge commit.
5. Cada contrato que se despliegue en testnet anota su ID en `contract-ids.txt`.

## Lo que revisa el CI (`.github/workflows/labs.yml`)

1. **Un PR de labs solo cambia `labs/`.** La única excepción es el propio workflow. Fuera de `labs/` solo se permite borrar el código que se muda aquí (`micopay/contracts/agent-tier/` y `micopay/circuits/agent_tier_v1/`).
2. **En todo PR:** la app y su despliegue no mencionan `labs/`, un WASM de labs (`micopay_labs_*`) ni un ID de `contract-ids.txt`.
3. **Backend y frontend compilan en un checkout sin `labs/`.**
4. **`cargo test` de cada proyecto de `labs/`**, en un job aparte y sin credenciales.

Para correr la revisión 1 y 2 en tu máquina:

```bash
bash labs/ci/guard.sh origin/main true
```
