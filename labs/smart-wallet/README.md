# smart-wallet (W0–W34)

Smart wallet de MicoPay en Soroban: una cuenta de contrato (`C…`) con varios firmantes y un umbral. **Solo testnet.** No va a producción: la app sigue con la cuenta clásica `G…`. El plan completo está fuera del repo (`PLAN_SMART_WALLET.md`, v0.3); esta carpeta tiene las fases W0–W5 (multifirma), W6–W7 (passkey), W8–W16 (guardianes, recuperación y congelamiento) W17–W19 (límites y escrows registrados) W20 (sesiones) y W21 (upgrade con espera). La fase 2 (`PLAN_SMART_WALLET_FASE2.md`, v0.2) suma W22, W23, W25–W28 y W31–W34; W24, W29, W30, W35 y F4 quedan fuera.

`labs/smart-account/` sigue como el spike de un firmante.

## El contrato

| ID | Función | Qué hace | Quién la puede llamar |
|---|---|---|---|
| W1 | `__constructor(owner)` | Primer firmante ed25519 con peso 1 y umbral 1. Los plazos del plan (D5) llegan con las fases que los usan | Quien despliega |
| W2 | `__check_auth` | Suma el peso de firmantes **distintos** con firma válida; tiene que llegar al umbral | Soroban, cuando un contrato pide `require_auth` de la wallet |
| W3 | `add_signer(key, weight, possession)` | Agrega un firmante ed25519; el id lo deriva el contrato. La llave nueva tiene que firmar una prueba de posesión, para que el umbral nunca dependa de una llave que nadie tiene | La wallet (umbral vigente) |
| W4 | `remove_signer(id)` | Quita un firmante (ed25519 o passkey); no quita el último ni deja el umbral inalcanzable | La wallet |
| W5 | `set_threshold(t)` | Cambia el umbral; `0 < t ≤ suma de pesos` (ed25519 y passkeys) | La wallet |
| W27 | `set_signer_weight(id, weight)` | Cambia el peso de un firmante (ed25519 o passkey); `weight > 0` y el umbral sigue alcanzable. La firma que lo autoriza cuenta con los pesos de antes. No congelada | La wallet |
| W28 | `rotate_signer(old_id, new_key, possession)` | Cambia la llave de un firmante ed25519 por otra con el mismo peso; la nueva firma su prueba de posesión. No la misma, otra del dueño ni una llave de sesión (`KeyUsed`). Devuelve el id nuevo. No congelada | La wallet |
| W6 | `set_webauthn(rp_id_hash, origins)` | Fija el sitio de los passkeys: `rpIdHash` y hasta 5 orígenes permitidos | La wallet |
| W6 | `add_passkey(key65, credential_id, weight, authenticator_data, client_data_json, sig)` | Agrega un passkey secp256r1. La llave nueva firma una aserción WebAuthn cuyo challenge es la prueba de posesión, como en `add_signer` | La wallet |
| W7 | Passkey en `__check_auth` | Ver abajo | — |
| W17 | `set_limit(token, per_period)` | Límite de gasto por periodo (~1 día) de un token. Ponerlo o bajarlo aplica ya; subirlo queda pendiente `DELAY_LEDGERS` | La wallet |
| W17 | `apply_limit(token)` | Aplica una subida pendiente cuando ya pasó la espera | Cualquiera |
| W22 | `cancel_limit(token)` | Borra solo la subida pendiente; el límite vigente y lo gastado quedan igual. Aplica ya, también congelada (D12) | La wallet |
| W18 | `add_escrow(escrow, token, fee_bps_max)` | Registra un escrow con su token y su comisión máxima; queda pendiente `DELAY_LEDGERS` | La wallet |
| W18 | `apply_escrow(escrow)` | Aplica un registro pendiente cuando ya pasó la espera | Cualquiera |
| W23 | `cancel_escrow(escrow)` | Borra solo el registro pendiente; la regla vigente, sus sesiones y lo que llevan gastado quedan igual. No congelada: un pendiente puede bajar la comisión | La wallet |
| W18 | `remove_escrow(escrow)` | Quita un escrow registrado o pendiente y revoca sus sesiones; aplica ya | La wallet |
| W8 | `add_guardian(g)` | Pide agregar un guardián (`G…` o `C…`, no la propia wallet); queda pendiente `DELAY_LEDGERS`. Tope de 10 | La wallet |
| W8 | `apply_guardian_add(g)` | Aplica el alta pasada la espera; con el primer guardián el quorum pasa a 1 | Cualquiera |
| W8 | `remove_guardian(g)` | Pide quitar un guardián; queda pendiente `DELAY_LEDGERS` | La wallet |
| W8 | `apply_guardian_removal(g)` | Aplica la baja; si el quorum queda mayor que los guardianes, baja a ese número | Cualquiera |
| W25 | `cancel_guardian_removal(g)` | Borra la baja pendiente. No congelada (D10) | La wallet |
| W9 | `set_guardian_threshold(t)` | Quorum de guardianes: `1 ≤ t ≤ guardianes` (0 sin guardianes). Aplica ya. No con una recuperación en curso (`RecoveryActive`) | La wallet |
| W10 | `start_recovery(guardians, new_key, possession, expires)` | Abre una propuesta para reemplazar todos los firmantes por `new_key` (con prueba de posesión). Una a la vez; una vigente solo la sustituye el quorum | Uno o más guardianes |
| W11 | `approve_recovery(guardian, id)` | Vota. Al llegar al quorum empieza la espera `RECOVERY_DELAY`; los votos de después no la mueven | Un guardián |
| W12 | `cancel_recovery()` | El veto del dueño. Con la wallet congelada pide dos credenciales distintas (D8, propuesta) | La wallet |
| W13 | `guardian_cancel_recovery(guardians)` | Cancela la propuesta | El quorum de guardianes |
| W14 | `finish_recovery(id)` | Pasada la espera: una sola llave nueva (peso 1, umbral 1), descongela y anula todo lo pendiente del dueño anterior | Cualquiera |
| W15 | `freeze(guardians)` | Congela `FREEZE_MAX`: el dueño no mueve fondos ni cambia nada | Uno o más guardianes |
| W16 | `request_unfreeze()` / `unfreeze()` | El dueño pide descongelar y, pasada `UNFREEZE_DELAY`, cualquiera lo aplica. No con una recuperación en curso | La wallet / cualquiera |
| W16 | `guardian_unfreeze(guardians)` | Descongela al instante | El quorum de guardianes |
| W26 | `cancel_unfreeze(guardian)` | Borra la solicitud de descongelar del dueño. Solo congelada y con solicitud; el congelamiento, su enfriamiento y la recuperación quedan igual (D11) | Un guardián activo |
| W19 | Reglas dentro de `__check_auth` | Ver abajo | — |
| W20 | `add_session(key, escrow, buyers, max_per_lock, max_total, max_timeout, expires)` | Llave temporal para un escrow registrado: `lock` hacia compradores de la lista con tope por `lock` y acumulado (contando la comisión), `release`, y `decline` solo con permiso. Hasta 5 sesiones y 7 días. Aplica ya | La wallet |
| W20 | `revoke_session(id)` | Revoca; aplica ya, también congelada | La wallet |
| W20 | `allow_session_decline(id, trade_id)` | Permite a la sesión un `decline` de ese trade, una vez | La wallet |
| W20 | `disallow_session_decline(id, trade_id)` | Retira ese permiso | La wallet |
| W31 | `revoke_all_sessions()` | Revoca todas las sesiones; aplica ya, también congelada | La wallet |
| W32 | `reduce_session(id, max_per_lock, max_total, max_timeout, expires)` | Baja los topes de una sesión vigente: cada valor ≤ el actual y válido, y `max_total` no bajo lo gastado (D15). Conserva lo gastado, la regla, los compradores y los `decline`. También congelada | La wallet |
| W33 | `add_session_buyer(id, buyer)` | Agrega un comprador a una sesión vigente con la regla del escrow sin cambios. No la wallet, sin repetir, hasta 10. No congelada | La wallet |
| W34 | `remove_session_buyer(id, buyer)` | Quita un comprador; no el último. También congelada | La wallet |
| W21 | `schedule_upgrade(hash)` | Programa un upgrade al WASM con ese hash; espera `UPGRADE_DELAY` (240 ledgers, ~20 min) | La wallet |
| W21 | `cancel_upgrade()` | Cancela; aplica ya, también congelada | La wallet |
| W21 | `apply_upgrade(hash)` | Aplica con el hash exacto, pasada la espera. No congelada, no con una recuperación en curso, no si lo programó el dueño anterior a una recuperación | Cualquiera |
| — | `signers()`, `threshold()`, `limit(token)`, `spent(token)`, `escrow(escrow)`, `guardians()`, `guardian_threshold()`, `frozen()`, `recovery()`, `session(id)`, `pending_upgrade()`, `passkeys()` | Lecturas | Cualquiera |

**Reglas de la firma:**
- Id de firmante: `sha256(0x00 ‖ pubkey)`. Una llave no puede entrar dos veces ni aportar doble peso.
- Cada llave firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la dirección de la wallet ‖ modo ‖ payload de Soroban)`. Una firma para una wallet no sirve en otra que comparta la llave. El modo `0` es el dueño; las sesiones llegan después.
- La firma (`Signature`) es una lista de pruebas `Proof::Ed25519(Ed25519Proof { id, sig })`.
- Prueba de posesión de una llave nueva: firma `sha256("micopay-labs-wallet-v1" ‖ XDR de la wallet ‖ "add-signer" ‖ id)`.
- Tope de 10 firmantes y de 10 pruebas por firma. Aritmética con `checked_add`.
- Una llave de sesión no puede ser del dueño ni al revés: `add_signer` y `rotate_signer` (W28) rechazan una llave que ya es de una sesión, y `add_session` una del dueño.
- `set_signer_weight` (W27) y `rotate_signer` (W28) piden la firma de la wallet con los pesos vigentes: una llave de peso 1 bajo umbral 2 no sube su propio peso sola.

**Passkey (W6–W7):**
- Id: `sha256(0x01 ‖ llave de 65 bytes)`; la llave tiene que empezar en `0x04`.
- La prueba es `Proof::Passkey(PasskeyProof { id, authenticator_data, client_data_json, sig })`, con los **bytes originales** de la aserción. Suma su peso como un firmante más; se puede combinar con firmas ed25519.
- `client_data_json` tiene que empezar con `{"type":"webauthn.get","challenge":"<base64url del mensaje>","origin":"<origen permitido>"` y seguir con `,` o `}`. Es el orden que fija la serialización de WebAuthn.
- `authenticator_data` tiene que empezar con el `rpIdHash` guardado y traer las banderas UP y UV (huella o PIN).
- Firma: `secp256r1_verify(llave, sha256(authenticator_data ‖ sha256(client_data_json)), r‖s)`. El host rechaza S alta.
- La recuperación (W14) quita los passkeys junto con las llaves ed25519.
- Las pruebas arman aserciones con una llave P-256 de prueba y, además, verifican un **vector de un navegador real** (`w7_vector_de_navegador_*`): un passkey de Windows Hello creado con `scripts/passkey.html` en `http://localhost:8080`. Cambiar el challenge, las banderas, el `rpIdHash` o el contador lo hace fallar.
- `scripts/passkey.html` crea un passkey y firma challenges en el navegador; se sirve con `python -m http.server 8080` desde `scripts/` (WebAuthn pide un origen seguro, y `localhost` lo es).

**Reglas de tokens y escrows (W19)**, sobre los contextos que la wallet autoriza:
- `approve` se rechaza siempre (`ApproveDenied`). Un permiso de gasto lo usaría un tercero (`transfer_from`, `burn_from`) sin pasar por la wallet ni por su límite.
- `transfer` y `burn` desde la wallet suman al gasto del periodo del token, si tiene límite (`LimitExceeded`). Un intento rechazado o una transacción que falla después no suma: el host revierte todo. Si el token no tiene límite y el destino no es un escrow registrado, la wallet no lee los argumentos, así que pasan un NFT o un destino muxed.
- En un escrow registrado, `lock` tiene que tener a la wallet de vendedor, otro comprador, `amount > 0`, la comisión dentro del tope y un plazo de 1 minuto a 7 días (`EscrowLockInvalid`).
- La autorización de ese `lock` tiene que ser **exactamente** `[escrow.lock, token.transfer(wallet, escrow, amount + platform_fee)]` en el token registrado. Una transferencia directa, con otro importe, en otro token, en otro orden o con más contextos alrededor se rechaza (`EscrowTransferMismatch`). Con un contrato intermedio, este podría llamar solo al `transfer` y el dinero llegaría al escrow sin crear trade.
- El `lock` cuenta contra el límite como cualquier gasto. Si se exenta o no depende de la decisión D9 del plan, que sigue abierta.
- `DELAY_LEDGERS` es fijo (120 ledgers, ~10 min) mientras la decisión D5 (plazos configurables) siga abierta. El periodo del límite es una ventana fija desde el primer gasto: cerca del cambio de periodo pueden salir dos límites seguidos.
- Como `__check_auth` escribe el gasto en la wallet, el cliente tiene que volver a simular la transacción con las autorizaciones ya firmadas antes de enviarla; si no, el footprint no incluye esa escritura. `scripts/demo.mjs` lo hace así.

**Guardianes, recuperación y congelamiento (W8–W16)**, para el teléfono robado:
- Un guardián firma con su propia cuenta (`require_auth`); no hay llaves de guardianes dentro de la wallet. Las funciones de guardianes reciben la lista de quienes firman y rechazan repetidos o ajenos.
- Agregar o quitar un guardián espera `DELAY_LEDGERS`, y no se aplica con la wallet congelada ni con una recuperación en curso. Así quien roba el teléfono no mete un guardián suyo al instante ni saca a los honestos.
- Congelar: un guardián solo congela `FREEZE_MAX` (360 ledgers, ~30 min) y después nadie sin quorum vuelve a congelar hasta `fin + FREEZE_WINDOW − FREEZE_MAX`: como mucho `FREEZE_MAX` por ventana de `FREEZE_WINDOW` (1 440, ~2 h). El enfriamiento es de la wallet, no de cada guardián. El quorum (y al menos dos guardianes, aunque el quorum sea 1) prolonga sin enfriamiento.
- Congelada, la wallet solo autoriza llamadas a sí misma para `request_unfreeze`, `revoke_session`, `cancel_upgrade`, `cancel_limit` (W22), `revoke_all_sessions` (W31), `reduce_session` (W32), `remove_session_buyer` (W34), o `cancel_recovery` con dos credenciales distintas. Si la autorización trae cualquier otro contexto junto a estos, se rechaza entera (`Frozen`). Las funciones `apply_*` también la respetan.
- Un guardián activo puede borrar la solicitud de descongelar del dueño (`cancel_unfreeze`, W26). Un guardián malicioso molesta como mucho hasta que vence el congelamiento: `unfreeze` sin congelamiento vigente pasa siempre.
- Con una recuperación en curso el dueño no descongela: si no, quien tiene el teléfono descongelaría antes de que la recuperación esté lista (`UNFREEZE_DELAY` < `RECOVERY_DELAY`) y la cancelaría con una sola llave.
- Sin congelar, el dueño cancela una recuperación con una sola llave. Ese es el veto ante guardianes que se ponen de acuerdo para robar; por eso los guardianes congelan primero y luego abren la recuperación. Si el congelamiento vence antes de terminar, el ladrón puede cancelar: `FREEZE_MAX` (360) es mayor que `RECOVERY_DELAY` (240), pero hay que juntar el quorum a tiempo.
- La espera empieza cuando la propuesta llega al quorum, no al abrirla. Cambiar guardianes o el quorum anula la propuesta (`Stale`).
- Con una recuperación en curso no se cambia el quorum: `set_guardian_threshold` falla con `RecoveryActive`, aunque sea el mismo valor, igual que `apply_guardian_add` y `apply_guardian_removal`. Antes subía la época de guardianes y anulaba la recuperación vigente.
- `finish_recovery` sube la época del dueño: lo pendiente del dueño anterior (subidas de límite, escrows, altas y bajas de guardianes) queda `Stale`. Se conservan el gasto del periodo, los escrows ya registrados y los guardianes vigentes.
- Los plazos son cortos y fijos para probarlos en testnet; el plan propone días y la decisión D5 sigue abierta.

**Sesiones (W20)**, para que la web o el agente operen el escrow sin pedir firma a cada rato:
- La firma de sesión es una sola `Proof::Session(SessionProof { id, sig })` sobre el mismo mensaje con modo `1`. Mezclarla con pruebas del dueño falla (`MixedProofs`); una firma de la llave de sesión en modo `0` no sirve.
- Id de sesión: `sha256(0x02 ‖ pubkey)`. Una llave del dueño no puede ser de sesión.
- Cada contexto tiene que ser, en el escrow de la sesión: `[lock, transfer]` hacia un comprador de la lista y con plazo ≤ `max_timeout`; `release`; o `decline` de un trade permitido. Todo lo demás falla (`SessionDenied`), incluidas las llamadas a la propia wallet y cualquier `transfer`.
- Las reglas de W19 siguen aplicando encima: comisión dentro del tope del escrow, `transfer` exacto y límite del token.
- La sesión guarda la regla del escrow (token y comisión máxima) al crearse. Falla si venció, si la revocaron, si la wallet está congelada, si cambió la regla del escrow o después de una recuperación (`Stale`). Quitar el escrow revoca sus sesiones; volver a registrarlo no las revive.

Sin admin ni llave de MicoPay. Un relayer `G…` manda y paga las transacciones; no tiene ninguna llave de la wallet.

## Pruebas

```bash
cargo test                 # 192 pruebas con firmas ed25519 y P-256 reales
stellar contract build
node scripts/demo.mjs <ruta a @stellar/stellar-sdk> --vector   # vector compartido Rust/JS
node scripts/demo.mjs <ruta a @stellar/stellar-sdk>            # demo en testnet
```

- Los errores esperados se comparan por código (`WalletError` o `Error(Auth, InvalidAction)`). Una firma inválida de una llave registrada aborta en `ed25519_verify` (`InvokeError::Abort`).
- `firma_real_umbral_1_y_luego_2_de_2` usa entradas de autorización firmadas de verdad (sin `mock_all_auths`): con 2 de 2, una firma no basta y una firma sobre otros argumentos no sirve.
- `w19_camino_real_*` corren W19 por el camino real: un token SAC, un escrow de prueba que copia el `lock` del real y autorizaciones firmadas. Prueban que un `lock` cobra una vez, que uno que falla después de cobrar no cuenta, y que un contrato intermedio no puede mandar dinero al escrow sin trade.
- `r4_*` son los ataques de la revisión de W20 (transfer hijo falso o desviado, otro escrow, importes extremos, un contrato intermedio con varios `lock`); todos fallan como deben.
- `w21_upgrade_con_espera_conserva_el_estado` sube `testdata/smart_wallet_w21.wasm` (el WASM de este contrato, fijo para que `cargo test` no tenga que compilar a wasm) y revisa que firmantes, guardianes y límites sigan igual después del upgrade.
- `w2_vector_compartido_rust_js` fija los bytes del mensaje firmado; la demo calcula los mismos en JS.
- `atk_*` son los ataques de la revisión de W8–W16 (descongelar antes de la recuperación, guardián del ladrón, congelar sin fin con quorum 1); todos fallan.
- Regresión inyectada en W8–W16: quitar el bloqueo del congelamiento, la regla de dos credenciales, el enfriamiento, la época de guardianes, la espera de la baja, de descongelar o de la recuperación, o la época del dueño hace fallar al menos una prueba en cada caso.
- Regresión inyectada en la fase 2: que `cancel_limit` o `cancel_escrow` borren también lo vigente, sacar `cancel_limit` o `revoke_all_sessions` de `check_frozen`, quitar `no_live_recovery` de `set_guardian_threshold`, el `require_auth` de `cancel_guardian_removal`, el control del umbral en `set_signer_weight`, el control de llave de sesión en `rotate_signer` o en `add_signer`, el de lo gastado en `reduce_session`, el de la regla en `add_session_buyer` o el del último comprador en `remove_session_buyer`, o que `cancel_unfreeze` descongele, hace fallar al menos una prueba en cada caso.
- Regresión inyectada: quitar a mano el umbral, el control de duplicados, el `require_auth`, la dirección del mensaje o el control de `remove_signer` hace fallar al menos una prueba en cada caso.

## Funciones en testnet

Cada función que escribe estado tiene al menos una transacción exitosa en testnet y sus pruebas en `src/test.rs`. La demo de cada fila está en las secciones de abajo. Las corridas de `demo-resto.mjs` y `demo-passkey.mjs` usan el WASM vigente (`feee1519…`); las demás, versiones anteriores del mismo contrato.

| # | Función | Demo | Transacción |
|---|---|---|---|
| 1 | `__constructor` | demo-resto | [8af98fde…](https://stellar.expert/explorer/testnet/tx/8af98fdeb56928d88f3ac1fac5c7d12a8cd5b07888bd61c919e6c8c95e778305) |
| 2 | `add_signer` | demo.mjs | [07e1311b…](https://stellar.expert/explorer/testnet/tx/07e1311bd8f2f75d2b6a7ecbd1deac9e7c643594602426b5f76b26ad8c5c150e) |
| 3 | `remove_signer` | demo.mjs | [0297d9ac…](https://stellar.expert/explorer/testnet/tx/0297d9acd6f9267b13ea526c21366c78db735e32f18c18a8f8b363a3fc526996) |
| 4 | `set_threshold` | demo.mjs | [03fa6cde…](https://stellar.expert/explorer/testnet/tx/03fa6cde031e041efc11d9f0a2fa5b64567055f00885856b9b587c215cfc9f15) |
| 5 | `__check_auth (multifirma ed25519)` | demo.mjs | [36c37391…](https://stellar.expert/explorer/testnet/tx/36c373913a4f492e6e34487da9746ba41c341a29075369d8a85ee6a0d26fe1c5) |
| 6 | `set_limit` | demo-resto | [80974635…](https://stellar.expert/explorer/testnet/tx/80974635e6ebc03e5174af091199326d742b514aafefa2924aa0c11493b4ea77) |
| 7 | `apply_limit` | demo-resto | [1b9e547f…](https://stellar.expert/explorer/testnet/tx/1b9e547f870994ba25b93049d26ef47f0ffd6ef089b1e0aa291edd8b382cfb02) |
| 8 | `add_escrow` | demo-resto | [8f66ef58…](https://stellar.expert/explorer/testnet/tx/8f66ef5819519777f60d406bf2820f3665d392d3aa2299f7f18a1b2899798c26) |
| 9 | `apply_escrow` | demo-resto | [53c767b9…](https://stellar.expert/explorer/testnet/tx/53c767b98195e2f94b9d4bb725ca15e77345d2f37643664372c9383212c9bb8d) |
| 10 | `remove_escrow` | demo-resto | [c5233db8…](https://stellar.expert/explorer/testnet/tx/c5233db82a0f8ca170ae2c977490a88b565f99415902594b25efa2abf4c3dc3f) |
| 11 | `add_guardian` | demo-resto | [575e42ad…](https://stellar.expert/explorer/testnet/tx/575e42ad64517c86d742f0998ddcf924e15add82f70d1de36435a159f1eebcbd) |
| 12 | `apply_guardian_add` | demo-resto | [0bda1b95…](https://stellar.expert/explorer/testnet/tx/0bda1b95ffafbedf8391c6e82b961752d5bb187fdb727ecd8231dff803ca069b) |
| 13 | `remove_guardian` | demo-resto | [5806ed2a…](https://stellar.expert/explorer/testnet/tx/5806ed2ac91d5c8717d2439be07c6df891835094b4a6b81f444e4fbc87692af2) |
| 14 | `apply_guardian_removal` | demo-resto | [39cda7e3…](https://stellar.expert/explorer/testnet/tx/39cda7e3b4686ea6493cda4e6f22c9163f50cc7fd97586990d1df25f6a8d5567) |
| 15 | `set_guardian_threshold` | demo-resto | [73d99e2c…](https://stellar.expert/explorer/testnet/tx/73d99e2c0cbd764bac84a76c4b30c5eb778195524dd137792d9045f82bcb12f9) |
| 16 | `freeze` | demo-resto | [c563e7d6…](https://stellar.expert/explorer/testnet/tx/c563e7d6e9bccd8c0c593e262767a6cc24592ea66edb7a846a69b702d4ee6c1a) |
| 17 | `request_unfreeze` | demo-resto | [f3bb0fca…](https://stellar.expert/explorer/testnet/tx/f3bb0fca01a69e783e7c3c8ffd283fa69a287d5d1d562e7caf6d5526b44533aa) |
| 18 | `unfreeze` | demo-resto | [2a717823…](https://stellar.expert/explorer/testnet/tx/2a717823d294762bcbdb6d9c72b4778418527e71653425ffeb1ed9d9cf718f72) |
| 19 | `guardian_unfreeze` | demo-resto | [90cf53d1…](https://stellar.expert/explorer/testnet/tx/90cf53d1ab2e3079c04c1e14cc23d0a08bcd275f5a795223432e56b092a047a7) |
| 20 | `start_recovery` | demo-resto | [5161d001…](https://stellar.expert/explorer/testnet/tx/5161d00117f230bb7e72dd9080213a19564246e0fae63e816779944a8bdeeca4) |
| 21 | `approve_recovery` | demo-guardianes | [d044000c…](https://stellar.expert/explorer/testnet/tx/d044000ca2349a7c0ecd8c0fa59111572cfa35d602735c3da04f70994691a0a1) |
| 22 | `cancel_recovery` | demo-resto | [6137fd0b…](https://stellar.expert/explorer/testnet/tx/6137fd0be65b64b06d53e9e7e1147e14c3df61f81bd54cfabca870ff553a79c1) |
| 23 | `guardian_cancel_recovery` | demo-resto | [51d5678d…](https://stellar.expert/explorer/testnet/tx/51d5678dee3ee1702bceb7a524d55cc99d6fc717f6b3b47522a595fb1a5da121) |
| 24 | `finish_recovery` | demo-guardianes | [bd8071f6…](https://stellar.expert/explorer/testnet/tx/bd8071f656a474891a449cfbaaf68ee110111a0e3ec4f2805e58aa1cd7a1be25) |
| 25 | `add_session` | demo-resto | [9b4fcd02…](https://stellar.expert/explorer/testnet/tx/9b4fcd022aca2a4990b089def505399a5ddbc0fb4cc345d10db19614caecb5d2) |
| 26 | `__check_auth (sesión)` | demo-sesiones | [3317992d…](https://stellar.expert/explorer/testnet/tx/3317992dd570e84a429c53f2a7407ccab2f4652f7b2f0a74138187cb98bc87ee) |
| 27 | `revoke_session` | demo-sesiones | [55526da5…](https://stellar.expert/explorer/testnet/tx/55526da5edce1ae6b89b827e96feb1f829589e00e8ee0e239a47fc4d65fdddfe) |
| 28 | `allow_session_decline` | demo-resto | [ce2a5449…](https://stellar.expert/explorer/testnet/tx/ce2a5449ef66058967dd13b4155e1a7e5d98efe43d494e16570727f8ccd9b2ce) |
| 29 | `disallow_session_decline` | demo-resto | [4a455511…](https://stellar.expert/explorer/testnet/tx/4a45551111ee0b768c89e9bd63cec9a3c3173d16a78128a3771d2870b92a31c4) |
| 30 | `schedule_upgrade` | demo-resto | [3d0540d8…](https://stellar.expert/explorer/testnet/tx/3d0540d80d526787a7166f2dce26d9784ca621bb84c1d34f070e0d707d349cbf) |
| 31 | `cancel_upgrade` | demo-resto | [10269494…](https://stellar.expert/explorer/testnet/tx/1026949413860fd88acf3ed56564afb4a2ba4ab070ffb1ae4a5e262d5b3c1597) |
| 32 | `apply_upgrade` | demo-sesiones | [c93949f0…](https://stellar.expert/explorer/testnet/tx/c93949f0de017de6444cda1d47cc8b7fb2495048e0be0008f581b4e616c9663e) |
| 33 | `set_webauthn` | demo-passkey | [ed4b0108…](https://stellar.expert/explorer/testnet/tx/ed4b010856916c72c86c58fed9f7e13bf7d8a9b32bc10e917422fbaaf803452c) |
| 34 | `add_passkey` | demo-passkey | [de1b6216…](https://stellar.expert/explorer/testnet/tx/de1b621614b061371839c7bbfe6c9192285f51daf8cda7b90f0d6fb2b33242e4) |
| 35 | `__check_auth (passkey)` | demo-passkey | [9dd015d5…](https://stellar.expert/explorer/testnet/tx/9dd015d50cd978fd47655dfc6a8306b45ec52aa367ce34046f4d0b645c6d290f) |
| 36 | `fábrica: __constructor` | demo-sesiones | [ac4e1e04…](https://stellar.expert/explorer/testnet/tx/ac4e1e04f20ec65458e2fc5da722d9fe8f07bbe65d8971593955f58d65aea1df) |
| 37 | `fábrica: create_account` | demo-sesiones | [4961f98b…](https://stellar.expert/explorer/testnet/tx/4961f98b3b8f02cc23b294f099c594f6f4f0aa4dd9a192d1c2500295c44ed5d9) |

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

### W8–W16

Corrida del 2026-11-27 con `scripts/demo-guardianes.mjs`. Wallet `CBI37B4AWAFDOOJTWRBUS7CTBGN422H6IE77SMCQFAGLGZHD7QFMTL5A` (WASM `ee3f6a14…`, el mismo de la demo de W20–W21). Los 18 chequeos pasan. Guardianes `g1`, `g2`, `g3` son cuentas `G…` normales; `a` es el teléfono robado y `n` el nuevo.

| Paso | Qué pasó | Transacciones |
|---|---|---|
| 1 | Subir el WASM, crear la wallet con `a` y darle 5 XLM | [4c806484…](https://stellar.expert/explorer/testnet/tx/4c8064847dd696fd4688c169dd5127e6655def75c1af59e041aea20fcc75df5e) · [6a84b483…](https://stellar.expert/explorer/testnet/tx/6a84b483b160886623fe40f1ee21e9440a64032b85335b6a89038b7e7fc5eb95) · [c9aeeb48…](https://stellar.expert/explorer/testnet/tx/c9aeeb48ea358dacd3854180c6167e33ce432cc2d0f691b51e25675ce2e231ae) |
| 1 | W8 `add_guardian` de g1, g2 y g3 firmado por `a`: quedan pendientes y `guardians()` sigue vacío | [2888e758…](https://stellar.expert/explorer/testnet/tx/2888e75827b91e8d2e54578b3673dc1d578d464cc189b385bd417d095b0fffc5) · [8d431761…](https://stellar.expert/explorer/testnet/tx/8d431761d4130e8d32dbe7a6c7f1a8a08f06a0f7aed474555528e91ca762d3c7) · [c87f9136…](https://stellar.expert/explorer/testnet/tx/c87f9136117bdc814c4d5e517fe9fe9969dd37d83c0bbba599b0f9879ab426ec) |
| 1 | Pasada la espera, el relayer aplica las tres altas **sin firmas de la wallet**; el quorum pasa a 1 | [9d4aad1e…](https://stellar.expert/explorer/testnet/tx/9d4aad1ede5a2166f039faa1611e5de48a0da0f9bdf3db002620e308ae451a89) · [ea85d196…](https://stellar.expert/explorer/testnet/tx/ea85d19611623a4eedd8f5b73c8974b6250aa818df189a748b27ab3a37d6bbb1) · [1d550b15…](https://stellar.expert/explorer/testnet/tx/1d550b15964b965d6ef68d1d4ab83090dc758948a8ed10a13c18f7426418e1e9) |
| 1 | W9 `set_guardian_threshold(2)` firmado por `a` | [afc8fc61…](https://stellar.expert/explorer/testnet/tx/afc8fc61bbd563b21356ee2ee9c780e36fa011073be9e9e3f2bb176264403edd) |
| 2 | Roban el teléfono: W15 g1 solo congela (hasta 360 ledgers) | [0cf83e1d…](https://stellar.expert/explorer/testnet/tx/0cf83e1dca23a25d5f179aab886d6d7a37d65c8be4005cb71dbb3918bb69266c) |
| 3 | `transfer` de 1 XLM firmado por `a`: **rechazado** con `#30` (`Frozen`) | — (falla en la simulación) |
| 4 | W10 g1 abre la recuperación hacia `n`; `ready_ledger` = 0 (falta el quorum) | [4da39158…](https://stellar.expert/explorer/testnet/tx/4da39158df51852b3b5caad7299209174f0d9da17ec2fc9e4bb75b33cba76140) |
| 4b | W16 `request_unfreeze` firmado por `a` con la recuperación abierta: **rechazado** con `#35` (`RecoveryActive`) | — (falla en la simulación) |
| 5 | W11 g2 vota: llega al quorum y la espera empieza ahí (240 ledgers) | [d044000c…](https://stellar.expert/explorer/testnet/tx/d044000ca2349a7c0ecd8c0fa59111572cfa35d602735c3da04f70994691a0a1) |
| 6 | W14 pasada la espera, el relayer termina la recuperación **sin firmas de la wallet**: un solo firmante `n`, umbral 1, descongelada | [bd8071f6…](https://stellar.expert/explorer/testnet/tx/bd8071f656a474891a449cfbaaf68ee110111a0e3ec4f2805e58aa1cd7a1be25) |
| 7 | `transfer` firmado por `a` (el teléfono viejo): **rechazado** con `#3` (`UnknownSigner`). El mismo firmado por `n` pasa: el agente sube 1 XLM | [ffe7c61f…](https://stellar.expert/explorer/testnet/tx/ffe7c61f52f7ddc12cdd0dfae3a348e497e506e9775c435384fab8aef7a0217b) |

Cuando el rechazo ocurre en la firma de la wallet, el error de arriba es `Error(Auth, InvalidAction)` y el código del contrato sale en los eventos de diagnóstico; el script revisa ese código.

### W20, W21 y F1–F3

Corrida del 2026-11-27 con `scripts/demo-sesiones.mjs`. Fábrica `CANRZQBAECXYRZZSWFMYABYLI5MPAZYOJWOUUHFIBJMIMLQCIB7EOHCN` (WASM `5a2ec709…`), wallet `CD4KCYV26MW3UOSUC52X2JEL7O63UQKUIX7IBNVFP7UHN3MDVJ6MDIOH` (WASM `ee3f6a14…`, sin W6–W7). Los 29 chequeos del script pasan. El script se cortó (la máquina se quedó sin memoria) justo antes de aplicar el upgrade; el paso 7 se terminó a mano con `stellar contract invoke`.

| Paso | Qué pasó | Transacciones |
|---|---|---|
| 1 | Subir los dos WASM y crear la fábrica | [8eb487d9…](https://stellar.expert/explorer/testnet/tx/8eb487d9a6a1f57baddb7fa216f1bd59c4c8769cb47a19538796d31fb94d4ecd) · [95570355…](https://stellar.expert/explorer/testnet/tx/95570355e79e58a479f7ace97e1cdb3a9c962a86655ea074d078c770e90ccb25) · [ac4e1e04…](https://stellar.expert/explorer/testnet/tx/ac4e1e04f20ec65458e2fc5da722d9fe8f07bbe65d8971593955f58d65aea1df) |
| 1 | F3: mandar 10 XLM a la dirección de `address_of` **antes** de crear la wallet | [19e7f571…](https://stellar.expert/explorer/testnet/tx/19e7f571d5d25aeeb4026f6b56ed0ee83f8051e9a0f68fea62e7e04802450a17) |
| 1 | F2: `create_account` devuelve esa misma dirección y el saldo sigue en 10 XLM | [4961f98b…](https://stellar.expert/explorer/testnet/tx/4961f98b3b8f02cc23b294f099c594f6f4f0aa4dd9a192d1c2500295c44ed5d9) |
| 2 | `add_escrow` firmado por `a` y `apply_escrow` tras la espera | [8c2c26ad…](https://stellar.expert/explorer/testnet/tx/8c2c26add2a1b8708b59396d8e9fa787a5cb0041edb99d21f0ee74202c1b8770) · [5a59436d…](https://stellar.expert/explorer/testnet/tx/5a59436d2625808c7c91cddd0651b1c7973adeb09c400591b669f1c2709cf0a9) |
| 3 | W20 `add_session`: 2 XLM por `lock`, 3 XLM en total, un comprador (el agente) | [6467ded3…](https://stellar.expert/explorer/testnet/tx/6467ded34ea4f4f5763c911b5d0910a18274bc48de89462a27cd9c4bb9027431) |
| 4 | `lock` de 1 XLM + 0.01 firmado **solo por la sesión**; el agente libera; `spent` = 1.01 XLM | [3317992d…](https://stellar.expert/explorer/testnet/tx/3317992dd570e84a429c53f2a7407ccab2f4652f7b2f0a74138187cb98bc87ee) · [6e5487e4…](https://stellar.expert/explorer/testnet/tx/6e5487e47581704fdebcfa1eb58a9158b2d9cb22c2750fcf556cfc78f875adc9) |
| 5 | Con la sesión: `lock` a otro comprador **rechazado** con `#43`; `lock` de 2.5 XLM **rechazado** con `#44`; `transfer` directo **rechazado** con `#43` | — (fallan en la simulación) |
| 6 | `revoke_session`; un `lock` con la sesión revocada **rechazado** con `#41` | [55526da5…](https://stellar.expert/explorer/testnet/tx/55526da5edce1ae6b89b827e96feb1f829589e00e8ee0e239a47fc4d65fdddfe) |
| 7 | W21 `schedule_upgrade`; `apply_upgrade` antes de la espera **rechazado** con `#17` | [6a3de87e…](https://stellar.expert/explorer/testnet/tx/6a3de87e6f31abda579785c195b0baae1d10756016948c47027e6267f6ca37ff) · [e04c3335…](https://stellar.expert/explorer/testnet/tx/e04c333595ef108cd4bf4d7f9e75c7035d14183f7f7fc664285f6c50bd299d96) |
| 7 | Pasada la espera, el relayer aplica el upgrade; `pending_upgrade()` queda vacío, siguen el firmante `a`, el umbral 1 y el escrow registrado | [c93949f0…](https://stellar.expert/explorer/testnet/tx/c93949f0de017de6444cda1d47cc8b7fb2495048e0be0008f581b4e616c9663e) |

Falta en testnet una transferencia firmada por `a` después del upgrade: la llave de esa corrida no se guardó. La prueba `w21_upgrade_con_espera_conserva_el_estado` lo cubre.

### W6–W7 (passkey real)

Corrida del 2026-11-27 con `scripts/demo-passkey.mjs` y un passkey de Windows Hello creado en `scripts/passkey.html` (`http://localhost:8080`). Wallet `CDXBETMTYEXUGOVTB6DYVKCMFCQYYHWWI6QB4IEQ7O2TLV5LKVHXR2GK` (WASM `feee1519…`). Los 6 chequeos pasan. El script tiene tres pasos (`prepare`, `add`, `send`) porque cada challenge lo firma una persona en el navegador; `--fake` firma con una llave P-256 local para probarlo sin navegador.

| Paso | Qué pasó | Transacciones |
|---|---|---|
| 1 | Subir el WASM, crear la wallet con `a` y darle 5 XLM | [4bf999e7…](https://stellar.expert/explorer/testnet/tx/4bf999e7c48c2b5f234da84cd099ae1a4ca2de72a9b07cdef34212ae53565350) · [e28c0a4c…](https://stellar.expert/explorer/testnet/tx/e28c0a4c4b08173340f8c050657807e439599755d29c33d1d8820856569f9cf4) · [b8519cb6…](https://stellar.expert/explorer/testnet/tx/b8519cb62a57d4bc51e08b48ca086c94a4ef587ae599e5b22e6771c813fcbf9c) |
| 2 | W6 `set_webauthn(sha256("localhost"), ["http://localhost:8080"])` firmado por `a` | [ed4b0108…](https://stellar.expert/explorer/testnet/tx/ed4b010856916c72c86c58fed9f7e13bf7d8a9b32bc10e917422fbaaf803452c) |
| 3 | W6 `add_passkey` con la prueba de posesión firmada en el navegador (huella) | [de1b6216…](https://stellar.expert/explorer/testnet/tx/de1b621614b061371839c7bbfe6c9192285f51daf8cda7b90f0d6fb2b33242e4) |
| 5 | W7 `transfer` de 1 XLM firmado **solo por el passkey**: el agente sube 1 XLM | [9dd015d5…](https://stellar.expert/explorer/testnet/tx/9dd015d50cd978fd47655dfc6a8306b45ec52aa367ce34046f4d0b645c6d290f) |
| 6 | La misma aserción sobre un `transfer` de 2 XLM: **rechazada** con `#49` (`WebAuthnFailed`) | — (falla en la simulación) |

### Las 12 restantes (demo-resto.mjs)

Corrida del 2026-11-27 con `scripts/demo-resto.mjs`: una sola wallet `CANIGSQC6A3NNI47NEJVK75MKUZJUNIJM3UVOFNOLN2GXLQK6EXMNHZF` (WASM `feee1519…`), dos guardianes `g1` y `g2`. Los 28 chequeos pasan. Deja en testnet las funciones que en las otras demos solo se probaron con rechazos o en pruebas unitarias.

| Paso | Qué pasó | Transacciones |
|---|---|---|
| 1 | Subir el WASM, crear la wallet con `a` y darle 5 XLM | [2874f5d1…](https://stellar.expert/explorer/testnet/tx/2874f5d17d38485b88f1cd0df86b90cb709353a7134d1799be1fac44af3b830f) · [8af98fde…](https://stellar.expert/explorer/testnet/tx/8af98fdeb56928d88f3ac1fac5c7d12a8cd5b07888bd61c919e6c8c95e778305) · [071c8b0d…](https://stellar.expert/explorer/testnet/tx/071c8b0d1d889311133f67be38558f6ecf193c6b505e5c5f16164a73b0b1e766) |
| 2 | `add_guardian` g1 y g2; `set_limit` 10 XLM (aplica ya) y 20 XLM (pendiente); `add_escrow`; `schedule_upgrade` y **`cancel_upgrade`** | [575e42ad…](https://stellar.expert/explorer/testnet/tx/575e42ad64517c86d742f0998ddcf924e15add82f70d1de36435a159f1eebcbd) · [d9a30b70…](https://stellar.expert/explorer/testnet/tx/d9a30b7048ddfafbe8fc341ceef8c4a1bcb7a90071c8efa1d6541eda80f6beb4) · [80974635…](https://stellar.expert/explorer/testnet/tx/80974635e6ebc03e5174af091199326d742b514aafefa2924aa0c11493b4ea77) · [f7e4ec4d…](https://stellar.expert/explorer/testnet/tx/f7e4ec4dbdfe91b323ff8c28fc40855d1311fb85c55a243c9af46a4e0020e672) · [8f66ef58…](https://stellar.expert/explorer/testnet/tx/8f66ef5819519777f60d406bf2820f3665d392d3aa2299f7f18a1b2899798c26) · [3d0540d8…](https://stellar.expert/explorer/testnet/tx/3d0540d80d526787a7166f2dce26d9784ca621bb84c1d34f070e0d707d349cbf) · [10269494…](https://stellar.expert/explorer/testnet/tx/1026949413860fd88acf3ed56564afb4a2ba4ab070ffb1ae4a5e262d5b3c1597) |
| 4 | Pasada la espera, el relayer aplica las altas, **`apply_limit`** (límite en 20 XLM) y `apply_escrow`; quorum 2 | [0bda1b95…](https://stellar.expert/explorer/testnet/tx/0bda1b95ffafbedf8391c6e82b961752d5bb187fdb727ecd8231dff803ca069b) · [6d37afe8…](https://stellar.expert/explorer/testnet/tx/6d37afe8c2f1ee39dbbf59174995f489ca7f30597e00c21da9fce7feb347f8ce) · [1b9e547f…](https://stellar.expert/explorer/testnet/tx/1b9e547f870994ba25b93049d26ef47f0ffd6ef089b1e0aa291edd8b382cfb02) · [53c767b9…](https://stellar.expert/explorer/testnet/tx/53c767b98195e2f94b9d4bb725ca15e77345d2f37643664372c9383212c9bb8d) · [73d99e2c…](https://stellar.expert/explorer/testnet/tx/73d99e2c0cbd764bac84a76c4b30c5eb778195524dd137792d9045f82bcb12f9) |
| 5 | `add_session`, **`allow_session_decline`**, **`disallow_session_decline`** y **`remove_escrow`** (que también borra la sesión) | [9b4fcd02…](https://stellar.expert/explorer/testnet/tx/9b4fcd022aca2a4990b089def505399a5ddbc0fb4cc345d10db19614caecb5d2) · [ce2a5449…](https://stellar.expert/explorer/testnet/tx/ce2a5449ef66058967dd13b4155e1a7e5d98efe43d494e16570727f8ccd9b2ce) · [4a455511…](https://stellar.expert/explorer/testnet/tx/4a45551111ee0b768c89e9bd63cec9a3c3173d16a78128a3771d2870b92a31c4) · [c5233db8…](https://stellar.expert/explorer/testnet/tx/c5233db82a0f8ca170ae2c977490a88b565f99415902594b25efa2abf4c3dc3f) |
| 6 | **`remove_guardian(g2)`**: queda pendiente | [5806ed2a…](https://stellar.expert/explorer/testnet/tx/5806ed2ac91d5c8717d2439be07c6df891835094b4a6b81f444e4fbc87692af2) |
| 7 | g1 congela; **`request_unfreeze`**; g1 y g2 juntos **`guardian_unfreeze`** | [c563e7d6…](https://stellar.expert/explorer/testnet/tx/c563e7d6e9bccd8c0c593e262767a6cc24592ea66edb7a846a69b702d4ee6c1a) · [f3bb0fca…](https://stellar.expert/explorer/testnet/tx/f3bb0fca01a69e783e7c3c8ffd283fa69a287d5d1d562e7caf6d5526b44533aa) · [90cf53d1…](https://stellar.expert/explorer/testnet/tx/90cf53d1ab2e3079c04c1e14cc23d0a08bcd275f5a795223432e56b092a047a7) |
| 8 | g1 y g2 congelan; `request_unfreeze`; pasada la espera, el relayer **`unfreeze`** | [032f3c04…](https://stellar.expert/explorer/testnet/tx/032f3c040f4b58ad907cc151ebad1a80d65156523c9d61105f03ab055ae59eeb) · [f646f10d…](https://stellar.expert/explorer/testnet/tx/f646f10d7324c72c43dda8bdb7c84d37c81780823a9b8cff7300f0b2235c256b) · [2a717823…](https://stellar.expert/explorer/testnet/tx/2a717823d294762bcbdb6d9c72b4778418527e71653425ffeb1ed9d9cf718f72) |
| 9 | El relayer **`apply_guardian_removal(g2)`**: queda g1, quorum 1 | [39cda7e3…](https://stellar.expert/explorer/testnet/tx/39cda7e3b4686ea6493cda4e6f22c9163f50cc7fd97586990d1df25f6a8d5567) |
| 10 | g1 abre una recuperación y `a` la veta con **`cancel_recovery`**; g1 abre otra y la retira con **`guardian_cancel_recovery`** | [5161d001…](https://stellar.expert/explorer/testnet/tx/5161d00117f230bb7e72dd9080213a19564246e0fae63e816779944a8bdeeca4) · [6137fd0b…](https://stellar.expert/explorer/testnet/tx/6137fd0be65b64b06d53e9e7e1147e14c3df61f81bd54cfabca870ff553a79c1) · [6ab61b9f…](https://stellar.expert/explorer/testnet/tx/6ab61b9f1d4de803f3911a9b8259bea44f84fd556e1a13d5b8d44fcfb1513a39) · [51d5678d…](https://stellar.expert/explorer/testnet/tx/51d5678dee3ee1702bceb7a524d55cc99d6fc717f6b3b47522a595fb1a5da121) |
