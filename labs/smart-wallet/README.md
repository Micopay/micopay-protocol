# smart-wallet (W0–W5)

Smart wallet de MicoPay en Soroban: una cuenta de contrato (`C…`) con varios firmantes y un umbral. **Solo testnet.** No va a producción: la app sigue con la cuenta clásica `G…`. El plan completo está fuera del repo (`PLAN_SMART_WALLET.md`, v0.3); esta carpeta es la fase W0–W5.

`labs/smart-account/` sigue como el spike de un firmante.

## El contrato

| ID | Función | Qué hace | Quién la puede llamar |
|---|---|---|---|
| W1 | `__constructor(owner)` | Primer firmante ed25519 con peso 1 y umbral 1. Los plazos del plan (D5) llegan con las fases que los usan | Quien despliega |
| W2 | `__check_auth` | Suma el peso de firmantes **distintos** con firma válida; tiene que llegar al umbral | Soroban, cuando un contrato pide `require_auth` de la wallet |
| W3 | `add_signer(key, weight, possession)` | Agrega un firmante ed25519; el id lo deriva el contrato. La llave nueva tiene que firmar una prueba de posesión, para que el umbral nunca dependa de una llave que nadie tiene | La wallet (umbral vigente) |
| W4 | `remove_signer(id)` | Quita un firmante; no quita el último ni deja el umbral inalcanzable | La wallet |
| W5 | `set_threshold(t)` | Cambia el umbral; `0 < t ≤ suma de pesos` | La wallet |
| — | `signers()`, `threshold()` | Lecturas | Cualquiera |

**Reglas de la firma:**
- Id de firmante: `sha256(0x00 ‖ pubkey)`. Una llave no puede entrar dos veces ni aportar doble peso.
- Cada llave firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la dirección de la wallet ‖ modo ‖ payload de Soroban)`. Una firma para una wallet no sirve en otra que comparta la llave. El modo `0` es el dueño; las sesiones llegan después.
- La firma (`Signature`) es una lista de pruebas `Proof::Ed25519(Ed25519Proof { id, sig })`.
- Prueba de posesión de una llave nueva: firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la wallet ‖ "add-signer" ‖ id)`.
- Tope de 10 firmantes y de 10 pruebas por firma. Aritmética con `checked_add`.

Sin admin ni llave de MicoPay. Un relayer `G…` manda y paga las transacciones; no tiene ninguna llave de la wallet.

## Pruebas

```bash
cargo test                 # 31 pruebas con firmas ed25519 reales
stellar contract build
node scripts/demo.mjs <ruta a @stellar/stellar-sdk> --vector   # vector compartido Rust/JS
node scripts/demo.mjs <ruta a @stellar/stellar-sdk>            # demo en testnet
```

- Los errores esperados se comparan por código (`WalletError` o `Error(Auth, InvalidAction)`). Una firma inválida de una llave registrada aborta en `ed25519_verify` (`InvokeError::Abort`).
- `firma_real_umbral_1_y_luego_2_de_2` usa entradas de autorización firmadas de verdad (sin `mock_all_auths`): con 2 de 2, una firma no basta y una firma sobre otros argumentos no sirve.
- `w2_vector_compartido_rust_js` fija los bytes del mensaje firmado; la demo calcula los mismos en JS.
- Regresión inyectada: quitar a mano el umbral, el control de duplicados, el `require_auth`, la dirección del mensaje o el control de `remove_signer` hace fallar al menos una prueba en cada caso.

## Demo en testnet

Corrida del 2026-11-27 contra el escrow real de XLM `CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4`, sin cambios. Wallet `CA662JXMUCAQRH5VMVSSWJIHETJA6FYL3U6LAYU5LQLRFUPG2G6JX2HP`. Un relayer `G…` mandó y pagó todo; `a` y `b` son llaves ed25519, no cuentas de Stellar.

| Paso | Qué pasó | Transacción |
|---|---|---|
| 1 | Subir el WASM `66c751c6…` y crear la wallet con `a` (umbral 1) | [d9cbb568…](https://stellar.expert/explorer/testnet/tx/d9cbb568a3433c2cd0c66e231567302f1a239336e825a8a15f44e596eab5c797) · [9c68e282…](https://stellar.expert/explorer/testnet/tx/9c68e282ccedd07dc915cfdaeabdce0e3b8b3c36a7001941a836f0d093b40ef6) |
| 1 | Darle 5 XLM a la `C…` | [06810e6e…](https://stellar.expert/explorer/testnet/tx/06810e6e450e30c0d5454709121c8af522126c7548b6671730517d92c75d3d92) |
| 2 | W3 `add_signer(b, 1)` firmado por `a` | [07e1311b…](https://stellar.expert/explorer/testnet/tx/07e1311bd8f2f75d2b6a7ecbd1deac9e7c643594602426b5f76b26ad8c5c150e) |
| 3 | W5 `set_threshold(2)` firmado por `a` | [03fa6cde…](https://stellar.expert/explorer/testnet/tx/03fa6cde031e041efc11d9f0a2fa5b64567055f00885856b9b587c215cfc9f15) |
| 4 | `lock` del escrow firmado solo por `a`: **rechazado** con `Error(Contract, #5)` (`InsufficientWeight`) | — (falla en la simulación) |
| 5 | `lock` de 1 XLM + 0.01 firmado por `a` y `b`: la wallet baja 1.01 XLM | [36c37391…](https://stellar.expert/explorer/testnet/tx/36c373913a4f492e6e34487da9746ba41c341a29075369d8a85ee6a0d26fe1c5) |
| 5 | El agente `G…` libera; el trade queda `Released` | [edb1a56f…](https://stellar.expert/explorer/testnet/tx/edb1a56f1d9772a5a59b3332104185e6e2c76ce1cfdbe48c48e8f1758b9e8582) |
| 6 | W5 `set_threshold(1)` firmado por `a` y `b` | [6640a746…](https://stellar.expert/explorer/testnet/tx/6640a746cdf6a9017d17f31b68dd78dc8d8781f63a55ac4ea3a0c595170407f0) |
| 6 | W4 `remove_signer(b)` firmado por `a` | [0297d9ac…](https://stellar.expert/explorer/testnet/tx/0297d9acd6f9267b13ea526c21366c78db735e32f18c18a8f8b363a3fc526996) |
| 6 | `lock` firmado solo por `b` (ya quitado): **rechazado** con `Error(Contract, #3)` (`UnknownSigner`) | — (falla en la simulación) |

Los rechazos salen en la simulación como `Error(Auth, InvalidAction)`; el código del contrato (`#5`, `#3`) está en los eventos de diagnóstico, y la demo lo compara ahí.
