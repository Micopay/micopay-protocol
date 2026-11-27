# smart-wallet (W0–W5, en construcción)

Smart wallet de MicoPay en Soroban: una cuenta de contrato (`C…`) con varios firmantes y un umbral. **Solo testnet.** No va a producción: la app sigue con la cuenta clásica `G…`. El plan completo está fuera del repo (`PLAN_SMART_WALLET.md`, v0.3); esta carpeta es la fase W0–W5.

`labs/smart-account/` sigue como el spike de un firmante.

## El contrato

| ID | Función | Qué hace | Quién la puede llamar |
|---|---|---|---|
| W1 | `__constructor(owner)` | Primer firmante ed25519 con peso 1 y umbral 1. Los plazos del plan (D5) llegan con las fases que los usan | Quien despliega |
| — | `signers()`, `threshold()` | Lecturas | Cualquiera |

Esta fase entra en un PR por función (W1, W2, W3, W5, W4). Las reglas de la firma, la demo en testnet y sus transacciones llegan completas con el último PR (W4).

## Pruebas

```bash
cargo test   # 1 prueba
```
