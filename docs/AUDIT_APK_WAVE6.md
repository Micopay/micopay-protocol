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

**✅ Bloqueante #0 resuelto (2026-06-25):** `npm run build` en `micopay/backend` pasa limpio.
CI gate en `.github/workflows/ci.yml` bloquea merges si backend o frontend rompen. El stack
es ahora deployable. Los P0 de frontend son el siguiente foco.

| Nivel | # | Tema |
|------|---|------|
| ~~🔴 B-1~~ | ~~1~~ | ~~**Backend no compila**~~ → ✅ **Resuelto 2026-06-25** |
| ~~🟡 P2-1~~ | ~~1~~ | ~~**Sin CI gate**~~ → ✅ **Resuelto 2026-06-25** |
| 🔴 P0 | 4 | Identidad doble, trade contra sí mismo, balance falso, fetch roto en APK |
| 🟠 P1 | 4 | UI descarta datos reales (mapa, economía de oferta, nombres, tipo de cambio) |
| 🟡 P2 | 1 | Config de release APK (P2-3) — DeFi simulado etiquetado ✅, CI ✅ |
| ~~⚠️ B pendiente~~ | ~~3~~ | ~~B-3, B-4, B-7~~ → ✅ **Resueltos 2026-06-28** (hardening backend interno) |

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

### ~~P0-4 · Fetch con ruta relativa roto dentro del APK~~ ✅ Resuelto
- **Resuelto por:** [@josealfredo79](https://github.com/josealfredo79) · **Issue:** #150 · **PR:** #154 · **Mergeado:** 2026-06-25
- ~~`fetch('/api/merchants/me/trades?state=pending')` con ruta relativa roto en Capacitor~~
- **Fix:** reemplazado con `getMerchantTrades(merchantToken, 'pending')` del cliente axios. Se creó
  `Home.test.tsx` desde cero con 5 casos cubriendo args correctos, token nulo, badge, estado vacío y error.

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

### ~~P1-2 · El mapa muestra pines inventados, no los comercios reales~~ ✅ Resuelto
- **Resuelto por:** [@Gozirimdev](https://github.com/Gozirimdev) · **Issue:** #152 · **PR:** #156 · **Mergeado:** 2026-06-25
- ~~3 pines fijos hardcodeados en `MapSim.tsx`~~
- **Fix:** `getMerchantPins(merchants)` proyecta `lat/lng` reales de la API a posiciones CSS,
  con clamp al rango 12–88% para mantenerlos dentro del viewport.

### P1-3 · Nombres de agente hardcodeados en el recibo → 📎 plegado a #160
- **Archivo:** `micopay/frontend/src/App.tsx:366`
- **Qué pasa:** `agentName={flow === 'cashout' ? 'Farmacia Guadalupe' : 'Tienda Don Pepe'}`.
- **Estado (2026-06-27):** parcialmente preparado — el recibo ya hace `fetchTradeDetail` y guarda
  `seller_username` en el estado `sellerUsername` (`App.tsx:302,316`), **pero esa variable nunca se
  lee**: `agentName` sigue hardcodeado. Falta cablear `agentName={sellerUsername ?? fallback}`
  (literal solo para `IS_DEMO_MODE`).
- **Decisión:** como toca `App.tsx` (mismo archivo que el epic P0-1/P0-2), **se pliega a #160** en
  vez de abrir issue aparte, para mantener `App.tsx` como un solo escritor y evitar conflictos.
- **Criterio de aceptación:** el recibo muestra el `seller_username` real del trade.

### ~~P1-4 · Tipo de cambio XLM→MXN hardcodeado~~ ✅ Resuelto
- **Resuelto por:** [@josealfredo79](https://github.com/josealfredo79) · **Issue:** #161 · **PR:** #162 · **Mergeado:** 2026-06-25
- ~~`parseFloat(...) * 20` fijo ("demo rate")~~
- **Fix:** nuevo `GET /rate/xlm-mxn` en `routes/rate.ts` llama a CoinGecko (free, sin API key,
  timeout 5 s, 503 si upstream falla). Frontend usa `getXlmMxnRate()` con `useEffect` cancelable;
  muestra `"—"` mientras carga y `~×20` con tilde si hay error.
- ⚠️ **Follow-up pendiente (P2-4):** el endpoint no tiene caché — cada render de Home dispara
  una llamada a CoinGecko. Ver §5 P2-4.

---

## 5. Hallazgos P2 — Endurecimiento de release

### ~~P2-1 · Sin gate de CI (riesgo de regresión)~~ ✅ Resuelto
- **Resuelto:** 2026-06-25 · `.github/workflows/ci.yml`
- Corre `npm run build` en backend y `tsc + vite build` en frontend en cada PR a `main`.
  `vitest` en modo informativo (`continue-on-error: true`) hasta que P0/P1 estabilicen los tests.

### ~~P2-2 · DeFi (CETES / Blend) totalmente simulado~~ ✅ Resuelto (etiquetado)
- **Resuelto:** 2026-06-27 · PR [#178](https://github.com/ericmt-98/micopay-protocol/pull/178) (Blend) — CETES ya etiquetaba.
- **Decisión aplicada (D-3):** DeFi se mantiene simulado y se **etiqueta explícitamente** en la UI; no
  se cablea contra protocolos reales en Wave 6.
- **Fix:** `CETESScreen.tsx:216` muestra "¡Prueba simulada!"; `BlendScreen.tsx` pasó de "¡Prueba
  exitosa!" (ambiguo) a "¡Prueba simulada!" + caption "Demostración — no se movieron fondos reales
  on-chain.". Persiste el feature-gate `showDefi={!isDemoMode || !isMockStellar}`.
- **Criterio de aceptación:** ✅ ningún flujo presenta una transacción simulada como real sin
  etiqueta visible.

### ~~P2-4~~ · ~~`/rate/xlm-mxn` sin caché — riesgo de rate-limit CoinGecko~~ → ✅ **Resuelto 2026-06-26**
- **Resuelto por:** [@josealfredo79](https://github.com/josealfredo79) · **PR:** [#172](https://github.com/ericmt-98/micopay-protocol/pull/172)
- **Solución:** caché module-level con TTL de 60 s, fallback `stale: true` si CoinGecko falla con valor previo en caché, 503 solo si no hay caché. Tests en `rateCache.test.ts` (5 escenarios).

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
| ~~B-1~~ | ~~Backend `npm run build` debe pasar~~ | — | — | — | — | ✅ **Resuelto 2026-06-25** — build pasa limpio |
| ~~P2-1~~ | ~~CI gate: tsc + vite build + backend build~~ | — | — | — | — | ✅ **Resuelto 2026-06-25** — `.github/workflows/ci.yml` |
| ~~B-2~~ | ~~Config prod fail-fast si faltan secretos~~ | — | — | — | — | ✅ **Resuelto 2026-06-25** — `validateConfig()` lanza y crashea |
| ~~B-6~~ | ~~Migraciones reproducibles + fix `init.sql`~~ | — | — | — | — | ✅ **Resuelto 2026-06-25** — `init.sql` eliminado, schema en código |
| P0-1 | Una sola identidad por dispositivo | `wave:frontend` | `wave:trust` | high | ✅ | Unir con P0-2 (mismo rediseño) |
| P0-2 | Trade contra contraparte real | `wave:frontend`,`wave:backend` | `wave:retail` | high | ✅ | Depende de P0-1 |
| ~~P0-4~~ | ~~Fix fetch relativo en APK~~ | — | — | — | — | ✅ **Resuelto** — issue #150 cerrado, PR #154 mergeado |
| P0-3 | Saldo real de la wallet del usuario | `wave:frontend`,`wave:backend` | `wave:retail` | medium | ✅ | Depende de P0-1 |
| P0-5 | Onboarding mínimo: alias + respaldo de clave obligatorio (KYC Nivel 0) | `wave:frontend` | `wave:trust` | medium | ✅ | Sienta base para KYC por niveles (D-4) · pendiente pregunta 3 §9 |
| ~~P1-2~~ | ~~Mapa grafica comercios reales~~ | — | — | — | — | ✅ **Resuelto** — PR #156 · @Gozirimdev |
| P1-1 | ExploreMap usa economía real | `wave:frontend` | `wave:retail` | medium | ✅ | Issue #151 publicado, abierto sin asignar |
| P1-3 | Nombre real del agente en recibo | `wave:frontend` | `wave:retail` | low | ✅ | 📎 **Plegado a #160** — `seller_username` ya se fetchea, falta cablear `agentName`; mismo `App.tsx` que P0-1/P0-2 |
| ~~P1-4~~ | ~~Tipo de cambio XLM→MXN real~~ | — | — | — | — | ✅ **Resuelto** — PR #162 · @josealfredo79 · follow-up: P2-4 caché |
| ~~P2-4~~ | ~~Caché en-memoria para `/rate/xlm-mxn`~~ | — | — | — | — | ✅ **Resuelto** — PR #172 · @josealfredo79 |
| ~~B-3~~ | ~~Desactivar fallback in-memory en prod~~ | — | — | — | — | ✅ **Resuelto 2026-06-28** — `initPg()` hace `process.exit(1)` en prod si PG no conecta (salvo `ALLOW_IN_MEMORY_DB=true`) |
| ~~B-4~~ | ~~No sembrar datos demo en prod~~ | — | — | — | — | ✅ **Resuelto 2026-06-28** — `seedData()` solo corre con `SEED_DEMO_DATA=true` |
| ~~B-7~~ | ~~Health/readiness real (DB + config)~~ | — | — | — | — | ✅ **Resuelto 2026-06-28** — `/health` hace ping real `SELECT 1` (`pingDb()`); 503 en prod si DB caída |
| ~~P2-2~~ | ~~Etiquetar DeFi como simulado~~ | — | — | — | — | ✅ **Resuelto** — etiquetado CETES + Blend (PR #178, D-3); issue #86 (wave anterior) |
| ~~P2-3~~ | ~~Config de release APK~~ | — | — | — | — | Cerrado como issue #89 (wave anterior) |

**Tratamiento especial:**
- **B-5 (Dockerfile/guía de deploy)** → trabajo interno de maintainer/integrator. Roza Risk
  Controls de la guía ("no exponer credenciales de deploy en Waves tempranas"). No publicar como
  issue de contribuidor Drips; manejarlo internamente.
- **§7 validación de mercado/producto (10 issues: V-1…V-10)** → publicados como issues de Drips en
  el milestone *Wave 6: Market & User Validation* (#18). **Entrega por PR** (el asignado agrega su
  sección en `VALIDATION_DRIPS.md`), experiencia propia (primera persona), un asignado por issue.
  Labels: `research` · `wave:docs` · `complexity: low` · `Stellar Wave` (el label `research` ya está
  creado y documentado en `DRIPS_TEAM_GUIDE.md`). Índice: [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md).

| ID | Tema | Issue |
|----|------|-------|
| V-1 | Cash-out | #131 |
| V-2 | Cash-in / depósito | #132 |
| V-3 | Proveedor de liquidez | #133 |
| V-4 | Onboarding no-custodial | #134 |
| V-5 | Confianza en el flujo | #135 |
| V-6 | Remesas | #138 |
| V-7 | Alternativas y switching | #139 |
| V-8 | Comisión justa | #140 |
| V-9 | Seguridad en persona | #141 |
| V-10 | Recurrencia y descubrimiento | #142 |

### 6.3 Orden recomendado de publicar → asignar → mergear

**Etapa 0 — Desbloqueo (interno) ✅ COMPLETA:**
1. ~~**B-1**~~ ✅ backend build verde.
2. ~~**P2-1**~~ ✅ CI gate `.github/workflows/ci.yml`.

**Etapa 1 — Núcleo "un usuario real, una transacción real" (P0):** 🔄 En curso
3. **P0-1 + P0-2** (issue #160, asignado en Drips) — en curso.
4. ~~**P0-4**~~ ✅ PR #154 · @josealfredo79.
5. **P0-3** — espera a que P0-1 aterrice.
6. **P0-5** — espera resolución §9.3 (nivel de backup obligatorio).

**Etapa 2 — "la UI deja de mentir" (P1):** 🔄 Parcialmente completa
7. ~~**P1-2**~~ ✅ PR #156 · @Gozirimdev. **P1-1** (issue #151, abierto sin asignar).
8. ~~**P1-4**~~ ✅ PR #162 · @josealfredo79. **P1-3** espera P0-2. ~~**P2-4**~~ ✅ PR #172 · @josealfredo79.

**Etapa 3 — Backend hardening (interno):** ✅ COMPLETA
9. ~~**B-3, B-4, B-7**~~ ✅ resueltos 2026-06-28. ~~B-2~~✅ ~~B-6~~✅

**Etapa 4 — Decisiones de producto / release:**
10. ~~**P2-2**~~ ✅ etiquetado simulado (PR #178). **P2-3** (config de release APK) sigue pendiente.

**Etapa paralela — Research (V-1…V-15):** 🔄 14/15 completas
- ~~V-1~~✅ ~~V-2~~✅ ~~V-3~~✅ ~~V-4~~✅ ~~V-5~~✅ ~~V-6~~✅ ~~V-7~~✅ ~~V-8~~✅ ~~V-9~~✅ ~~V-10~~✅
- ~~V-11~~✅ ~~V-12~~✅ ~~V-13~~✅ ~~V-14~~✅ **V-15**🔴 (único pendiente; issues #164–#168 publicados 2026-06-25)

### 6.4 Política de asignación y merge (de `DRIPS_TEAM_GUIDE.md`)

- **Owners internos por track antes de abrir:** retail (P0-1/2/3, P1-*), trust/backend (B-*),
  DX/docs (P2-1).
- **SLA:** primera review < 24 h; respuesta a aplicación el mismo día.
- **`wave:needs-product`** en P0-1, P0-3: no asignar a contribuidor hasta cerrar §9. (P2-2 ya resuelto.)
- **Regla de merge:** B-1 y P2-1 NO se entregan a Drips — son Etapa 0 interna. Lo demás se mergea
  por etapas; dentro de una etapa, lo independiente puede ir en cualquier orden.
- **`complexity: high`** (B-1, P0-1, P0-2): reservar para contribuidores con contexto o tomar
  internamente; la guía pide usar `high` con moderación y solo si es mergeable dentro de la Wave.

---

## 7. Validación DRIPs inicial (mercado + producto)

Además de corregir P0/P1, Wave 6 debe validar si MicoPay hace sentido para usuarios reales en
su país/contexto. Hay **10 issues de validación publicados (V-1…V-10)** en el milestone
*Wave 6: Market & User Validation* (#18). **Entrega por PR** (no comentario): el asignado agrega su
sección `### V-X` en `VALIDATION_DRIPS.md`. Experiencia **propia** (primera persona); un asignado por issue.

> 📄 **Índice y reglas:** [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md). Síntesis
> agregada para la SDF: [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md).

**Principio privacy-first:** no pedir ni aceptar nombres reales, teléfonos, direcciones, wallets,
llaves privadas, documentos, comprobantes, hashes de transacción ni información financiera.
**No se piden montos de dinero** (ni siquiera en rangos): nada de ingresos, saldos ni tamaños de
transacción. Las respuestas usan solo país/región general y relatos anonimizados.

### Los 10 issues (publicados, milestone #18)

| ID | Tema | Issue | Qué valida (SDF) | Estado |
|----|------|-------|------------------|--------|
| V-1 | Cash-out | #131 | Demanda (digital → efectivo) | ✅ PR #155 · @larryjay007 |
| V-2 | Cash-in / depósito | #132 | Demanda bidireccional | ✅ PR #159 · @Truphile |
| V-3 | Proveedor de liquidez | #133 | Oferta | ✅ PR #169 · @DevSolex |
| V-4 | Onboarding no-custodial | #134 | Stellar self-custody usable | ✅ PR #157 · @Shadow-MMN |
| V-5 | Confianza en el flujo | #135 | Confianza / PMF | ✅ PR #158 · @Truphile |
| V-6 | Remesas (receptor) | #138 | Demanda cross-border lado receptor | ✅ PR #146 · @KaruG1999 |
| V-7 | Alternativas y switching | #139 | Diferenciación | ✅ PR #145 · @barnabasolutayo-lgtm |
| V-8 | Comisión justa | #140 | Economía unitaria (% sin montos) | ✅ PR #148 · @rosemary21 |
| V-9 | Seguridad en persona | #141 | De-risk P2P | ✅ PR #147 · @deep-bhikadiya |
| V-10 | Recurrencia y descubrimiento | #142 | Retención / PMF | ✅ PR #143 · @attyolu |
| V-11 | Transacción fallida / disputa | #164 | Confianza — recuperación tras fallo | ✅ Integrado PR #174 · @Chigybillionz |
| V-12 | Vivir sin cuenta bancaria | #165 | Demanda — usuarios sin banco | ✅ PR #173 · @Oluwasuyi-Timilehin |
| V-13 | Remesas (emisor) | #166 | Demanda + diferenciación lado emisor | ✅ Integrado PR #171 · @Jo-anny |
| V-14 | Mental model peso digital / stablecoin | #167 | Capa stablecoin de Stellar | ✅ Integrado PR #175 · @Max-Owolabi |
| V-15 | Umbral de primera vez | #168 | PMF — barrera de primera adopción | 🔴 Abierto — único pendiente |

Las preguntas completas (en primera persona) viven en cada issue.

### Etiquetas y entrega

> Publicados como issues de Drips (la comunidad hace el trabajo y se le reconoce). **Entrega por
> PR**, no comentario: el bot de Drips rastrea PRs, lo que deja al contribuidor aplicar a más
> issues mientras se revisa el suyo. El label **`research`** ya está creado y documentado en
> `DRIPS_TEAM_GUIDE.md`. Cada issue lleva: `research` · `wave:docs` · `complexity: low` ·
> `Stellar Wave`.

### Cierre y síntesis

Cada issue se cierra al mergear el PR de su asignado (primera persona, sin datos sensibles). Los
aprendizajes se resumen de forma agregada y anónima en `docs/VALIDATION_DRIPS.md`, sin copiar
datos personales ni detalles que identifiquen a participantes.

---

## 8. Backend readiness para servidor

> **Actualización 2026-06-28:** B-1, B-2, B-6 y P2-1 resueltos; **B-3, B-4 y B-7 también resueltos
> (hardening backend interno)**. Solo queda B-5 (Dockerfile/guía de deploy), que se trata
> internamente. El backend interno ya no tiene pendientes de readiness.

### Estado de los issues internos (verificado 2026-06-28)

| ID | Título | Estado | Evidencia |
|----|--------|--------|-----------|
| **B-1** | Backend `npm run build` debe pasar | ✅ **Resuelto** | `cd micopay/backend && npm run build` → exit 0 sin errores TypeScript |
| **P2-1** | CI gate: tsc + vite build + backend build | ✅ **Resuelto** | `.github/workflows/ci.yml` bloquea merge si backend o frontend no buildean; tests en modo informativo mientras P0/P1 se estabilizan |
| **B-2** | Config prod fail-fast si faltan secretos | ✅ **Resuelto** | `validateConfig()` en `src/config.ts:92` lanza error y `start()` crashea via `process.exit(1)` si faltan `DATABASE_URL`, `SECRET_ENCRYPTION_KEY` o variables Stellar en modo real |
| **B-6** | Migraciones / `init.sql` duplicado | ✅ **Resuelto** | `sql/init.sql` eliminado; schema vive en `src/db/schema.ts`; la tabla duplicada y el `audit_log` doble ya no existen |
| **B-5** | Dockerfile / guía de deploy | — | Trabajo interno de maintainer; no se publica como issue Drips |
| **B-3** | Desactivar fallback in-memory en prod | ✅ **Resuelto** | `initPg()` (`src/db/schema.ts`): si PG no conecta y `config.isProduction`, hace `console.error` + `process.exit(1)`; el fallback in-memory solo se permite con `ALLOW_IN_MEMORY_DB=true` (opt-in explícito, ya no silencioso). Verificado: `NODE_ENV=production` sin DB → exit 1 |
| **B-4** | No sembrar datos demo en producción | ✅ **Resuelto** | `start()` (`src/index.ts`) solo llama `seedData()` si `config.seedDemoData` (`SEED_DEMO_DATA === 'true'`); si no, loguea que se omite. DB de producción nueva ya no se siembra |
| **B-7** | Health/readiness real | ✅ **Resuelto** | nuevo `pingDb()` hace `SELECT 1` real contra el pool; `/health` lo expone como `dbConnected` y responde **503** en producción si la DB está caída (readiness probe real), además de los checks de config previos |

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






