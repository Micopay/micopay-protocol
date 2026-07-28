# MicoPay Mobile App — Pre-Mainnet Audit Report
**Generated:** 2026-07-01 · **Last updated:** 2026-07-02
**Auditor:** Fable
**Status:** 🟡 **WARNING** — los 7 BLOCKERs de código están resueltos y verificados (tests + `tsc` limpio); solo queda **B8 (deploy del contrato a mainnet + config de Render)**, que es una acción de infraestructura con dinero real y no se ejecuta de forma autónoma. No desplegar a mainnet hasta completar B8 y revisar los WARNINGs restantes.

## Executive Summary

El núcleo del producto (cashout/deposit P2P con escrow HTLC en Soroban) está **bien diseñado y mayormente completo**: firma client-side de lock/release con la llave del dispositivo, verificación del XDR firmado contra el trade en backend (`assertInvocationMatches`), replay prevention (`processed_tx`), secretos HTLC cifrados AES-256-GCM y borrados al completar, challenge/response auth con firma Ed25519, y storage nativo seguro (Keychain/Keystore vía `@aparajita/capacitor-secure-storage`). El frontend compila limpio con `tsc` (verificado en esta auditoría — la nota histórica de "main no compila" ya no aplica).

**Actualización 2026-07-02:** se implementaron y verificaron los 7 BLOCKERs de código (B1, B2, B3, B4, B5, B6, B9) — ver el detalle "✅ FIXED" en cada finding y en la Implementation Checklist. Resumen de lo corregido: (1) los endpoints `/defi/*` que mueven fondos ahora exigen JWT; (2) cancelar un trade `locked` ahora tiene una ruta real de recuperación de fondos — `refundTrade` acepta a cualquier participante y un sweep automático cada 5 min liquida on-chain los trades cancelados una vez vence el timeout del contrato, sin necesidad de tocar el contrato Soroban ni migrar la DB; (3) SPEI/KYC reparados de punta a punta (mismatch de payloads corregido, auth headers añadidos); (4) CETES/Blend (trading que no movía fondos reales del usuario) ocultos tras un feature flag hasta tener una implementación real; (5) QR real en el flujo de depósito. Todo verificado con `tsc --noEmit` limpio en frontend y backend, la suite de tests existente sin regresiones, y 5 tests nuevos de regresión para el ciclo cancel→refund. Solo **B8** (desplegar el contrato escrow a mainnet y configurar Render) sigue pendiente — es una acción de infraestructura irreversible con fees reales que requiere ejecución manual del equipo, no algo que deba automatizarse. Quedan además ~18 WARNINGs sin tocar (hardening de config, dead code, testing, observabilidad) documentados en la Implementation Checklist.

---

## 1. Flujos Completos
### Status: ⚠️ *(los 4 BLOCKERs de esta sección — B3, B6, CETES-mainnet, SPEI-offramp — están corregidos; quedan WARNINGs de código muerto sin tocar: `registerBankAccount`, `ClaimQR`/`TradeCancelled`)*

| Flujo | Estado end-to-end |
|---|---|
| Cash-out (USDC→cash) | ✅ Completo (crear → lock firmado por seller → reveal → QR secreto → release firmado por buyer) — con el hueco del refund (B3) |
| Cash-in (cash→USDC) | ⚠️ Funciona, pero el QR mostrado al agente es una imagen estática falsa (B6) |
| CETES | ❌ Compra en mainnet mueve fondos plataforma→plataforma (no toca al usuario); venta mainnet = HTTP 501 |
| SPEI (Etherfuse) | ❌ Roto e2e: mismatch de payloads/respuestas + KYC llama sin auth y desloguea al usuario |
| Blend | ❌ 100% simulado incluso en mainnet (el backend siempre devuelve `mock_blend_*`) |
| Send/Receive P2P | ✅ Completo (Horizon directo, firma local, validación de address/amount, errores en español) |

#### Finding B3: Cancelar un trade `locked` deja los fondos atrapados on-chain sin ruta de recuperación en la app
- ✅ **FIXED (2026-07-02):** Se optó por la ruta "estado intermedio + retry" en vez de tocar el contrato (evita re-deploy en mainnet). Cambios en `backend/src/services/trade.service.ts`: (1) `refundTrade` ahora acepta a **cualquiera de los dos participantes** (antes solo `buyer_id`), y ya no rechaza trades en status `'cancelled'` — solo rechaza `'completed'`/`'refunded'` (terminales on-chain reales); la lógica de refund se extrajo a `executeRefundOnChain()` compartida. (2) Nueva función `sweepPendingRefunds()`: escanea `status='cancelled' AND lock_tx_hash IS NOT NULL AND release_tx_hash IS NULL AND expires_at < NOW()` y llama refund automáticamente — con doble chequeo de expiración en JS además del filtro SQL (defensa en profundidad). Se registra como job periódico cada 5 min en `backend/src/index.ts` (`startRefundSweep`, se salta si `MOCK_STELLAR=true` a nivel de arranque, pero la función en sí funciona igual en mock que en real). `cancelTrade` no cambió su comportamiento inmediato (sigue solo actualizando la DB) — el fix vive enteramente en hacer que `refundTrade`/`sweepPendingRefunds` completen lo que `cancelTrade` deja pendiente. También se relajó el tipo de `callRefundOnChain`/`pollForConfirmation` en `stellar.service.ts` de `FastifyRequest` a `Pick<FastifyRequest,'log'>` para que el sweep (sin request HTTP real) pueda invocarlos con un shim `{ log: app.log }`. **Frontend** (`frontend/src/pages/TradeDetail.tsx`): el botón "Recuperar fondos" ya no se gatea solo por `isBuyer` (bug de permisos espejo del backend) sino por `isBuyer || isSeller`; y ahora también es alcanzable para trades en status `'cancelled'` con `lock_tx_hash` presente y `release_tx_hash` ausente (antes solo aparecía en `status === 'expired'`, que el backend nunca persiste — el botón era código muerto). Cubierto por un nuevo test de regresión `backend/src/tests/refund.test.ts` (5 casos: permiso del seller, rechazo pre-expiración, no-replay, sweep automático, sweep no toca trades no expirados — los 5 pasan). No se tocó el contrato Soroban ni se requirió migración de DB (se reutilizó `expires_at`, que ya coincide con el timeout on-chain).
- **Severity:** BLOCKER
- **Location:** `micopay/backend/src/services/trade.service.ts:836-878` (cancel no hace refund on-chain), `trade.service.ts:914-916` (refund es buyer-only), `trade.service.ts:930-932` (refund rechaza status `cancelled`)
- **Description:** `cancelTrade` sobre un trade `locked` ejecuta `finalizeTradeCancellation` (UPDATE en DB + borra el secreto) y devuelve `refund_expected: true`, pero **nunca llama `callRefundOnChain`**. Después, `refundTrade`: (a) exige `trade.buyer_id === userId` — en cashout quien bloqueó fondos es el **seller** (el usuario), que no puede llamarlo; (b) lanza `ConflictError` si el status ya es `cancelled`; (c) exige que el trade haya expirado. Resultado: cualquier cancelación post-lock deja USDC del usuario en el contrato sin ninguna ruta de recuperación desde la app.
- **Impact:** En mainnet esto es pérdida de fondos reales percibida por el usuario en el caso más común de fricción (merchant no aparece → usuario cancela). El contrato permite `refund()` permissionless tras timeout, pero solo vía CLI/ops manual.
- **Recommended Fix:** En `cancelTrade`, cuando `trade.status === 'locked' || 'revealing'` y `lock_tx_hash` existe y no es mock:
  ```ts
  // trade.service.ts — dentro del branch locked/revealing de cancelTrade
  if (lockTx && !config.mockStellar) {
    const secretHashBytes = Buffer.from(trade.secret_hash, 'hex');
    const tradeIdBytes = createHash('sha256').update(secretHashBytes).digest();
    try {
      const { txHash } = await callRefundOnChain({ request, tradeIdBytes });
      await db.execute(
        `UPDATE trades SET status='refunded', release_tx_hash=$2, completed_at=NOW(),
         secret_enc=NULL, secret_nonce=NULL WHERE id=$1`, [tradeId, txHash]);
      return finishCancel({ status: 'cancelled', refund_expected: true, lock_tx_hash: lockTx });
    } catch (e) {
      // refund() del contrato solo procede tras timeout — marcar para retry
      await db.execute(`UPDATE trades SET status='cancelled_pending_refund' WHERE id=$1`, [tradeId]);
      // + job/cron que reintenta callRefundOnChain después de expires_at
    }
  }
  ```
  Además: permitir `refundTrade` al **seller** (es quien pierde fondos) y aceptar el status `cancelled_pending_refund`. Nota: el `refund()` del contrato exige timeout vencido, por lo que el cancel inmediato necesita el estado intermedio + retry job (o añadir un `cancel_by_agreement` al contrato antes del deploy mainnet).

#### Finding B6: El QR del flujo de depósito es una imagen estática hardcodeada, no un QR real
- ✅ **FIXED (2026-07-02):** `frontend/src/pages/DepositQR.tsx` ahora renderiza `QRCodeSVG` con `micopay://confirm?trade_id=${activeTrade?.id}` en vez del `<img>` de stock. Los dos avatares `googleusercontent.com` (agente y "Store") también se reemplazaron por círculos locales con íconos Material Symbols — cero dependencia de un CDN externo. `handleComplete`/`completeTrade` no se tocaron.
- **Severity:** BLOCKER
- **Location:** `micopay/frontend/src/pages/DepositQR.tsx:100-106`
- **Description:** La pantalla "MUESTRA ESTE CÓDIGO AL AGENTE" renderiza `<img src="https://lh3.googleusercontent.com/aida/...">` — un PNG de stock. El agente no puede escanear nada asociado al trade; la liberación depende solo del botón "Ya entregué el efectivo" del buyer (protegido apenas por el estado `revealing` que setea el merchant).
- **Impact:** El paso de verificación visual/escaneo del flujo cash-in no existe; además la imagen depende de un CDN de Google (puede 404). En mainnet, disputas "yo sí pagué / no me pagó" sin evidencia de handoff.
- **Recommended Fix:** Renderizar un QR real con el `trade_id` (mismo patrón que `ClaimQR.tsx`/`QRReveal.tsx`):
  ```tsx
  import { QRCodeSVG } from 'qrcode.react';
  // dentro del card:
  <QRCodeSVG value={`micopay://confirm?trade_id=${activeTrade?.id ?? ''}`} size={192} level="M" />
  ```
  El agente lo escanea desde `MerchantInbox` (ya llama `merchantConfirmScan(tradeId)`), y solo tras esa confirmación habilitar el botón de completar. También reemplazar los avatares `googleusercontent` hardcodeados (líneas 50, 73) por assets locales.

#### Finding: CETES en mainnet no involucra al usuario; venta = 501; Blend siempre simulado
- ✅ **FIXED (2026-07-02) vía feature flag:** `frontend/src/App.tsx` (`ExploreRoute`) cambia `showDefi={true}` → `showDefi={import.meta.env.VITE_ENABLE_DEFI_TRADING === 'true'}` — oculto por defecto, con comentario citando este hallazgo. No se implementó la compra real con firma del usuario (eso sigue pendiente, 2-3 días de trabajo estimados); esto solo evita exponer trading falso en mainnet hasta que exista una implementación real.
- **Severity:** BLOCKER (si se lanza con estas pantallas activas)
- **Location:** `micopay/backend/src/routes/defi.ts:139-172` (buy: `destination: keypair.publicKey()` = cuenta plataforma, firmado con `platformSecretKey`), `defi.ts:221-227` (sell mainnet → 501), `defi.ts:260-323` (blend supply/borrow devuelven `mock_blend_*` incondicionalmente)
- **Description:** El "buy CETES" mainnet hace `pathPaymentStrictReceive` desde la cuenta plataforma hacia la cuenta plataforma. El usuario nunca paga ni recibe CETES; su wallet no participa. Blend devuelve `status: 'success', simulated: true` siempre (la UI sí muestra el banner "Demostración", pero en mainnet el usuario esperaría movimientos reales).
- **Impact:** Pantallas de inversión que aparentan operar dinero real sin hacerlo (o gastando fondos de la plataforma, ver §2-B1).
- **Recommended Fix (mínimo para mainnet):** feature-flag para ocultar CETES/Blend del `Explore` (`showDefi={false}` en `App.tsx:529`) hasta que estén implementados con la wallet del usuario (patrón prepare/sign-local/submit ya existente en escrow: reutilizar `signTransactionXdr`). La compra real debe construir el XDR con `source = user.stellar_address`, devolverlo sin firmar, y el device firmarlo — igual que `lockTrade`.

#### Finding: SPEI offramp roto por mismatch de contrato de API frontend↔backend
- ✅ **FIXED (2026-07-02):** Eliminadas las 4 funciones ramp viejas (`getOfframpQuote`, `createOfframpOrder`, `regenerateOfframpTx`, `getRampOrder`) y sus interfaces duplicadas de `api.ts`. `CETESScreen.tsx` migrado a `getRampQuote('offramp', amount, token)` / `createRampOrder(quoteId, token, useAnchor)` / `getRampOrderStatus` / nueva `regenerateRampOrderTx`, todas usando `quote.quoteId`/`order.orderId` correctos. Detalle no previsto en el fix original: `createRampOrder` recibía un `bankAccountId` que el backend ignora (lo resuelve server-side vía `requireOnboardedUser`), así que se quitó ese parámetro en vez de mandarlo muerto. También se corrigió `RampOrderStatus`'s terminal-state check (`'refunded'` → `'failed'`, que es el valor real del tipo). `KYCScreen`/`startKYC`/`getKYCStatus` — que llamaban al backend sin `Authorization` y por tanto siempre 401eaban — ahora reciben y envían el token (ver también el fix del interceptor 401 abajo, que agravaba este bug borrando la sesión completa en cada 401). `tsc --noEmit` pasa limpio; verificado por grep que no queda ninguna referencia a las funciones eliminadas.
- **Severity:** BLOCKER (para el flujo SPEI)
- **Location:** `micopay/frontend/src/services/api.ts:117-135` vs `micopay/backend/src/routes/ramp.ts:45-92`; `CETESScreen.tsx:139,159,175,190`
- **Description:** El frontend envía `{ type, amount }` pero el backend exige `sourceAmount` (→ `ValidationError` siempre). Envía `{ quote_id }` pero el backend espera `quoteId`. Lee `quote.id` / `order.id` pero el backend devuelve `quoteId` / `orderId` (→ `undefined`, el polling de `getRampOrder(undefined)` nunca funciona). Existen **dos generaciones de funciones ramp** en `api.ts` (`getOfframpQuote`/`createOfframpOrder` líneas 117-135 vs `getRampQuote`/`createRampOrder` líneas 709-741) y `CETESScreen` usa la generación rota.
- **Recommended Fix:** Borrar `getOfframpQuote`, `createOfframpOrder`, `regenerateOfframpTx`, `getRampOrder` (117-135) y las interfaces duplicadas `RampQuote`/`RampOrder` (90-103); migrar `CETESScreen.tsx` a `getRampQuote`/`createRampOrder`/`getRampOrderStatus` (líneas 709-741) usando `quote.quoteId` y `order.orderId`. Nota: `regenerateOfframpTx` necesita su equivalente nuevo apuntando a `/defi/ramp/order/:orderId/regenerate_tx` con `orderId` correcto.

#### Finding: `registerBankAccount` llama a un endpoint inexistente
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/services/api.ts:743-753` → `POST /defi/bank-account` (no existe en backend; el CLABE se registra en el flujo hosted de Etherfuse vía `kyc.ts`)
- **Recommended Fix:** Eliminar `registerBankAccount` (sin usos en pages) o implementar el endpoint si el plan SPEI_ANCHOR lo requiere.

#### Finding: `ClaimQR` está importada pero no tiene ruta; `TradeCancelled` es página huérfana
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/App.tsx:41` (import), `App.tsx:1030-1063` (Routes — no hay `/claim/:requestId`), `App.tsx:656` (`HIDE_BOTTOMNAV_PREFIX = ['/claim/']` referencia una ruta que no existe); `pages/TradeCancelled.tsx` (0 imports en todo el src)
- **Description:** El deep-link `micopay://claim` y la página `ClaimQR` (que además apunta a `VITE_PROTOCOL_API_URL` / `apps/api`, código muerto para este flujo) son inalcanzables. `TradeCancelled.tsx` no se importa en ningún lado — la UX post-cancelación cae en `CancelledView` de `TradeDetail`.
- **Recommended Fix:** O registrar `<Route path="/claim/:requestId" element={<ClaimQRRoute />} />` con un wrapper que lea `useParams()`, o eliminar `ClaimQR.tsx` + el import + el prefix. Eliminar `TradeCancelled.tsx` o conectarla al flujo de cancelación.

#### Finding: 27 de 29 páginas registradas; router sin rutas colgantes
- **Severity:** INFO
- **Description:** Todas las rutas de `App.tsx` resuelven a una página existente; el wildcard `*` redirige a `/`. Las 2 páginas sin registrar son las de arriba (ClaimQR, TradeCancelled). ZK credentials correctamente sin superficie en la app móvil (ninguna referencia rota a `ZkVerifierRegistry` en frontend — verificado).

---

## 2. Seguridad
### Status: ⚠️ *(los 2 BLOCKERs de esta sección — B1, B4 — están corregidos; queda pendiente el registro sin prueba de posesión de llave, key management en build web, e IDOR en `/defi/ramp/order/:orderId`)*

#### Finding B1: Endpoints `/defi/*` sin autenticación firman transacciones con la llave de la plataforma
- ✅ **FIXED (2026-07-01):** `authMiddleware` añadido como `preHandler` en `POST /defi/cetes/buy`, `/defi/cetes/sell`, `/defi/blend/supply`, `/defi/blend/borrow` (`backend/src/routes/defi.ts`). Nota: se optó por gatear solo las 4 rutas que mueven fondos, no todo el router — `GET /defi/cetes/rate`, `/defi/blend/pools` y `/defi/ramp/assets` se dejaron públicos (son solo-lectura, sin riesgo de fondos, y el frontend hoy los llama sin token en flujos que corren antes del contexto de auth estar listo). `tsc --noEmit` del backend pasa limpio tras el cambio.
- **Severity:** BLOCKER
- **Location:** `micopay/backend/src/routes/defi.ts:10` (no hay `app.addHook('preHandler', authMiddleware)` ni preHandler por ruta), `defi.ts:142` (`Keypair.fromSecret(config.platformSecretKey)`), `defi.ts:173` (`server.submitTransaction(tx)`)
- **Description:** `POST /defi/cetes/buy`, `/defi/cetes/sell`, `/defi/blend/supply`, `/defi/blend/borrow`, `GET /defi/cetes/rate`, `/defi/blend/pools`, `/defi/ramp/assets` no requieren JWT (compárese con `ramp.ts` y `kyc.ts`, que sí usan `authMiddleware`). En mainnet (`stellarNetwork !== 'TESTNET'`), `cetes/buy` construye, firma con `PLATFORM_SECRET_KEY` y envía un `pathPaymentStrictReceive` real. Sin rate-limit en esas rutas.
- **Impact:** Cualquier persona en internet puede ejecutar `curl -X POST https://micopay-api.onrender.com/defi/cetes/buy -d '{"amount":"10000","sourceAsset":"USDC"}'` en loop y vaciar la cuenta plataforma vía slippage/fees, o simplemente convertir todo su balance. Es el hallazgo más urgente del reporte.
- **Recommended Fix:**
  ```ts
  // defi.ts, primera línea dentro de defiRoutes(app):
  app.addHook('preHandler', authMiddleware);
  ```
  (y mover `GET /defi/cetes/rate` a público si se quiere, con su propio registro). Además: nunca firmar movimientos de valor con la platform key en respuesta a input de usuario — ver fix de CETES en §1.

#### Finding B4: `JWT_SECRET` no se valida; producción puede arrancar firmando con `dev_jwt_secret`
- ✅ **FIXED (2026-07-01):** `validateConfig()` en `backend/src/config.ts` ahora rechaza el arranque en producción si `JWT_SECRET` falta, es el default `'dev_jwt_secret'`, o tiene menos de 32 caracteres; también rechaza `MOCK_STELLAR=true` en producción. Además se añadió validación de formato de `SECRET_ENCRYPTION_KEY` (debe ser 64 hex chars / 32 bytes) — antes solo se comprobaba que no estuviera vacío, y una key mal formada habría hecho crash en el primer `encryptSecret`/`decryptSecret` en vez de al boot. `tsc --noEmit` pasa limpio.
- **Severity:** BLOCKER
- **Location:** `micopay/backend/src/config.ts:46` (`jwtSecret: process.env.JWT_SECRET || 'dev_jwt_secret'`), `config.ts:103-150` (`validateConfig` no lo verifica)
- **Impact:** Si `JWT_SECRET` falta en Render, cualquiera forja tokens `{ id: <uuid-víctima> }` firmados con el secreto conocido → account takeover total (crear trades, ver secretos HTLC de trades donde la víctima es seller, cancelar, borrar cuenta).
- **Recommended Fix:** En `validateConfig()`:
  ```ts
  if (config.isProduction && (!process.env.JWT_SECRET || config.jwtSecret === 'dev_jwt_secret' || config.jwtSecret.length < 32)) {
    errors.push('JWT_SECRET is missing or too weak (min 32 chars) — required in production.');
  }
  if (config.isProduction && config.mockStellar) {
    errors.push('MOCK_STELLAR=true is not allowed in production (disables auth signature verification).');
  }
  if (config.secretEncryptionKey && Buffer.from(config.secretEncryptionKey, 'hex').length !== 32) {
    errors.push('SECRET_ENCRYPTION_KEY must be 64 hex chars (32 bytes) for AES-256-GCM.');
  }
  ```
  (El segundo check cubre que `auth.ts:95` salta la verificación de firma Ed25519 cuando `mockStellar=true`; el tercero cubre `secret.service.ts:4`, que hoy crashearía en runtime con una key de longitud incorrecta.)

#### Finding: Registro emite JWT sin probar posesión de la llave (address squatting)
- **Severity:** WARNING
- **Location:** `micopay/backend/src/routes/users.ts:19-81`
- **Description:** `POST /users/register` acepta cualquier `stellar_address` (solo valida longitud 56, ni siquiera `StrKey.isValidEd25519PublicKey`) y devuelve un JWT válido de 24h. Un atacante puede registrar la dirección pública de otra persona (las direcciones son públicas) antes que ella, bloqueando su registro legítimo y operando una identidad ligada a esa address (no puede firmar lock/release on-chain, pero sí crear trades, chatear, y quemar reputación).
- **Recommended Fix:** Exigir el mismo challenge/response del login en el registro: `POST /auth/challenge` → firmar → `POST /users/register { username, stellar_address, challenge, signature }` y verificar con `Keypair.fromPublicKey(addr).verify(...)` antes del INSERT. Validar formato con `StrKey.isValidEd25519PublicKey(stellar_address)`. En frontend, eliminar `generateFallbackAddress` (`api.ts:161-168`) — fabrica direcciones aleatorias inválidas; si no hay keypair es un bug, no un caso a maquillar.

#### Finding: El interceptor 401 borra una key de storage equivocada
- ✅ **FIXED (2026-07-02):** `api.ts:760` corregido a `removeKey('micopay_user')`; `reportError.ts` corregido a `readJSON<{token?:string}>('micopay_user')` con el shape plano real (`UserData`), en vez de la key/shape inexistente `micopay_users:{buyer,seller}`. No se extrajo a una constante compartida (queda como micro-limpieza pendiente, bajo impacto) — se corrigieron los 2 sitios directamente.
- **Severity:** WARNING (bug de sesión)
- **Location:** `micopay/frontend/src/services/api.ts:760` (`removeKey('micopay_users')`) vs `App.tsx:62` (`USERS_STORAGE_KEY = "micopay_user"`); mismo problema en `utils/reportError.ts:68` (lee `micopay_users` con shape `{buyer:{token}}` que no existe)
- **Impact:** Tras un 401 la sesión huérfana persiste en storage; al reabrir, la app reintenta con el token muerto (mitigado por `recoverSession`, pero es un loop evitable). `reportError` nunca adjunta el token.
- **Recommended Fix:** Exportar la constante desde un módulo compartido y usarla en los tres sitios: `removeKey('micopay_user')`; en `reportError.ts` leer `readJSON<UserData>('micopay_user')` y usar `stored?.token`.

#### Finding: Key management — correcto en nativo, plaintext en web; backup vía clipboard
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/services/secureStorage.ts:13-23` (web = `localStorage` plano), `App.tsx:933-938` (backup copia la seed al portapapeles)
- **Description:** En Android/iOS la seed vive en Keystore/Keychain (`@aparajita/capacitor-secure-storage`) ✅. Hay backup gate antes de la primera operación con fondos ✅ y restore por seed en `Login.tsx:67` y `Profile.tsx:165` ✅. Pero: (a) el build web (hay `vercel.json`) guarda la secret key en `localStorage` sin cifrar — cualquier XSS la exfiltra; (b) el backup copia la seed al clipboard, que en Android es legible por otras apps (pre-13) y por listeners de clipboard.
- **Recommended Fix:** (a) Si el build web es solo demo, gatearlo: en `keystore.ts`, si `!Capacitor.isNativePlatform() && import.meta.env.MODE === 'mainnet'` lanzar error/bloquear generación de llaves. (b) Mostrar la seed on-screen para transcripción manual con advertencia, o mantener clipboard pero llamar `navigator.clipboard.writeText('')` tras 60s y avisarlo.

#### Finding: Validación de inputs — sólida en trades y P2P, sin timeout HTTP
- **Severity:** INFO (validación) / WARNING (timeouts, ver §5)
- **Description:** Montos: schema JSON `integer 100..50000` en `POST /trades` ✅, `sendPayment` valida monto>0 y dirección con `Keypair.fromPublicKey` ✅. QR: `parseQRPayload` + `qrValidation.ts` rechazan UUIDs/hex64 malformados con mensajes claros y tienen tests ✅. URLs de claim: no aplica (ClaimQR sin ruta). El explorer link siempre se construye internamente (`buildTxUrl`), no desde datos del QR ✅.

#### Finding: Replay/nonce/on-chain — bien cubierto en escrow
- **Severity:** INFO
- **Description:** `assertNotReplayed` (tabla `processed_tx` con INSERT único) cubre lock/complete/refund ✅. `assertInvocationMatches` (`stellar.service.ts:47-99`) impide que un XDR firmado de un trade se envíe contra otro (contract id + function + args fund-relevant) ✅. Challenges de auth expiran en 5 min y son single-use ✅ — pero viven en un `Map` en memoria (`auth.ts:16`): con >1 instancia o restart de Render, los logins en vuelo fallan. Igual el rate-limit (`rateLimit.middleware.ts:8-26`) y la revocación de tokens. Aceptable para 1 instancia; documentar que escalar horizontalmente requiere Redis.

#### Finding: `/defi/ramp/order/:orderId` sin check de pertenencia
- **Severity:** WARNING
- **Location:** `micopay/backend/src/routes/ramp.ts:129-148`
- **Description:** Cualquier usuario autenticado puede consultar el status de la orden de otro (los `orderId` son UUIDs generados por el backend, difíciles de adivinar, pero es IDOR).
- **Recommended Fix:** Persistir `orderId → user_id` al crear la orden y validar en el GET (y en `regenerate_tx`).

#### Finding: Data exposure — razonable
- **Severity:** INFO
- **Description:** `reportError.ts` redacta JWTs, seeds Stellar y headers auth antes de enviar ✅ (aunque el endpoint no existe, ver §7). Los 16 `console.log` restantes son del offline queue (IDs de mutación, no secretos). El secreto HTLC viaja solo por HTTPS dentro del QR payload y el backend lo registra en `secret_access_log` con IP/UA ✅. Errores al usuario pasan por `errorMap`/`apiError` con mensajes en español y `support_code` ✅.

---

## 3. Testnet ↔ Mainnet Config
### Status: ⚠️

#### Finding B8: Contrato escrow sin desplegar en mainnet; `VITE_ESCROW_CONTRACT_ID` vacío
- **Severity:** BLOCKER (prerrequisito de deploy, esperado)
- **Location:** `micopay/frontend/.env.mainnet` (`VITE_ESCROW_CONTRACT_ID=` vacío), backend Render necesita `ESCROW_CONTRACT_ID`/`MXNE_CONTRACT_ID` mainnet
- **Description:** El pipeline de config está bien hecho: `validateConfig()` del backend rechaza arranque sin contract IDs válidos cuando `MOCK_STELLAR=false`, y el frontend valida `/health.configCheck` al arrancar (`App.tsx:747-760`). Falta ejecutar `scripts/deploy-mainnet.sh`, poblar los IDs y el `PLATFORM_SECRET_KEY` mainnet en Render (no en el repo — verificado: ningún secreto mainnet commiteado; solo URLs/issuers públicos en los `.env.*` trackeados ✅).
- **Recommended Fix:** Deploy del contrato → setear env vars en Render → build `npm run build:mainnet`. Documentar el runbook en `docs/DEPLOY_PLAN.md`.

#### Finding: El guard de "backend inalcanzable" no cubre el modo `mainnet`
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/App.tsx:768` (`if (envName === 'production')`)
- **Description:** `build:mainnet` usa `--mode mainnet`, así que `import.meta.env.MODE === 'mainnet'`, no `'production'`. Si el backend está caído al arrancar, el APK mainnet cae al branch "dev/testnet fallback" (`App.tsx:776-780`): `isDemoMode=true`, `isMockStellar=true`, y la app sigue con mocks silenciosamente en vez de bloquear.
- **Recommended Fix:**
  ```ts
  const STRICT_MODES = new Set(['production', 'mainnet']);
  if (STRICT_MODES.has(envName)) { /* startupError block */ }
  ```

#### Finding: Explorer links y labels hardcodeados a testnet
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/pages/TradeDetail.tsx:215` y `:326` (`const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx'`), `QRReveal.tsx:219` (`t('qrReveal.htlcTestnet')` — texto "testnet" fijo), `ChatRoom` usa key `viewOnStellarTestnet`
- **Description:** Existe `utils/stellarExplorer.ts` que resuelve `public`/`testnet` según `VITE_STELLAR_NETWORK` — pero TradeDetail no lo usa. En mainnet los links de transacción llevarán al explorer equivocado.
- **Recommended Fix:** Reemplazar ambas constantes por `import { buildTxUrl } from '../utils/stellarExplorer'` y `href={buildTxUrl(trade.lock_tx_hash)}`. Cambiar las keys i18n a texto neutro ("Ver en Stellar") o parametrizar la red.

#### Finding: No hay banner "running on testnet" y el RPC no tiene fallback
- **Severity:** WARNING
- **Location:** frontend global; `backend/src/config.ts:35` (un solo `STELLAR_RPC_URL`), `stellar.service.ts:105-135`
- **Description:** El usuario no ve en la UI en qué red está (el `DebugOverlay` que lo mostraría está desconectado, ver §6). Backend y frontend usan un único RPC/Horizon sin failover; `pollForConfirmation` abandona a los 30s (15×2s) y deja la DB desincronizada si la tx confirma después — el event listener que reconciliaría está **apagado por defecto** (`EVENT_LISTENER_ENABLED`).
- **Recommended Fix:** (a) Banner persistente cuando `VITE_STELLAR_NETWORK !== 'PUBLIC'` (chip "TESTNET" en el header de `Home`). (b) Encender `EVENT_LISTENER_ENABLED=true` en Render para mainnet. (c) Subir el poll a ~60s para lock/release o, tras timeout, marcar `lock_submitted` y reconciliar por listener en vez de fallar.

#### Finding: Tipos de cambio hardcodeados en pantallas de dinero
- **Severity:** WARNING
- **Location:** `CETESScreen.tsx:95,100,108,110` (`17.5` MXN/USDC fijo), `BlendScreen.tsx:52` (`17.5`), `Home.tsx:125` (fallback `17.5` si CoinGecko falla), `defi.ts:84` (`cesPriceMxn: 10.0` "for demo"), `trade.service.ts:712` (`/17` para volumen USDC)
- **Impact:** En mainnet, previews de inversión con FX inventado = montos equivocados mostrados sobre dinero real.
- **Recommended Fix:** Usar `GET /rate/xlm-mxn` (ya existe, con cache y multi-fuente) y añadir un `GET /rate/usdc-mxn` equivalente; el frontend nunca debe tener FX literal. Los fallbacks deben mostrar "—" y deshabilitar el submit, no inventar un número.

#### Finding: Config por entorno bien estructurada
- **Severity:** INFO
- **Description:** `VITE_API_URL`, contract IDs, issuers, red y passphrase viven en `.env.{testnet,mainnet,production}` con scripts `build:*` dedicados ✅. El backend valida formato de llaves/contratos al boot ✅. `.env.production.local` y `backend/.env` no están trackeados en git ✅.

---

## 4. Error Handling & UX
### Status: ⚠️

#### Finding: `TradeDetail.RevealedView` muestra éxito aunque `completeTrade` falle
- **Severity:** WARNING (alto — honestidad sobre fondos)
- **Location:** `micopay/frontend/src/pages/TradeDetail.tsx:275-288`
- **Description:** `handleConfirm` hace `catch (e) { console.warn(...) }` y en `finally` llama `onComplete()` tras 1.5s — la UI transiciona a "completado" aunque el release on-chain haya fallado o no hubiera token.
- **Recommended Fix:**
  ```ts
  try {
    const effectiveToken = token ?? (await getStoredToken());
    if (!effectiveToken) throw new Error('NO_TOKEN');
    await completeTrade(trade.id, effectiveToken);
    setTimeout(() => onComplete(), 1500);
  } catch (e) {
    setIsConfirming(false);
    setError(mapApiError(e).message); // + botón reintentar, patrón de DepositQR.tsx:23-27
  }
  ```

#### Finding: Estados pending→confirmed→complete y retry — bien cubiertos en el flujo core
- **Severity:** INFO
- **Description:** Lock fallido: el trade queda `pending`, `QRReveal.loadSecret` es reintentable con `ErrorBanner` + retry ✅. Release fallido: reintintable desde `DepositQR` (con mensaje) y el estado real siempre se relee del backend ✅. Errores mapeados a español plano con `support_code` correlacionable a logs ✅. `SupportLink` presente en QRReveal, TradeDetail, SuccessScreen, MerchantInbox ✅. Crash/kill mid-transaction: el estado vive en el backend + on-chain; al reabrir, History/TradeDetail muestran la verdad; `assertNotReplayed` evita dobles submits ✅. Lo que falta: estimación de tiempo de confirmación antes de confirmar (INFO) y el auto-refund del punto B3.

#### Finding: QRReveal muestra un mensaje de chat falso hardcodeado y avatar de stock
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/pages/QRReveal.tsx:154-165` ("Estamos en Av. Juárez 34, a un costado del banco." atribuido al counterparty real), botones "location"/"Compartir ubicación" sin `onClick` (`QRReveal.tsx:175`, `DepositQR.tsx:90`), botones de `LockedView`/`RevealingView` sin handler (`TradeDetail.tsx:241,261,265`)
- **Impact:** El usuario cree que el agente le escribió una dirección que nadie escribió — en mainnet eso puede mandarlo a una ubicación equivocada para un intercambio de efectivo.
- **Recommended Fix:** Mostrar el último mensaje real (`useChatMessages` ya expone los mensajes; tomar el último del counterparty) o eliminar el preview. Quitar o implementar los botones sin handler.

#### Finding: Provider cancela / merchant no disponible — backend listo, UI desconectada
- **Severity:** WARNING
- **Location:** backend `trade.service.ts:44-52` + `merchant_unavailable` en `GET /trades/:id` ✅; frontend `components/MerchantUnavailableBanner.tsx` y `components/CancelTradeDialog.tsx` — **sin ningún import** (§6)
- **Description:** El caso "merchant se apaga mid-flow" está modelado (cancel permitido para el lado correcto), pero los componentes de UI que lo comunican nunca se montan.
- **Recommended Fix:** Montar `MerchantUnavailableBanner` en `ChatRoom`/`QRReveal` cuando `fetchTradeDetail(...).merchant_unavailable === true`, y usar `CancelTradeDialog` en el botón "Cancelar operación" de `TradeDetail` (hoy cancela sin confirmación ni copy del refund).

#### Finding: Dos dispositivos simultáneos / sesión
- **Severity:** INFO
- **Description:** La llave vive por-dispositivo; importar la seed en un segundo dispositivo funciona (Login restore). No hay revocación del otro dispositivo ni lista de sesiones — aceptable para MVP; los estados de trade se validan server-side así que no hay doble-release (replay guard + status checks).

#### Finding: Offline — cola implementada pero invisible; sin gate de conectividad global
- **Severity:** WARNING
- **Location:** `services/offlineQueue*.ts` + `hooks/useOfflineQueue.ts` (usados en MerchantSettings) ✅, pero `ConnectionBanner.tsx` y `OfflineQueueStatus.tsx` sin montar; además la cola sincroniza contra endpoints que no existen (§1 — availability), o sea que "queued" nunca se vacía
- **Recommended Fix:** Montar `ConnectionBanner` en el layout raíz (`App.tsx` junto a `BottomNavAdapter`); arreglar los endpoints de availability (abajo) para que la cola pueda drenar.

#### Finding B9: El toggle de disponibilidad del merchant llama endpoints inexistentes
- ✅ **FIXED (2026-07-01):** Se agregó `PATCH /users/me/availability` en `backend/src/routes/users.ts` (tal cual el fix propuesto). Corrección al diagnóstico original: el camino en vivo (`MerchantSettings.tsx` → `setAvailability()` en `api.ts:381-383`) **ya apuntaba** a la ruta correcta `/users/me/availability` — solo faltaba el endpoint en el backend, que ahora existe. `patchMerchantAvailability` (`api.ts:146-152`, `PATCH /users/me`) y el componente `MerchantAvailabilityToggle.tsx` que la usa vía `updateMerchantAvailabilityWithOfflineSupport` siguen rotos pero son código muerto sin ningún `import` en el árbol de páginas — no bloquean el flujo real de un merchant y quedan como limpieza pendiente (no bloqueante).
- **Severity:** BLOCKER
- **Location:** `api.ts:146-152` (`PATCH /users/me` — no existe), `api.ts:381-383` (`PATCH /users/me/availability` — no existe), usado por `MerchantSettings.tsx:2` y `MerchantAvailabilityToggle.tsx`; backend solo tiene `PATCH /users/me/push_token` y `PATCH /merchants/me/location`
- **Impact:** Un agente real no puede ponerse online/offline: la llamada 404ea, el wrapper "offline support" la encola para siempre y la UI dice "queued for sync". El mapa de discovery depende de `merchant_available`.
- **Recommended Fix (backend, users.ts):**
  ```ts
  app.patch('/users/me/availability', { preHandler: [authMiddleware], schema: { body: {
    type: 'object', required: ['availability'],
    properties: { availability: { type: 'string', enum: ['online', 'offline', 'paused'] } },
    additionalProperties: false } } }, async (request) => {
    const { availability } = request.body as { availability: string };
    await db.execute('UPDATE users SET merchant_available = $1 WHERE id = $2',
      [availability === 'online', request.user.id]);
    return { merchant_available: availability === 'online' };
  });
  ```
  y unificar el frontend en `setAvailability` (borrar `patchMerchantAvailability` o apuntarla al nuevo endpoint).

---

## 5. Performance & Responsiveness
### Status: ⚠️

#### Finding: Axios sin timeout — llamadas pueden colgar indefinidamente
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/services/api.ts:10` (`axios.create({ baseURL })` sin `timeout`), fetches de `getAuthToken` (174, 187) y health check (`App.tsx:735`) también sin `AbortSignal.timeout`
- **Recommended Fix:** `axios.create({ baseURL: BASE_URL, timeout: 15000 })`; para lock/complete (que esperan confirmación on-chain ~30s server-side) override por llamada: `http.post(url, body, { ...authHeaders(t), timeout: 45000 })`. En los `fetch`, `signal: AbortSignal.timeout(10000)`.

#### Finding: Polling triple sin backoff (chat 3s + trade 4s + KYC 5s)
- **Severity:** WARNING
- **Location:** `hooks/useChatMessages.ts:193` (3s), `QRReveal.tsx:97` (4s), `KYCScreen.tsx:146` (5s), `CETESScreen.tsx:72` (5s)
- **Description:** No hay WebSocket/SSE; en pantallas de espera largas (QR abierto 10+ min esperando al comprador) son ~15 requests/min sostenidos — batería y datos móviles. Aceptable para lanzamiento, pero debería pausarse en background.
- **Recommended Fix (barato):** Pausar polls con `CapApp.addListener('appStateChange')` (patrón ya usado en KYCScreen) y backoff a 10-15s después de 2 min sin cambios. (Ideal a mediano plazo: SSE en `GET /trades/:id/events`.)

#### Finding: `getTradeHistory` carga todos los usuarios y pagina en memoria
- **Severity:** WARNING
- **Location:** `micopay/backend/src/services/trade.service.ts:305-345` (`SELECT id, username FROM users` completo + `filtered.slice(offset...)` tras traer todos los trades del usuario)
- **Recommended Fix:** JOIN con alias y LIMIT/OFFSET en SQL:
  ```sql
  SELECT t.*, su.username AS seller_username, bu.username AS buyer_username
  FROM trades t JOIN users su ON su.id = t.seller_id JOIN users bu ON bu.id = t.buyer_id
  WHERE t.seller_id = $1 OR t.buyer_id = $1
  ORDER BY t.created_at DESC LIMIT $2 OFFSET $3
  ```

#### Finding: Bundle y assets OK
- **Severity:** INFO
- **Description:** `dist/` ≈ 2.0 MB ✅ (<5MB). Mapas son simulados (`MapSim`) — sin geocoding pesado. Los avatares remotos de googleusercontent (QRReveal/DepositQR) deben volverse assets locales de todos modos (§4). CoinGecko se llama client-side sin key (`useWalletBalance.ts:26-33`) — rate limit compartido por IP; mover al backend junto al fix de FX (§3).

---

## 6. Code Quality & Dead Code
### Status: ⚠️

#### Finding: Componentes y hooks muertos (features implementadas pero desconectadas)
- **Severity:** WARNING (no es solo limpieza: varios son UX de seguridad que debería estar montada)
- **Location (0 imports fuera de su propio archivo, verificado por grep):**
  - `components/ConnectionBanner.tsx` — banner de offline (montar, §4)
  - `components/OfflineQueueStatus.tsx` — estado de cola offline (montar o borrar)
  - `components/MerchantUnavailableBanner.tsx` — merchant pausado (montar, §4)
  - `components/CancelTradeDialog.tsx` — confirmación de cancelación con copy de refund (#20) (montar, §4)
  - `components/PermissionGate.tsx` — borrar (el flujo usa `usePermission` directo)
  - `components/DebugOverlay.tsx` — importado en `App.tsx:46` pero jamás renderizado; el estado `debugOpen`/`setDebugOpen` (`App.tsx:712,982`) también está muerto
  - `hooks/useTradePolling.ts` — solo lo importa su test; `QRReveal` reimplementa el polling a mano (migrar QRReveal al hook o borrar hook+test)
  - `hooks/useGeolocation.ts` — sin usos
  - `pages/TradeCancelled.tsx`, `pages/ClaimQR.tsx` — sin ruta (§1)
  - `services/api.ts:371-377 getAccountBalance` — sin usos (y el endpoint devuelve el balance de la plataforma, no del usuario — borrarla evita confusión)
  - `services/api.ts:117-135` — funciones ramp obsoletas (§1)
- **Recommended Fix:** Un PR de "wire or delete": montar los 4 primeros, borrar el resto.

#### Finding: Interfaces duplicadas `RampQuote`/`RampOrder` se fusionan silenciosamente
- **Severity:** WARNING
- **Location:** `micopay/frontend/src/services/api.ts:90-103` y `:677-695`
- **Description:** TypeScript hace declaration-merging de las dos declaraciones (no hay error de compilación porque no colisionan propiedades), produciendo un tipo mentiroso donde `quote.id` y `quote.quoteId` "existen" ambas — exactamente el bug que rompió SPEI (§1). Borrar la pareja vieja.

#### Finding: Backend `updateMerchantReputation` escribe en una tabla `merchants` que no existe en este schema
- **Severity:** WARNING
- **Location:** `micopay/backend/src/services/trade.service.ts:674-749` (`UPDATE merchants ...`, `trades.updated_at` tampoco existe); envuelto en try/catch "non-critical" así que solo loguea warning en cada trade completado
- **Recommended Fix:** Borrar la función y el bloque de `completeTrade:647-654` (la reputación ya se calcula on-read en `GET /users/me` desde `trades`), o migrarla a `merchant_configs`.

#### Finding: Ruta backend definida pero no registrada: `client-errors`
- **Severity:** WARNING
- **Location:** `micopay/backend/src/routes/client-errors.ts` existe; `micopay/backend/src/index.ts:218-228` no lo registra → `reportClientError` del frontend (ErrorBoundary) postea a un 404
- **Recommended Fix:** `import { clientErrorRoutes } from './routes/client-errors.js';` + `app.register(clientErrorRoutes, { prefix: '' });`

#### Finding: Redirect roto post-KYC con HashRouter
- **Severity:** INFO
- **Location:** `micopay/frontend/src/App.tsx:1053-1056` (`window.location.hash = '/#/cetes'` produce `#/#/cetes`, que no matchea ninguna ruta y cae al wildcard `/`)
- **Recommended Fix:** El wrapper debe usar `useNavigate()` como `KYCApprovedNextRoute` (que ya existe en `App.tsx:546-553` y hace esto bien — otra pista de código duplicado): `element={<KYCScreenRoute />}` con `onApproved={() => navigate('/cetes')}`.

#### Finding: Testing — unit sí, e2e de fondos no
- **Severity:** WARNING
- **Description:** Backend: 8 suites (rate-limit, revocation, requestId, abuse, tradeAuth, event-listener, accountDeletion, rateCache) — ninguna cubre el ciclo `create→lock→reveal→complete` ni los paths de fallo on-chain. Frontend: `Home`, `TradeDetail`, `useTradePolling` (hook muerto), `qrPayload`/`qrValidation` ✅. No hay tests del flujo de backup/restore de llave. Cobertura <70% en rutas críticas.
- **Recommended Fix:** Antes de mainnet, al menos: test de integración backend con `MOCK_STELLAR=true` recorriendo el ciclo completo + cancel/refund por cada estado (el bug B3 habría salido aquí), y un test de `Login` restore-with-seed.

#### Finding: Sin ESLint configurado; TypeScript limpio
- **Severity:** INFO
- **Description:** `tsc --noEmit` pasa sin errores (verificado 2026-07-01) ✅. No existe `.eslintrc*`/`eslint.config.*` ni en frontend ni en backend — hay un comentario `eslint-disable` en KYCScreen pero nada que lo aplique. 16 `console.log` (offline queue) — envolver en `if (import.meta.env.DEV)` o un logger con niveles.
- **Recommended Fix:** `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` con `no-console: warn`; añadir `tsc && eslint` al CI (la memoria del proyecto ya pedía un build gate en CI).

---

## 7. Deployment Readiness
### Status: ⚠️

#### Finding: Build/release — firma configurada, versionado y changelog ausentes
- **Severity:** WARNING
- **Location:** `micopay/frontend/android/app/build.gradle:10-11` (`versionCode 1`, `versionName "1.0.0"`, firma release vía `keystore.properties` ✅); sin `CHANGELOG.md`, sin git tags
- **Recommended Fix:** Bump manual por release (o derivar de `package.json version` en gradle), tag `v1.0.0` al primer release, `CHANGELOG.md` con Keep-a-Changelog. `VITE_APP_VERSION` (usado por `reportError.ts:63`) no se setea en ningún build — inyectarlo: `"build:mainnet": "tsc && VITE_APP_VERSION=$npm_package_version vite build --mode mainnet"` (en Windows usar `cross-env`).

#### Finding: Monitoring/alerting — solo logs
- **Severity:** WARNING
- **Description:** Backend loguea con pino estructurado + `request_id`/`support_code` ✅ y hay audit trail por trade ✅. Pero: no hay alerting (Render no avisa de 5xx), no hay crash reporting móvil (el `reportClientError` apunta a un endpoint no registrado, §6), no hay métricas (trades/hora, ratio de fallos de lock). No hay analytics de producto.
- **Recommended Fix (mínimo viable):** (1) registrar `client-errors`; (2) UptimeRobot/BetterStack sobre `/health` (ya devuelve 503 real si la DB cae ✅); (3) Sentry en frontend (Capacitor) y backend — con `beforeSend` reutilizando la redacción de `reportError.ts`; (4) un contador diario de `logTransitionFailure` que dispare email.

#### Finding: `SEED_DEMO_DATA` y `MOCK_STELLAR` deben quedar apagados y auditados en Render
- **Severity:** WARNING
- **Location:** Render service `micopay-api` (hoy sirve testnet con `SEED_DEMO_DATA` sembrando merchants demo); `index.ts:418-429`
- **Description:** Si el mismo servicio se promueve a mainnet, los merchants falsos (`farmacia_guadalupe`, etc., con direcciones Stellar inválidas `GFARMACIA...XXX`) aparecerían en el mapa real y los usuarios intentarían trades contra cuentas que no pueden firmar.
- **Recommended Fix:** Servicio Render separado para mainnet con `SEED_DEMO_DATA` sin definir, `MOCK_STELLAR=false`, `EVENT_LISTENER_ENABLED=true`, y el guard de `validateConfig` de B4 que impida `MOCK_STELLAR=true` en producción.

#### Finding: Reproducibilidad del build
- **Severity:** INFO
- **Description:** `package-lock.json` presente ✅, modos de Vite por entorno ✅, `capacitor.config.ts` mínimo y sano (`androidScheme: 'https'` ✅). Dos árboles de contratos (`contracts/` en la raíz y `micopay/contracts/escrow`) — documentar cuál es el canónico para el deploy mainnet para no desplegar el WASM equivocado.

---

## Priority Matrix

| Severity | Count | Examples |
|---|---|---|
| **BLOCKER** | 8 (7 ✅ fixed, 1 open) | ✅ B1 `/defi/*` sin auth; ✅ B2 CETES/Blend fuera de mainnet vía flag; ✅ B3 refund on-chain al cancelar; ✅ B4 guards de producción; ✅ B5 SPEI/KYC reparados; ✅ B6 QR real en depósito; ✅ B9 endpoint de availability; ❌ **B8 contrato escrow mainnet sin desplegar (acción manual de infraestructura, no ejecutada)** |
| **WARNING** | 19 (2 ✅ fixed, 17 open) | ✅ interceptor 401 corregido; ✅ el fix de B5 también resolvió el 401 en KYC; abiertos: registro sin prueba de llave (squatting), seed en localStorage (web) y clipboard, explorer/labels hardcodeados testnet, FX hardcodeado 17.5, guard de arranque no cubre modo `mainnet`, `RevealedView` muestra éxito ante fallo, mensaje de chat falso en QRReveal, componentes de seguridad UX sin montar (ConnectionBanner, CancelTradeDialog, MerchantUnavailableBanner), axios sin timeout, polling sin backoff, `getTradeHistory` O(users), `client-errors` sin registrar, `updateMerchantReputation` tabla inexistente, IDOR ramp order, sin e2e de fondos (salvo el nuevo `refund.test.ts`), sin alerting/crash reporting, versionado/changelog |
| **INFO** | 10 (sin cambios) | ClaimQR/TradeCancelled huérfanas; redirect `#/#/cetes`; 16 console.log; sin ESLint; botones sin handler; challenges/rate-limit en memoria (single-instance); CoinGecko client-side; textos EN/ES mezclados en KYCScreen; fee de Success calculado client-side con fallback "Farmacia Guadalupe"; dos árboles de contratos |

---

## Implementation Checklist

**BLOCKERs (en orden de urgencia):**

- [x] **B1 — Auth en `/defi/*` + quitar firma de platform key expuesta** ✅ *(2026-07-01 — auth añadida a buy/sell/supply/borrow; el rediseño de cetes/buy con firma de usuario queda cubierto por el feature-flag de B2)*
  - Files: `backend/src/routes/defi.ts`
- [x] **B4 — Guards de producción en `validateConfig` (JWT_SECRET, MOCK_STELLAR, longitud SECRET_ENCRYPTION_KEY)** ✅ *(2026-07-01)*
  - Files: `backend/src/config.ts`
- [x] **B3 — Refund on-chain en cancel de trade locked + permitir refund al seller + retry job** ✅ *(2026-07-02 — sin tocar el contrato: `expires_at` reutilizado como reloj, `refundTrade` acepta cualquier participante, `sweepPendingRefunds` corre cada 5 min; 5 tests nuevos en `refund.test.ts`)*
  - Files: `backend/src/services/trade.service.ts`, `backend/src/services/stellar.service.ts`, `backend/src/index.ts`, `backend/src/tests/refund.test.ts`, `frontend/src/pages/TradeDetail.tsx`
- [x] **B9 — Endpoint `PATCH /users/me/availability` + unificar cliente** ✅ *(2026-07-01 — el cliente ya apuntaba a la ruta correcta; solo faltaba el endpoint)*
  - Files: `backend/src/routes/users.ts`
- [x] **B5 — Reparar SPEI/KYC** ✅ *(2026-07-02)*
  - Files: `frontend/src/services/api.ts`, `frontend/src/pages/CETESScreen.tsx`, `frontend/src/pages/KYCScreen.tsx`, `frontend/src/App.tsx`
- [x] **B6 — QR real en DepositQR** ✅ *(2026-07-02 — QR real + avatares locales; el gate por `merchantConfirmScan` en MerchantInbox ya existía y no requirió cambios)*
  - Files: `frontend/src/pages/DepositQR.tsx`
- [x] **B2 — Feature-flag CETES/Blend fuera de mainnet** ✅ *(2026-07-02 — oculto por defecto vía `VITE_ENABLE_DEFI_TRADING`; la implementación real con firma de usuario sigue pendiente, fuera de alcance de esta pasada)*
  - Files: `frontend/src/App.tsx`
- [ ] **B8 — Deploy contrato escrow mainnet + env vars Render + servicio mainnet separado**
  - PR/branch: TBD · Effort: 2-4 h (runbook + verificación) · **No ejecutado — requiere fees reales de mainnet y acceso al dashboard de Render; acción de infraestructura fuera del alcance de esta sesión, debe hacerse manualmente**
  - Files: `micopay/scripts/deploy-mainnet.sh`, Render dashboard, `frontend/.env.mainnet`

**WARNINGs (agrupados):**

- [ ] **Seguridad de identidad:** registro con challenge/response + `StrKey` validation; ~~fix key `micopay_user` en interceptor 401 y `reportError`~~ ✅ *(hecho 2026-07-02, ver hallazgo arriba)*; borrar `generateFallbackAddress`; ownership check en `/defi/ramp/order/:orderId`
  - Effort restante: 3-5 h (el fix de sesión ya está hecho) · Files: `backend/src/routes/users.ts`, `backend/src/routes/ramp.ts`, `frontend/src/services/api.ts`
- [ ] **Mainnet-correctness de UI:** `buildTxUrl` en TradeDetail; textos "testnet" parametrizados; banner de red; guard de arranque para modo `mainnet`; FX desde `/rate/*` (nuevo endpoint USDC-MXN); quitar mensaje de chat falso de QRReveal
  - Effort: 6-8 h · Files: `frontend/src/pages/TradeDetail.tsx`, `QRReveal.tsx`, `CETESScreen.tsx`, `BlendScreen.tsx`, `Home.tsx`, `App.tsx`, `frontend/src/i18n/*`, `backend/src/routes/rate.ts`
- [ ] **Wire-or-delete de componentes:** montar ConnectionBanner/CancelTradeDialog/MerchantUnavailableBanner; fix de `RevealedView` (no éxito ante fallo); borrar DebugOverlay-import muerto, PermissionGate, useGeolocation, useTradePolling(+test o migrar QRReveal), TradeCancelled, ClaimQR(+ruta o borrar), `getAccountBalance`, interfaces Ramp duplicadas, `updateMerchantReputation`
  - Effort: 6-8 h · Files: `frontend/src/App.tsx`, `components/*`, `pages/TradeDetail.tsx`, `services/api.ts`, `backend/src/services/trade.service.ts`
- [ ] **Robustez de red:** timeout de axios (15s, overrides 45s en lock/complete); backoff+pausa de polling en background; `EVENT_LISTENER_ENABLED=true`; SQL con JOIN/LIMIT en `getTradeHistory`
  - Effort: 4-6 h · Files: `frontend/src/services/api.ts`, `hooks/useChatMessages.ts`, `pages/QRReveal.tsx`, `backend/src/services/trade.service.ts`, Render env
- [ ] **Observabilidad:** registrar `client-errors`; Sentry front+back; uptime check sobre `/health`; alerta sobre transition failures; `VITE_APP_VERSION` en builds
  - Effort: 1 día · Files: `backend/src/index.ts`, `frontend/src/main.tsx`, `frontend/package.json`
- [ ] **Testing:** e2e backend del ciclo de trade (mock Stellar) incluyendo cancel/refund por estado; test de restore-with-seed; ESLint + CI gate (`tsc && eslint && vitest run`)
  - Effort: 1-2 días · Files: `backend/src/tests/`, `frontend/src/__tests__/`, CI config
- [ ] **Release hygiene:** CHANGELOG, git tag, bump de versionCode/Name, documentar árbol de contratos canónico
  - Effort: 2 h

---

## Sign-off

- [ ] All BLOCKERs resolved
- [ ] All WARNINGs addressed
- [ ] APK/IPA tested on mainnet config
- [ ] Ready for mainnet deployment

**Next reviewer:** @ericmt-98 (Sonnet implementation)

> Nota para Sonnet: los line numbers corresponden al estado del repo en `main` @ `8f589de` (2026-07-01) — desactualizados donde el hallazgo ya está marcado ✅ FIXED (ver el diff real en su lugar). B1 y B4 son cambios de pocas líneas con impacto crítico — hacerlos primero y desplegarlos al backend testnet de una vez. **[2026-07-02] Decisión tomada para B3: se optó por "estado intermedio + retry" (sin tocar el contrato) en vez de `cancel_by_agreement`** — `refundTrade` ahora acepta a cualquier participante y un sweep periódico (`sweepPendingRefunds`, cada 5 min) liquida on-chain los trades cancelados una vez vence `expires_at`. Esto significa que **B8 (deploy del contrato) ya NO está bloqueado por una decisión de diseño de B3** — el contrato actual (sin cambios) es compatible con el fix implementado. B8 sigue pendiente solo por ser una acción de infraestructura (fees reales de mainnet, secretos, Render) que requiere ejecución manual del equipo.
