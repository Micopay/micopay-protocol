# Plan — poner el repo en orden y abrir Drips a asignación

**Fecha:** 2026-08-25
**Ejecutor previsto:** agente Sonnet, con validación de Eric en los puntos 🔒
**Objetivo:** desbloquear `main`, cerrar la deuda de PRs, dejar los issues de Drips en estado asignable.

---

## Por qué existe este plan

`main` está en mal estado y tres contribuidores llevan semanas esperando:

| Hecho | Verificado el 2026-08-25 contra `origin/main` |
|---|---|
| `main` apunta al backend apagado | `.env.testnet` → `VITE_API_URL=https://micopay-api.onrender.com` |
| `POST /users/register` no exige firma | `routes/users.ts` acepta `stellar_address` + `username` y nada más. Cualquiera registra una dirección que no controla |
| `/merchants/available` sin rate-limit | `routes/merchants.ts:59` — comentario propio: "stays unauthenticated" |
| IDOR en `/defi/ramp/order` sin corregir | el fix vive solo en `feat/map-real` |
| 3 PRs de contribuidores esperando | #352 (2 ago), #353 (3 ago), #354 (11 ago) — los tres `MERGEABLE` |
| El PR que traía los arreglos está atascado | #344, abierto el 27 jul, `CONFLICTING`, 62 archivos, `main` avanzó 44 commits desde entonces |

**La causa de todo:** los cuatro arreglos de seguridad viajan dentro de #344, que no entra por su tamaño. Sacarlos de ahí desbloquea el resto.

### Lo que ya se probó, no se supone

Cada commit crítico se aplicó sobre `origin/main` en un árbol de trabajo aislado:

| Commit | Qué trae | Resultado del cherry-pick |
|---|---|---|
| `8108aeb` | endpoint → `api.micopay.app` | **limpio** |
| `34a4b23` | IDOR `/defi/ramp/order` | **limpio** |
| `72b4497` | prueba de posesión de llave al registrar | 2 bloques en `backend/src/routes/auth.ts`, 1 en `frontend/src/services/api.ts` |
| `db7455b` | rate-limit `/merchants/available` | 1 bloque en `backend/package.json` |

Cuatro bloques de conflicto en total. No 62 archivos.

---

## Reglas para el ejecutor

1. **No mergees nada a `main`.** Prepara ramas y abre PRs; el merge lo hace Eric.
2. **No cierres ni edites PRs de contribuidores** (#352, #353, #354). Solo comenta si el plan lo pide.
3. **Nunca commitees** `keystore.properties`, `*.jks` ni `.env`. Verifica con `git status` antes de cada commit.
4. **Verifica siempre contra `origin/main`**, no contra el árbol local ni contra `feat/map-real`. Usa `git show origin/main:<ruta>`. Haz `git fetch origin` antes de empezar cada fase.
   > Este es el error que provocó medio desastre: la auditoría previa se validó contra una rama 44 commits atrasada, y publicó issues con líneas equivocadas y trabajo duplicado.
5. **Un commit por tarea**, con el ID en el mensaje.
6. `npx tsc --noEmit` en 0 antes de cada commit del frontend.
7. Trabaja en árboles aislados: `git worktree add`. No cambies de rama en el árbol principal.
8. Si una verificación falla y no sabes por qué, **detente y reporta**. No improvises.
9. **Gradle necesita JDK 17+.** El `java` del PATH es Java 8. Usa:
   `JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew <tarea>`

---

## Fase A — Sacar los arreglos de seguridad de #344

Tres PRs pequeños contra `main`. Es lo que desbloquea todo lo demás.

### A-1 · PR "endpoint AWS + IDOR ramp" (sin conflictos)

```bash
git fetch origin
git worktree add -b fix/aws-endpoint-and-ramp-idor <ruta-temporal> origin/main
cd <ruta-temporal>
git cherry-pick 8108aeb 34a4b23
```

Ambos aplican limpios (verificado). Comprobar antes de abrir el PR:

```bash
git show HEAD~1 --stat          # 8108aeb
git show HEAD --stat            # 34a4b23
grep VITE_API_URL micopay/frontend/.env.testnet   # debe decir api.micopay.app
cd micopay/backend && npm ci && npm run build     # debe pasar
```

Abrir PR con título `fix: point builds at api.micopay.app and close ramp order IDOR`, cuerpo en inglés explicando que ambos venían de #344 y que se extraen porque ese PR lleva un mes bloqueado.

**Criterio de terminado:** PR abierto, `MERGEABLE`, CI en verde.

### A-2 · PR "prueba de posesión de llave al registrar" 🔒

```bash
git worktree add -b fix/register-key-possession <ruta> origin/main
cd <ruta>
git cherry-pick 72b4497     # va a conflictar
```

Tres bloques a resolver:

- `micopay/backend/src/routes/auth.ts` — 2 bloques
- `micopay/frontend/src/services/api.ts` — 1 bloque

**Esto no es mecánico.** `main` ganó 44 commits sobre autenticación (`#319` phone_hash, `#322` KYC caps, `#328` delegated signing). Resolver el conflicto es decidir cómo convive el reto de firma con lo que ya hay.

Reglas para resolverlo:
- **No borres** el manejo de `phone_hash` que `main` añadió en `/users/register`.
- **No borres** el pruning de challenges (`_challengePruneInterval` en `auth.ts`), que vino del fix de fugas de memoria `#341`.
- El objetivo es que `POST /users/register` exija `challenge` + `signature` **además** de lo que ya pide.
- Añade un test que compruebe que un registro sin firma válida es rechazado.

🔒 **Punto de parada.** Explica a Eric cada decisión de resolución antes de abrir el PR. Toca autenticación; no vale con que compile.

### A-3 · PR "rate-limit en discovery"

```bash
git worktree add -b fix/discovery-rate-limit <ruta> origin/main
cd <ruta>
git cherry-pick db7455b     # 1 bloque en micopay/backend/package.json
```

El conflicto en `package.json` es casi seguro una dependencia añadida en ambos lados. Resuélvelo conservando **las dos** listas de dependencias y corre `npm install` para regenerar el lock.

**Criterio:** `/merchants/available` responde 429 al superar el límite; test que lo demuestre.

### A-4 · Actualizar #344

Comentar en #344 que A-1, A-2 y A-3 extraen los arreglos de seguridad y el cambio de endpoint, y que el PR se queda con el trabajo de mapa. **No lo cierres** — es decisión de Eric si se rebasa o se rehace.

---

## Fase B — Desbloquear a los contribuidores 🔒

Tres PRs esperando entre dos y tres semanas, con un SLA prometido de 24 h en `CONTRIBUTING.md`.

| PR | Autor | Qué hace | Estado |
|---|---|---|---|
| #353 | waterWang | SEC-05 · cifra la llave en localStorage con WebCrypto AES-GCM | 1 archivo, `MERGEABLE` |
| #352 | waterWang | SEC-25 · sustituye el portapapeles por QR | 7 archivos, `MERGEABLE`, ya cableado en `Profile.tsx:481` de `main` |
| #354 | vallejoraul08 | SEC-02 · claim token opaco, endpoint de tasa, countdown | 28 archivos, `MERGEABLE` |

**Orden recomendado:** #353 → #352 → #354. De menor a mayor superficie, para que los conflictos los absorba el más grande.

El ejecutor **revisa y reporta**; no mergea. Para cada uno: leer el diff, correr los tests, y decir si hay algo que objetar.

**Al mergear #352, cerrar #348.** Al mergear #354, cerrar #356 y #357 (ver Fase D).

---

## Fase C — Reconciliar `fix/auditoria-apk-2026-08`

La rama de la auditoría del APK sale de `feat/map-real` y hereda su atraso. Once commits, ya pusheada.

### C-1 · Descartar el trabajo duplicado

**#352 resuelve el portapapeles mejor y llegó antes.** De la Fase 3 de aquella auditoría:

| Pieza | Destino |
|---|---|
| `src/components/SecretKeyBackupModal.tsx` | **descartar** — #352 lo cubre con QR |
| cambios en `Profile.tsx` / `Register.tsx` sobre el modal | **descartar** |
| `SecureScreenPlugin.java` + `src/lib/secureScreen.ts` | **conservar** — complementa a #352, un QR en pantalla también se fotografía |
| fix de `setBackupConfirmed()` incondicional | **conservar** — defecto distinto, #352 no lo toca |
| `SEC-33` | **fusionar con SEC-25**, no duplicar numeración |

### C-2 · Rebasar sobre `main`

Una vez A-1 y A-2 estén dentro:

```bash
git fetch origin
git rebase origin/main fix/auditoria-apk-2026-08
```

Conflictos esperables en `services/api.ts` (lo tocan A-2 y #354) y `App.tsx` (#354).

### C-3 · Abrir el PR

Título: `fix: offline queue data loss, release signing, and Android hardening`. Lo que queda tras C-1:

- cola offline que descartaba cambios del comercio (contratos, enrutado por api.ts, cableado, encolado selectivo, 5 tests)
- `versionCode` dinámico por fecha
- permisos innecesarios retirados
- plugin `FLAG_SECURE` + fix de `setBackupConfirmed()`
- los documentos de auditoría y `SEC-32`

---

## Fase D — Dejar los issues de Drips asignables

Estado verificado el 2026-08-25 contra `origin/main`:

| Issue | Estado | Acción |
|---|---|---|
| #355 APK-1 · KYC navigation | válido | ninguna, asignable ya |
| #356 APK-2 · `Home.test.tsx` | `wave:blocked` | **cerrar** cuando #354 mergee |
| #357 APK-3 · `TradeDetail.test.tsx` | `wave:blocked` | **cerrar** cuando #354 mergee |
| #358 APK-4 · ABIs x86 | válido | ninguna, asignable ya |
| #359 APK-5 · botones muertos | válido | ninguna, asignable ya |
| #360 APK-6 · aria-labels | válido, roza #354 | quitar la nota de dependencia cuando #354 mergee |
| #348 SEC-25 | reabierto | **cerrar** cuando #352 mergee |

### D-1 · Reponer la puerta de entrada

Al cerrar #356 se pierde el issue `wave:good-first` más accesible. Queda solo #358, que exige entorno Android montado.

Proponer a Eric **uno o dos issues nuevos `complexity: low` + `wave:good-first`** que no necesiten toolchain nativo. Candidatos ya identificados en la auditoría y no publicados:

- retirar el avatar placeholder de `lh3.googleusercontent.com` en `Explore.tsx:24` (hoy va dentro de #360; se puede extraer)
- limpiar los módulos muertos: `offlineQueueManager` ya no lo estará, pero `DebugOverlay.tsx`, `CancelTradeDialog.tsx`, `MerchantUnavailableBanner.tsx` siguen sin referencias

🔒 Redactar y proponer; publicar lo decide Eric.

### D-2 · Higiene de issues duplicados

Tres registros del mismo tema del respaldo de llave: #257 (es, cerrado), #348 (en, reabierto), #330 (cerrado). Y #10 (aria-labels) cerrado como completado mientras el defecto persiste.

Proponer a Eric una limpieza: dejar #348 como el único vivo del portapapeles, y comentar en #10 apuntando a #360.

---

## Fase E — Documentación al día

### E-1 · `RELEASE_APK_CHECKLIST.md`

Su §2 dice de incrementar `versionCode` a mano. La rama de la auditoría lo automatiza por fecha (AAMMDDHH). Actualizar cuando C-3 mergee.

Su §5 tiene una lista de QA en dispositivo físico que nunca se corrió sobre el APK de release compilado el 2026-08-24. **Añadirla como tarea pendiente para Eric**, no ejecutable por el agente.

### E-2 · `STORE_COMPLIANCE.md`

`docs/README.md` lo marca como lectura obligatoria y la Fase 4 del plan de remediación se escribió sin consultarlo. **Leerlo y reconciliar** `docs/PLAN_REMEDIACION_APK_2026-08-24.md` §Fase 4 con lo que ya diga sobre requisitos de Google Play para apps financieras.

### E-3 · `docs/README.md`

No lista ninguno de los documentos nuevos (auditoría, plan de remediación, issues de Drips, este plan). Añadirlos al índice.

---

## Secuencia y dependencias

| Fase | Depende de | 🔒 Eric |
|---|---|---|
| A-1 endpoint + IDOR | — | merge |
| A-2 posesión de llave | — | resolución de conflicto + merge |
| A-3 rate-limit | — | merge |
| B #353, #352, #354 | — | merge de los tres |
| C-1 descartar duplicado | B (#352) | — |
| C-2 rebase | A-1, A-2 | — |
| C-3 PR de la auditoría | C-1, C-2 | merge |
| D issues de Drips | B (#352, #354) | publicar los nuevos |
| E documentación | C-3 | revisar |

A-1, A-2, A-3 y B son independientes entre sí y pueden ir en paralelo.

## Definición de terminado

- [ ] `git show origin/main:micopay/frontend/.env.testnet` dice `api.micopay.app`
- [ ] `POST /users/register` en `main` rechaza un registro sin firma válida, con test
- [ ] `/merchants/available` en `main` responde 429 al superar el límite, con test
- [ ] `/defi/ramp/order` en `main` valida pertenencia antes de exponer
- [ ] Cero PRs de contribuidores esperando más de 48 h
- [ ] #348 cerrado por #352
- [ ] #356 y #357 cerrados por #354, o desbloqueados si #354 se rechaza
- [ ] Al menos dos issues `wave:good-first` abiertos y sin asignar
- [ ] `npx tsc --noEmit` en 0 y los tests de `main` en verde
- [ ] `docs/README.md` lista los documentos nuevos
