# smart-wallet-factory (F1–F3)

Fábrica de la smart wallet de `labs/smart-wallet/`. **Solo testnet.** Sin admin.

| ID | Función | Qué hace | Quién la puede llamar |
|---|---|---|---|
| F1 | `__constructor(wasm_hash)` | Guarda el WASM de las wallets. No se cambia: la fábrica no toca wallets ya creadas, y cada wallet hace sus propios upgrades (W21) | Quien despliega |
| F2 | `create_account(config)` | Valida la config y despliega la wallet con `salt = sha256(XDR de la config)`. Crearla dos veces falla (`AlreadyCreated`) | Cualquiera |
| F3 | `address_of(config)` | La dirección que tendrá la wallet, con la misma validación y el mismo `salt` que F2 | Cualquiera |
| — | `wasm_hash()` | Lectura | Cualquiera |

`Config { owner }` es la llave pública ed25519 del primer firmante. Como la dirección sale de la config, quien cree la wallet primero no puede ponerle otro firmante. Los plazos de la wallet son constantes del WASM mientras la decisión D5 siga abierta; si se vuelven configurables, entran en `Config` y con ella en el `salt`.

## Pruebas

```bash
cargo test                 # 6 pruebas
stellar contract build
```

- Las pruebas usan el WASM fijo de `../smart-wallet/testdata/smart_wallet_w21.wasm`.
- `f3_prefondear_la_direccion_prevista`: hay saldo en la dirección prevista antes de crear la wallet, el saldo se conserva al desplegar, y el firmante previsto lo gasta con una autorización firmada de verdad (otra llave no).
