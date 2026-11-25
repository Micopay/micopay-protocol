# Reauditoría del APK Stellar — 26 de octubre de 2026

## Alcance y conclusión

Se volvió a inspeccionar el APK `artifacts/kyc-20261025/micopay-kyc-testnet-release.apk`, el checkout actual (`344a822` con cambios locales), las rutas de firma y la interfaz pública del contrato en Stellar Testnet. El SHA-256 del APK sigue siendo `E3F1945B88849EED135C14FD1278E51632CAA60C8E31AA70FAE5BCD957B9C0D6`: es exactamente el artefacto del informe del 25 de octubre, no una nueva compilación. El código actual no demuestra por sí mismo qué backend está desplegado ni qué cambios posteriores contiene el APK.

**Resultado: siguen abiertos los bloqueadores para fondos reales.** El artefacto es de Testnet; no se ha demostrado aptitud para Mainnet. Esta revisión fue estática y de interfaz pública, sin ejecutar operaciones que muevan fondos ni una prueba de ataque al contrato.

## Hallazgos confirmados

| Prioridad | Hallazgo | Evidencia y efecto |
| --- | --- | --- |
| P0 | Contrato Testnet anterior al parche | El ID configurado en `micopay/frontend/.env.testnet` (`CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ`) sigue exponiendo errores 1–9, sin `TradeAlreadyExists = 10`. La fuente local sí contiene el control en `micopay/contracts/escrow/src/lib.rs:79-88`. La interfaz coincide con la versión anterior; no se probó dinámicamente la sobrescritura. |
| P0 | Firma de XDR preparado sin validación en el teléfono | `micopay/frontend/src/services/api.ts:409` y `:479` pasan el XDR y la passphrase del backend a `signTransactionXdr`. `micopay/frontend/src/lib/keystore.ts:45-60` solicita presencia y firma, pero no comprueba red, contrato, método, argumentos, source, fee o vigencia. El backend valida la invocación después de recibir la firma. |
| P1 | Inicialización sin autorización del admin | `micopay/contracts/escrow/src/lib.rs:37-53` permite establecer admin, token y wallet de plataforma sin `admin.require_auth()`. El despliegue nuevo exige inicialización controlada antes de exponer el contrato. |
| P1 | API de solicitudes de firma incompatible | El frontend pide `GET /sign-requests/:id` con JWT y XDR, pero el backend usa autenticación de dispositivo y solo devuelve estado. El frontend pide `/pending`, ruta inexistente. El frontend envía `action`; el backend admite `signed_xdr` o `cancelled` y rechaza propiedades extra. Véanse `micopay/frontend/src/services/signRequestService.ts:34-82` y `micopay/backend/src/routes/sign-requests.ts:103-185`. |
| P1 | Autorización insuficiente de solicitudes de firma | `micopay/backend/src/routes/sign-requests.ts:190-225` busca por ID y permite cancelar con cualquier JWT de usuario válido: no compara el destinatario (`identifier`) con `request.user`. El GET para dispositivos en `:123-151` tampoco compara `device_id` con el dispositivo autenticado. Quien conozca un ID puede alterar o consultar una solicitud ajena. |
| P1 | Un XDR inválido puede quedar registrado como firmado | `micopay/backend/src/routes/sign-requests.ts:240-257` captura cualquier fallo de `fromXDR`, inventa un `txid` `hash_...` y marca el registro `signed`. La prueba existente usa deliberadamente un XDR de ejemplo inválido (`micopay/backend/src/tests/signRequests.test.ts:115`), por lo que no detecta este fallo. Además, no se compara la transacción firmada con el `txxdr` solicitado. |
| P1 | Aprobación externa con red y activo insuficientemente visibles | `micopay/frontend/src/services/signRequestService.ts:73` usa la passphrase errónea `Test SDF Network ; July 2015` como fallback y acepta la passphrase recibida. `micopay/frontend/src/pages/SignatureApproval.tsx:95-119` decodifica y firma; la pantalla de pago muestra código, monto y destino, pero omite issuer, red, source, fee, secuencia y vigencia. |
| P2 | Seed accesible desde JavaScript | `micopay/frontend/src/lib/keystore.ts:51-59` carga la seed en un string JS para firmar; `:80-84` la exporta a otros módulos. La biometría es una compuerta de intención y no ofrece firma con clave no exportable. |
| P2 | Fees fijas y timeout ambiguo | `micopay/frontend/src/services/payment.ts:92,152` y `micopay/frontend/src/services/stellarRamp.ts:34` usan `10000` stroops. El pago clásico no reconcilia por hash después de un fallo de `submitTransaction`. |

## Verificaciones de esta repetición

- `stellar contract info interface` consultó directamente `https://soroban-testnet.stellar.org` con la passphrase oficial de Testnet: la interfaz carece de `TradeAlreadyExists`.
- SHA-256 del APK comprobado localmente e idéntico al informe previo.
- Frontend: 4 suites, 33 pruebas aprobadas (`SignatureApproval`, decoder, presencia y retiro bancario).
- Backend: `test:sign-requests` y `test:escrow-contracts` aprobados. Estas pruebas no validan el flujo conjunto ni rechazan XDR inválido.
- Contrato Soroban: `cargo test` aprobó 6 pruebas, incluida la de `secret_hash` repetido; valida la fuente local y no el bytecode desplegado.

## Orden de corrección

1. Corregir `initialize`, desplegar una instancia nueva del contrato parcheado, verificar su interfaz y actualizar IDs en backend y APK.
2. Validar el XDR en el dispositivo contra una intención concreta antes de biometría y firma; conservar la validación del backend.
3. Unificar las rutas y los esquemas de solicitudes de firma; limitar lectura y resolución al dispositivo y wallet correspondientes, rechazar XDR inválido y comparar el XDR firmado con la solicitud original.
4. Fijar la red permitida por build y mostrar issuer, red, source, fee y vigencia al aprobar.
5. Implementar el firmador nativo Android descrito abajo, migrar las cuentas existentes sin cambiar su dirección Stellar y medir la exposición residual de la seed en memoria nativa.
6. Resolver fees y reconciliar envíos inciertos antes de reintentar.

## Decisión de implementación: Android Keystore y firma nativa

Se conserva la **misma seed Ed25519 y la misma dirección Stellar `G…`** de cada persona. No se cambia a passkeys ni a una cuenta de contrato `C…`: el contrato de escrow seguirá recibiendo firmas de las cuentas actuales para `lock` y `release`.

1. Crear un plugin Android para generar o importar la seed, guardarla cifrada mediante una clave AES de Android Keystore ligada a autenticación del sistema y firmar dentro del código nativo. Preferir StrongBox cuando esté disponible y comprobar el nivel de seguridad efectivo; disponer de una política explícita para dispositivos sin StrongBox o sin bloqueo de pantalla.
2. Hacer que JavaScript entregue al plugin la transacción **ya validada** y reciba únicamente la firma o el XDR firmado. El plugin debe firmar el hash de transacción Stellar con la passphrase de red fijada por el build, respetar el XDR Soroban preparado y no aceptar una red arbitraria enviada por el servidor. La validación de intención previa a la firma del punto 2 sigue siendo obligatoria.
3. Mover también al plugin la firma del reto de inicio de sesión y de los pagos clásicos. Evitar que las rutas normales de `exportSecretKey()` vuelvan a cargar la seed en JavaScript. Tratar el respaldo/revelación de la seed como un flujo nativo separado con autenticación y exposición explícita a la persona.
4. Migrar el `stellar_keypair` existente en el dispositivo tras verificar su clave pública; persistir la nueva copia cifrada y probar recuperación antes de retirar la anterior. No crear una cuenta nueva ni cambiar el `G…`; conservar un mecanismo de respaldo para reinstalación o pérdida del teléfono.
5. Verificar con cuentas existentes en Testnet que la clave pública permanece igual y que funcionan challenge de login, pago, `lock`, `release` y `refund`. Comparar la firma/XDR resultante con el flujo actual, incluyendo red, hash, firmas y autorizaciones Soroban. Probar cancelación biométrica, cambio de PIN/huella, reinicio y recuperación.

**Límite:** StrongBox/Keystore protege la clave AES de cifrado; no se afirma que firme Ed25519 dentro del hardware. La seed Stellar se descifra brevemente en memoria nativa para firmar. Esta mejora reduce su exposición al WebView, pero no sustituye la validación del XDR ni elimina el riesgo de un sistema Android comprometido.

La reauditoría no modifica el APK ni el contrato desplegado. El informe previo está en `docs/AUDITORIA_APK_STELLAR_RAVEN_2026-10-25.md`.

El plan completo de corrección, incluido el nuevo `decline` del escrow, está en
[`docs/plans/current/PLAN_IMPLEMENTACION_APK_ESCROW_SEGURO_2026-10-26.md`](../plans/current/PLAN_IMPLEMENTACION_APK_ESCROW_SEGURO_2026-10-26.md).
