# Auditoría del APK con Stellar Raven — 2026-10-25

## Resumen ejecutivo

**Resultado: no apto para mainnet ni para fondos reales.** El APK auditado sí es un
release firmado y endurecido a nivel Android, pero conserva dos bloqueadores de
seguridad en la ruta Stellar:

1. El contrato de escrow configurado en Testnet corresponde a la versión anterior
   al parche que impide sobrescribir una operación mediante un `secret_hash`
   repetido.
2. El APK firma a ciegas los XDR de `lock` y `release` preparados por el backend;
   la validación estricta ocurre en el servidor después de que la llave del usuario
   ya firmó.

La clasificación P0 significa **bloqueador antes de usar fondos reales**. El APK
actual opera en Testnet, por lo que el impacto monetario inmediato se limita a
activos de prueba, pero el defecto de diseño debe corregirse antes de mainnet.

## Alcance y artefacto

- APK: `artifacts/kyc-20261025/micopay-kyc-testnet-release.apk`
- SHA-256: `E3F1945B88849EED135C14FD1278E51632CAA60C8E31AA70FAE5BCD957B9C0D6`
- Paquete: `com.micopay.app`
- Versión: `versionCode=26102519`, `versionName=1.0.0`
- Firma: APK Signature Scheme v2, certificado `CN=Micopay`
- Certificado SHA-256: `1a1235a6cdaa88dd69bffa5352f1ba921eed8407cfcdc55e5bb5a90f58a5172c`
- Código auditado: worktree `feat/kyc-efectivo`, `HEAD feb24a1`, incluyendo sus
  cambios locales, que fue la fuente usada para compilar el APK.

## Metodología

1. Stellar Raven MCP autenticado por OAuth:
   - consulta de separación Testnet/pubnet, passphrases, Horizon/RPC, inspección
     de XDR, trustlines, claves, Soroban, fees, sequence y timebounds;
   - consulta del registro de contratos de Raven para el ID del escrow.
2. Verificación pública de Testnet:
   - Stellar CLI 25.2 contra `https://soroban-testnet.stellar.org`;
   - Horizon Testnet para las cuentas emisoras.
3. Revisión estática del frontend, backend, contrato Soroban y configuración
   Android.
4. Inspección del APK con `apksigner` y `aapt`.
5. Ejecución de pruebas dirigidas: 33 frontend, 2 backend de escrow/timeout y 6
   del contrato Soroban; todas pasaron.

### Alcance real de Raven

Raven aportó documentación oficial y criterios de auditoría. Su catálogo de
contratos verificados consultado cubre mainnet, no estado en vivo de Testnet.
Por ello, el resultado `no-rows` de `scout.listContracts` para el contrato no se
interpretó como inexistencia. La existencia y la interfaz se comprobaron después
con Stellar RPC Testnet.

## Hallazgos

### P0-1 — El contrato desplegado no contiene el parche anti-sobrescritura

**Evidencia**

- El APK fija el contrato
  `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ` en
  `micopay/frontend/.env.testnet:8`.
- Stellar RPC confirmó que el contrato existe y expone `lock`, `release`,
  `refund`, `get_trade` e `initialize`.
- La interfaz desplegada solo enumera `EscrowError` 1–9; no contiene
  `TradeAlreadyExists = 10`.
- Esa interfaz coincide exactamente con la revisión anterior a `e51d588`
  (`fix(escrow): lock no sobrescribe una operacion existente`).
- La fuente actual explica y corrige el defecto en
  `micopay/contracts/escrow/src/lib.rs:79` y devuelve el nuevo error en
  `micopay/contracts/escrow/src/lib.rs:88`.

**Impacto**

En la versión anterior, `trade_id` depende únicamente de `secret_hash`. Como el
hash queda visible on-chain, un tercero puede intentar llamar `lock` con el mismo
hash y una cantidad mínima. Sin la comprobación de existencia, el registro del
trade puede sobrescribirse y los fondos originales quedar sin una ruta correcta
de liberación o reembolso.

No se ejecutó el ataque en Testnet para evitar mutar estado. La coincidencia exacta
de la interfaz desplegada con la versión previa al parche confirma la deriva de
versión; una reproducción dinámica debe hacerse únicamente en un contrato desechable.

**Remediación**

1. Desplegar el WASM construido desde una revisión que incluya `e51d588`.
2. Verificar que la interfaz desplegada incluya `TradeAlreadyExists = 10`.
3. Inicializar y verificar token, wallet de plataforma y admin antes de publicar
   el nuevo ID.
4. Actualizar el mapeo backend `ESCROW_CONTRACTS` y después el build del APK.
5. No dirigir fondos reales al contrato actual.

### P0-2 — Firma ciega de XDR preparados por el backend

**Evidencia**

- `lockTrade` firma directamente `prepared.xdr` y
  `prepared.network_passphrase` en `micopay/frontend/src/services/api.ts:413`.
- `completeTrade` repite el patrón en `micopay/frontend/src/services/api.ts:482`.
- `signTransactionXdr` solo pide presencia, parsea y firma; no verifica contrato,
  función, argumentos, source, fee, sequence, timebounds ni red permitida:
  `micopay/frontend/src/lib/keystore.ts:45`.
- El backend sí comprueba contrato, función y argumentos, pero lo hace después de
  recibir el XDR ya firmado en
  `micopay/backend/src/services/stellar.service.ts:228` y
  `micopay/backend/src/services/stellar.service.ts:323`.

**Impacto**

Un backend comprometido, una respuesta alterada o un fallo de programación puede
hacer que el teléfono firme una transacción distinta a la operación que la persona
cree aprobar. La biometría actual solo confirma una intención genérica; no muestra
el efecto criptográfico que se autoriza.

**Remediación**

Antes de llamar a `signTransactionXdr`, el APK debe:

- permitir únicamente `Networks.TESTNET` en este build;
- exigir una sola operación `invokeHostFunction`;
- fijar contract ID por activo y comprobar `lock` o `release`;
- validar todos los argumentos contra el trade mostrado;
- comprobar source account, fee, sequence, timebounds y firmas existentes;
- mostrar monto, activo, issuer, contraparte, comisión, timeout y contrato en la
  pantalla previa a la biometría.

La validación del backend debe conservarse como segunda barrera.

### P1-1 — `initialize` no exige autorización del admin

**Evidencia**

`initialize` acepta `admin`, `token_id` y `platform_wallet`, y los guarda sin
ejecutar `admin.require_auth()` en `micopay/contracts/escrow/src/lib.rs:37`.
El contrato desplegado expone la misma firma pública.

**Impacto**

En cada despliegue nuevo, cualquier cuenta puede adelantarse a la inicialización y
fijar el token y la wallet de comisiones. El segundo intento legítimo falla con
`AlreadyInitialized`.

**Remediación**

Exigir `admin.require_auth()` antes de escribir estado y tratar despliegue más
inicialización como una operación controlada y verificada. Añadir una prueba donde
un invocador distinto del admin no pueda inicializar.

### P1-2 — El flujo de solicitudes de firma no coincide entre APK y backend

**Evidencia**

- El APK consulta `GET /sign-requests/:id` con el JWT de usuario y espera el XDR:
  `micopay/frontend/src/services/signRequestService.ts:34`.
- El backend protege ese GET con `deviceAuthMiddleware` y devuelve solo estado,
  no XDR: `micopay/backend/src/routes/sign-requests.ts:103`.
- El APK llama `GET /sign-requests/pending`, pero no existe esa ruta en el backend:
  `micopay/frontend/src/services/signRequestService.ts:47`.
- El APK envía `{ action, signed_xdr }`; el backend prohíbe propiedades extra y
  espera `{ signed_xdr, cancelled }`:
  `micopay/frontend/src/services/signRequestService.ts:77` frente a
  `micopay/backend/src/routes/sign-requests.ts:174`.
- La ruta sí está expuesta en el APK mediante
  `micopay/frontend/src/App.tsx:866`.

**Impacto**

Las notificaciones y deep links de firma no pueden completar de forma consistente
el flujo real aunque las pruebas unitarias aisladas pasen.

**Remediación**

Definir un único contrato API, autorizar al wallet destinatario, devolver el XDR
solo a ese usuario, implementar `/pending` o retirarlo, y agregar una prueba E2E
device → wallet → resolución.

### P1-3 — La aprobación de pagos externos omite datos críticos y acepta la red del servidor

**Evidencia**

- La solicitud entrega `network_passphrase` y el APK la usa sin allowlist en
  `micopay/frontend/src/pages/SignatureApproval.tsx:94` y
  `micopay/frontend/src/pages/SignatureApproval.tsx:108`.
- Si falta, usa `Test SDF Network ; July 2015`, que no es la passphrase oficial de
  Testnet (`September 2015`):
  `micopay/frontend/src/services/signRequestService.ts:73`.
- El decoder obtiene `assetIssuer`, pero la UI solo muestra código, monto,
  destino y memo en `micopay/frontend/src/pages/SignatureApproval.tsx:275`.
- No muestra red, issuer, source, fee, sequence, timebounds ni firmas existentes.

**Impacto**

Cuando el flujo API se repare, un activo malicioso con el mismo código visible o
una solicitud de red inesperada puede presentarse de forma engañosa. El fallback
actual produce firmas no válidas si el servidor omite la passphrase.

**Remediación**

Eliminar el fallback literal, derivar la passphrase del build, rechazar redes no
permitidas y ampliar decoder/UI con todos los campos de inspección recomendados
por Stellar.

### P2-1 — La biometría protege la acción, no el material de la seed

**Evidencia**

- En Android se usa `@aparajita/capacitor-secure-storage`:
  `micopay/frontend/src/services/secureStorage.ts:169`.
- La seed se carga como string en JavaScript para firmar:
  `micopay/frontend/src/lib/keystore.ts:54`.
- El propio diseño reconoce que la clave sigue siendo legible por el código de la
  app y no está envuelta con una clave de Android Keystore ligada a autenticación:
  `micopay/frontend/src/lib/userPresence.ts:14`.

**Impacto**

La defensa es útil contra uso casual de un teléfono desbloqueado, pero no contra
ejecución de código dentro del WebView, instrumentación o compromiso avanzado del
dispositivo.

**Remediación**

Implementar un componente nativo que cifre/descifre con Android Keystore usando
autenticación del sistema, reducir al mínimo la exposición de la seed al runtime
JS y conservar la pantalla segura para el respaldo.

### P2-2 — Fees fijas y manejo ambiguo de timeouts en pagos clásicos

**Evidencia**

- Trustline y pagos usan fee fija `10000` stroops:
  `micopay/frontend/src/services/payment.ts:91` y
  `micopay/frontend/src/services/payment.ts:151`.
- CETES usa el mismo valor en
  `micopay/frontend/src/services/stellarRamp.ts:33`.
- Ante error de `submitTransaction`, el pago clásico devuelve un error genérico
  sin conservar hash ni consultar si la transacción terminó entrando:
  `micopay/frontend/src/services/payment.ts:167`.

**Impacto**

La fee puede ser excesiva o insuficiente según congestión. Un timeout de Horizon
no prueba que la transacción haya fallado; reintentar sin consultar el hash puede
producir UX inconsistente y errores de sequence.

**Remediación**

Consultar fee recomendada, mostrarla antes de firmar y conservar el hash para
consultar estado antes de reconstruir o reintentar. Mantener timebounds acotados.

## Controles correctos observados

- El APK es release, no debug; `android:debuggable` no está habilitado.
- `allowBackup=false`, cleartext deshabilitado y CAs de sistema únicamente en
  release: `micopay/frontend/android/app/src/main/AndroidManifest.xml:3` y
  `micopay/frontend/android/app/src/main/res/xml/network_security_config.xml:8`.
- El paquete y certificado coinciden con el release anterior, por lo que puede
  instalarse como actualización sin borrar la cuenta local.
- La configuración del APK separa Testnet y fija issuers/contrato.
- Horizon y la passphrase usados por pagos directos caen correctamente a
  `horizon-testnet.stellar.org` y `Networks.TESTNET`.
- Trustlines identifican el activo por código **e issuer**.
- El retiro bancario valida source, destino, activo, issuer y monto antes de firmar:
  `micopay/frontend/src/services/stellarRamp.ts:106`.
- Las operaciones sensibles piden presencia del usuario y revelar la seed fuerza
  una nueva autenticación.
- El contrato exige autorización del seller en `lock` y del buyer en `release`.
- El backend usa `prepareTransaction` (simulación + assembly Soroban) y vuelve a
  validar la invocación firmada antes de enviarla.
- Stellar RPC confirmó que el contrato configurado existe en Testnet y expone la
  interfaz de escrow esperada.
- Horizon Testnet confirmó que ambos issuers existen. Sus flags actuales son:
  `auth_required=false`, `auth_revocable=false`, `auth_immutable=false` y
  `auth_clawback_enabled=false`.

## Evidencia Raven / Stellar

Referencias recuperadas mediante Stellar Raven:

- [Inspección antes de firmar](https://developers.stellar.org/docs/tools/cli/agent-cli/guides/build-and-submit-transactions#inspection-before-signing)
- [Passphrase y configuración de red](https://developers.stellar.org/docs/build/guides/dapps/frontend-guide#setting-up-the-stellar-sdk)
- [Simulación y assembly Soroban](https://developers.stellar.org/docs/build/guides/transactions/simulateTransaction-Deep-Dive#assembling-a-transaction)
- [Errores comunes al firmar invocaciones Soroban](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations#common-pitfalls-and-gotchas)
- [SEP-7 y verificación de solicitudes](https://developers.stellar.org/docs/build/apps/wallet/sep7#pay-operation)
- [Trustlines](https://developers.stellar.org/docs/build/apps/example-application-tutorial/manage-trust#the-dashboardassets-page)
- [Timeouts y reintentos de Horizon](https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/error-handling#synchronous-transaction-submission)

Consultas públicas adicionales:

- `https://soroban-testnet.stellar.org`, contrato
  `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ`
- `https://horizon-testnet.stellar.org/accounts/GADK7SUS7NHIGERQBKF7R67A5DNIEFWG4YKNHLTQM5JN4KP2QISMJSHG`
- `https://horizon-testnet.stellar.org/accounts/GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC`

## Pruebas ejecutadas

- Frontend: 4 archivos, 33 pruebas, todas aprobadas.
  - `SignatureApproval.test.tsx`
  - `transactionDecoder.test.ts`
  - `userPresence.test.ts`
  - `validatePreparedWithdrawTx.test.ts`
- Backend:
  - `test:escrow-contracts`: 6 comprobaciones aprobadas.
  - `test:lock-timeout`: 2 comprobaciones aprobadas.
- Contrato Soroban: 6 pruebas aprobadas, incluida
  `test_lock_rejects_reused_secret_hash`.

Las pruebas verdes confirman el comportamiento de la **fuente actual**, no que el
WASM desplegado contenga ese comportamiento. Esa diferencia es precisamente el
hallazgo P0-1.

## Orden de remediación recomendado

1. Proteger `initialize` y desplegar el contrato corregido.
2. Verificar interfaz/WASM y actualizar el mapeo del backend.
3. Implementar validación y presentación local del XDR de escrow antes de firmar.
4. Alinear el contrato API de solicitudes de firma y endurecer su pantalla.
5. Envolver la seed con Android Keystore ligado a autenticación.
6. Mejorar fees, seguimiento por hash y tratamiento de timeouts.
7. Generar un nuevo APK release, repetir esta auditoría y hacer QA en dispositivo.

## Incertidumbres y pruebas pendientes

- No se explotó el contrato actual ni se alteró estado on-chain.
- No se hizo análisis dinámico del APK en dispositivo, proxy TLS, Frida o equipo
  rooteado.
- No se comprobó pinning TLS porque no está implementado; el release confía en
  CAs del sistema.
- Raven no ofreció estado vivo de Testnet; esa parte se cubrió con Stellar
  CLI/RPC y Horizon.
- No se verificó Play Integrity, publicación en Play App Signing ni configuración
  de Play Console.
