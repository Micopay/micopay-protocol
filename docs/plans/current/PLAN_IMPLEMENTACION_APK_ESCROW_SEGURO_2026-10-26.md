# Plan de implementación — APK, firma segura y cancelación temprana de escrow

**Fecha de creación:** 26 de octubre de 2026

**Última actualización:** 28 de octubre de 2026; contratos con `decline` desplegados, probados y activados en Testnet.

**Base revisada:** checkout `344a822` con cambios locales y el APK release Testnet SHA-256 `E3F1945B88849EED135C14FD1278E51632CAA60C8E31AA70FAE5BCD957B9C0D6`.
**Estado:** implementación en curso; contrato y backend activos en Testnet. Falta cerrar las pruebas instrumentadas en dispositivos y generar/distribuir el APK final con la configuración actualizada.

## Avance del 26 de octubre de 2026

| Área | Estado verificable |
| --- | --- |
| Contrato | Implementados `decline`, suma segura de monto + fee y constructor atómico con `soroban-sdk 25.3.2`. `cargo test`: 9/9. WASM release: 8,771 bytes, SHA-256 `6ec8aba7d201c6fec89e40a1437910fdc393d5b606370142ae115372afcf2693`; exporta `__constructor`, `lock`, `release`, `decline`, `refund`, `get_trade`. |
| Backend | Implementados prepare/submit de `decline`, source/contrato/método/argumentos exactos, bloqueo tras constancia de efectivo, idempotencia, evento `declined`, feature gate `ESCROW_DECLINE_CONTRACT_IDS` y listeners separados para todos los contratos activos y legacy. Build TypeScript y pruebas focalizadas pasan. |
| APK web | Implementado CTA de devolución inmediata y validación local previa a firma para `lock`, `release` y `decline`: red del build, source, contrato, método, argumentos, preimage, fee, vigencia, memo, firmas previas y operación adicional. Pagos, trustlines, CETES y retiro bancario ya usan el firmador central y no llaman `exportSecretKey()` directamente. Build Testnet y 63 pruebas focalizadas pasan. |
| APK Android | Implementado `StellarKeyVaultPlugin`: seed cifrada con AES-256-GCM mediante Android Keystore, autenticación fuerte/PIN, ventana de 30 segundos, StrongBox preferido con fallback medido a TEE/software y fallo cerrado sin bloqueo seguro. La migración conserva la misma `G…`, da prioridad al registro legacy cuando detecta un vault nativo distinto, borra el registro anterior solo tras confirmar la importación y deduplica intentos simultáneos. Login y arranque fallan cerrados si falta la llave; solo el registro explícito crea una wallet fuera del modo demo. La firma rechaza red distinta al build, fee-bump, firmas previas, source ajeno, múltiples operaciones, tipos no permitidos y método Soroban distinto a la intención. Compilación Java y ensamblado APK exitosos; 22/22 pruebas focalizadas de migración, presencia y prevención de creación automática pasan. |
| APK release | Generado release Testnet actualizado `versionCode 26102816`, 15,867,398 bytes, SHA-256 `AD3EF85EEBF3D309E9B8C56BC6C8EC57FEA4D64DBC7B4AFAB07CA1B1BD794151`. Incluye la configuración del escrow USDC `CALS…`, KYC y retiro bancario/swap actuales. `apksigner` confirma firma v2 y certificado SHA-256 `1A1235A6CDAA88DD69BFFA5352F1BA921EED8407CFCDC55E5BB5A90F58A5172C`, idéntico a los releases anteriores, por lo que Android lo reconoce como actualización. La suite frontend pasa 466/466 y el build Android release terminó correctamente. Falta probar la actualización y los flujos en el teléfono real. |
| Despliegue | Completado en Testnet el 2026-10-28. USDC: `CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3`; XLM: `CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4`. Ambos publican `decline`, pasaron pruebas live de `lock` + `decline` con devolución exacta y están activos en ECS revision 33 mediante `ESCROW_CONTRACTS` y `ESCROW_DECLINE_CONTRACT_IDS`. |
| Pendiente crítico | Pruebas instrumentadas en teléfonos reales de migración interrumpida, invalidación del Keystore, StrongBox/TEE y actualización sobre el APK anterior; API externa de solicitudes de firma; instalar y probar el APK `26102816` en el dispositivo real. La implementación reduce la exposición, pero la custodia no se considera cerrada para producción hasta completar esas pruebas. |

## Decisiones de producto y seguridad

1. La cuenta de cada persona sigue siendo la misma cuenta Stellar `G…` con su misma seed Ed25519. Android Keystore protege una clave AES ligada a huella o PIN; el plugin nativo descifra brevemente la seed y firma sin entregarla a JavaScript en rutas ordinarias. StrongBox se prefiere cuando existe y el nivel efectivo se reporta como StrongBox, TEE o software. No se afirma que StrongBox firme Ed25519.
2. Se añadirá `decline(trade_id)` al **nuevo contrato**. Solo el `buyer` guardado en el escrow puede autorizarlo mediante `buyer.require_auth()`. Devuelve **`amount + platform_fee` al `seller` original** sin esperar el timeout y liquida el trade. El `seller` puede solicitar el `decline`, pero no ejecutarlo unilateralmente; si el buyer no coopera, continúa disponible `refund()` tras el timeout. No se reduce a ciegas el timeout de 120 minutos de `micopay/backend/src/services/stellar.service.ts:26`.
3. Antes de `lock`, cancelar solo libera la reserva fuera de cadena. Después de `lock`, el estado `cancelled` de la base de datos no significa fondos devueltos. Solo una transacción `decline` o `refund` confirmada en cadena permite mostrar `refunded`. Tras la constancia durable de entrega de efectivo, la app y el backend no ofrecen ni preparan `decline`; ofrecen completar o soporte.
4. El contrato no puede observar la constancia de entrega de efectivo que vive en la base de datos. Un buyer con su llave todavía podría invocar `decline` directamente tras la entrega; ocultar un botón no crea una prohibición on-chain. Este riesgo residual debe revisarse en el modelo de amenazas y en las reglas de disputa antes de fondos reales. No se dará a soporte una llave que pueda recuperar o reasignar fondos.

## Incidente de migración de wallet

- **Causa raíz:** el arranque de `App.tsx` y el login de `Login.tsx` llamaban a `generateAndStoreKeypair()` cuando no encontraban una llave. Durante una migración fallida o incompleta, esa lógica podía crear una cuenta nueva y ocultar el problema en vez de detenerse.
- **Corrección:** login y arranque normal ya no generan cuentas. Si la llave no existe, se cierra la sesión local y se muestra recuperación; la creación queda limitada al registro explícito y al modo demo habilitado expresamente.
- **Recuperación:** si conviven una seed legacy y un vault nativo con otra cuenta, la migración vuelve a importar la seed legacy, comprueba que produzca la misma dirección `G…` y solo entonces elimina el registro anterior.
- **Regresión:** pasan 22/22 pruebas focalizadas de migración nativa, presencia del usuario y prohibición de creación automática. El APK corregido es únicamente `versionCode 26102623`; `26102622` no debe instalarse ni distribuirse.

## Origen de `decline` y situación actual

- `docs/AUDITORIA_CASHOUT_AGENTE_2026-08-26.md:888-892` propone expresamente un `decline` on-chain firmado solo por el buyer, previo a la entrega, para reembolsar al seller inmediatamente.
- [`docs/archive/issues/2026-08-26/CASH-2.md`](../../archive/issues/2026-08-26/CASH-2.md) conserva como regla histórica que el seller no puede reclamar antes del timeout; deja el cambio de contrato fuera de ese issue.
- `docs/AUDIT_MOBILE_MAINNET.md:26-51` documenta la solución temporal vigente: cancelar en la app y esperar al sweep de `refund()` después del vencimiento. `cancel_by_agreement` quedó diferido para evitar entonces un redespliegue.
- El contrato actual solo expone `lock`, `release`, `refund`, `get_trade` e `initialize`. `refund()` exige `timeout_ledger`, y el ID Testnet usado por la APK carece incluso del parche `TradeAlreadyExists`. Se despliega una **instancia nueva**, sin asumir que el contrato viejo adquiera `decline`.

## Referencia externa: Trustless Work

- [Repositorio de contratos Soroban](https://github.com/Trustless-Work/trustlesswork-smart-contract-stellar) y [referencia de interfaz](https://github.com/Trustless-Work/trustlesswork-smart-contract-stellar/blob/single-release-develop/docs/CONTRACT_REFERENCE.md). Su escrow es para hitos de servicios: `release_funds` depende de aprobaciones y la ruta alternativa es `dispute_escrow`/`resolve_dispute` con un árbitro. **No implementa nuestro `decline` buyer-only para una entrega de efectivo** ni justifica introducir un árbitro con poder sobre los fondos de MicoPay.
- [Runtime Verification auditó](https://www.trustlesswork.com/20251107%20Trustless%20Work%20Audit%20Report.pdf) los contratos en los commits `5d4669d69ecdf1a8c788b5e644078f797f818850` (single-release) y `68d9a9920a50a60223ec85c20400ee8af72d6e4e` (multi-release). El backend recibió una revisión limitada y las remediaciones solo comprobaciones parciales; ni la rama actual de Trustless Work ni nuestro contrato quedan auditados por extensión.
- Traducir sus hallazgos en pruebas propias: [A05] fijar destinatario, roles, activo y montos al firmar/financiar para impedir cambios entre preparación y ejecución; [A06] rechazar montos negativos y overflow; [A09] hacer `release`, `decline` y `refund` terminales y mutuamente excluyentes; [B08] devolver al **seller que aportó los fondos**, no a un actor que solo autorizó; [B07] inicialización atómica; [TS28/TS29] conciliar DB con estado/eventos y confirmar envío real en cadena. El código ajeno sirve como patrón y casos de regresión, no como sustituto de una auditoría independiente de MicoPay.

## Fases y entregables

### 0. Línea base y contratos de interfaz

- Registrar ID, WASM hash, versión de protocolo, token, issuer, wallet de comisión y saldo/operaciones abiertas de **cada** instancia de escrow por activo. Comprobar que los IDs de frontend, backend y registros de operaciones coinciden.
- Definir un esquema compartido para intención de firma: red fijada por build, cuenta fuente, contrato, método, argumentos, asset/issuer, monto, contraparte, comisión total, secuencia y vigencia. No confiar en una descripción textual enviada por el servidor.
- Definir estados distinguibles para `cancel_requested`, `cancelled_with_funds`, `decline_pending`, `refunded` y `completed`, ya sea con columnas de liquidación o con estados nuevos; especificar migración y compatibilidad de la API antes de cambiar la UI. Conservar `escrow_contract_id` por operación.
- Criterio de salida: fixtures de la API y tabla de transiciones para depósito/cash-out, ambos actores y los momentos antes/después de la entrega.

### 1. Contrato Soroban nuevo

- Añadir `decline(env, trade_id)` al `micopay/contracts/escrow/src/lib.rs`: cargar trade `Locked`, exigir `trade.buyer.require_auth()`, transferir el total al seller, persistir `TradeStatus::Refunded`, extender TTL y emitir un evento inequívoco `declined` con trade ID y seller. Conservar el evento `refunded` para el timeout; ambos representan fondos devueltos, con causa distinta.
- Mantener el rechazo de `secret_hash` repetido y los errores ya publicados; añadir solo errores nuevos al final de la enumeración si son necesarios. Comprobar suma de monto y comisión sin overflow, límites del timeout y ausencia de doble liquidación entre `decline`, `release` y `refund`.
- Sustituir la inicialización abierta por parámetros fijados **en el despliegue** mediante constructor `__constructor` si la versión de protocolo/SDK del proyecto lo permite. Autorizar al admin allí y comprobar token/wallet; un `initialize(admin)` público con `admin.require_auth()` por sí solo **no impide** que el primero elija su propio admin. Si la migración de SDK no permite constructor, diseñar y probar un despliegue con inicialización atómica y admin precomprometido antes de publicar el ID.
- Pruebas Rust: buyer autorizado, seller/tercero rechazados, reembolso exacto de monto y fee, antes/después de timeout, `release` frente a `decline`, llamada doble, hash repetido, inicialización por tercero y TTL. Construir WASM reproducible y guardar su hash.
- Criterio de salida: suite de contrato y simulaciones RPC pasan; interfaz contiene `decline` y `TradeAlreadyExists`, y no existe ruta de primer inicializador ajeno.

### 2. Validación local antes de cada firma

- En `micopay/frontend/src/services/api.ts` validar el XDR **antes** de llamar al firmador para `lock`, `release` y `decline`. Exigir una sola invocación al contrato almacenado para ese trade, argumentos exactos, cuenta fuente igual a la wallet local, red del build, secuencia/tiempos vigentes, fee dentro de política y ausencia de firmas u operaciones inesperadas. Comparar con datos del trade recuperados de forma autenticada, no con el propio XDR.
- Extender el decoder y la pantalla de confirmación para mostrar activo **e issuer**, monto, quién recibe, red, contrato/método, comisión y vigencia. Rechazar lo que no pueda describirse con precisión; la biometría llega después de la revisión.
- Aplicar el mismo criterio al flujo de solicitudes de firma externas y retirar el fallback `Test SDF Network ; July 2015`. El backend conserva su validación posterior como segunda barrera.
- Criterio de salida: pruebas negativas con contrato, método, issuer, destinatario, monto, fee, red, source, secuencia y operación adicional alterados; ninguna variante llega al firmador.

### 3. Plugin nativo Android y migración de cuentas

**Avance local:** plugin y puente Capacitor implementados; pagos clásicos, trustlines, CETES, retiro bancario, challenge y escrow pasan por él en Android. El respaldo conserva una ruta separada y autenticada. Compilan el frontend Testnet, `:app:compileDebugJavaWithJavac`, `:app:assembleDebug` y `:app:assembleRelease`; pasan 6 pruebas de migración/puente. El release está en `artifacts/security-20261026/micopay-testnet-keystore-release.apk`. Falta probarlo en hardware real y todavía no se distribuyó.

- Diseñar una API nativa acotada: crear/importar cuenta, obtener dirección, firmar challenge, firmar una **intención validada** de transacción y revelar respaldo bajo un flujo separado. No exponer al puente Capacitor un método genérico `getSeed()` ni un firmador de XDR arbitrario. Validar la intención también en el límite nativo para que un llamador JavaScript no salte la política.
- Cifrar la seed con AES-GCM y una clave Android Keystore que requiera autenticación del sistema; definir huella/PIN admitidos, ventana de autorización, invalidación por cambios de bloqueo/biometría y recuperación. Comprobar `KeyInfo` para distinguir StrongBox, TEE y software. La política para teléfonos sin bloqueo seguro debe quedar resuelta y probada, sin degradación silenciosa.
- Reemplazar los usos normales de `exportSecretKey()` en `keystore.ts`, `payment.ts`, `stellarRamp.ts` y la firma de challenge. No registrar seed, XDR sensible ni bytes descifrados. El respaldo de la seed se muestra mediante pantalla nativa segura, tras nueva autenticación.
- Migración de cuentas existentes: verificar que la seed antigua produce el mismo `G…`, moverla una sola vez al contenedor nuevo, probar firma y recuperación, y **solo entonces** retirar el registro anterior. Si el plugin no puede leer el almacenamiento anterior directamente, documentar el puente de migración de una sola vez y su exposición residual. Ensayar reinstalación y pérdida de dispositivo con respaldo del usuario.
- Criterio de salida: la dirección `G…` no cambia; funcionan login, pago clásico y Soroban `lock`/`release`/`decline`; pruebas de bloqueo/cancelación biométrica, app en segundo plano, migración interrumpida y restauración. Ninguna ruta ordinaria entrega la seed a JavaScript.

### 4. API de solicitudes de firma

- Unificar contrato frontend/backend: GET de solicitud y pendientes para la wallet destinataria autenticada; GET de estado para **el dispositivo creador**; POST de resolución con un solo esquema canónico y estados `pending/signed/cancelled/expired`.
- Resolver el `identifier` contra una wallet concreta al crear la solicitud y comprobarla al leer/resolver. Comprobar `device_id` al consultar el estado. Rechazar XDR inválido en producción; eliminar el `txid` inventado. Comparar la transacción firmada con el `txxdr` original y verificar identidad/firma, red y expiración. Actualizar estado atómicamente para impedir dos resoluciones.
- Prueba de integración: dispositivo crea → wallet correcta lee/decodifica → firma o rechaza → dispositivo propio consulta. Cubrir wallet ajena, dispositivo ajeno, XDR alterado, cancelación simultánea y expiración.
- Criterio de salida: flujo real extremo a extremo aprobado sin mocks que acepten XDR inválidos.

### 5. Flujo `decline` en backend y APK

- Backend: añadir `prepareDeclineTx` y `submitDeclineTx` en `stellar.service.ts`, con `buyer` como fuente/firmante, contrato obtenido de `escrowContractForTrade`, trade ID calculado desde el hash y XDR preparado con simulación. Antes de enviar, verificar contrato, método, argumentos, source y firma igual que para `lock/release`.
- Servicio de trades: el seller puede **pedir** la cancelación; el buyer decide y firma `decline`. Exigir participantes, trade bloqueado, ausencia de liquidación y **ausencia de constancia durable de entrega** antes de preparar/enviar. No borrar secretos ni presentar fondos devueltos antes de confirmación en cadena. Registrar solicitante, firmante, causa y hash; hacer la transición idempotente.
- Eventos: reconocer `declined`, persistir `refunded` y hash de liquidación, avisar a ambos y tratar eventos tardíos/repetidos sin degradar estado. Mantener el sweep de `refund()` para contratos viejos y trades cuyo buyer no coopere; excluir los ya liquidados. Conservar el manejo de timeout RPC como estado incierto que se reconcilia por hash/evento.
- APK: mostrar al seller «solicitar cancelación» y al buyer «devolver fondos ahora» solo antes de la entrega; explicar que pedir no equivale a reembolso. Después de `decline` confirmado mostrar «fondos devueltos». Probar depósito y cash-out con actor y proveedor distintos.
- Criterio de salida: pruebas de integración y Testnet para solicitud → buyer firma → evento → balance seller → detalle de ambos; denegar después de handoff en API/UI, sin afirmar que esa denegación exista dentro del contrato.

### 6. Fees, red y conciliación

- Sustituir las fees fijas de pagos/trustlines/CETES por estimación vigente con tope y presentación al usuario; para Soroban incluir fee de recursos y comprobar el total antes de firmar. Fijar Testnet/Mainnet por build y rechazar respuestas con passphrase distinta.
- Calcular hash antes de enviar; ante timeout consultar RPC/Horizon y eventos antes de reconstruir o reintentar. Conservar secuencia y timebounds acotados, y registrar estados inciertos sin mostrar «falló» o «reembolsado» prematuramente.
- Criterio de salida: pruebas de envío aceptado con respuesta perdida, rechazo real, expiración y reintento sin doble liquidación.

### 7. Despliegue y corte

- Desplegar **nuevas instancias por activo** en Testnet, con constructor seguro y parámetros verificados on-chain. Confirmar interfaz, WASM hash, balances y pruebas de `lock/release/decline/refund` contra cada instancia. No usar la interfaz como única prueba de comportamiento: ejecutar flujos completos con fondos de prueba.
- Publicar backend compatible primero, manteniendo IDs viejos para operaciones abiertas mediante `escrow_contract_id` y `ESCROW_LEGACY_CONTRACT_ID`. El listener debe observar contratos viejos y nuevos mientras haya operaciones activas. No dirigir trades nuevos al contrato viejo; impedir que una APK antigua cree un lock incompatible durante el corte mediante versión mínima/feature gate.
- Generar un **nuevo APK release** con `versionCode` superior, misma identidad y firma de actualización; validar instalación encima del anterior y migración de seed sin crear otra cuenta. Distribuir a un piloto Testnet, verificar reconciliación y rollback de API/UI sin dejar fondos sin ruta de `refund`.
- Puerta para Mainnet: revisión independiente del contrato y firmador nativo, pruebas de amenazas anteriores, inventario de trades abiertos y plan de operación/alertas. Publicar Mainnet solo tras comprobar sus propios IDs, red, issuers y artefactos; el APK Testnet no acredita Mainnet.

## Trazabilidad de hallazgos

| Hallazgo de la reauditoría | Fase que lo cierra |
| --- | --- |
| Contrato Testnet anterior al parche e inicialización abierta | 1, 7 |
| Firma ciega de `lock/release` y aprobación externa incompleta | 0, 2, 5 |
| API de firma incompatible, autorización débil y XDR inválido aceptado | 4 |
| Seed expuesta a JavaScript | 3 |
| Fees fijas y timeout ambiguo | 6 |
| Cancelación que espera timeout pese a fallo de condiciones | 1, 5, 7 |

**Referencias técnicas:** [constructores atómicos de Stellar](https://developers.stellar.org/docs/build/apps/guestbook/smart-contract), [autorización de claves Android Keystore](https://developer.android.com/privacy-and-security/keystore), [autenticación biométrica/PIN](https://developer.android.com/identity/sign-in/biometric-auth).
