# MicoPay — Auditoría de Seguridad Wave 6 (Drips)

> Issues diseñados para que participantes de Stellar Drips Wave 6 realicen
> pruebas de seguridad en la app móvil de MicoPay y reporten hallazgos.
> Añade label `security-audit` + `wave-6-drips` al abrir cada issue en GitHub.

---

## Template de respuesta

Al cerrar cada issue, el auditor debe completar:

```
**Resultado:** [Vulnerable / No vulnerable / Parcialmente]
**Evidencia:** [curl, captura, tx hash, extracto de log]
**Reproducible en testnet:** sí / no
**Sugerencia de fix:** (opcional)
```

---

## `[SEC-01]` Flag `mockStellar` puede bypassear verificación de firma en producción

**Archivo:** `apps/api/src/routes/auth.ts:83-98`

### Contexto

El endpoint `POST /auth/token` verifica la firma Stellar del challenge solo cuando
`config.mockStellar` es `false`. Si este flag se activa accidentalmente en producción
(env var mal configurada, CI que hereda variables de staging), cualquier persona puede
obtener un JWT válido para **cualquier dirección Stellar** enviando una firma vacía o
arbitraria.

### Pasos para reproducir

1. Levantar el API con `MOCK_STELLAR=true` (o el nombre que tenga en `.env`)
2. Generar un challenge para cualquier dirección pública conocida (`POST /auth/challenge`)
3. Enviar `POST /auth/token` con `signature: "fakesig"` — esperar JWT válido
4. Usar ese JWT para acceder a rutas protegidas de otro usuario

### Lo que reportar

- ¿El token se emite con firma falsa?
- ¿Las rutas protegidas lo aceptan?
- ¿Qué claims incluye el JWT?

**Severidad estimada:** Crítica si llega a producción

---

## `[SEC-02]` Secreto HTLC expuesto en texto plano dentro del QR payload

**Archivo:** `apps/api/src/routes/cash.ts:280`

### Contexto

Al crear un cash request, el API construye el QR así:

```
micopay://claim?request_id=...&secret=<PREIMAGE_HEX>&amount_mxn=...&contract=...
```

El `secret` es el preimage del HTLC. Quien lo tenga puede reclamar el USDC del escrow
directamente en el contrato Soroban **sin pasar por el flujo de la app**. Este string
viaja en logs del servidor, en la barra de URL del browser si se abre como link, en
capturas de pantalla del carrete, y potencialmente en analytics del dispositivo.

> **Nota de alcance:** el mismo patrón existe en el flujo de trades P2P, no solo en
> cash requests. Ver `apps/api/src/services/trade.service.ts:207`:
> `micopay://release?trade_id=...&secret=<PREIMAGE>`. El auditor debe probar **ambos**
> flujos (cash + trade), porque cada uno construye un deep link con el preimage en claro.

### Pasos para reproducir

1. Hacer un cash request vía API y copiar `qr_payload` de la respuesta
2. Repetir con un trade P2P (`GET /trades/:id/secret`) y copiar su `qr_payload`
3. Llamar directamente al contrato Soroban con el `secret` y `contract` del payload,
   saltándose la app
4. Verificar si el USDC se libera sin que el merchant escanee el QR en la app

### Lo que reportar

- ¿Se puede reclamar el USDC directamente con el preimage del QR (cash y/o trade)?
- ¿El secret aparece en logs del servidor?
- ¿Aparece en el historial del browser si el QR se abre como URL?

**Severidad estimada:** Alta — expone el activo fuera del flujo controlado

---

## `[SEC-03]` Estado de cash request accesible sin autenticación

**Archivo:** `apps/api/src/routes/cash.ts:332-346`

### Contexto

`GET /api/v1/cash/request/:id` no tiene ningún middleware de autenticación. Devuelve
`merchant_name`, `amount_mxn`, `htlc_tx_hash` y `expires_at` a cualquiera que conozca
el `request_id`. El ID sigue el patrón `mcr-{8 chars hex}` — espacio de búsqueda
reducido, enumerable con fuerza bruta moderada.

### Pasos para reproducir

1. Crear un cash request legítimo, anotar el `request_id`
2. Desde una sesión sin token hacer `GET /api/v1/cash/request/{id}` — esperar 200
3. Intentar enumerar IDs (`mcr-00000000` a `mcr-ffffffff`) y medir cuántos hits se
   obtienen en N intentos

### Lo que reportar

- ¿Se obtiene 200 sin token?
- ¿Cuántos requests se pueden enumerar antes de ser bloqueado?
- ¿El rate limit lo frena?

**Severidad estimada:** Media — fuga de información financiera sin credenciales

---

## `[SEC-04]` Rate limiting global no protege endpoints de autenticación

**Archivo:** `apps/api/src/plugins/rate-limit.ts`

### Contexto

El rate limit es global: 100 req/min para **toda** la API, sin granularidad por endpoint
ni por IP. Los endpoints `POST /auth/challenge` y `POST /auth/token` no tienen límite
propio. Un atacante puede hacer brute-force de usernames o intentar forzar challenges
para múltiples direcciones sin ser bloqueado hasta superar el bucket global (que comparte
con tráfico legítimo).

### Pasos para reproducir

1. En un script, llamar `POST /auth/challenge` 200 veces en 1 minuto con distintas
   `stellar_address`
2. Verificar cuántas pasan antes del 429, si bloquea por IP o por toda la instancia
3. Medir si el bloqueo afecta a otros usuarios legítimos en el mismo minuto

### Lo que reportar

- ¿En qué request llega el 429?
- ¿El bloqueo es por IP o global?
- ¿Usuarios legítimos se ven afectados durante el bloqueo?

**Severidad estimada:** Media — amplifica otros ataques y permite DoS colateral

---

## `[SEC-05]` Robustez del almacenamiento del keypair Stellar en el dispositivo móvil

**Archivos:** `micopay/frontend/src/lib/keystore.ts` + `micopay/frontend/src/services/secureStorage.ts`

### Contexto

Al hacer login, la app genera un keypair Stellar (`generateAndStoreKeypair()`) y lo
almacena vía `writeJSON`. La capa `secureStorage.ts` **ya distingue plataforma**:

- **App nativa (Capacitor):** usa `@aparajita/capacitor-secure-storage`, que respalda en
  Android Keystore / iOS Keychain. La private key **no** queda en texto plano en disco
  común. Este es el camino correcto.
- **Build web/PWA:** cae a `window.localStorage` — sin cifrado del OS, accesible a
  cualquier script del mismo origen.

Por tanto, esto **no es una vulnerabilidad confirmada de almacenamiento en claro** en la
app móvil. El objetivo de la auditoría es validar la **robustez** de ese secure storage,
no asumir que falla.

### Pasos para reproducir

1. **Nativo:** en un dispositivo rooteado/jailbroken, intentar extraer el valor de
   `stellar_keypair` del Keystore/Keychain sin pasar por la app
2. Verificar si el secure storage exige autenticación biométrica / device-unlock para
   leer la clave (por defecto `capacitor-secure-storage` puede no exigirla)
3. Confirmar que la clave **no** se filtra a logs, backups de la nube (Android Auto
   Backup / iCloud Keychain) ni a `localStorage` por una ruta de fallback inesperada
4. **Web/PWA (si se distribuye):** confirmar que ahí sí cae a `localStorage` y medir el
   impacto vía XSS

### Lo que reportar

- ¿El secure storage nativo exige biometría/device-auth para leer la clave?
- ¿La clave se incluye en backups automáticos del OS o la nube?
- ¿Existe alguna ruta donde la app nativa termine usando `localStorage`?
- ¿El build web expone la clave sin cifrar?

**Severidad estimada:** Media en nativo (depende de biometría/backups) — Alta solo en web/PWA

---

## `[SEC-06]` JWT sin mecanismo de revocación server-side

**Archivos:** `apps/api/src/config.ts:66` + `micopay/frontend/src/services/secureStorage.ts`

### Contexto

Tras el login exitoso, el JWT se persiste vía `writeJSON` (mismo `secureStorage` que la
private key: Keychain/Keystore en nativo, `localStorage` en web). Datos confirmados en
el repo:

- **Expiración:** `jwtExpiry = "24h"` (`config.ts:66`). Ventana de 24 horas.
- **Revocación:** **no existe.** No hay blacklist, no hay refresh tokens, no hay endpoint
  de logout que invalide el token server-side. El "logout" del cliente solo borra el
  token local; un token ya copiado sigue válido las 24h completas.

El riesgo principal no es el almacenamiento (en nativo está en Keychain/Keystore), sino
la **imposibilidad de revocar** un token comprometido antes de su expiración natural.

### Pasos para reproducir

1. Hacer login y capturar el JWT (interceptar tráfico o leer del secure storage en
   dispositivo de prueba)
2. Hacer "logout" en la app y confirmar que el token capturado **sigue funcionando** en
   rutas protegidas (`GET /trades/active`, etc.)
3. Verificar que no exista ningún endpoint que invalide tokens server-side
4. **Web/PWA:** confirmar si el JWT queda en `localStorage` y es exfiltrable vía XSS

### Lo que reportar

- ¿El token sobrevive al logout del cliente? (esperado: sí — esto es el hallazgo)
- ¿Hay alguna forma de revocar un token comprometido antes de las 24h?
- ¿En web el JWT es accesible desde `localStorage`?

**Severidad estimada:** Media-Alta — sin revocación, un token robado vale 24h sin remedio

---

## `[SEC-07]` Deep links `micopay://` interceptables por apps maliciosas (Android)

**Archivo:** `apps/api/src/routes/cash.ts:280` — schema `micopay://claim?...&secret=...`

### Contexto

El QR contiene un deep link `micopay://claim?secret=<PREIMAGE>`. En Android, cualquier
app puede registrarse para manejar el scheme `micopay://` declarando un `<intent-filter>`
en su manifest. Si una app maliciosa (o una app legítima con el mismo scheme por
colisión) intercepta el intent, obtiene el preimage del HTLC y puede reclamar el USDC
directamente en el contrato Soroban. En iOS el riesgo es menor con Universal Links pero
el scheme custom sigue siendo vulnerable sin App Attest.

### Pasos para reproducir

1. Crear una app Android mínima que declare `<intent-filter>` para `micopay://`
2. Instalarla en el mismo dispositivo que la app de MicoPay
3. Escanear un QR de cash request real y verificar si Android muestra el picker de apps
4. Desde la app interceptora, leer los query params del Intent y extraer `secret`

### Lo que reportar

- ¿Android muestra app picker al escanear?
- ¿La app maliciosa puede leer el `secret` del deep link?
- ¿MicoPay usa App Links verificados con `assetlinks.json`?

**Severidad estimada:** Alta en Android — robo de fondos sin interacción del usuario

---

## `[SEC-08]` Validación de Merkle root no-fatal abre ventana de raíz fabricada en ZK

**Archivo:** `apps/api/src/routes/zk.ts:172-185`

### Contexto

Para los circuits `reputation_v1` y `access_credential_v1`, el API valida que
`public_inputs[0]` (la Merkle root) coincida con la root on-chain. Pero si
`fetchReputationRoot()` lanza excepción, el bloque `catch` **ignora el error y deja
pasar la verificación al contrato**:

```ts
} catch (err) {
  // Non-fatal if root unavailable — let contract decide
  fastify.log.warn({ err }, "Could not fetch on-chain root");
}
```

Si el contrato Soroban no tiene la misma guarda duplicada, un atacante puede presentar
una prueba ZK con una Merkle root fabricada durante una ventana donde el RPC esté lento
o caído (ej. timeout forzado, network partition).

### Pasos para reproducir

1. Generar una prueba ZK válida para `reputation_v1` con una Merkle root arbitraria
2. Configurar un firewall local para que las peticiones al RPC de Soroban den timeout
3. Enviar el request de verificación durante esa ventana
4. Verificar si el API responde `verified: true` o el contrato lo rechaza de todas formas

### Lo que reportar

- ¿El contrato Soroban tiene su propia guarda sobre la Merkle root?
- ¿El API acepta la prueba cuando el RPC falla?
- ¿Se puede fabricar una credencial válida con esta ventana?

**Severidad estimada:** Media — depende de si el contrato tiene la guarda duplicada

---

## `[SEC-09]` `DebugOverlay` es código muerto incluido en el bundle

**Archivo:** `micopay/frontend/src/components/DebugOverlay.tsx` + `App.tsx`

### Contexto

> **Corrección tras revisión de código:** el riesgo original ("overlay activo en
> producción") **no aplica**. `DebugOverlay` se **importa** en `App.tsx:40` pero
> **nunca se renderiza**: no existe ningún `<DebugOverlay ... />` en el frontend y
> `setDebugOpen()` jamás se invoca. Es código muerto: no se monta en ninguna build.

El riesgo residual es menor y de higiene, no de exposición activa:

- El componente queda **incluido en el bundle de producción** (a menos que el
  tree-shaking lo elimine por no usarse). Su código describe estructura interna: campos
  como `escrowContractId`, `mxneContractId`, `buyerUser.id`, flags `MOCK_STELLAR`/
  `Demo Mode` — útil para fingerprinting del stack si alguien lee el JS minificado.
- El estado `debugOpen`/`setDebugOpen` sigue cableado en el árbol de props sin propósito,
  lo que indica que en algún momento el overlay **sí** se mostraba; conviene confirmar
  que ninguna rama oculta lo reactive (gesto secreto, query param, etc.).

### Pasos para reproducir

1. Compilar la build de producción y buscar la string `DebugOverlay` / `Depuración
   Interna` en `dist/assets/*.js` — ¿el código sobrevive al tree-shaking?
2. Confirmar que no exista ningún trigger oculto que llame `setDebugOpen(true)`
   (gesto, atajo de teclado, query param, evento)
3. Si aparece en el bundle, evaluar qué metadata de estructura interna revela

### Lo que reportar

- ¿El código del overlay queda en el bundle de producción?
- ¿Existe algún trigger oculto que lo reactive?
- ¿Vale la pena eliminarlo del repo en vez de dejarlo como import muerto?

**Severidad estimada:** Baja / informativa — código muerto, no exposición activa

---

## `[SEC-10]` Verificación (regresión) de autorización por rol en la máquina de estados

**Archivo:** `apps/api/src/services/trade.service.ts`

### Contexto

> **Nota tras revisión de código:** los guards de rol **ya están implementados
> correctamente**. Esto **no es una vulnerabilidad abierta** sino un **test de regresión**
> para que el auditor confirme que las invariantes se mantienen. Guards verificados:
> - `revealTrade` (`:165`): `if (trade.seller_id !== userId) → ForbiddenError('Only the seller can reveal')`
> - `completeTrade` (`:215`): `if (trade.buyer_id !== userId) → ForbiddenError('Only the buyer can complete')`
> - `getTradeSecret` (`:183`): solo seller
> - `lockTrade` (`:117`): solo seller
>
> El objetivo es **confirmar** que no haya regresiones ni rutas alternativas que
> salten estos checks, no asumir que están rotos.

### Pasos para reproducir

1. Crear un trade como buyer (guardar `trade_id` y JWT del buyer)
2. Autenticado como **buyer**, llamar `POST /trades/{id}/reveal` → debe responder **403**
   ("Only the seller can reveal")
3. Autenticado como **seller**, llamar `POST /trades/{id}/complete` → debe responder
   **403** ("Only the buyer can complete")
4. Un tercero autenticado (ni buyer ni seller) intenta `GET /trades/{id}/secret` → **403**
5. Buscar rutas alternativas que toquen el estado del trade sin pasar por el servicio
   (queries directas, endpoints de demo/seed, etc.)

### Lo que reportar

- ¿Los 403 se mantienen en todos los casos? (esperado: sí)
- ¿Existe algún endpoint o secuencia que modifique el estado del trade saltándose los
  guards del servicio?
- ¿Los endpoints de demo/seed exponen alguna ruta sin estas validaciones?

**Severidad estimada:** Informativa si los guards se mantienen — Crítica si se encuentra un bypass

---

## `[SEC-11]` Mismatch cliente/servidor en el flujo de autenticación

**Archivos:** `apps/api/src/routes/auth.ts:18-28` vs `micopay/frontend/src/services/api.ts:98-114`

### Contexto

Hallazgo de correctitud (no estrictamente de seguridad, pero relevante para validar el
modelo de auth real desplegado). El **backend** define el schema así:

- `POST /auth/challenge` → requiere `stellar_address` (56 chars), `additionalProperties: false`
- `POST /auth/token` → requiere `stellar_address`, `challenge`, `signature`, `additionalProperties: false`

Pero el **cliente** (`getAuthToken`) envía `{ username }` y `{ username, challenge,
signature }`. Contra el schema actual, esas peticiones deberían rechazarse con **400**
(falta `stellar_address`, propiedad `username` no permitida). Esto sugiere que el flujo
de auth desplegado **no coincide** con el código del repo, o que hay una versión
distinta corriendo. Hay que clarificar cuál es la verdad antes de auditar SEC-01.

### Pasos para reproducir

1. Levantar backend del repo y llamar `POST /auth/challenge` con `{ "username": "x" }`
2. Observar si responde 400 (schema) o lo procesa
3. Repetir con el cliente real apuntando al backend del repo y ver si el login funciona

### Lo que reportar

- ¿El backend del repo acepta el payload que envía el cliente?
- ¿Qué versión/flujo de auth está realmente desplegado?
- ¿La firma del challenge se verifica de verdad en el deploy actual?

**Severidad estimada:** Informativa — pero bloquea la interpretación correcta de SEC-01

---

---

# Batch 2 — Pagos x402, agentes y superficies de servidor (SEC-12…SEC-21)

> Publicados 2026-06-29 (#243–#252). Mientras el batch 1 (SEC-01…11) se centró en auth, HTLC y
> almacenamiento del cliente, este batch audita la capa de **pagos x402**, los **endpoints de
> servidor sin cubrir** (credentials, bazaar, agent/swaps, demo, fund, ramp) y el **bootstrap**
> (CORS/headers). Cada issue lleva `security-audit` · `wave-6-drips` · `Stellar Wave` · `complexity:*`.

## `[SEC-12]` Bypass total de x402: el prefijo `mock:` en `X-PAYMENT` se acepta sin gate de entorno

**Archivo:** `apps/api/src/middleware/x402.ts:107-112` · **Issue:** #243

`verifyPayment()` acepta cualquier `X-PAYMENT: mock:G...:0` como pago válido y devuelve esa
dirección como payer, **sin verificar nada y sin guarda por entorno** (el flag `X402_MOCK_MODE` de
`index.ts:29` no se consulta aquí). Anula el pago en todos los endpoints `requirePayment` y habilita
SEC-16/17/18 gratis. **Severidad:** Crítica si llega a producción.

## `[SEC-13]` x402 acepta un pago sin confirmarlo on-chain ni verificar firma/saldo

**Archivo:** `apps/api/src/middleware/x402.ts:114-159` · **Issue:** #244

El "pago" solo se valida parseando el XDR y comprobando una op de pago al `PLATFORM_ADDRESS` ≥ monto.
No se envía a la red, ni se confirma en Horizon/RPC, ni se verifican firmas o saldo. Un XDR bien
formado **nunca enviado** basta para obtener el recurso gratis. **Severidad:** Alta.

## `[SEC-14]` Anti-replay de x402 nunca usa la DB (`useDatabase` siempre `false`)

**Archivo:** `apps/api/src/middleware/x402.ts:18, 120-129, 153-157` · **Issue:** #245

`useDatabase` se declara `false` y nunca se reasigna → el anti-replay siempre corre en memoria. Los
hashes usados se pierden al reiniciar y no se comparten entre instancias → ventana de replay.
**Severidad:** Media.

## `[SEC-15]` `/users/register` emite un JWT para una dirección Stellar no verificada

**Archivo:** `apps/api/src/routes/users.ts:12-63` · **Issue:** #246

El registro devuelve un JWT autenticado sin probar posesión de la llave privada de `stellar_address`,
saltándose el challenge de firma de `auth.ts`. Permite suplantar/secuestrar la dirección de un tercero.
**Severidad:** Crítica (bypass de autenticación).

## `[SEC-16]` `/api/v1/credentials/buy` ancla on-chain una Merkle root arbitraria del cliente

**Archivo:** `apps/api/src/routes/credentials.ts:54-66` · **Issue:** #247

En Modo A, `setReputationRoot(body.merkle_root)` escribe on-chain una root enviada por el usuario tras
solo un pago x402 (saltable con SEC-12). Toma de control persistente de la raíz de confianza ZK; luego
`/inference` valida contra esa root manipulada. **Severidad:** Alta.

## `[SEC-17]` Reputación del Bazaar inflable vía `accept` con payer falsificable

**Archivo:** `apps/api/src/routes/bazaar.ts:120-124, 354` · **Issue:** #248

`recordCompletion` se dispara al aceptar/lock (no al liquidar el swap) y el crédito va a un
`payerAddress` falsificable (SEC-12). Por centavos —o gratis— se fabrica un agente "maestro" 🍄,
contradiciendo el "not buyable" del propio endpoint. **Severidad:** Media.

## `[SEC-18]` Prompt injection en `/api/v1/swaps/plan` dirige un swap ejecutado con llaves de plataforma

**Archivos:** `apps/api/src/routes/agent.ts:212-250, 256-320` · **Issue:** #249

El `intent` libre del usuario alimenta al LLM que produce el `SwapPlan`; `/execute` lo ejecuta firmando
con `PLATFORM_SECRET_KEY`. Una inyección puede forzar contraparte/monto/asset y mover fondos de
plataforma. Sin tope de monto ni allowlist. **Severidad:** Alta.

## `[SEC-19]` `/api/v1/demo/run` (sin auth) dispara tx on-chain reales; `/auth/demo-login` acuña sesiones 24h

**Archivo:** `apps/api/src/routes/demo.ts:49-71, 85-274` · **Issue:** #250

`demo/run` sin auth firma y envía 6 pagos USDC reales por llamada (drenaje del agente demo + DoS).
`demo-login` emite un JWT de 24h si `demoMode` está activo (riesgo si se filtra a prod, cf. SEC-01).
**Severidad:** Media-Alta.

## `[SEC-20]` Webhook de ramp acepta callbacks de liquidación sin autenticación ni firma

**Archivo:** `apps/api/src/routes/ramp.ts:163-170` (+ `:16-30`) · **Issue:** #251

`/defi/ramp/webhook` es público y acusa recibo sin verificar firma/origen. Al cablear el proveedor real
acreditará órdenes → confirmación de depósito falsificable. Además, revisar manejo de la CLABE (PII).
**Severidad:** Media (stub) / Alta al conectar el proveedor.

## `[SEC-21]` CORS comodín (`origin: "*"`) en toda la API + ausencia de cabeceras de seguridad

**Archivo:** `apps/api/src/index.ts:39` · **Issue:** #252

CORS abierto a cualquier origen sobre toda la API (incluye endpoints sin auth/enumerables) y sin
`@fastify/helmet` (faltan HSTS, X-Content-Type-Options, CSP, etc.). **Severidad:** Media.

---

# Batch 3 — App móvil (Capacitor / APK · `micopay/frontend`) (SEC-22…SEC-31)

> Publicados 2026-06-29 (#254–#263). Lote **enfocado en la app móvil**: almacenamiento de
> claves/sesión en el dispositivo, WebView de Capacitor, deep links y build del APK. Cada issue lleva
> `security-audit` · `wave-6-drips` · `Stellar Wave` · `wave:frontend` · `complexity:*`.
>
> **Nota honesta de alcance:** el endurecimiento **nativo de Android ya es correcto** y no se reporta
> como vuln: `allowBackup=false` + reglas que excluyen sharedpref/db/file del backup y device-transfer
> (`backup_rules.xml`, `data_extraction_rules.xml`); `usesCleartextTraffic=false` + `network_security_config`
> (system CAs, user CAs solo en debug); `minifyEnabled`/`shrinkResources`/`debuggable=false`. Los
> hallazgos están en la capa **web/Capacitor** y el manejo de claves/estado en el cliente.

## `[SEC-22]` Lecturas directas de `localStorage` esquivan el secure storage nativo

**Archivos:** `src/pages/TradeDetail.tsx:36` · `src/hooks/useChatMessages.ts:85,127,224` · `src/utils/reportError.ts:17` · **Issue:** #254

Varios módulos leen `window.localStorage` directamente en vez de `secureStorage` (Keychain/Keystore en
nativo). O fallan en silencio en el APK, o implican que el material sensible vive en `localStorage` del
WebView en claro — anulando la protección que acreditan SEC-05/06. **Severidad:** Alta.

## `[SEC-23]` Claves de token inconsistentes entre módulos

**Archivos:** `useChatMessages.ts` (`auth_token`) · `reportError.ts` (`token`) vs `micopay_users` · **Issue:** #255

El token se guarda en `micopay_users`, pero chat y telemetría lo buscan bajo claves nunca escritas →
`Authorization` vacío (correctitud) + riesgo de introducir un store paralelo inseguro. **Severidad:** Media.

## `[SEC-24]` Estado de trade sobrescribible desde `localStorage`

**Archivo:** `src/components/TradeStateBadge.tsx:131-132` · **Issue:** #256

`micopay_trade_state_override` permite falsear la UI de estado ("completado/fondos seguros") desde el
cliente. Override de depuración que no debe ir en release. **Severidad:** Media.

## `[SEC-25]` La llave secreta se copia al portapapeles del sistema

**Archivo:** `src/pages/Profile.tsx:113-114` · **Issue:** #257

`exportSecretKey()` → `navigator.clipboard.writeText(secret)`: el `S...` queda en el portapapeles
(legible por otras apps/historial/sincronización). **Severidad:** Media-Alta.

## `[SEC-26]` `micopay_users` persiste dos identidades (buyer+seller) con sus tokens

**Archivos:** `src/pages/TradeDetail.tsx:27` · `App.tsx` · **Issue:** #258

Artefacto del demo de doble identidad (P0-1): dos sesiones autenticadas en un dispositivo; en web/PWA en
`localStorage` en claro. Amplía superficie y riesgo "trade contra sí mismo". **Severidad:** Media.

## `[SEC-27]` El reporte de errores envía `stack`/`context` arbitrario a `/client-errors`

**Archivo:** `src/utils/reportError.ts:10-26` · **Issue:** #259

Sin redacción ni allowlist: `stack`/`context` pueden arrastrar secretos a logs del servidor; además lee
el token de la clave equivocada (cf. SEC-23). **Severidad:** Media.

## `[SEC-28]` WebView de Capacitor sin Content-Security-Policy + recursos remotos

**Archivos:** `index.html` · `capacitor.config.ts` · **Issue:** #260

Sin CSP y con fuentes remotas. No es XSS activo (React escapa; sin `dangerouslySetInnerHTML`), pero falta
defensa en profundidad: un script inyectado alcanzaría el bridge nativo (SecureStorage/Camera/Geo).
**Severidad:** Media (defensa en profundidad).

## `[SEC-29]` Verificación de App Links (`assetlinks.json`) y consumo de `/claim/:id`

**Archivos:** `AndroidManifest.xml:35-43` · `src/main.tsx:28-30` · **Issue:** #261

`autoVerify=true` para `https://app.micopay.xyz/claim/*` solo protege si `assetlinks.json` está publicado y
correcto; si no, el claim puede ser interceptado por otra app (cf. SEC-07). **Severidad:** Media (Android).

## `[SEC-30]` El parser de QR acepta `secret`/`htlc` sin validar; scheme legacy en claro

**Archivo:** `src/utils/qrPayload.ts:48-122` (+ `demoMode.ts:3`) · **Issue:** #262

`secret`/`htlc` se toman crudos; verificar que el preimage HTLC no se filtre a logs/clipboard/historial en
el dispositivo; el formato legacy `MICOPAY:` en claro sigue aceptándose. **Severidad:** Media (cf. SEC-02/07).

## `[SEC-31]` Flag de demo de build (`VITE_DEMO_MODE`) embebible en el APK de release

**Archivo:** `src/utils/demoMode.ts:1-3` · **Issue:** #263

`IS_DEMO_MODE` se resuelve en build; sin guarda, un APK de release puede hornear comportamiento de demo
(QR/secret de demo). **Severidad:** Media (cf. SEC-01/19 del lado cliente).

---

## Priorización recomendada

| Issue | Severidad | Estado tras revisión de código |
|-------|-----------|--------------------------------|
| SEC-02 | Alta | Confirmado (cash + trades) |
| SEC-07 | Alta | Conceptualmente válido (Android) |
| SEC-01 | Crítica (solo si llega a prod) | Confirmado: sin guard de prod en `mockStellar` |
| SEC-06 | Media-Alta | Confirmado: sin revocación, expiry 24h |
| SEC-04 | Media | Confirmado: rate limit global |
| SEC-03 | Media | Confirmado: endpoint sin auth |
| SEC-08 | Media | Confirmado: catch no-fatal |
| SEC-05 | Media (nativo) / Alta (web) | Corregido: nativo usa Keychain/Keystore |
| SEC-09 | Baja / informativa | Corregido: código muerto, nunca se renderiza |
| SEC-10 | Informativa (test de regresión) | Corregido: guards ya implementados |
| SEC-11 | Informativa | Nuevo: mismatch cliente/servidor en auth |
| **SEC-12** | **Crítica (prod)** | Nuevo: bypass `mock:` sin gate (`x402.ts:110`) |
| **SEC-15** | **Crítica** | Nuevo: `/users/register` da JWT sin verificar firma |
| **SEC-13** | **Alta** | Nuevo: pago x402 sin settlement on-chain |
| **SEC-16** | **Alta** | Nuevo: anclar Merkle root arbitraria del cliente |
| **SEC-18** | **Alta** | Nuevo: prompt injection con fondos de plataforma |
| **SEC-19** | **Media-Alta** | Nuevo: `demo/run` sin auth + `demo-login` |
| **SEC-14** | **Media** | Nuevo: anti-replay nunca usa DB (`useDatabase=false`) |
| **SEC-17** | **Media** | Nuevo: reputación Bazaar inflable |
| **SEC-20** | **Media / Alta al conectar** | Nuevo: webhook ramp sin verificación |
| **SEC-21** | **Media** | Nuevo: CORS `*` + sin helmet |
| **SEC-22** | **Alta** | Móvil: lecturas `localStorage` esquivan secure storage |
| **SEC-25** | **Media-Alta** | Móvil: llave secreta al portapapeles |
| **SEC-24** | **Media** | Móvil: override de estado de trade vía `localStorage` |
| **SEC-26** | **Media** | Móvil: doble identidad (buyer+seller) persistida |
| **SEC-27** | **Media** | Móvil: telemetría sin redacción a `/client-errors` |
| **SEC-28** | **Media** | Móvil: WebView sin CSP (defensa en profundidad) |
| **SEC-29** | **Media** | Móvil: verificación de App Links / `assetlinks.json` |
| **SEC-30** | **Media** | Móvil: parser QR sin validar secret/htlc |
| **SEC-31** | **Media** | Móvil: `VITE_DEMO_MODE` embebible en APK release |
| **SEC-23** | **Media** | Móvil: claves de token inconsistentes |

### Otras superficies anotadas (no abiertas como issue, candidatas a futuro)

- **Chat de trade — sanitizador regex débil** (`routes/trade-messages.ts:38` `sanitizeBody`): strip de
  tags con `/<[^>]*>/g`; el propio comentario lo reconoce insuficiente. Verificar que el frontend nunca
  renderice `body` como HTML (riesgo de stored XSS) — estilo test de regresión como SEC-10.
- **`fund.ts` montos/hash falsos** (`routes/fund.ts:88-91`): `amount_usdc` hardcodeado a "0.10" y
  `stellar_tx_hash: demo_${Date.now()}`; el `message` (280 chars) se muestra en el dashboard — validar
  escape en el frontend.
- **Bucle del agente** (`routes/agent.ts:154` `while(true)`): sin tope de iteraciones → posible abuso
  de presupuesto de inferencia.

---

*Documento generado para Stellar Drips Wave 6 — MicoPay Security Audit*
