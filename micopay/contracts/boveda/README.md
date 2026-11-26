# Bóveda Ship It

Contrato Soroban del reto exprés **Bóveda** (Ship It · BAF × Stellar, 26 nov 2026).

Retiene **5,555 XLM** en testnet y solo los libera a quien presente el código
secreto (`Ship It`). El contrato **nunca guarda el código en claro**: guarda su
`sha256`.

## Contrato desplegado (testnet)

| | |
|---|---|
| Contrato | [`CCS5EVJT5ZQK736L7JGWWYKLX673RGHVC6PIUYSXYAVAVMSJPI5HXXU5`](https://stellar.expert/explorer/testnet/contract/CCS5EVJT5ZQK736L7JGWWYKLX673RGHVC6PIUYSXYAVAVMSJPI5HXXU5) |
| Token | XLM nativo (SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`) |
| Monto | `55550000000` stroops = 5,555 XLM |
| Pantalla | `/#/boveda` |

## Funciones

| Función | Quién | Qué hace |
|---|---|---|
| `__constructor(admin, token, amount, code_hash)` | despliegue | Configura admin, token, monto y `sha256(código)`. |
| `fund(from)` | cualquiera (firma `from`) | Transfiere `amount` a la bóveda. |
| `claim(claimant, code)` | `claimant` | Verifica `sha256(code)`, transfiere los 5,555 XLM y marca reclamado. Solo una vez. |
| `reset()` | admin | Re-arma la bóveda para repetir la demo. |
| `withdraw(to)` | admin | Recupera el saldo restante (limpieza). |
| `state()` | lectura | Admin, token, monto, saldo, reclamado y quién. |
| `code_hash(code)` | lectura | `sha256` que espera el contrato para un código. |

Errores: `1` no inicializado, `2` ya inicializado, `3` ya reclamado,
`4` código inválido, `5` monto inválido.

## Compilar

El SDK 25 exige `wasm32v1-none` (no `wasm32-unknown-unknown`):

```bash
rustup target add wasm32v1-none
cargo build --target wasm32v1-none --release
```

Salida: `target/wasm32v1-none/release/boveda_shipit.wasm`.

## Desplegar (testnet)

```bash
stellar keys generate boveda-admin --network testnet --fund

HASH=$(printf 'Ship It' | sha256sum | cut -d' ' -f1)

stellar contract deploy \
  --wasm target/wasm32v1-none/release/boveda_shipit.wasm \
  --source boveda-admin --network testnet -- \
  --admin "$(stellar keys address boveda-admin)" \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --amount 55550000000 \
  --code_hash "$HASH"

stellar contract invoke --id <CONTRATO> --source boveda-admin --network testnet -- \
  fund --from "$(stellar keys address boveda-admin)"
```

## Repetir la demo

```bash
stellar contract invoke --id <CONTRATO> --source boveda-admin --network testnet -- reset
stellar contract invoke --id <CONTRATO> --source boveda-admin --network testnet -- \
  fund --from "$(stellar keys address boveda-admin)"
```

## Verificado el 26 nov 2026

- Código incorrecto → `Error(Contract, #4)` (`InvalidCode`).
- Código `Ship It` → transfiere `55550000000` stroops al `claimant`.
- `state()` posterior: `balance: 0`, `claimed: true`, `claimed_by: <tester>`.
