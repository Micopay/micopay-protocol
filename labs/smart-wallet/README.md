# smart-wallet (W0–W5, W17–W19)

Smart wallet de MicoPay en Soroban: una cuenta de contrato (`C…`) con varios firmantes y un umbral. **Solo testnet.** No va a producción: la app sigue con la cuenta clásica `G…`. El plan completo está fuera del repo (`PLAN_SMART_WALLET.md`, v0.3); esta carpeta tiene las fases W0–W5 (multifirma) y W17–W19 (límites y escrows registrados).

`labs/smart-account/` sigue como el spike de un firmante.

## El contrato

| ID | Función | Qué hace | Quién la puede llamar |
|---|---|---|---|
| W1 | `__constructor(owner)` | Primer firmante ed25519 con peso 1 y umbral 1. Los plazos del plan (D5) llegan con las fases que los usan | Quien despliega |
| W2 | `__check_auth` | Suma el peso de firmantes **distintos** con firma válida; tiene que llegar al umbral | Soroban, cuando un contrato pide `require_auth` de la wallet |
| W3 | `add_signer(key, weight, possession)` | Agrega un firmante ed25519; el id lo deriva el contrato. La llave nueva tiene que firmar una prueba de posesión, para que el umbral nunca dependa de una llave que nadie tiene | La wallet (umbral vigente) |
| W4 | `remove_signer(id)` | Quita un firmante; no quita el último ni deja el umbral inalcanzable | La wallet |
| W5 | `set_threshold(t)` | Cambia el umbral; `0 < t ≤ suma de pesos` | La wallet |
| W17 | `set_limit(token, per_period)` | Límite de gasto por periodo (~1 día) de un token. Ponerlo o bajarlo aplica ya; subirlo queda pendiente `DELAY_LEDGERS` | La wallet |
| W17 | `apply_limit(token)` | Aplica una subida pendiente cuando ya pasó la espera | Cualquiera |
| W18 | `add_escrow(escrow, token, fee_bps_max)` | Registra un escrow con su token y su comisión máxima; queda pendiente `DELAY_LEDGERS` | La wallet |
| W18 | `apply_escrow(escrow)` | Aplica un registro pendiente cuando ya pasó la espera | Cualquiera |
| W18 | `remove_escrow(escrow)` | Quita un escrow registrado o pendiente; aplica ya | La wallet |
| W19 | Reglas dentro de `__check_auth` | Ver abajo | — |
| — | `signers()`, `threshold()`, `limit(token)`, `spent(token)`, `escrow(escrow)` | Lecturas | Cualquiera |

**Reglas de la firma:**
- Id de firmante: `sha256(0x00 ‖ pubkey)`. Una llave no puede entrar dos veces ni aportar doble peso.
- Cada llave firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la dirección de la wallet ‖ modo ‖ payload de Soroban)`. Una firma para una wallet no sirve en otra que comparta la llave. El modo `0` es el dueño; las sesiones llegan después.
- La firma (`Signature`) es una lista de pruebas `Proof::Ed25519(Ed25519Proof { id, sig })`.
- Prueba de posesión de una llave nueva: firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la wallet ‖ "add-signer" ‖ id)`.
- Tope de 10 firmantes y de 10 pruebas por firma. Aritmética con `checked_add`.

**Reglas de tokens y escrows (W19)**, sobre los contextos que la wallet autoriza:
- `approve` se rechaza siempre (`ApproveDenied`). Un permiso de gasto lo usaría un tercero (`transfer_from`, `burn_from`) sin pasar por la wallet ni por su límite.
- `transfer` y `burn` desde la wallet suman al gasto del periodo del token, si tiene límite (`LimitExceeded`). Un intento rechazado o una transacción que falla después no suma: el host revierte todo. Si el token no tiene límite y el destino no es un escrow registrado, la wallet no lee los argumentos, así que pasan un NFT o un destino muxed.
- En un escrow registrado, `lock` tiene que tener a la wallet de vendedor, otro comprador, `amount > 0`, la comisión dentro del tope y un plazo de 1 minuto a 7 días (`EscrowLockInvalid`).
- La autorización de ese `lock` tiene que ser **exactamente** `[escrow.lock, token.transfer(wallet, escrow, amount + platform_fee)]` en el token registrado. Una transferencia directa, con otro importe, en otro token, en otro orden o con más contextos alrededor se rechaza (`EscrowTransferMismatch`). Con un contrato intermedio, este podría llamar solo al `transfer` y el dinero llegaría al escrow sin crear trade.
- El `lock` cuenta contra el límite como cualquier gasto. Si se exenta o no depende de la decisión D9 del plan, que sigue abierta.
- `DELAY_LEDGERS` es fijo (120 ledgers, ~10 min) mientras la decisión D5 (plazos configurables) siga abierta. El periodo del límite es una ventana fija desde el primer gasto: cerca del cambio de periodo pueden salir dos límites seguidos.
- Como `__check_auth` escribe el gasto en la wallet, el cliente tiene que volver a simular la transacción con las autorizaciones ya firmadas antes de enviarla; si no, el footprint no incluye esa escritura. `scripts/demo.mjs` lo hace así.

Sin admin ni llave de MicoPay. Un relayer `G…` manda y paga las transacciones; no tiene ninguna llave de la wallet.

## Pruebas

```bash
cargo test                 # 59 pruebas con firmas ed25519 reales
stellar contract build
node scripts/demo.mjs <ruta a @stellar/stellar-sdk> --vector   # vector compartido Rust/JS
node scripts/demo.mjs <ruta a @stellar/stellar-sdk>            # demo en testnet
```

- Los errores esperados se comparan por código (`WalletError` o `Error(Auth, InvalidAction)`). Una firma inválida de una llave registrada aborta en `ed25519_verify` (`InvokeError::Abort`).
- `firma_real_umbral_1_y_luego_2_de_2` usa entradas de autorización firmadas de verdad (sin `mock_all_auths`): con 2 de 2, una firma no basta y una firma sobre otros argumentos no sirve.
- `w19_camino_real_*` corren W19 por el camino real: un token SAC, un escrow de prueba que copia el `lock` del real y autorizaciones firmadas. Prueban que un `lock` cobra una vez, que uno que falla después de cobrar no cuenta, y que un contrato intermedio no puede mandar dinero al escrow sin trade.
- `w2_vector_compartido_rust_js` fija los bytes del mensaje firmado; la demo calcula los mismos en JS.
- Regresión inyectada: quitar a mano el umbral, el control de duplicados, el `require_auth`, la dirección del mensaje o el control de `remove_signer` hace fallar al menos una prueba en cada caso.

## Demo en testnet

### W1–W5

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

### W17–W19

Corrida del 2026-11-27, mismo escrow. Wallet `CCUZJDPZCD22AJTVD6B556BFEJQSOTU64CNIICW5435CI3JMTGJWUJ5V`. Los 21 chequeos de la demo pasan; el saldo termina en 7.98 XLM (10 − 1.01 − 1.01).

| Paso | Qué pasó | Transacciones |
|---|---|---|
| 1 | Subir el WASM `c694d257…`, crear la wallet con `a`, darle 10 XLM y pedir `add_escrow(escrow, XLM, 100)` (1% de comisión máxima) | [aa1090d2…](https://stellar.expert/explorer/testnet/tx/aa1090d2144e7905962786d7a9df9136166e74fe25f29c3de84328ae4868b410) · [4061c70e…](https://stellar.expert/explorer/testnet/tx/4061c70e3acc8da37bd6e8dd26fa664194413dbc77a3b57801bc3eed12ed9f31) · [c1743937…](https://stellar.expert/explorer/testnet/tx/c1743937b89c5a1487503c834641a5b87d64ae67951b6d7740002283f68f1101) · [1fc663d0…](https://stellar.expert/explorer/testnet/tx/1fc663d0ff14c758744d26fef0ad99615bfe119bf9f827d82b64a5d29da08617) |
| 2–6 | Los mismos pasos de W1–W5, con los mismos resultados | [542ab514…](https://stellar.expert/explorer/testnet/tx/542ab514c0f92105b042b101a65862aa0c814d984adc20461d80d13ebb424549) · [1a61a5f6…](https://stellar.expert/explorer/testnet/tx/1a61a5f6c2eb8502bf5810ff22b41ad2213a428f5acc765c98bafe2d1dd48a50) · [48fe757e…](https://stellar.expert/explorer/testnet/tx/48fe757ee66b7a0a7480a6b036377f0762b2c6e7de4f2953f1ad142dae54c106) · [8c259ddd…](https://stellar.expert/explorer/testnet/tx/8c259ddd528d203a96d5fce2d0833d449f42a4a1b085a7d7cb0efb8df9c01032) · [dca2bf73…](https://stellar.expert/explorer/testnet/tx/dca2bf73796e39134d7707b8da6a750ec73bb81ff91690d4169a0f3852637f2e) · [7bba1614…](https://stellar.expert/explorer/testnet/tx/7bba1614c8a4d9cdd63bb5312fae7fe8f4bdf318b78591b77559000c22c978ab) |
| 7a | Pasada la espera, el relayer aplica el registro **sin firmas de la wallet** (`apply_escrow`) | [06be58d6…](https://stellar.expert/explorer/testnet/tx/06be58d62da94c4b43734b997a9f48b725080a7145cfb7036cf03616a233d3d3) |
| 7b | `set_limit(XLM, 2 XLM)` aplica ya | [38be0d2a…](https://stellar.expert/explorer/testnet/tx/38be0d2a2b57912629f8785b6074a9924aac2d567b62f1394a5b96f3b604fb20) |
| 7c | `transfer` de 3 XLM a otra cuenta: **rechazado** con `#15` (`LimitExceeded`) | — (falla en la simulación) |
| 7d | `transfer` directo de 1.01 XLM al escrow: **rechazado** con `#19` (`EscrowTransferMismatch`) | — (falla en la simulación) |
| 7e | `lock` de 1 XLM + 0.01 pasa y `spent(XLM)` queda en 1.01 XLM; el agente libera | [53aee288…](https://stellar.expert/explorer/testnet/tx/53aee28878ff08bb00af3344d1d4dedb944c25a85cd35a1b40511610f1633d9a) · [dd2b0b32…](https://stellar.expert/explorer/testnet/tx/dd2b0b322ad3f95b75e0b97e6ea5a3de90fbbe136cbe843fd1d81810ae05724d) |
| 7f | `lock` con 2% de comisión: **rechazado** con `#20` (`EscrowLockInvalid`) | — (falla en la simulación) |
| 7g | Segundo `lock` de 1.01 XLM (2.02 > 2): **rechazado** con `#15` | — (falla en la simulación) |
| 7h | `set_limit(XLM, 100 XLM)` queda pendiente; el límite sigue en 2 XLM | [392e3b97…](https://stellar.expert/explorer/testnet/tx/392e3b97f362e98829f7b1616a1edcf19c2be85bf40aa842c2815e0b072cbb7e) |
