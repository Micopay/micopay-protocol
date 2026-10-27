# Reporte de sesión: MicoPay, 21–22 de octubre de 2026

Cubre una sesión larga que arrancó la tarde del 21 (publicación del JWKS para `/idv`) y siguió toda la mañana del 22 (WP1 completo del retiro a banco, suscripción de webhooks, deploys y portado de los security advisories). No repite nada del reporte del 20 de octubre; los pendientes de ese día que **no** se avanzaron hoy van al final.

> **Privado.** El reporte menciona secretos en SSM por su nombre, el org id de Etherfuse y el id de usuario de un agente. No subirlo al repo público.

---

## Resumen

| # | Tema | Resultado | Estado |
|---|------|-----------|--------|
| **I. JWKS y JWT para Etherfuse /idv** | | | |
| 1 | Publicar `/.well-known/jwks.json` | PR #454 mergeado; backend v20 (rev 25) desplegado; panel de Etherfuse llenado | ✅ en prod |
| 2 | Firmar JWT para abrir `/idv` | `signLaunchToken(subject, {ttlSeconds, extraClaims, issuer})` en lib + 3 pruebas | ✅ listo |
| **II. Retiro a banco (WP1 completo, PR #455)** | | | |
| 3 | Migración de base de datos | `20261021170000_bank_withdraw`: tabla `ramp_quotes`, columnas de estado en `ramp_orders`, columnas KYC Etherfuse en `users` | ✅ aplicada en prod |
| 4 | Cliente v2 de Etherfuse | `etherfuseV2.service.ts`: personal orgs, verification, payment accounts, quotes, orders, webhooks + verificación HMAC | ✅ |
| 5 | Service de orquestación | `rampWithdraw.service.ts`: KYC, CLABE (dígito del Banco de México), quote USDC→MXN, order, listado, 3 webhook handlers | ✅ |
| 6 | Rutas HTTP | 6 rutas `/defi/bank-withdraw/*` + 3 rutas de webhook con body crudo | ✅ |
| 7 | Firma de preparedTransaction (WP2) | `validatePreparedWithdrawTx` en frontend con 9 pruebas (decisión 7 del plan) | ✅ |
| 8 | Pantalla y botón en Home | `BankWithdrawScreen.tsx` con 5 fases y polling; botón detrás de `VITE_ENABLE_BANK_WITHDRAW` | ✅ |
| **III. Fix urgente del cliente v2** | | | |
| 9 | `Authorization` sin `Bearer` | PR #456: la API de Etherfuse rechaza con 401 "Invalid API key format" si se manda `Bearer`. Verificado directo contra `api.sand.etherfuse.com` | ✅ en prod (v22) |
| **IV. Suscripción de webhooks y SSM** | | | |
| 10 | 3 webhooks suscritos en Etherfuse (`orderUpdated`, `kycUpdated`, `paymentAccountUpdated`) | Script PowerShell con la API `/webhook_subscription`. Secretos nunca pasaron por stdout | ✅ |
| 11 | Secretos en SSM | 4 parámetros nuevos: 3 webhook secrets + `ETHERFUSE_USDC_ASSET` (Circle testnet) | ✅ |
| **V. PRs portados y mergeados** | | | |
| 12 | #432 — Didit v3 (los 3 cambios de mi revisión) | Revisado commit `32665c3`, aprobado y mergeado como `552c328` | ✅ en main |
| 13 | SEC-1 (GHSA-f97g-64fh-j2px) | Portado del fork privado como PR #457 (`chore/cetes-buy-mainnet-public`), mergeado | ✅ en main |
| 14 | SEC-2 (GHSA-7r9r-cv69-rgg6) | Portado como PR #458 (`chore/deploy-platform-wallet-public`), mergeado | ✅ en main |
| **VI. Deploys** | | | |
| 15 | Backend v20 → v21 → v22 → v23 | 4 revisiones de task definition (25, 26, 27, 28); al final `micopay-backend:v23` en rev 28 corriendo | ✅ en prod |
| 16 | Lecciones del scheduler atascado | Con `maximumPercent=100/minimumHealthyPercent=0` el deploy se queda sin colocar la tarea nueva. Cambio temporal a 200/0 destraba; vuelta a 100/0 después | 💬 documentar |
| **VII. UX y APK** | | | |
| 17 | Flag + pantalla + botón | `VITE_ENABLE_BANK_WITHDRAW=true` en `.env.testnet` | ✅ |
| 18 | APK con el botón | `micopay-testnet-release-d563976.apk` (14 MB) | ✅ construido |
| 19 | Fix UX: botón del historial siempre visible | PR #459, mergeado como `344a822` | ✅ en main + APK |
| 20 | APK final del día | `micopay-testnet-release-344a822.apk` | ✅ listo para instalar |
| 21 | Override SQL para probar `agente_xalapa` | `kyc_status='approved'`, `etherfuse_customer_id` = el propio user_id, `etherfuse_kyc_status='approved'` | ✅ aplicado (saltos de UI, no e2e real) |
| **VIII. Documentación** | | | |
| 22 | Imagen de la arquitectura AWS | 2 versiones (detallada interna y sanitizada para compartir) en `docs/arquitectura-aws*.png` | ✅ |

---

# I. JWKS y JWT para Etherfuse /idv

## 1. Publicar el JWKS en producción (PR #454)

**Qué era.** Etherfuse exige que firmemos un JWT RS256 para lanzar al usuario a `/idv` (selfie + contrato). Nosotros firmamos con la privada y Etherfuse valida contra una URL JWKS pública. En el panel de Etherfuse se registra el `issuer` (`https://api.micopay.app`) y el `JWKS URL` (`https://api.micopay.app/.well-known/jwks.json`).

**Cómo se hizo.**
- `lib/etherfuseJwt.ts`: convierte el PEM público a JWK (`kty: "RSA"`, `use: "sig"`, `alg: "RS256"`, `kid` por RFC 7638).
- `routes/jwks.ts`: sirve `{ keys: [...] }` con `Cache-Control: public, max-age=3600`.
- `scripts/generate-etherfuse-jwt-keys.mjs`: genera RSA 2048 y escribe la privada a SSM como `SecureString` por archivo temporal (`%TEMP%\etherfuse-jwt-...`, borrado al terminar). La privada nunca pasa por argv ni por stdout.
- Prueba `test:etherfuse-jwks` con 6 casos (round-trip de firma, kid estable, cache, errores).

**En prod.** Backend `v20` (rev 25) subido tras el merge de #454. `curl https://api.micopay.app/.well-known/jwks.json` devuelve el kid `3pIvAeVE22Cl1qep_DtNyAjOo8WtpPZP1THuksDKYuk`.

**Error de proceso que vale la pena anotar.** Primero generé las llaves bajo `/micopay/sandbox/*`, pero el rol de ejecución de ECS solo tiene permiso `ssm:GetParameters` sobre `/micopay/prod/*`. Hubo que borrar y regenerar bajo el path correcto. Confirmación de Eric: no hay dos entornos, solo `prod` en SSM (aunque internamente apunte al sandbox de Etherfuse). Guardado en memoria `micopay-secretos-ssm.md`.

## 2. Firmar JWT para abrir /idv

- `signLaunchToken(subject, { ttlSeconds, extraClaims, issuer, nowSec })`:
  - Header: `alg="RS256"`, `kid=<RFC 7638 thumbprint>`, `typ="JWT"`.
  - Reclamos: `iss`, `sub` (= id de la personal org del usuario), `iat`, `exp` (default 5 min), `jti`.
  - `extraClaims` permite agregar `aud`, `scope`, `email`, `name` según requisito de Etherfuse.
- 3 pruebas nuevas: produce RS256 verificable, falla con subject vacío / privada ausente / ttl inválido, mezcla `extraClaims` sin pisar los reservados.

---

# II. Retiro a banco (SPEI) — WP1 completo

PR #455 (`feat/bank-withdraw-wp1`), 12 commits, 10 archivos backend + 3 frontend + 2 migraciones + 2 pruebas. Mergeado como `d563976`.

## 3. Migración de base de datos (`20261021170000_bank_withdraw.up.sql`)

- Tabla **`ramp_quotes`** (nueva): guarda lo cotizado (activo, DEX path, monto que llega a Etherfuse, MXN prometidos, fee, `expires_at`). Impide que la orden posterior pueda alterar lo cotizado.
- `ramp_orders` (ya existía): columnas `quote_id`, `status`, `status_updated_at`.
- `users` (ya existía): columnas `etherfuse_wallet_account_id`, `etherfuse_kyc_status` ('not_started' | 'review' | 'approved' | 'action_required' | 'rejected'), `etherfuse_kyc_updated_at`, `clabe_last4`.

El `etherfuse_kyc_status` es **columna aparte** del `kyc_status` (que sigue siendo el nivel de Didit). Un usuario con Didit aprobado puede estar en revisión en Etherfuse — ignorar esto fue un bug intermedio que el typechecker atrapó.

## 4. Cliente v2 de Etherfuse (`etherfuseV2.service.ts`)

Cubierto por los docs oficiales `docs.etherfuse.com/llms.txt` y `/v2/guides/jwt-authentication` (leídos durante la sesión). Lo útil que descubrimos leyéndolos:

- **Modelo**: no hay "customers" dentro de una org. Cada usuario de MicoPay necesita su propia **personal organization** hija de Micopay1 (`5f10d083-f297-4d8d-a75f-c883be54ce7b`). El `sub` del JWT y el `id` que mandamos al crear la org **tienen que coincidir** con nuestro user UUID.
- **Auth**: la API v2 **no** usa prefijo `Bearer` (ver sección III).
- `GET /me` devuelve nuestra org (`approvedAt: "2026-06-30T21:13:41.965569Z"`, `partnerFeeDefaultBps: 0`).

Operaciones implementadas:

- Organizations: `createPersonalOrg` (idempotente desde el cliente: 409 → GET y devuelve la existente), `getOrganization`.
- Verification: `submitVerification` (firstName/lastName/DOB/taxId/country/address), `getVerificationStatus`.
- Launch: `buildLaunchForm` devuelve `{ url, fields }` para que la app arme un `<form POST>` al host `sandbox.etherfuse.com/auth/launch` con `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, `assertion=<jwt>`, `target=/kyc`.
- Payment accounts: `registerPaymentAccount` (soporta `kind: 'wallet'` con `AccountDetails: { kind: 'address', address, chain: 'stellar' }` y `kind: 'bank'` con `kind: 'clabe'` + `registrationInfo`), `getPaymentAccount`, `listPaymentAccounts`.
- Quotes y orders: `createQuote` (`sourceAmount`, `sourceAsset: "USDC:ISSUER"`, `destinationAsset: 'MXN'`), `createOrder` (idempotente del lado de Etherfuse por `quoteId`), `getOrder`, `refreshFundingInstructions`.
- Webhooks: `createWebhookSubscription`, `listWebhookSubscriptions`, `verifyWebhookSignature` (HMAC-SHA256 contra el body crudo, `timingSafeEqual`, header `X-Signature: sha256=<hex>`).

7 pruebas nuevas (`test:etherfuse-v2-webhook`) para la verificación de firma: cover body cambiado, secret distinto, header sin prefijo, Buffer y longitud distinta.

## 5. Service de orquestación (`rampWithdraw.service.ts`)

- `getBankWithdrawStatus(userId)`: `needs_didit` | `needs_kyc` | `kyc_review` | `needs_bank` | `ready` + CLABE enmascarada.
- `startKyc(userId, { firstName, lastName, dateOfBirth, taxId, country, address, email, displayName })`: crea la personal org (reutilizando el user id de MicoPay como el `id`), envía verification, devuelve el `launchForm`. En este slice la UI pide los datos personales a la mano porque la integración con Didit queda para después.
- `applyKycUpdate(customerOrgId)`: llamado por el webhook `kycUpdated`; re-lee de Etherfuse (no confía en el body) y mapea el status a `etherfuse_kyc_status`.
- `registerWalletAccount(userId)`: registra la dirección Stellar del usuario como payment account; guarda `etherfuse_wallet_account_id`.
- `registerBankAccount(userId, { clabe, accountHolderName, taxId })`: valida el dígito de control (mod-10 con pesos 3-7-1 publicados por el Banco de México), registra el payment account y guarda los últimos 4 dígitos.
- `createWithdrawQuote(userId, { asset: 'USDC', amount })`: pide quote a Etherfuse, persiste en `ramp_quotes`. XLM no está soportado en este slice (requiere armar un `pathPaymentStrictReceive` + `payment` en una sola tx firmada por el usuario, decisión del 12 de octubre que ya no se recoge en este flujo).
- `confirmWithdrawOrder(userId, quoteId)`: valida ownership + no vencido, llama `createOrder`, hace upsert en `ramp_orders`.
- `applyOrderUpdate(customerOrgId, orderId)`: webhook `orderUpdated`; devuelve `{ order, userId, previousStatus }` para que el route handler mande push si el estado cambió a `completed`.
- `applyPaymentAccountUpdate(customerOrgId, paymentAccountId)`: webhook `paymentAccountUpdated`; por ahora solo re-lee.
- `listUserWithdrawOrders(userId)`: últimos 50 con JOIN a `ramp_quotes` para traer el MXN prometido.

Prueba nueva `test:clabe` con 4 casos (formato inválido, dígito válido, dígito inválido, CLABE calculada a mano con el algoritmo oficial — también capturó un error del fixture inicial donde yo había calculado mal el dígito).

## 6. Rutas HTTP

6 rutas bajo `/defi/bank-withdraw/*` (`status`, `kyc`, `bank-account`, `quote`, `order`, `orders`), todas detrás de `authMiddleware` y con rate limit de 30/min por usuario. Validación por schema de Fastify (regex de RFC `^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$`, pattern de CLABE de 18 dígitos, etc.). Errores de `EtherfuseV2Error` se propagan como `{ code, message }` con el status correspondiente.

3 rutas de webhook bajo `/defi/ramp/webhook/*` en un plugin encapsulado que registra un `contentTypeParser` propio para preservar el `rawBody: Buffer`. Fuera del plugin el parser por defecto sigue intacto. Cuando el webhook de orden detecta que el estado pasó a `completed`, manda la push "Tu retiro llegó · Enviamos $X MXN a tu cuenta •••1234" (nueva en `push.service.ts`).

## 7. Firma de la preparedTransaction en la app (WP2)

En `frontend/src/services/stellarRamp.ts`:

- `validatePreparedWithdrawTx(xdr, expected)`: parsea con el `decodeTransactionXdr` existente y verifica — en orden — que haya **un solo pago**, `sourceAccount === expected.fromAddress`, `destination === expected.toAddress`, `assetCode === 'USDC'`, `assetIssuer === expected.assetIssuer`, `amount` normalizado a 7 decimales igual al cotizado, y memo si la orden lo pide. Falla con `WithdrawTxMismatchError` que lleva `{ got, expected }` para el log.
- `signAndSubmitPreparedWithdrawTx(xdr, expected)`: valida, pide `requireUserPresence('payment')`, firma con la llave del dispositivo, envía a Horizon. Si Horizon devuelve `tx_bad_seq` o `tx_too_late`, se re-lanza con ese código para que la pantalla pida nuevas instrucciones.

9 pruebas nuevas (`validatePreparedWithdrawTx.test.ts`), incluidas tres de ataque: destino cambiado al atacante, segunda operación agregada, emisor del activo cambiado. Las tres son rechazadas antes de firmar.

## 8. Pantalla y botón

- `constants/features.ts`: `BANK_WITHDRAW_ENABLED = import.meta.env.VITE_ENABLE_BANK_WITHDRAW === 'true'`. Encendido en `.env.testnet`, apagado por default.
- `pages/BankWithdrawScreen.tsx` (476 líneas): consume `getBankWithdrawStatus` cada 10 s cuando el stage es `kyc_review`; renderiza una sub-vista por stage. Formulario de KYC con validación en vivo (RFC con regex, DOB con `max = -18 años`, email, dirección); abre `/idv` con un `<form method="POST" target="_blank">` creado y removido en runtime. Formulario de CLABE con detección de banco por los primeros 3 dígitos (lista corta de BanxiCo). Flujo de retiro con cuenta regresiva en vivo de 2 min, confirmación y firma vía WP2.
- `services/api.ts`: 6 métodos tipados nuevos (`fetchBankWithdrawStatus`, `startBankKyc`, `registerBankAccount`, `createBankWithdrawQuote`, `confirmBankWithdrawOrder`, `fetchBankWithdrawOrders`).
- `App.tsx` + `Home.tsx`: nueva ruta `/retirar-banco` detrás de `ProtectedRoute`, botón en Home solo si el flag está encendido.

**Decisiones de alcance que quedaron pendientes de iterar.**
- El formulario de KYC pide nombre/DOB/dirección a la mano. El plan era rellenarlos con la decisión de Didit (`GET /v3/session/{id}/decision/`). Pendiente — requiere un cambio de backend que no cabía hoy.
- La constancia de situación fiscal no se sube desde la app todavía. Si Etherfuse la pide, lo hará su propia página al abrir `/idv`.
- XLM como fuente queda fuera; solo USDC directo.

---

# III. Fix del cliente v2 (PR #456)

**Qué pasó.** Al armar el script para suscribir los webhooks, un `curl` directo a `api.sand.etherfuse.com` devolvió `401 "Invalid API key format. Expected: api_:: (no Bearer prefix)"`. Mi cliente v2 estaba mandando `Authorization: Bearer <key>`. **Toda llamada a Etherfuse v2 del backend habría fallado** si no se hubiera detectado antes de probar el flujo end-to-end. (La prueba lo habría atrapado también, pero el deploy del WP1 ya estaba hecho.)

**Fix.** Un cambio de dos líneas en `v2Fetch` para pasar la key tal cual, con el comentario explicando que la key ya trae prefijo `api_sand:…` o `api_prod:…`. PR #456 mergeado como `350f2c1`. Backend `v22` (rev 27).

---

# IV. Webhooks y SSM

## 10. 3 suscripciones de webhook en Etherfuse

Micopay1 (`5f10d083-f297-4d8d-a75f-c883be54ce7b`) tenía 0 suscripciones de la nueva v2. Suscritas hoy mediante `POST /webhook_subscription` (el endpoint, contra lo que la memoria `micopay-retiro-spei` sugería, **no** vive bajo `/organization/{id}/`):

| Evento | Sub id | URL | SSM key |
|---|---|---|---|
| `orderUpdated` | `374783f6-162b-415a-be55-d17e55190e0a` | `https://api.micopay.app/defi/ramp/webhook/order-updated` | `ETHERFUSE_WEBHOOK_SECRET_ORDER_UPDATED` |
| `kycUpdated` | `69d72898-8e43-4176-9aad-47f469bd1ad2` | `https://api.micopay.app/defi/ramp/webhook/kyc-updated` | `ETHERFUSE_WEBHOOK_SECRET_KYC_UPDATED` |
| `paymentAccountUpdated` | `126aeb75-fc1c-43f7-aca4-4e5873a1d1e6` | `https://api.micopay.app/defi/ramp/webhook/payment-account-updated` | `ETHERFUSE_WEBHOOK_SECRET_PAYMENT_ACCOUNT_UPDATED` |

Los secrets se escribieron a SSM como `SecureString` pasando el valor por archivo temporal (nunca por argv, nunca imprimidos). Script `scripts/create-webhooks-and-save.ps1` (temporal, no commit).

## 11. `ETHERFUSE_USDC_ASSET`

Agregado a SSM como `String` con el valor `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (Circle testnet, verificado en el stellar-sdk del repo).

Task definition rev 27 inyecta los 4 nuevos secretos como `secrets` del contenedor (ECS acepta tanto `SecureString` como `String` por esa vía). El rol `micopayEcsExecutionRole` ya tiene el permiso `ssm:GetParameters` sobre `/micopay/prod/*`.

---

# V. PRs portados y mergeados

## 12. #432 — Didit v3

Revisado el día anterior con 3 cambios pedidos (ver reporte del 19 en memoria). Verificado hoy que el commit `32665c3` aplica las tres cosas (ProviderOnboardingRoute → `/kyc/didit?return=joinNetwork`, `INSERT ... ON CONFLICT (session_id) DO NOTHING`, comentario actualizado en `didit.service.ts`). Las suites del backend y frontend corrieron verdes contra Postgres real. Aprobado y mergeado como `552c328`.

El co-author del commit de Raúl aparece como `Claude Opus 5.5`. Lo confirmé buscando en los metadatos de GitHub. Mi `/model` local solo mostraba 4.7 — el modelo nuevo existe pero no estaba disponible para mí. Lo guardé en memoria para no volver a asumir que un modelo "no existe" sin verificar.

## 13 y 14. SEC-1 (PR #457) y SEC-2 (PR #458)

GitHub no permite mergear PRs de forks privados de Security Advisory vía API (devuelve `GraphQL: This action is forbidden on workspace repositories`). Eric eligió la opción B: portar el commit al repo público como un PR normal.

Hecho con `git fetch` directo desde el fork + `git cherry-pick` + `git push` a una rama pública:

- **SEC-1** (GHSA-f97g-64fh-j2px). Rama pública `chore/cetes-buy-mainnet-public`. PR #457. Mergeado como `1d06096`.
  - `POST /defi/cetes/buy` responde **501** `CETES_BUY_DISABLED_ON_MAINNET` fuera de testnet/mock. Antes del throw no lee `config.platformSecretKey` ni construye tx. El bloque completo de `Keypair.fromSecret → submitTransaction` fue eliminado.
  - `CETESScreen` muestra `cetes.buyUnavailable` (es/en) para ese código, en vez del error genérico.
  - `test:cetes-buy` con 4 casos (PUBLIC, TESTNET, MOCK, sin token).
  - Scope note de Raúl: tocó `i18n/es.json` y `i18n/en.json` fuera de la lista; justificado porque todos los textos de `CETESScreen` salen por `t()`.
- **SEC-2** (GHSA-7r9r-cv69-rgg6). Rama pública `chore/deploy-platform-wallet-public`. PR #458. Mergeado como `4170e9b`.
  - `PLATFORM_WALLET` (dirección pública G...) va a `--platform_wallet` en `initialize`; `--admin` sigue siendo `SOURCE`.
  - Sin `PLATFORM_WALLET` el script se detiene con mensaje claro. `ALLOW_HOT_PLATFORM_WALLET=1` conserva el comportamiento anterior para ensayos en testnet.
  - Valida formato (`^G[A-Z2-7]{55}$`), existencia en Horizon y, con `TOKEN=USDC`, trustline con el emisor correcto. **No crea la trustline** (la firma la llave fría offline).
  - `MAINNET.md` explica las dos cuentas y el orden.
  - Ensayo en testnet: 50 USDC + 2 de comisión → 50 al comprador, 2 a la cuenta fría `GDHN…FYL6`. Confirmado por eventos y balances.

Los advisories en el repo privado quedan abiertos hasta que Eric los cierre a mano desde la UI de Security Advisories.

---

# VI. Deploys

4 revisiones de task definition hoy:

| Rev | Imagen | Qué llevó |
|---|---|---|
| 25 | `v20` | JWKS vivo (PR #454) |
| 26 | `v21` | WP1 completo del retiro a banco (PR #455) |
| 27 | `v22` | Fix del Bearer (PR #456) + webhook secrets + `ETHERFUSE_USDC_ASSET` |
| 28 | `v23` | #432 Didit v3 + #457 SEC-1 + #458 SEC-2 + #459 fix historial |

Cada uno probado con `curl https://api.micopay.app/health` y `curl /.well-known/jwks.json` después.

## 16. Lecciones del deploy ECS

Dos cosas documentables aparte de `docs/DESPLIEGUE_ECS_2026-09-08.md`:

**(a) El workaround de "`desiredCount = 0 → 1`" no es gratis.** Al desplegar la rev 25 vi 90 s de `running: 0 pending: 0` y asumí que era el bug del planificador del 5 de septiembre. **No era.** Era el tiempo normal de pull de imagen + arranque. Al bajar a 0 maté la tarea buena de rev 25 que ya estaba sirviendo (steady state desde 16:48:49). Downtime adicional de ~6 min por mi impaciencia. En lo sucesivo: no interrumpir hasta pasar los 5 min de arranque esperado, y revisar los eventos antes de bouncear.

**(b) `maximumPercent=100/minimumHealthyPercent=0` se traba con frecuencia.** Pasó dos de los tres deploys de hoy: ECS marca la deployment PRIMARY como `IN_PROGRESS` pero no coloca la tarea, sin eventos de error. El workaround que destraba es cambiar temporalmente a `200/0` durante el deploy y volver a `100/0` cuando el servicio está estable. Es lo opuesto a la decisión documentada (`AWS_MIGRATION_PLAN_2026-07.md` A10) — con `200/0` conviven dos tareas unos segundos, lo que es un riesgo para `sweepPendingRefunds`, `runMigrations` y el event listener. Hoy ninguno de los tres estaba activo en producción (`EVENT_LISTENER_ENABLED=false`, no hay sweep en vuelo), pero la próxima vez vale la pena verificarlo. La pelea de deployments en cadena del incidente de hoy pasó por disparar `force-new-deployment` tres veces seguidas: cada una creó una PRIMARY nueva que mató la tarea de la anterior antes de que arrancara. **Un solo trigger y esperar.**

---

# VII. UX y APK

## 17–20. Pantalla, APK y fix del botón del historial

- `.env.testnet`: `VITE_ENABLE_BANK_WITHDRAW=true`.
- Build y APK: `npm run build:testnet` + `npx cap sync android` + `./gradlew assembleRelease` (con `JAVA_HOME` apuntando al JBR de Android Studio, Java 21).
- APK intermedio `micopay-testnet-release-d563976.apk` instalado en el S25 de Eric vía Shell COM (MTP). Workaround del `Size: 0` del Shell COM: el archivo igual queda bien, solo que la metadata no se refresca.
- Durante la prueba Eric notó que **no había cómo abrir el Historial** desde la pantalla principal. En Home el botón "Ver todo el historial" aparecía solo cuando había `>4` trades; para un usuario nuevo o un agente con pocas operaciones (como `agente_xalapa`) la pantalla con la pestaña "Transferencias" era inaccesible. PR #459 cambia la condición a "aparece siempre que haya `onNavigateHistory`". Mergeado como `344a822`.
- APK final del día: `micopay-testnet-release-344a822.apk` (14.1 MB). El teléfono se desconectó antes de poderlo mandar por USB; pendiente copiar por WhatsApp.

## 21. Override SQL para probar la UI del retiro

El sandbox de Etherfuse rechaza los clientes de prueba sin motivo (bloqueo pendiente a Andy). Para que Eric pudiera ver el flujo en el teléfono sin esperar la respuesta, ejecuté por `ecs execute-command` (Session Manager Plugin instalado hoy) un script Node que:

```
UPDATE users
SET kyc_status='approved',
    etherfuse_customer_id = COALESCE(etherfuse_customer_id, user.id::uuid),
    etherfuse_kyc_status='approved',
    etherfuse_kyc_updated_at = NOW()
WHERE username='agente_xalapa'
```

Con eso, la pantalla salta directo a `needs_bank`. Advertencia obvia: `etherfuse_customer_id = user.id` **no existe en Etherfuse**; cuando toque "Guardar cuenta", el POST a Etherfuse va a devolver 404 y el usuario verá el error. La UI sí se puede recorrer; el e2e real sigue bloqueado.

---

# VIII. Documentación

## 22. Imagen de la arquitectura

Instalado Graphviz vía `winget install Graphviz.Graphviz`. 2 archivos:

- `docs/arquitectura-aws.dot` + `.png` (278 KB, 200 DPI): versión detallada con nombres de parámetros SSM, nombres de tablas, endpoints de webhook, "hot wallet", etc. Para uso interno.
- `docs/arquitectura-aws-general.dot` + `.png` (141 KB): versión sanitizada para compartir con un conocido. SSM genéricamente "secretos cifrados", sin nombres de tablas, sin vendor subdomains, sin `v23`/`micopay-tg`.

Las dos pintan el flujo real auditado contra producción:
- Teléfono → Cloudflare DNS → ALB → ECS Fargate (`micopay-backend` monolito) → RDS Postgres + SSM + CloudWatch.
- Teléfono → Horizon directo (auto-custodia).
- Backend → Stellar/Etherfuse/Didit/FCM.
- Etherfuse → ALB (webhooks `orderUpdated` / `kycUpdated` / `paymentAccountUpdated`).
- Didit → ALB (webhook decisión).
- FCM → teléfono (push).

---

## Pendientes

| Pendiente | Responsable | Por qué importa |
|-----------|-------------|-----------------|
| Instalar APK `344a822` en el teléfono y probar: Home → Historial → "Transferencias", Home → "Retirar a banco" → formulario CLABE | Eric | Primera prueba real del botón del retiro + verificar que el fix del historial se vea bien |
| **Mensaje a Andy (Etherfuse)** sobre los 3 bloqueos del sandbox (órdenes `fulfillmentFailed`, KYC rechazado sin motivo, docs contradictorios) | Anna | Sin esta respuesta el flujo e2e del retiro no se puede terminar. El punto 3 original (JWKS) ya se puede quitar — lo resolvimos nosotros |
| Rellenar el formulario de KYC desde la decisión de Didit (`GET /v3/session/{id}/decision/`) | Claude en próxima sesión | Mejora UX fuerte; evita re-pedir nombre/DOB/dirección al usuario |
| XLM como fuente del retiro (DEX en una sola tx firmada por el usuario) | Claude cuando toque | Decisión del plan del 12 de octubre que quedó fuera del WP1 slice |
| Subir constancia de situación fiscal desde la app | Claude cuando toque | Hoy la pide la página hosted de Etherfuse |
| Decidir si subimos `maximumPercent` a 200 permanentemente o resolvemos el stuck scheduler de 100/0 por otro camino | Equipo | Hoy pasó dos de tres deploys; la próxima vez puede tardar más |
| Cerrar los advisories SEC-1 y SEC-2 desde la UI de GitHub Security Advisories | Eric | Son privados; los PRs públicos ya mergearon la fix |
| Verificar en producción que el webhook `kycUpdated` llega bien (p. ej. forzando un `GET /verification/status` por ecs exec si el usuario de prueba sigue en revisión) | Claude cuando llegue algún webhook | Sin esto el stepper se queda en `kyc_review` indefinidamente |
| Verificar que el push "Tu retiro llegó" llega al teléfono con el canal `trade_alerts` | Eric | Solo cuando una orden real pase a `completed`; bloqueado por Etherfuse |
| Pendientes del 20 que **no se avanzaron hoy**: #448 (AUTH-2), #450 KEY-1, #451 KEY-2, D-U-N-S / CIAL, SAS, mensaje de Play para Anna, página `micopay.com.mx/eliminar-cuenta`, PR de limpieza (`Privacy.tsx` + unificar correos + quitar App Link) | Varios | Siguen tal cual, ver el reporte del 20 |

---

## Dónde está cada cosa

| Qué | Dónde |
|-----|-------|
| JWKS en prod | `https://api.micopay.app/.well-known/jwks.json`, kid `3pIvAeVE22Cl1qep_DtNyAjOo8WtpPZP1THuksDKYuk` |
| Panel de Etherfuse (Micopay1) | Issuer `https://api.micopay.app`, JWKS URL registrados; organización `5f10d083-f297-4d8d-a75f-c883be54ce7b` |
| WP1 backend + frontend | PR #455, `main`, commits de `d563976` para atrás (12 commits) |
| Fix del Bearer | PR #456, mergeado como `350f2c1` |
| Didit v3 | PR #432, mergeado como `552c328` |
| SEC-1 público | PR #457, `1d06096` |
| SEC-2 público | PR #458, `4170e9b` |
| Fix historial accesible | PR #459, `344a822` |
| Backend en prod | `micopay-backend:v23`, task definition rev 28, 1 tarea en ECS Fargate `micopay` |
| Webhooks suscritos | 3 subs en Micopay1, secretos en `/micopay/prod/ETHERFUSE_WEBHOOK_SECRET_*` |
| APK testnet | `C:\Users\eric\Downloads\micopay-apk-testnet\micopay-testnet-release-344a822.apk` |
| Imagen arquitectura (interna) | `docs/arquitectura-aws.png` (+ `.dot`) |
| Imagen arquitectura (sanitizada) | `docs/arquitectura-aws-general.png` (+ `.dot`) |
| Override SQL de `agente_xalapa` | Aplicado en RDS por `ecs execute-command`; no hay script en el repo |
