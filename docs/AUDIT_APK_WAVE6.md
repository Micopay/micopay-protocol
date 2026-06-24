# Auditoría APK MicoPay — Wave 6 (Drips)

> **Propósito:** reporte para revisión por Codex. Identifica la brecha entre la app móvil
> actual (demo de un solo dispositivo) y "el producto principal" (app móvil usable por un
> usuario real). Cada hallazgo incluye archivo:línea, severidad, causa y criterio de aceptación.
>
> **Fecha:** 2026-06-23 · **Rama auditada:** `feat/zkaas-hardening` · **Plataforma:** Capacitor (Android APK)
> **App ID:** `com.micopay.app` · `versionCode 1` / `versionName 1.0.0`

---

## 0. Resumen ejecutivo

La APK **ya compila verde** (`tsc --noEmit` y `vite build` ambos pasan): el problema histórico de
"main no compila" está resuelto. La arquitectura base es real: auth con keypair no-custodial en
SecureStorage, navegación con `HashRouter`, descubrimiento de comercios por geolocalización contra
`/merchants/available`, y ciclo HTLC wired (`createTrade → lock → reveal → complete`).

**Sin embargo, la app está construida como demo de una sola persona, no como producto.** Cuatro
artefactos P0 hacen que un solo dispositivo simule ambas partes de la transacción y muestre datos
que no son del usuario. Adicionalmente, varias pantallas descartan datos reales que la API ya
provee y los reemplazan por constantes hardcodeadas (P1). Falta endurecimiento de release y un
gate de CI que evite regresiones (P2).

**Decisión de producto cerrada:** MicoPay no es custodial. Para Wave 6 nos mantenemos con wallet
local no-custodial: crear keypair en la app o importar una clave secreta Stellar. Integraciones con
wallets externas móviles (LOBSTR, WalletConnect, etc.) quedan fuera del alcance inmediato; Freighter
no debe asumirse como flujo principal para APK/iOS.

**⚠️ Bloqueante #0 (verificado 2026-06-23):** aunque el frontend compila verde, el **backend
`npm run build` falla** (errores TS en `index.ts`, `trade.service.ts`, `requestId.test.ts`, falta
`firebase-admin`, props de config inexistentes). La app móvil habla con un backend que hoy **no es
deployable**. Esto antecede a todos los P0 de frontend — ver B-1 en §6 y §8.

| Nivel | # | Tema |
|------|---|------|
| 🔴 B-1 | 1 | **Backend no compila** — bloqueante #0, precede a todo |
| 🔴 P0 | 4 | Identidad doble, trade contra sí mismo, balance falso, fetch roto en APK |
| 🟠 P1 | 4 | UI descarta datos reales (mapa, economía de oferta, nombres, tipo de cambio) |
| 🟡 P2 | 3 | Sin CI gate, DeFi simulado, config de release |

---

## 1. Metodología y verificación

- **Build:** `cd micopay/frontend && npx tsc --noEmit` → exit 0. `npx vite build` → `✓ built in 7.79s`, exit 0.
- **Revisión de código:** `App.tsx`, `services/api.ts`, `lib/keystore.ts`, `pages/Home.tsx`,
  `pages/ExploreMap.tsx`, `components/MapSim.tsx`, `hooks/useMerchantsAvailable.ts`,
  `android/app/src/main/AndroidManifest.xml`, `capacitor.config.ts`, `android/app/build.gradle`.
- **Backend cruzado:** `micopay/backend/src/index.ts` (endpoint `/account/balance`).
- **Issues actuales:** `gh issue list` en `ericmt-98/micopay-protocol` y `micopay-mvp1` → **vacío** (partimos de cero).
- **Nota:** el `micopay/frontend/README.md` está **desactualizado** (describe una máquina de
  estados manual y `randomAddress`; el código real ya migró a `HashRouter` + keypair). No usar
  el README como fuente de verdad.

---

## 2. Lo que YA es real (no tocar / no re-litigar)

- ✅ Auth: keypair generado en dispositivo (`lib/keystore.ts`), challenge/signature, la llave
  privada nunca sale por HTTP (`api.ts:97-116`).
- ✅ Wallet local no-custodial: el dispositivo puede crear keypair (`generateAndStoreKeypair`),
  importar clave secreta (`importKeypair`) y exportarla desde perfil (`Profile.tsx`).
- ✅ Navegación real con `HashRouter` y rutas montadas (`App.tsx:730-760`).
- ✅ Descubrimiento de comercios real por geolocalización Capacitor-aware
  (`hooks/useMerchantsAvailable.ts`, `GET /merchants/available`).
- ✅ Ciclo de trade HTLC wired contra backend (`api.ts:118-188`).
- ✅ Android App Links para `https://app.micopay.xyz/claim/*` (`AndroidManifest.xml:35-43`).
- ✅ Permisos nativos declarados: cámara, ubicación, notificaciones (`AndroidManifest.xml:62-66`).

---

## 3. Hallazgos P0 — Bloqueantes para "un usuario real, una transacción real"

### P0-1 · Identidad doble por dispositivo
- **Archivo:** `micopay/frontend/src/App.tsx:600-608`
- **Qué pasa:** al iniciar, la app registra DOS usuarios en el mismo teléfono:
  `registerUser('juan_<ts>')` (comprador) y `registerUser('farmacia_<ts>')` (comerciante),
  y los guarda juntos en `StoredUsers { buyer, seller }`.
- **Por qué importa:** un producto real es **una identidad por dispositivo**. La contraparte
  debe vivir en otro dispositivo. Mientras esto exista, no hay P2P real.
- **Criterio de aceptación:** el dispositivo registra una sola identidad. El rol comerciante
  se activa por una acción explícita del usuario (no se auto-crea un segundo usuario).

### P0-2 · Trade contra sí mismo (sin contraparte real)
- **Archivo:** `micopay/frontend/src/App.tsx:636-662` (`runTradeFlow`, `handleOfferSelected`, `handleDepositOfferSelected`)
- **Qué pasa:** `runTradeFlow` crea el trade con el token del comprador y luego llama
  `lockTrade`/`revealTrade` con `sellerUser.token` — es decir, el mismo dispositivo ejecuta
  los pasos que corresponden a la contraparte. El `offerId` del comercio seleccionado se ignora
  (`_offerId`).
- **Por qué importa:** la "operación" no involucra a otra persona; el teléfono juega ambos lados.
- **Criterio de aceptación:** seleccionar una oferta crea un trade contra el `seller_id` real
  del comercio elegido; el `lock`/`reveal` los dispara la contraparte (otro dispositivo o el
  backend en su nombre), no el comprador con un token de vendedor local.

### P0-3 · Balance de wallet falso (saldo de plataforma, igual para todos)
- **Archivos:** `micopay/frontend/src/pages/Home.tsx:43-52` → `getAccountBalance()` →
  `micopay/backend/src/index.ts:177-193`
- **Qué pasa:** `GET /account/balance` no recibe token; devuelve el saldo de la wallet de
  plataforma (`config.platformSecretKey`). Todos los usuarios ven el mismo número. El keypair
  real del usuario (`lib/keystore.ts`) nunca se fondea ni se consulta para mostrar saldo.
- **Por qué importa:** el "saldo" de la pantalla principal es de adorno; no representa los
  fondos del usuario. Como MicoPay no es custodial, este no es un tema de modelo abierto: la UI
  debe reflejar la dirección Stellar del usuario, no una wallet central.
- **Criterio de aceptación:** la pantalla principal muestra el saldo de la dirección Stellar
  del propio usuario (autenticada por token o consultada por dirección pública validada contra
  el usuario actual). El endpoint `/account/balance` deja de usar `platformSecretKey` para la
  Home o se reemplaza por un endpoint explícito de saldo de usuario.

### P0-4 · Fetch con ruta relativa roto dentro del APK
- **Archivo:** `micopay/frontend/src/pages/Home.tsx:61-69`
- **Qué pasa:** usa `fetch('/api/merchants/me/trades?state=pending')` con **ruta relativa**.
  El resto de la app usa el cliente axios `http` con `baseURL = VITE_API_URL` (`api.ts:5-7`).
  En el WebView de Capacitor, `/api/...` resuelve contra el origen de la app (`https://localhost`
  / esquema de la app), no contra el backend.
- **Por qué importa:** el badge de "operaciones pendientes" del comerciante **no carga en el
  dispositivo** (funciona solo en web por el proxy de dev).
- **Criterio de aceptación:** la llamada usa el helper de API con `baseURL` (p. ej.
  `getMerchantTrades(token, 'pending')` ya existe en `api.ts:226-232`). Cero rutas relativas
  `/api/...` en el código de pantallas.

---

## 4. Hallazgos P1 — La data real existe pero la UI la oculta

### P1-1 · ExploreMap descarta la economía real de cada comercio
- **Archivo:** `micopay/frontend/src/pages/ExploreMap.tsx:31-43` (`merchantToOffer`)
- **Qué pasa:** la API (`AvailableMerchant`, `api.ts:441-455`) devuelve `distance_km`,
  `payout_mxn`, `rate_percent`, `username`, `latitude/longitude`. `merchantToOffer` los **ignora**
  y devuelve constantes: `distance: '180 m'`, `walkMinutes: 3`, `receiveMxn: 495`,
  `commissionPct: 1`, `badge: 'Negocio verificado'`. Todas las tarjetas muestran lo mismo.
- **Criterio de aceptación:** cada tarjeta refleja los valores reales del comercio
  (`m.distance_km`, `m.payout_mxn`, `m.rate_percent`). `formatDistance`/`walkMinutes` (ya
  presentes en el archivo) se usan con la distancia real.

### P1-2 · El mapa muestra pines inventados, no los comercios reales
- **Archivo:** `micopay/frontend/src/components/MapSim.tsx:32-79`
- **Qué pasa:** renderiza 3 pines fijos (Farmacia Guadalupe, @carlos_g, Centro Lavado) con
  posiciones CSS hardcodeadas. No recibe ni grafica los comercios reales ni sus `lat/lng`.
- **Criterio de aceptación:** el mapa grafica los comercios devueltos por `useMerchantsAvailable`
  en su posición real (o, si se mantiene la simulación visual para el hackathon, etiquetarla
  claramente como ilustrativa y no como ubicaciones reales).

### P1-3 · Nombres de agente hardcodeados en el recibo
- **Archivo:** `micopay/frontend/src/App.tsx:345`
- **Qué pasa:** `agentName={flow === 'cashout' ? 'Farmacia Guadalupe' : 'Tienda Don Pepe'}`.
  El nombre real del comercio (disponible en `seller_username` vía `fetchTradeDetail`) no se usa.
- **Criterio de aceptación:** el recibo muestra el `seller_username` real del trade.

### P1-4 · Tipo de cambio XLM→MXN hardcodeado
- **Archivo:** `micopay/frontend/src/pages/Home.tsx:71-76`
- **Qué pasa:** `parseFloat(...) * 20` fijo ("demo rate"). No hay oráculo ni feed.
- **Criterio de aceptación:** el tipo de cambio viene de una fuente del backend (endpoint de
  rate / oráculo). Si no hay fuente aún, etiquetar el valor como aproximado/demo en la UI.

---

## 5. Hallazgos P2 — Endurecimiento de release

### P2-1 · Sin gate de CI (riesgo de regresión)
- **Hecho:** no existe `.github/workflows/`. La regresión previa (main sin compilar) ocurrió
  justamente por mergear sin gate.
- **Criterio de aceptación:** workflow que corra `tsc --noEmit` + `vite build` (y `vitest run`)
  en cada PR a `main`, bloqueando merge si falla.

### P2-2 · DeFi (CETES / Blend) totalmente simulado
- **Archivos:** `api.ts:285-374` (`simulated: boolean`), pantallas `CETESScreen.tsx`,
  `BlendScreen.tsx`. El backend responde `{ simulated: true }`; no se mueve dinero on-chain.
- **Decisión requerida:** (a) cablear contra protocolos reales, o (b) etiquetar la UI
  explícitamente como "simulado" para no inducir a error. Hoy hay un feature-gate parcial
  (`showDefi={!isDemoMode || !isMockStellar}` en `App.tsx:368-374`).
- **Criterio de aceptación:** ningún flujo presenta una transacción simulada como real sin
  etiqueta visible.

### P2-3 · Configuración de release incompleta
- **Push notifications:** `build.gradle:67-74` aplica `google-services` solo si existe
  `google-services.json`; el manifest declara canal `trade_alerts` (`AndroidManifest.xml:54-57`).
  Verificar que el archivo exista para builds de release o documentar que push está deshabilitado.
- **Versionado/firma:** `versionCode 1` / `versionName 1.0.0` fijos; firma depende de
  `keystore.properties` (`build.gradle:17-29`). Definir estrategia de bump y custodia de keystore.
- **Bundle:** un solo chunk de **1.46 MB** (`index-*.js`); sin code-splitting (warning de Vite).
  Considerar `dynamic import()` / `manualChunks` para arranque más rápido en gama baja.

---

## 6. Cola de publicación / asignación / merge

> Convención de labels tomada de `docs/DRIPS_TEAM_GUIDE.md` y confirmada contra los labels
> reales del repo y los issues cerrados #75–89. Cada issue lleva:
> **superficie** (`wave:frontend` y/o `wave:backend`) · **track** (`wave:retail` | `wave:merchant`
> | `wave:trust` | `wave:docs`) · **complejidad** (`complexity: low|medium|high`) · **`Stellar Wave`**
> · opcional `ux`/`bug`. No usar labels que no existan en el repo (ver §7, nota de corrección).

### 6.1 Distinción clave: prioridad ≠ orden de merge

La prioridad (§3–§5) dice *qué duele más*. El orden de merge dice *qué debe entrar primero para
no romper integración*. El gran cambio respecto al orden anterior: **el backend no compila
(B-1), así que es el verdadero bloqueante #0** — sin backend deployable, ningún P0 de frontend
se puede validar end-to-end. B-1 va primero, y el CI gate (P2-1) justo después para proteger todo
lo demás.

### 6.2 Matriz de issues (publicar con estos labels)

| ID | Título corto | Superficie | Track | Complejidad | `Stellar Wave` | Notas |
|----|--------------|-----------|-------|-------------|:---:|-------|
| B-1 | Backend `npm run build` debe pasar | `wave:backend` | `wave:trust` | high | ✅ | **Bloqueante #0. Verificado: falla hoy.** |
| P2-1 | CI gate: tsc + vite build + backend build | `wave:backend`,`wave:frontend` | `wave:docs` | medium | ✅ | Debe incluir el build del backend, no solo frontend |
| P0-1 | Una sola identidad por dispositivo | `wave:frontend` | `wave:trust` | high | ✅ | Unir con P0-2 (mismo rediseño) · `wave:needs-product` |
| P0-2 | Trade contra contraparte real | `wave:frontend`,`wave:backend` | `wave:retail` | high | ✅ | Depende de P0-1 |
| P0-4 | Fix fetch relativo en APK | `wave:frontend` | `wave:merchant` | low | ✅ | `bug` · independiente, merge cuando sea |
| P0-3 | Saldo real de la wallet del usuario | `wave:frontend`,`wave:backend` | `wave:retail` | medium | ✅ | Depende de P0-1 · `wave:needs-product` |
| P1-1 | ExploreMap usa economía real | `wave:frontend` | `wave:retail` | medium | ✅ | Independiente |
| P1-3 | Nombre real del agente en recibo | `wave:frontend` | `wave:retail` | low | ✅ | `ux` · depende de P0-2 (trade real) |
| P1-2 | Mapa grafica comercios reales | `wave:frontend` | `wave:retail` | medium | ✅ | `ux` · independiente |
| P1-4 | Tipo de cambio XLM→MXN real | `wave:frontend`,`wave:backend` | `wave:retail` | medium | ✅ | Necesita endpoint de rate |
| B-2 | Config prod fail-fast si faltan secretos | `wave:backend` | `wave:trust` | medium | ✅ | Depende de B-1 |
| B-3 | Desactivar fallback in-memory en prod | `wave:backend` | `wave:trust` | medium | ✅ | Depende de B-1 |
| B-4 | No sembrar datos demo en prod | `wave:backend` | `wave:trust` | low | ✅ | Depende de B-1 |
| B-6 | Migraciones reproducibles + fix `init.sql` (users duplicado, `audit_log` x2) | `wave:backend` | `wave:trust` | medium | ✅ | Depende de B-1 |
| P0-5 | Onboarding mínimo: alias + respaldo de clave obligatorio (KYC Nivel 0) | `wave:frontend` | `wave:trust` | medium | ✅ | Sienta base para KYC por niveles (D-4) · `wave:needs-product` (pregunta 3) |
| B-7 | Health/readiness real (DB + config) | `wave:backend` | `wave:trust` | medium | ✅ | Depende de B-1 |
| P2-2 | Feature-gate o productizar DeFi | `wave:frontend`,`wave:backend` | `wave:retail` | medium | ✅ | `wave:needs-product` |
| P2-3 | Config de release APK | `wave:frontend` | `wave:retail` | medium | ✅ | Push, firma, code-splitting |

**Tratamiento especial:**
- **B-5 (Dockerfile/guía de deploy)** → trabajo interno de maintainer/integrator. Roza Risk
  Controls de la guía ("no exponer credenciales de deploy en Waves tempranas"). No publicar como
  issue de contribuidor Drips; manejarlo internamente.
- **§7 validación de mercado/producto (5 issues: V-1…V-5)** → SÍ se publican como issues de Drips:
  usar Drips es justamente la ventaja (la comunidad hace el trabajo y se le reconoce). Para que no
  sean "vague strategy work" cada uno lleva criterio de aceptación concreto (un entregable
  estructurado que lo cierra). No usan PR ni merge. Labels: `research` (nuevo) · track `wave:docs` ·
  `complexity: low` · `Stellar Wave`. Ver §7.

| ID | Título corto | Tipo |
|----|--------------|------|
| V-1 | Market validation: contexto de cash-out | research |
| V-2 | Market validation: contexto de cash-in / depósito | research |
| V-3 | Market validation: perspectiva de proveedor de liquidez | research |
| V-4 | Product validation: onboarding de wallet no-custodial | research |
| V-5 | Product validation: confianza en flujo cash-in/cash-out | research |

> ⚠️ **`research` es el único label NUEVO** que hay que crear en el repo (y documentar en
> `DRIPS_TEAM_GUIDE.md`) antes de abrir V-1…V-5. El resto de labels ya existen.

### 6.3 Orden recomendado de publicar → asignar → mergear

**Etapa 0 — Desbloqueo (interno, antes de abrir a contribuidores):**
1. **B-1** backend build verde — sin esto nada se valida end-to-end.
2. **P2-1** CI gate (frontend + backend) — protege todo merge posterior. Mergear apenas B-1 esté.

**Etapa 1 — Núcleo "un usuario real, una transacción real" (P0):**
3. **P0-1 + P0-2** (un solo PR/epic: identidad única + contraparte real). Decisiones D-1 y D-2 ya
   cierran el alcance; resolver pregunta §9.3 (backup) antes de asignar P0-5.
4. **P0-4** en paralelo (trivial, independiente).
5. **P0-3** después de P0-1 (saldo por-usuario necesita identidad única).
6. **P0-5** tras P0-1 (onboarding mínimo + respaldo de clave; KYC Nivel 0). Depende de §9.3.

**Etapa 2 — "la UI deja de mentir" (P1, paralelizable entre contribuidores):**
7. **P1-1** y **P1-2** (independientes, frontend puro).
8. **P1-3** (tras P0-2) y **P1-4** (tras endpoint de rate).

**Etapa 3 — Backend hardening (tras B-1, paralelizable):**
9. **B-2, B-3, B-4, B-6, B-7**.

**Etapa 4 — Decisiones de producto / release:**
10. **P2-2** y **P2-3** (requieren decisión de producto primero).

**Etapa paralela — Research (V-1…V-5, sin merge, en cualquier momento):**
- Las 5 de validación corren **en paralelo a todo**: no tienen dependencia de código ni de
  build, no llevan PR. Solo requieren crear el label `research` primero (ver §6.2 y §7). Se pueden
  abrir desde el día 1.

### 6.4 Política de asignación y merge (de `DRIPS_TEAM_GUIDE.md`)

- **Owners internos por track antes de abrir:** retail (P0-1/2/3, P1-*), trust/backend (B-*),
  DX/docs (P2-1).
- **SLA:** primera review < 24 h; respuesta a aplicación el mismo día.
- **`wave:needs-product`** en P0-1, P0-3, P2-2: no asignar a contribuidor hasta cerrar §9.
- **Regla de merge:** B-1 y P2-1 NO se entregan a Drips — son Etapa 0 interna. Lo demás se mergea
  por etapas; dentro de una etapa, lo independiente puede ir en cualquier orden.
- **`complexity: high`** (B-1, P0-1, P0-2): reservar para contribuidores con contexto o tomar
  internamente; la guía pide usar `high` con moderación y solo si es mergeable dentro de la Wave.

---

## 7. Validación DRIPs inicial (mercado + producto)

Además de corregir P0/P1, Wave 6 debe validar si MicoPay hace sentido para usuarios reales en
su país/contexto. Para empezar, se crearán **5 issues iniciales** en DRIPs. Estos issues no
requieren pull request ni merge: se aceptan como resueltos cuando el participante entrega una
respuesta estructurada, útil y sin datos personales sensibles.

> 📄 **Texto completo listo para publicar:** ver [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md)
> (cuerpo de cada issue, plantillas de respuesta y checklist de publicación). Los aprendizajes
> agregados se vacían en [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md).

**Principio privacy-first:** no pedir ni aceptar nombres reales, teléfonos, direcciones, wallets,
llaves privadas, documentos, comprobantes, hashes de transacción ni información financiera.
**No se piden montos de dinero** (ni siquiera en rangos): nada de ingresos, saldos ni tamaños de
transacción. Las respuestas usan solo país/región general y relatos anonimizados.

### Issues iniciales sugeridos

1. **Market validation: contexto de cash-out**
   - Objetivo: entender si convertir saldo digital/remesa/cripto a efectivo es un problema real.
   - Respuestas esperadas: país o región general, frecuencia aproximada, método actual, principal
     fricción (comisión, tiempo, confianza, liquidez, seguridad). Sin montos.
   - Aceptación: respuesta completa sin datos sensibles y etiquetada para análisis agregado.

2. **Market validation: contexto de cash-in / depósito**
   - Objetivo: entender si ingresar efectivo a una wallet/saldo digital resuelve un dolor real.
   - Respuestas esperadas: caso de uso, método actual, frecuencia, barreras de confianza y
     disponibilidad de agentes/comercios. Sin montos.
   - Aceptación: respuesta completa sin datos sensibles y etiquetada para análisis agregado.

3. **Market validation: perspectiva de proveedor de liquidez**
   - Objetivo: validar si un usuario/comercio aceptaría operar como proveedor de liquidez (app
     agnóstica de rol, D-2).
   - Respuestas esperadas: tipo de comercio general, país/región, motivación, riesgos percibidos,
     comisión esperada (en %) y condiciones para confiar. Sin montos.
   - Aceptación: respuesta completa sin datos sensibles y etiquetada para análisis agregado.

4. **Product validation: onboarding de wallet no-custodial**
   - Objetivo: validar si el usuario entiende crear/importar wallet y la responsabilidad de backup.
   - Respuestas esperadas: claridad del flujo, dudas, miedos, qué texto o paso generaría confianza,
     preferencia entre crear wallet e importar clave.
   - Aceptación: feedback accionable sin compartir claves, direcciones personales ni capturas con
     datos sensibles.

5. **Product validation: confianza en flujo cash-in/cash-out**
   - Objetivo: validar si el usuario confiaría en elegir un agente, ver comisión, usar QR/recibo y
     completar la operación.
   - Respuestas esperadas: puntos de confianza/desconfianza, información mínima que necesita ver,
     señales de comercio verificado, soporte esperado y razones para abandonar el flujo.
   - Aceptación: feedback accionable sin datos sensibles y con etiquetas de fricción/confianza.

### Etiquetas — cómo publicarlos en Drips

> Estos 5 **SÍ se publican como issues de Drips**: usar Drips es la ventaja (la comunidad hace el
> trabajo y se le reconoce). No usan PR ni merge — se cierran cuando el participante entrega la
> respuesta estructurada que pide el criterio de aceptación. Eso es lo que los saca de "vague
> strategy work": cada issue tiene un **entregable concreto y verificable**, no una pregunta abierta.
>
> ⚠️ Los labels propuestos originalmente (`validation:*`, `persona:*`, `country:*`, `pain:*`,
> `amount:*`, `frequency:*`) **NO existen en el repo** y no se deben inventar issue por issue.
> En su lugar, crear **un solo label nuevo de forma deliberada** y documentarlo en
> `DRIPS_TEAM_GUIDE.md` **antes** de abrir los issues:
> - **`research`** (nuevo) — marca issues de validación de mercado/usuario sin código.
>
> Cada uno de los 5 issues lleva: `research` · track **`wave:docs`** · `complexity: low` ·
> `Stellar Wave`. Cero labels que no existan en el repo.

### Cierre y síntesis

Cada issue individual se puede cerrar cuando la respuesta esté registrada y etiquetada. Los
aprendizajes se deben resumir de forma agregada (por ejemplo en `docs/VALIDATION_DRIPS.md`) sin
copiar datos personales ni detalles que identifiquen a participantes.

---

## 8. Backend readiness para servidor

El backend tiene buen esqueleto para operar en servidor (`PORT`, `DATABASE_URL`, `/health`, logs,
CORS para Capacitor y `listen` en `0.0.0.0`), pero **todavía no está listo para hostear como
servicio real**. La verificación `cd micopay/backend && npm run build` falla actualmente con errores
de TypeScript, por lo que el primer objetivo es volverlo deployable antes de exponerlo.

### Issues iniciales sugeridos

1. **Backend deploy blocker: `npm run build` debe pasar**
   - Evidencia: `tsc` falla por imports faltantes en `src/index.ts`, config de event listener no
     declarada, `sendTradeNotificationToMerchant` sin import, referencias a `query` sin definición
     y un test con comparación literal inválida.
   - Aceptación: `npm run build` pasa en `micopay/backend` sin errores TypeScript.

2. **Backend production config: fallar fuerte si faltan secretos reales**
   - Problema: `JWT_SECRET` cae a `dev_jwt_secret`; producción no debe arrancar con secretos demo.
   - Aceptación: con `NODE_ENV=production`, el backend falla si faltan `DATABASE_URL`, `JWT_SECRET`,
     `SECRET_ENCRYPTION_KEY` y las variables Stellar requeridas para el modo elegido.

3. **Backend persistence: desactivar fallback in-memory en producción**
   - Problema: `src/db/schema.ts` puede caer a almacenamiento en memoria si PostgreSQL no está
     disponible. Eso es útil en demo/dev, pero peligroso en servidor real.
   - Aceptación: en producción, si PostgreSQL no conecta, el proceso falla y `/health` no reporta
     servicio sano. El fallback in-memory queda limitado a development/test.

4. **Backend seed data: no sembrar datos demo en producción**
   - Problema: `seedData()` inserta usuarios/trades demo al arrancar si no hay trades.
   - Aceptación: el seed solo corre con flag explícito (`SEED_DEMO_DATA=true`) y nunca por default
     en producción.

5. **Backend deploy artifact: Dockerfile o guía de despliegue reproducible**
   - Problema: no hay Dockerfile/compose/Procfile ni README operativo de despliegue.
   - Aceptación: existe una ruta documentada para levantar el backend con Node + Postgres, variables
     requeridas, build, start, health check y estrategia de logs.

6. **Backend database schema/migrations reproducibles**
   - Problema: no hay flujo claro de migraciones para crear/actualizar tablas en un servidor nuevo.
     Además, **`sql/init.sql` está malformado**: la tabla `users` tiene columnas duplicadas/mezcladas
     (dos bloques de definición pegados, líneas ~14–25) y el archivo **define `audit_log` dos veces**
     con esquemas distintos (líneas ~32 y ~104). Un servidor nuevo no puede provisionar schema con
     este archivo tal cual.
   - Aceptación: un servidor vacío puede provisionar schema de forma reproducible antes de arrancar
     la app, sin depender de estado local o inserts manuales. `sql/init.sql` corregido: `users` con
     una sola definición coherente y `audit_log` declarada una sola vez (separar el audit de trades
     del audit general si se necesitan ambos).

7. **Backend health/readiness real**
   - Problema: `/health` existe, pero debe distinguir proceso vivo vs servicio listo.
   - Aceptación: health/readiness valida conexión a DB, configuración crítica y estado del listener
     si está habilitado, sin exponer secretos.

---

## 9. Preguntas abiertas para el revisor (Codex)

### Decisiones cerradas por el equipo (2026-06-23)

- **D-1 · Dos dispositivos, transacción real.** Wave 6 abandona el demo de un solo teléfono. El
  objetivo es una transacción real entre dos celulares. Esto convierte **P0-1 y P0-2 en "ahora"**,
  no "después".
- **D-2 · App agnóstica de rol: todos pueden ser proveedores de liquidez.** No hay "rol
  comerciante" como modo o app separada. Es la misma identidad (un usuario, una wallet por
  dispositivo) que, según la operación, actúa como cliente o como proveedor de liquidez y cobra
  comisión. **Esto define el alcance de P0-1:** una sola identidad por dispositivo; el lado
  "comerciante" no se auto-crea ni vive en otra app — es el mismo usuario eligiendo poner liquidez.
- **D-3 · DeFi (CETES/Blend) fuera de alcance en Wave 6.** No se cablea contra protocolos reales.
  Se mantiene como está pero **etiquetado claramente como "simulado"** en la UI (cierra P2-2 por
  ahora con la opción de etiquetado).
- **D-4 · KYC por niveles (tiered), compatible con privacy-first.** Hoy el registro NO tiene KYC:
  `Register.tsx` solo pide un alias (3–30 chars) y genera el keypair en el dispositivo; la tabla
  `users` tiene `phone_hash` pero **no se recolecta en ningún lado**. Para Wave 6 esto basta. La
  estrategia acordada es escalonada:
  - **Nivel 0 (hoy):** alias + wallet no-custodial. Suficiente para montos chicos / demo real
    entre dos celulares. Es el alcance de Wave 6.
  - **Nivel 1:** verificación de **teléfono** (recién aquí se usa el `phone_hash` ya presente en la
    tabla) para subir límites.
  - **Nivel 2:** KYC formal (documento) **solo** al superar umbrales de monto, con consentimiento
    explícito. Es el único nivel que toca datos personales.

  Implicación para Wave 6: **no se implementa KYC todavía**, pero el registro mínimo debe quedar
  bien hecho (alias + **respaldo de clave obligatorio** durante el alta — ver pregunta 3 pendiente).
  El KYC real se vuelve obligatorio cuando el monto/volumen dispare regulación AML.

### Pendientes por resolver

1. Confirmado: MicoPay es no-custodial. ¿Cuál será el endpoint oficial para consultar el saldo
   de la dirección Stellar del usuario autenticado?
2. ¿El onboarding oficial debe ofrecer dos caminos desde el inicio ("crear wallet" e "importar
   clave Stellar") o dejamos importar clave solo desde Perfil por ahora?
3. ¿Qué nivel de backup exigimos al crear wallet? Hoy se puede exportar la clave desde Perfil,
   pero no hay paso obligatorio de respaldo durante alta.






