# Plan de implementación — Anchor SPEI ↔ CETES (Etherfuse)

> Fuente: documentación de Etherfuse (`docs.etherfuse.com`), investigada 2026-06-28.

> ⚠️ **Corrección de ubicación (2026-06-30):** todo este plan y los issues #220-225 apuntan a `apps/api/src/routes/{kyc,ramp,cetes}.ts`. Eso es un error — **`apps/api` no es lo que corre en producción.** El servicio real detrás de `https://micopay-api.onrender.com` (el que usa la app móvil) ejecuta el código de **`micopay/backend`**, confirmado comparando las respuestas reales de `/defi/cetes/rate` y `/health` contra ambos repos. La implementación real y verificada vive en:
> - `micopay/backend/src/routes/kyc.ts`, `ramp.ts`, y la sección nueva en `defi.ts` (`GET /defi/ramp/assets`)
> - `micopay/backend/src/services/etherfuse.service.ts`
> - `micopay/backend/src/lib/webhook-auth.ts`
> - `micopay/sql/migrations/20260630220000_etherfuse_ramp.up.sql`
>
> La copia en `apps/api` (commits `ceb2f3b`/`8caea7d`) sigue ahí pero **no se despliega — es código muerto para este propósito.** No la uses como referencia de qué está realmente en producción.

## Estado de los issues

| Issue | GitHub | Responsable | Notas |
|-------|--------|-------------|-------|
| A-1 · Backend: API client + `/ramp/assets` | [#220](https://github.com/ericmt-98/micopay-protocol/issues/220) cerrado | **Equipo core** | **Hecho 2026-06-30** — ver "Estado real de A-1" abajo |
| A-2 · Backend: KYC routes | [#221](https://github.com/ericmt-98/micopay-protocol/issues/221) cerrado | **Equipo core** | **Hecho 2026-06-30** — ver "Estado real de A-2/A-3" abajo |
| A-3 · Backend: CLABE + quote + order + webhook | [#222](https://github.com/ericmt-98/micopay-protocol/issues/222) cerrado | **Equipo core** | **Hecho 2026-06-30** (sin probar order/webhook end-to-end — ver notas) |
| A-4 · Frontend: pantalla KYC | [#223](https://github.com/ericmt-98/micopay-protocol/issues/223) abierto | **Drips** | Trabaja contra stubs del backend (ver abajo) |
| A-5 · Frontend: onramp SPEI en CETESScreen | [#224](https://github.com/ericmt-98/micopay-protocol/issues/224) abierto | **Drips** | Trabaja contra stubs del backend (ver abajo) |
| A-6 · Frontend: offramp CETES → SPEI | [#225](https://github.com/ericmt-98/micopay-protocol/issues/225) abierto | **Drips** | Trabaja contra stubs del backend (ver abajo) |

### Estado real de A-1 (2026-06-30)

Ya se obtuvo la cuenta sandbox y el `ETHERFUSE_API_KEY` (self-service en `https://sandbox.etherfuse.com` → `Account → Manage Accounts → Sandbox API Keys`, sin proceso de aprobación). Implementado y verificado contra el sandbox real:

- `apps/api/src/services/etherfuse.service.ts` → `etherfuseRampClient()` autenticado + `getRampAssets(wallet, currency)`.
- `apps/api/src/routes/cetes.ts` → `GET /defi/ramp/assets?wallet=<G...>&currency=mxn` (503 si falta la key, 400 si falta `wallet`).
- `apps/api/.env` / `.env.example` con `ETHERFUSE_API_KEY` y `ETHERFUSE_API_URL`.
- `render.yaml` actualizado: `ETHERFUSE_API_URL` público y `ETHERFUSE_API_KEY` como secreto (`sync: false`) en el servicio `micopay-api`. **Falta cargar el valor real en el dashboard de Render** (variable nueva, no existía antes).

**Correcciones al spec original tras probar contra el sandbox real** (la sección "Que construir" de A-1 más abajo describía la forma equivocada):

- El endpoint real es `GET /ramp/assets`, no acepta llamada sin querystring: requiere `blockchain` (fijo `"stellar"` para nosotros), `currency` (prioridad de orden, ej. `"mxn"`) y **`wallet`** (dirección Stellar — Etherfuse la usa para enriquecer la respuesta con balances). El plan original no mencionaba `wallet`.
- La respuesta es `{ "assets": [...] }`, no un array plano.
- El header es `Authorization: <API_KEY>` **sin** prefijo `Bearer`.
- Issuer real de CETES en sandbox: `GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4` (el fallback hardcodeado en `cetes.ts` — `CETES7CKqqKQizuSN6iWQwmTeFRjbJR6Vw2XRKfEDR8f` — no es un G-address válido y debería revisarse aparte).

### Estado real de A-2/A-3 (2026-06-30)

**Hallazgo principal: la API real de Etherfuse no se parece al spec original de A-3 en varios puntos clave.** Todo lo de abajo se confirmó probando contra el sandbox real (`docs.etherfuse.com/api-reference/...` embebe el OpenAPI exacto en cada página — más confiable que la prosa).

**No existe un endpoint para "solo registrar CLABE".** El plan original asumía `POST /defi/bank-account` con solo `{ clabe }`. En la realidad, en modo **hosted** (el que eligió MicoPay en A-2), la cuenta bancaria se vincula **dentro del mismo flujo hosted** junto con el KYC — el usuario captura su CLABE en la página de Etherfuse, no en nuestra app. Por eso **se eliminó la ruta `/defi/bank-account`** de `ramp.ts`. En su lugar:
- `customerId` y `bankAccountId` son UUIDs que **nosotros generamos** (no Etherfuse) al llamar `POST /defi/kyc/start` por primera vez, y se persisten en `users.etherfuse_customer_id` / `users.etherfuse_bank_account_id` (migración `002_etherfuse_ramp.sql`). Son permanentes una vez usados — no se pueden regenerar para el mismo usuario.
- Esos mismos IDs se reusan en quote/order — no hace falta pedirlos de nuevo.

**`POST /ramp/onboarding-url` devuelve `presigned_url` en snake_case** (a diferencia de todos los demás campos de respuesta, que son camelCase — confirmado en la doc: "Field naming convention").

**`POST /ramp/quote` cambia de forma respecto al plan:**
- `quoteId` y `customerId` los generamos nosotros y van en el body (no se reciben de Etherfuse en la request).
- `quoteAssets` es un objeto anidado `{ type: "onramp"|"offramp", sourceAsset, targetAsset }`, no `sourceAsset`/`targetAsset` sueltos.
- **Sandbox limita los onramps a 500 MXN** (`SandboxAmountExceeded` si se excede) — útil para pruebas, no es un límite de producción.
- Verificado con `curl` real: `POST /ramp/quote` con `sourceAmount: "500"` devolvió `destinationAmount`, `exchangeRate`, `feeBps`, `feeAmount`, `expiresAt` — coincide con lo implementado en `etherfuse.service.ts#createQuote`.

**`POST /ramp/order` también genera su propio `orderId`/`quoteId` de respuesta** — el que mandamos en el request no es el que se usa después; siempre hay que leer el ID de la respuesta, no asumir el que generamos. La respuesta es `{ onramp: {...} }` o `{ offramp: {...} }` (objeto envolvente, no plano).

**Webhooks: el esquema completo es distinto al que se había implementado.** Lo viejo (`x-webhook-signature` + `x-webhook-timestamp`, secreto único en `WEBHOOK_SECRET`) era inventado, no el real. El esquema real:
- Te suscribís con `POST /ramp/webhook` (`{ id, eventType, url }`) y la respuesta trae un `secret` (base64) **que se entrega una sola vez** — hay que guardarlo, no se puede volver a consultar.
- Cada `eventType` (`order_updated`, `kyc_updated`, `bank_account_updated`, etc.) es una suscripción separada con su propio secreto. Por eso ahora hay **dos rutas de webhook** (`/defi/ramp/webhook/order` y `/defi/ramp/webhook/kyc`), una por tipo de evento, en vez de una sola — así no hay que adivinar qué secreto usar para verificar.
- La firma real es `X-Signature: sha256={hex}`, calculada sobre el JSON **canonicalizado** (RFC 8785 JCS — orden de claves determinista), no sobre `JSON.stringify` plano. Implementado con el paquete `canonicalize` en `webhook-auth.ts`.
- Ya se registraron ambas suscripciones contra `https://micopay-api.onrender.com/defi/ramp/webhook/{order,kyc}` y los secretos están en `apps/api/.env` (`ETHERFUSE_WEBHOOK_SECRET_ORDER`/`_KYC`). **Hasta que esto se despliegue a Render, las entregas de Etherfuse van a fallar y reintentar 3 veces (con 5s de espera) — no hay impacto real, pero conviene desplegar pronto para no perder eventos.**

**Sin probar end-to-end:** `POST /ramp/order` y el webhook de `order_updated` real requieren un customer con KYC `approved` y bank account `compliant: true`, lo cual exige completar el flujo hosted en un navegador (no se puede simular por `curl`). El código sigue el spec real al pie de la letra, pero falta una corrida manual completa (KYC en sandbox con datos falsos → quote → order → SPEI simulado) antes de darlo por 100% verificado.

### Nota sobre la base de datos para probar A-2/A-3 localmente

No usamos Postgres local — la base de datos vive en Render (servicio `micopay-db`, ver `render.yaml` y memoria del proyecto). Para correr `apps/api` localmente con DB real, copia la **External Database URL** desde el dashboard de Render a `DATABASE_URL` en `apps/api/.env` (la Internal URL solo funciona dentro de la red de Render). Sin esto, `npm run dev` falla en el arranque (`ECONNREFUSED` en `initAuthChallengesTable`) antes de levantar cualquier ruta.

### Estado para Drips (A-4/A-5/A-6) — ya no hay stubs

**Obsoleto:** la sección original decía que A-4/A-5/A-6 trabajarían contra stubs en memoria mientras el equipo core conectaba la API real. Esos stubs ya no existen — `kyc.ts` y `ramp.ts` llaman a Etherfuse real (sandbox) desde el 2026-06-30. Drips puede construir directo contra estas rutas; solo necesita un usuario de prueba autenticado (el `ETHERFUSE_API_KEY` nunca sale del backend).

**Cambios de contrato que afectan a A-4/A-5/A-6 respecto al plan original:**
- **`POST /defi/bank-account` ya no existe.** El plan original (A-5) asumía un modal para registrar la CLABE por separado. En la realidad, la CLABE se captura dentro del mismo flujo hosted de KYC (`KYCScreen`) — no hace falta ninguna pantalla ni llamada adicional para esto. Si A-5 ya tiene un modal de CLABE construido contra el stub viejo, hay que quitarlo.
- `POST /defi/kyc/start` y `GET /defi/kyc/status` mantienen la misma forma de respuesta que el stub (`{ onboardingUrl, expiresAt }` y `{ status, rejectionReason }`), así que A-4 no debería necesitar cambios de UI.
- `POST /defi/ramp/quote` y `POST /defi/ramp/order` también mantienen la forma de respuesta del stub original (`{ quoteId, exchangeRate, destinationAmount, expiresAt }` y `{ depositClabe, ... }` / `{ withdrawAnchorAccount, ... }`), así que A-5/A-6 tampoco deberían necesitar cambios — pero **ahora requieren KYC aprobado primero** (403 si el usuario no completó `kyc/start` + el flujo hosted).
- Sandbox limita los onramps a 500 MXN — útil para que Drips no se sorprenda con un `400 SandboxAmountExceeded` al probar montos grandes.

## Resumen de flujos

Etherfuse expone una API REST propia (no SEP-6/SEP-24) para onramp y offramp SPEI ↔ CETES en Stellar.

**Onramp (SPEI → CETES):**
```
Usuario transfiere MXN via SPEI a CLABE de Etherfuse
  → Etherfuse detecta el pago
  → acredita CETES en la wallet Stellar del usuario
```

**Offramp (CETES → SPEI):**
```
Frontend firma un payment Stellar con keypair del dispositivo
  → CETES enviados a cuenta de Etherfuse (anchor mode, con memo)
  → Etherfuse detecta el pago on-chain
  → envía MXN via SPEI a la CLABE del usuario
```

**Restricciones clave:**
- API key B2B requerido — nunca va al frontend, siempre en el backend
- KYC obligatorio para todos los usuarios (CURP + RFC + selfie + liveness check por SPEI/CNBV)
- El issuer de CETES difiere entre sandbox y producción — siempre leerlo de `/ramp/assets`, nunca hardcodearlo
- Sandbox: `api.sand.etherfuse.com` / Producción: `api.etherfuse.com`
- Cotización caduca en **2 minutos** — la transacción Stellar en **1-2 minutos**

## Diagrama de dependencias

```
[EQUIPO CORE — necesitan API key Etherfuse]
A-1 (API client + assets)
├── A-2 (KYC backend)
└── A-3 (quote/order/webhook)
         │
         │ equipo core agrega stubs
         ▼
[DRIPS — trabajan contra stubs, sin API key]
A-4 (KYC frontend)       ← stubs de A-2
A-5 (onramp SPEI UI)     ← stubs de A-3
A-6 (offramp CETES→SPEI) ← stubs de A-3
```

A-4/A-5/A-6 pueden empezar en paralelo en cuanto el equipo core agregue los stubs.
Cuando A-1/A-2/A-3 estén listos con la API real, el frontend no necesita cambios.

---

## A-1 · Backend: Etherfuse API client + `GET /defi/ramp/assets`

**Complejidad:** media | **Depende de:** nada

### Que existe hoy

`apps/api/src/services/etherfuse.service.ts` llama a `/lookup/bonds/cost/CETES` para tasas. No existe cliente para la API de ramp (`/ramp/*`), ni manejo del API key, ni endpoint de assets.

### Que construir

**1. Variable de entorno**

Agregar a `.env.example` y `render.yaml`:
```
ETHERFUSE_API_KEY=<tu-llave-de-etherfuse>
ETHERFUSE_API_URL=https://api.sand.etherfuse.com   # sandbox
# produccion: https://api.etherfuse.com
```

**2. Cliente HTTP autenticado**

En `apps/api/src/services/etherfuse.service.ts`, agregar una funcion `etherfuseRampClient()` que retorne un `fetch` preconfigurado con:
```
Authorization: <ETHERFUSE_API_KEY>   # sin prefijo "Bearer" — Etherfuse lo manda crudo
Content-Type: application/json
```

**3. Ruta `GET /defi/ramp/assets`**

Hace proxy a `GET /ramp/assets` de Etherfuse. Retorna la lista de activos soportados con su identificador Stellar real (`CODE:ISSUER`).

Respuesta esperada (subset):
```json
[
  {
    "identifier": "CETES:GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC",
    "symbol": "CETES",
    "network": "stellar",
    "type": "bond"
  }
]
```

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `apps/api/src/services/etherfuse.service.ts` | Agregar `etherfuseRampClient()` |
| `apps/api/src/routes/cetes.ts` | Agregar `GET /defi/ramp/assets` |
| `.env.example` | Agregar `ETHERFUSE_API_KEY` y `ETHERFUSE_API_URL` |
| `render.yaml` | Agregar `ETHERFUSE_API_KEY` como `sync: false` |

### Criterio de aceptacion

- [ ] `GET /defi/ramp/assets` retorna la lista de activos con su `identifier` Stellar.
- [ ] El API key se lee de `process.env.ETHERFUSE_API_KEY` — nunca hardcodeado.
- [ ] Si `ETHERFUSE_API_KEY` no esta configurado, la ruta retorna 503 con mensaje claro.
- [ ] `tsc --noEmit` pasa sin errores en `apps/api/`.

---

## A-2 · Backend: KYC via flujo hosted de Etherfuse

> ⚠️ **Implementado el 2026-06-30 — ver "Estado real de A-2/A-3" arriba antes de leer esta sección.** La decisión de usar flujo hosted (abajo) sigue siendo correcta, pero varios detalles de "Que construir" (forma de la request/response, dónde vive `bankAccountId`) estaban mal respecto a la API real. Esta sección se deja como contexto histórico de la decisión, no como spec exacto.

**Complejidad:** media | **Depende de:** A-1

### Decisión: flujo hosted, no programmatic

Etherfuse ofrece dos caminos de onboarding:
- **Programmatic:** recolectamos CURP, RFC, selfie, liveness en nuestra UI y los enviamos por API. Control total, pero implica construir captura de documentos + integración de liveness — semanas de trabajo y carga regulatoria sobre nosotros.
- **Hosted (elegido):** generamos una URL firmada; el usuario completa **todo** (identidad, documentos, liveness, firma de acuerdos) en la página de Etherfuse. Etherfuse almacena los datos. Nosotros solo abrimos la URL y consultamos el estado.

MicoPay usa **hosted** — es más rápido, no almacenamos datos sensibles de KYC, y el liveness check (requisito SPEI/CNBV) lo maneja Etherfuse.

### API de Etherfuse a usar

- `POST /ramp/customer` — crear el customer, obtener `customerId`
- `POST /ramp/onboarding-url` — genera la URL hosted (presigned, expira en **15 minutos**)
- `GET /kyc/status` — consultar estado (pending / approved / rejected)

### Que construir

Dos rutas en `apps/api/src/routes/kyc.ts`:

**`POST /defi/kyc/start`**
Crea el customer en Etherfuse (si no existe), genera la onboarding URL y la devuelve. Guarda el `customerId` en `users`.

Body de Etherfuse `POST /ramp/onboarding-url`:
```json
{
  "customerId": "<uuid>",
  "bankAccountId": "<uuid>",
  "publicKey": "<stellar_pubkey_del_usuario>",
  "blockchain": "stellar",
  "userInfo": { "email": "...", "displayName": "..." }
}
```
Respuesta a devolver al frontend:
```json
{
  "onboardingUrl": "https://api.sand.etherfuse.com/onboarding?org_id=...&signature=...",
  "expiresAt": "2026-06-28T10:45:00Z"
}
```

**`GET /defi/kyc/status`**
```json
{ "status": "pending" | "approved" | "rejected", "rejectionReason": "..." }
```

### Punto a resolver con el sandbox

El body de `onboarding-url` pide `bankAccountId`, pero la página hosted **también** vincula la cuenta bancaria. Verificar en el sandbox si `bankAccountId` es opcional o si hay que pre-registrar la CLABE antes. Si es opcional, A-2 no depende de A-3.

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `apps/api/src/routes/kyc.ts` | Reemplazar stubs con llamadas reales a Etherfuse |
| `apps/api/src/index.ts` | `kycRoutes` ya registrado |
| `micopay/sql/migrations/` | Migracion para columna `kyc_customer_id` en `users` |

### Criterio de aceptacion

- [ ] `POST /defi/kyc/start` crea el customer en Etherfuse sandbox y devuelve una `onboardingUrl` válida con `expiresAt`.
- [ ] `GET /defi/kyc/status` retorna el estado real desde Etherfuse (no mock).
- [ ] Las rutas requieren token de usuario valido (middleware de auth existente).
- [ ] El `customerId` se persiste en `users` para no recrearlo en cada intento.
- [ ] En sandbox, completar el hosted flow con datos ficticios resulta en `approved`.
- [ ] `tsc --noEmit` pasa sin errores.

---

## A-3 · Backend: CLABE registro + quote + order + webhook SPEI

> ⚠️ **Implementado el 2026-06-30 — ver "Estado real de A-2/A-3" arriba antes de leer esta sección.** El registro de CLABE por separado (`POST /defi/bank-account`) **no existe en la API real** y se eliminó del código — la CLABE se captura dentro del flujo hosted de A-2. La forma de `quote`/`order` y el esquema de webhooks tampoco coinciden con lo que sigue; esta sección queda como contexto histórico.

**Complejidad:** alta | **Depende de:** A-1

### API de Etherfuse a usar

- `POST /ramp/bank-accounts` — registrar CLABE del usuario
- `POST /ramp/quote` — cotizacion MXN → CETES
- `POST /ramp/order` — crear orden, obtener CLABE de deposito
- `GET /ramp/order/:id` — consultar estado
- Webhook entrante — Etherfuse notifica cuando el SPEI llega y los CETES son acreditados

### Que construir

**`POST /defi/bank-account`**
```json
{ "clabe": "646180157000000004" }
```
Registra la CLABE en Etherfuse y la guarda en `users`.

**`POST /defi/ramp/quote`**
```json
{
  "sourceAsset": "MXN",
  "targetAsset": "CETES:<ISSUER>",
  "sourceAmount": "1000",
  "walletAddress": "<stellar_pubkey_del_usuario>"
}
```
El `targetAsset` se obtiene de `/defi/ramp/assets` — nunca hardcodeado.

Respuesta:
```json
{
  "quoteId": "...",
  "exchangeRate": "17.12",
  "destinationAmount": "0.0584",
  "expiresAt": "2026-06-28T10:30:00Z"
}
```

**`POST /defi/ramp/order`**
```json
{
  "orderId": "...",
  "depositClabe": "646180157000000004",
  "depositAmount": "1000.00",
  "depositBankName": "Etherfuse MX",
  "depositAccountHolder": "Etherfuse MX"
}
```

**`GET /defi/ramp/order/:orderId`**
Proxy a Etherfuse. Retorna `{ status: "pending" | "completed" | "failed" }`.

**`POST /defi/ramp/webhook`** (ruta publica, sin auth de usuario)
Etherfuse llama este endpoint cuando el SPEI es recibido. Verificar firma del webhook con secret de Etherfuse.

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `apps/api/src/routes/ramp.ts` | Nuevo archivo con las 5 rutas |
| `apps/api/src/index.ts` | Registrar `rampRoutes` |
| `micopay/sql/migrations/` | Columna `bank_account_id` y `clabe` en `users` |

### Criterio de aceptacion

- [ ] `POST /defi/bank-account` guarda la CLABE y retorna el `bankAccountId` de Etherfuse.
- [ ] `POST /defi/ramp/quote` retorna tasa y monto en CETES con `expiresAt`.
- [ ] `POST /defi/ramp/order` retorna la CLABE de deposito de Etherfuse.
- [ ] `GET /defi/ramp/order/:id` retorna el estado actualizado de la orden.
- [ ] `POST /defi/ramp/webhook` verifica firma y responde 200 (sin crash en body invalido).
- [ ] `tsc --noEmit` pasa sin errores.

---

## A-4 · Frontend: pantalla KYC (flujo hosted de Etherfuse)

**Complejidad:** media | **Depende de:** A-2 (o sus stubs)

### Decisión: hosted, no formulario propio

**No construimos formulario de CURP/RFC ni captura de documentos.** Etherfuse maneja todo eso en su página hosted. El frontend solo: (1) pide la URL al backend, (2) la abre, (3) hace polling del estado. Mucho menos trabajo y cero datos sensibles en la app.

### Que construir

Nueva pantalla `micopay/frontend/src/pages/KYCScreen.tsx`:

**Paso 1 — Introducción**
- Explicar que se va a verificar identidad con Etherfuse (un paso único)
- Botón "Verificar mi identidad"

**Paso 2 — Abrir flujo hosted**
- Al tocar el botón: `POST /defi/kyc/start` → obtener `onboardingUrl`
- Abrir la URL. En Capacitor usar `@capacitor/browser` (`Browser.open({ url })`) para abrirla en el navegador del sistema, no en un `<a href>`. Si el plugin no está instalado, agregarlo (es ligero) o usar `window.open` como fallback.
- La URL **expira en 15 minutos** — generarla justo al tocar el botón, no antes.

**Paso 3 — Espera y verificación**
Al regresar a la app (evento `appStateChange` de `@capacitor/app`, o un botón "Ya completé la verificación"), hacer polling a `GET /defi/kyc/status` cada 5 segundos:
- `pending` → "Verificando identidad..."
- `approved` → navegar al flujo SPEI + cachear en `secureStorage`
- `rejected` → motivo + botón para reintentar (regenera la URL)

El estado `approved` se cachea en `secureStorage` con clave `kyc_status` para no repetir el flujo.

**Punto de entrada:** si el usuario toca "Depositar via SPEI" en `CETESScreen` sin KYC aprobado, navegar a `KYCScreen`.

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `micopay/frontend/src/pages/KYCScreen.tsx` | Nuevo archivo (intro + abrir URL + polling) |
| `micopay/frontend/src/services/api.ts` | Agregar `startKYC()` y `getKYCStatus()` |
| `micopay/frontend/src/App.tsx` | Agregar ruta `/kyc` |

### Criterio de aceptacion

- [ ] El botón "Verificar mi identidad" llama a `POST /defi/kyc/start` y abre la `onboardingUrl` en el navegador del sistema.
- [ ] Al regresar a la app, el polling a `GET /defi/kyc/status` muestra el estado en tiempo real.
- [ ] `approved` navega al flujo SPEI; `rejected` permite reintentar.
- [ ] En sandbox (con stubs), el estado retorna `approved` y el flujo se completa end-to-end.
- [ ] Estado `approved` cacheado en `secureStorage`.
- [ ] No se recolecta ni almacena CURP, RFC, ni documentos en el frontend.
- [ ] `tsc --noEmit` pasa sin errores.

---

## A-5 · Frontend: flujo SPEI en CETESScreen (quote + CLABE + polling)

**Complejidad:** alta | **Depende de:** A-3 + A-4

### Flujo completo

```
[CETESScreen] → tab "SPEI"
  → verificar kyc_status → si no aprobado → KYCScreen
  → input monto MXN
  → POST /defi/ramp/quote → mostrar cotizacion (tasa + CETES + expira en X min)
  → usuario confirma → POST /defi/ramp/order
  → instrucciones de transferencia:
      CLABE: 646180157000000004  [Copiar] [QR]
      Banco: Etherfuse MX
      Monto exacto: $1,000.00 MXN
  → polling GET /defi/ramp/order/:id cada 5s
  → completed → "CETES acreditados en tu wallet"
```

### Que construir

Tercer tab "SPEI" en `CETESScreen.tsx` con 3 subpasos:

**Subpaso 1 — Cotizacion:** input MXN + llamada a `POST /defi/ramp/quote` + display de CETES a recibir con countdown de expiracion.

**Subpaso 2 — Instrucciones SPEI:** CLABE copiable, QR (`qrcode.react` ya instalado), monto exacto, nombre banco/titular.

**Subpaso 3 — Confirmacion:** polling cada 5s. Cuando `completed`, mostrar CETES acreditados + hash Stellar.

Si la cotizacion expira antes de confirmar: aviso + boton para obtener nueva cotizacion.

Primer uso: modal para registrar CLABE del usuario (`POST /defi/bank-account`), cacheada en `secureStorage`.

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `micopay/frontend/src/pages/CETESScreen.tsx` | Agregar tab SPEI con los 3 subpasos |
| `micopay/frontend/src/services/api.ts` | Agregar `getRampQuote()`, `createRampOrder()`, `getRampOrderStatus()`, `registerBankAccount()` |

### Criterio de aceptacion

- [ ] Flujo SPEI inaccesible sin KYC aprobado.
- [ ] Cotizacion muestra CETES a recibir y countdown de expiracion.
- [ ] Instrucciones incluyen CLABE copiable y QR.
- [ ] Polling actualiza estado automaticamente.
- [ ] En sandbox, orden transiciona a `completed` en ~30 segundos.
- [ ] `tsc --noEmit` pasa sin errores.

---

---

## A-6 · Frontend: offramp CETES → MXN via SPEI (anchor mode)

**Complejidad:** alta | **Depende de:** A-3 (quote/order backend), A-4 (KYC)

### Contexto

El offramp es la operación inversa al onramp: el usuario vende CETES y recibe pesos en su cuenta SPEI. Etherfuse soporta dos modos en Stellar:

- **Modo default:** Etherfuse construye la transacción de quema y la devuelve firmada parcialmente.
- **Anchor mode** (`useAnchor: true`): Etherfuse devuelve cuenta destino + memo; el frontend construye y firma el payment con el keypair del dispositivo.

MicoPay usa **anchor mode** porque es no-custodial — el usuario firma con su propia llave.

### Flujo completo

```
[CETESScreen] → tab "Vender" → subtab "Recibir SPEI"
  → verificar kyc_status y CLABE registrada
  → input monto en CETES a vender
  → POST /defi/ramp/quote (type: offramp, sourceAsset: CETES, targetAsset: MXN)
  → mostrar MXN a recibir + tasa + countdown 2 minutos
  → usuario confirma
  → POST /defi/ramp/order (useAnchor: true)
  → recibe { withdrawAnchorAccount, withdrawMemo, withdrawMemoType: "hash" }
  → frontend firma y envía transaccion Stellar:
      payment:
        destination: withdrawAnchorAccount
        asset: CETES:<ISSUER>
        amount: <monto del quote>
        memo: Memo.hash(Buffer.from(withdrawMemo, 'base64'))
  → polling GET /defi/ramp/order/:id cada 5s
  → funded  → "CETES recibidos por Etherfuse, procesando SPEI..."
  → completed → "MXN enviados a tu cuenta SPEI"
  → finalized → operacion cerrada
```

### Timing — restriccion critica

| Etapa | Ventana | Que hacer si expira |
|-------|---------|---------------------|
| Cotizacion | 2 minutos | Nueva llamada a `/ramp/quote` |
| Transaccion Stellar | ~1-2 minutos | `POST /ramp/order/:id/regenerate_tx` → re-firmar |

La UI debe guiar al usuario para confirmar y firmar dentro de los 90 segundos de obtener la orden. Si la transaccion Stellar llega tarde (`tx_too_late`), llamar a `regenerate_tx` y volver a firmar.

### Que construir

**En `stellarRamp.ts`** (nuevo servicio, paralelo a `stellarDex.ts`):

```typescript
export async function sendCETESToEtherfuse(
  cetesAmount: string,
  withdrawAnchorAccount: string,
  withdrawMemo: string,          // base64
): Promise<{ hash: string }> {
  // 1. exportSecretKey() → keypair del dispositivo
  // 2. loadAccount() desde Horizon
  // 3. TransactionBuilder con:
  //      Operation.payment({
  //        destination: withdrawAnchorAccount,
  //        asset: new Asset('CETES', CETES_ISSUER),
  //        amount: cetesAmount,
  //      })
  //      memo: TransactionBuilder.buildIncrement...
  //      Memo.hash(Buffer.from(withdrawMemo, 'base64'))
  // 4. setTimeout(90)  ← ventana mas generosa que el DEX
  // 5. sign(kp) + submitTransaction()
}
```

**En `CETESScreen.tsx`**, dentro del tab "Vender", agregar opcion "Recibir en SPEI" vs "Recibir en wallet":
- "Recibir en wallet" → flujo DEX ya implementado (`sellCETESOnDex`)
- "Recibir en SPEI" → flujo offramp (este issue)

**Nuevas funciones en `api.ts`:**
- `getOfframpQuote(cetesAmount)` → `POST /defi/ramp/quote` con `type: offramp`
- `createOfframpOrder(quoteId)` → `POST /defi/ramp/order` con `useAnchor: true`
- `regenerateOfframpTx(orderId)` → `POST /defi/ramp/order/:id/regenerate_tx`

### Archivos a tocar

| Archivo | Que cambia |
|---------|-----------|
| `micopay/frontend/src/services/stellarRamp.ts` | Nuevo: `sendCETESToEtherfuse()` |
| `micopay/frontend/src/services/api.ts` | Agregar `getOfframpQuote()`, `createOfframpOrder()`, `regenerateOfframpTx()` |
| `micopay/frontend/src/pages/CETESScreen.tsx` | Tab "Vender" con opcion SPEI vs wallet |

### Criterio de aceptacion

- [ ] La opcion "Recibir en SPEI" solo aparece si el usuario tiene KYC aprobado y CLABE registrada.
- [ ] El countdown de 2 minutos es visible durante la confirmacion del quote.
- [ ] Si el quote expira antes de confirmar, la UI invita a obtener uno nuevo sin perder el monto ingresado.
- [ ] La transaccion Stellar incluye el memo correcto (hash, decodificado de base64) — sin memo = refund de Etherfuse.
- [ ] Si la transaccion expira (`tx_too_late`), la UI llama a `regenerate_tx` y re-firma automaticamente.
- [ ] El polling muestra los estados `funded` → `completed` con mensajes en espanol.
- [ ] En sandbox, la orden transiciona a `completed` en ~30 segundos tras el envio on-chain.
- [ ] `tsc --noEmit` pasa sin errores.

---

## Plan de ejecución

### Equipo core (con API key de Etherfuse)
1. Registrar cuenta business en `sandbox.etherfuse.com` → obtener API key
2. Implementar A-1 (cliente + `/ramp/assets`) — base de todo
3. Implementar A-2 y A-3 en paralelo
4. **Mientras tanto:** agregar stubs para desbloquear A-4/A-5/A-6 a Drips

### Drips (sin API key, trabajando con stubs)
- A-4, A-5, A-6 pueden empezar en cuanto los stubs estén en el backend
- Cuando el equipo conecte la API real (A-2/A-3), el frontend no necesita cambios
- Para desbloquear un issue: quitar el label `wave:blocked` y avisar en el issue

### Orden sugerido
```
Semana 1: equipo core → A-1 + stubs para A-4/A-5/A-6
Semana 1-2: Drips → A-4/A-5/A-6 en paralelo contra stubs
Semana 2-3: equipo core → A-2 + A-3 (reemplaza stubs con API real)
```
