# Plan de migración a AWS — MicoPay (backend + BD)

**Fecha:** 2026-07-19 · **Revisión v2 (auditada):** 2026-07-22
**Estado:** listo para ejecutar
**Si no tienes contexto de AWS, lee primero:** [`docs/AWS_GUIA_CONCEPTOS.md`](./AWS_GUIA_CONCEPTOS.md) — explica cada pieza y por qué la arquitectura tiene esta forma. Este documento es el runbook; ese es el mapa.
**Alcance:** el servicio `micopay-backend` (Fastify, `micopay/backend`) y su PostgreSQL. El frontend es una app móvil (Capacitor/APK) que consume esta API; no se "migra", solo se recompila apuntando al dominio nuevo. El bloque `micopay-api` (`apps/api`) de `render.yaml` no está desplegado y queda fuera de alcance.

**Premisa de esta revisión: no hay usuarios reales.** Eso elimina de raíz la parte más cara y frágil del plan v1 (convivencia de dominios, ventana de mantenimiento, congelar escrituras, runbook de cutover, rollback DNS). Render deja de ser una restricción: se apaga cuando AWS esté verde. Lo que queda es *construir bien* el destino, no *mudarse sin romper*.

---

## 1. Motivación

- La BD de Render está en plan `free`, que expira cada ~90 días. Ya expiró una vez. Es el riesgo operativo #1.
- El servicio live no se sincroniza desde `render.yaml`: los env vars se aplican a mano en el dashboard, así que **el manifiesto del repo no es la verdad** (ver hallazgo A4, que es consecuencia directa de esto).
- AWS da BD con backups automáticos, secretos gestionados, alarmas y camino de crecimiento sin re-arquitectura.

## 2. Inventario verificado (contra el código, 2026-07-22)

| Pieza | Estado real | Implicación |
|---|---|---|
| API backend | Node + Fastify, `config.port` default **3000** (`src/config.ts:92`), health `/health` | Render lo corre en 3002 por env var; en AWS fijamos `PORT=3000` |
| Migraciones | `runMigrations()` en boot (`src/index.ts:450`) + `preDeployCommand` de Render | En AWS basta el boot-migrate — **pero ver A1** |
| Ruta de los SQL | `src/db/migrate.ts:20` resuelve `../../../sql` desde `dist/db/` → `micopay/sql` | **El contexto de build Docker debe ser `micopay/`, no `micopay/backend/`** |
| Jobs in-process | Refund sweep `setInterval` 5 min (`src/index.ts:426`) + event listener con cursor persistido en BD | Exigen CPU continua y una sola instancia — ver A2/A3/A10 |
| Conexión BD | `new Pool({ connectionString })` sin `ssl` (`src/db/schema.ts:266`); en producción, si no conecta → `process.exit(1)` (`schema.ts:306`) | RDS PG16 fuerza TLS — ver A5 |
| Arranque | `await initPg()` top-level, 5 intentos × 15 s + backoff ≈ 95 s peor caso | Grace period del health check ≥ 180 s — ver A12 |
| Estáticos | `public/.well-known/assetlinks.json` con ruta explícita (`src/index.ts:68`) | Viaja en la imagen; solo verificar tras deploy |
| Webhooks Etherfuse | Rutas reales: `POST /defi/ramp/webhook/order` y `/defi/ramp/webhook/kyc` (`src/routes/ramp.ts:217,228`) | El plan v1 citaba `/ramp/webhook`, que no existe |
| CORS | `getCorsOptions()` devuelve `origin:false` en prod si no hay `CORS_ALLOWED_ORIGINS` (`config.ts:245`) | El APK hace fetch/axios desde el WebView → **CORS aplica** — ver A4 |
| Capacitor | `androidScheme: 'https'`, sin plugin `CapacitorHttp` (`micopay/frontend/capacitor.config.ts`) | Origin del APK = `https://localhost` |
| Frontend env | `.env.production` ya apunta a `https://api.micopay.app`; `.env.mainnet`/`.env.testnet` a onrender | Solo hay que editar los dos de modo — ver A14 |
| Docker | **No existe Dockerfile ni `.dockerignore`** | Se escriben en Fase 0 (contenido completo en §6) |
| CI | `.github/workflows/ci.yml` ya existe y bloquea el merge si backend o frontend no buildean; corre Node 20 | Solo hay que añadirle el `docker build` y subir a Node 22 — ver A11/A13 |
| Compilación | `npm run build` pasa **hoy** en backend (`tsc`) y frontend (`tsc && vite build`) | La premisa "main no compila" del v1 está obsoleta — ver A13 |

## 3. Auditoría del plan v1

### Bloqueantes

**A1 — El Dockerfile descrito no incluye `micopay/sql/`.**
El v1 dice "runtime con `dist/` + `public/` + prod deps". Falta el directorio de migraciones, que vive **fuera** de `micopay/backend/`. `migrate.ts:20` resuelve `resolve(__dirname, '../../../sql')`; con `dist/db/` en `/app/backend/dist/db`, eso apunta a `/app/sql`. Si no está, `runMigrations()` lanza, `index.ts:454` lo captura y **solo lo loguea** — el servidor arranca contra una BD vacía y falla en la primera query real. Falla silenciosa y difícil de leer.
→ **Fix:** contexto de build = `micopay/`, `COPY sql /app/sql`. Verificación explícita en Fase 0.

**A2 — App Runner + VPC connector deja al servicio sin salida a internet.**
Al enrutar el egress por una VPC, App Runner pierde acceso público salvo que la VPC tenga NAT Gateway. Este backend llama Soroban RPC, Horizon, la API de Etherfuse y FCM: sin NAT, todo eso muere. Un NAT Gateway son **~$32/mes + $0.045/GB**, lo que casi duplica el estimado de $30–35 del v1.

**A3 — App Runner no garantiza CPU cuando no procesa requests.**
Cobra memoria siempre y CPU solo durante requests activos; las instancias en reposo quedan con CPU estrangulada. El refund sweep (`setInterval` cada 5 min) es precisamente el job que **manda transacciones on-chain** para devolver fondos. Depender de que el health check "despierte" el contenedor lo suficiente para que corra un timer es comportamiento no documentado, y no es aceptable para dinero.
→ **Fix elegido:** ECS Fargate, donde la CPU está asignada siempre y los jobs corren exactamente igual que hoy en Render. (Variante App Runner en §9, si se prefiere, con el trabajo de código que implica.)

### Altos

**A4 — Falta `CORS_ALLOWED_ORIGINS` en la matriz de env vars.**
No está en `render.yaml`. En producción, sin esa variable, `@fastify/cors` se registra con `origin: false`: el servidor responde, pero **sin cabecera `Access-Control-Allow-Origin`**, así que el WebView descarta la respuesta. El APK no usa el plugin `CapacitorHttp`, así que sus llamadas son XHR/fetch reales del WebView con `Origin: https://localhost` (por `androidScheme: 'https'`) — es decir, CORS sí aplica. Conclusión: o Render la tiene puesta a mano (y entonces **no está en el repo: hay que ir a leerla al dashboard antes de apagarlo**), o el APK está roto hoy. En cualquier caso, migrar copiando solo lo que dice `render.yaml` rompe la app.
→ **Fix:** setear explícitamente `CORS_ALLOWED_ORIGINS=https://localhost,capacitor://localhost,http://localhost`.

**A5 — RDS PostgreSQL ≥15 fuerza TLS y el pool no lo pide.**
Los parameter groups por defecto de RDS PG15+ traen `rds.force_ssl=1`. `schema.ts:266` construye el Pool solo con `connectionString`. Si el string no lleva `sslmode`, la conexión se rechaza → 5 reintentos → `process.exit(1)` en producción → la tarea nunca pasa el health check y el deploy hace rollback en bucle.
→ **Fix:** `DATABASE_URL` con `?sslmode=require`. **Decisión consciente (Raúl, 2026-07-23):** `require` cifra pero **no verifica la identidad del servidor** — no protege contra MITM. Dentro de la VPC, con la BD sin IP pública y accesible solo desde el SG de la app, `require` es aceptable **como interino**. `verify-full` (que sí valida cert + hostname) queda agendado con gatillo explícito: **antes de fondos reales / mainnet** (ver Fase 9 y pregunta abierta #6). No se adopta ya porque un `verify-full` mal configurado bloquea la conexión, y el costo es embarcar el root CA de RDS una vez.

**A6 — `trustProxy: true` detrás de un ALB permite falsear la IP.**
`src/index.ts:35` usa `trustProxy: true`, que hace que Fastify tome la entrada **más a la izquierda** de `X-Forwarded-For` — la que controla el cliente. Todos los rate limits por IP (`IP_RATE_LIMIT_MAX`, etc.) se evaden mandando una cabecera. Ya pasa en Render; el ALB no lo arregla.
→ **Fix (1 línea):** `trustProxy: 1` (un solo hop de proxy).

### Medios

**A7 — La matriz de secretos/env del v1 está incompleta.** Faltan `CORS_ALLOWED_ORIGINS`, `EVENT_LISTENER_ENABLED`, `XLM_MXN_FALLBACK`, `USDC_MXN_FALLBACK`, `KYC_GATE_ENABLED`, `KYC_LEVEL_EXPIRY_DAYS`, `CETES_ISSUER`, `BLEND_POOL_ID`, `JWT_EXPIRY`. Matriz completa en §5.

**A8 — Rutas de webhook equivocadas.** §4.3 y §6 del v1 dicen `POST /ramp/webhook`. Las reales son `/defi/ramp/webhook/order` y `/defi/ramp/webhook/kyc`. Registrar la URL mal contra Etherfuse quema los secretos (se entregan una sola vez) y obliga a rehacer las suscripciones.

**A9 — El criterio de aceptación `eventListenerHealthy: true` es inalcanzable con la config actual.** `EVENT_LISTENER_ENABLED` no está en `render.yaml` y su default es `false` (`config.ts:134`), así que `/health` reporta `eventListenerState: "disabled"`. O se habilita explícitamente en AWS, o el criterio correcto es `"disabled"`.

**A10 — El despliegue rolling por defecto corre dos tareas a la vez.** ECS usa `maximumPercent=200 / minimumHealthyPercent=100`: durante cada deploy conviven la tarea vieja y la nueva. Eso reintroduce exactamente el doble-submit que §4.2 del v1 quería evitar, y además dos procesos corriendo migraciones simultáneamente.
→ **Fix:** `minimumHealthyPercent=0, maximumPercent=100` (deploy con ~40 s de corte, irrelevante sin usuarios). Alternativa sin corte: `pg_advisory_lock` en el sweep, el listener y `runMigrations()`.

**A11 — Node 20 está EOL** (fin de mantenimiento abril 2026), y `.github/workflows/ci.yml` lo pinea en ambos jobs. Subir la imagen y el CI a `node:22` a la vez, para no construir con un runtime distinto al de producción. `npm ci` sí es válido: existe `micopay/backend/package-lock.json`.

**A12 — Arranque lento vs. health check.** Con reintentos, `initPg()` puede tardar ~95 s antes de rendirse. `--health-check-grace-period-seconds 180` en el servicio ECS.

### Bajos / informativos

**A13 — "main no compila" ya no aplica, y el gate de CI ya existe.** Verificado hoy: `npm run build` pasa limpio en backend y frontend, y `.github/workflows/ci.yml` ya bloquea merges que no compilen. La tarea de Fase 0 no es *crear* CI sino *añadirle el `docker build`*, para que el contenedor no pueda romperse sin que nadie se entere.

**A14 — `.env.production.local` pisa `api.micopay.app` con `micopay-api.onrender.com`.** Solo afecta a `npm run build:prod` (modo `production`), no a `build:mainnet`/`build:testnet`. Aun así, borrarlo o actualizarlo evita una sorpresa.

**A15 — Rotación de secretos: no todos son rotables.**
- `JWT_SECRET`, `ADMIN_API_KEY`: rotar libremente (invalida sesiones activas, sin usuarios da igual).
- `SECRET_ENCRYPTION_KEY`: cifra los secretos HTLC **ya guardados**. Solo se puede regenerar si se arranca con BD limpia; si se copian datos de Render, tiene que ser bit a bit el mismo valor.
- `PLATFORM_SECRET_KEY`: es la hot wallet. "Rotar" = crear cuenta nueva y mover fondos + reapuntar el contrato. No es un cambio de env var.

**A16 — `/health` es público y expone `configCheck`.** Solo booleanos, sin valores, pero es superficie innecesaria. Opcional: mover el detalle a `/health?verbose` con `ADMIN_API_KEY`.

**A17 — `deletion-protection` bloquea el borrado.** Correcto tenerlo, pero recordar que hay que hacer `modify-db-instance --no-deletion-protection` antes de cualquier `delete-db-instance`.

**A18 — Free tier: las cuentas nuevas ya no tienen 12 meses gratis, y el plan gratuito *termina* (no factura solo).** Desde julio 2025 AWS reemplazó el free tier de 12 meses por un "Free Plan" basado en créditos ($100 al registrarse + hasta $100 más por completar actividades). Dos matices que corrige Raúl (2026-07-23):
- **No es "se agotan los créditos y empieza a cobrar".** Cuando el Free Plan expira (6 meses o créditos agotados, lo que ocurra primero), la cuenta **se pausa/cierra** salvo que se haga *upgrade manual al Paid Plan*. Es decir, el modo de falla es una **caída sorpresa del servicio**, no una factura inesperada.
- **El "~4 meses" asume los $200 completos.** Con solo el crédito base de $100 y ~$44/mes, el runway real es **~2.3 meses**; con los $200, ~4.5.
→ **Mitigación (ver Fase 1):** activar el Paid Plan desde el día 1 (los créditos se consumen igual primero, pero se elimina el precipicio) **o** anotar la fecha exacta de expiración y poner un recordatorio ~2 semanas antes, además del Budget alert.

**A19 — Hot wallet en su propia llave KMS (Raúl, 2026-07-23).** El plan v2 dejaba `PLATFORM_SECRET_KEY` sobre la llave gestionada por defecto (`aws/ssm`), igual que los demás secretos. Como es una hot wallet (quien la descifra controla los fondos), conviene aislarla en una **CMK dedicada** (`alias/micopay-hotwallet`): así el permiso de descifrado se gobierna por separado del resto, se audita de forma independiente en CloudTrail y se puede restringir a **solo** el execution role. Cuesta ~$1/mes por la llave. Implementado en Fase 2.3 (creación) y Fase 4.1 (grant de `kms:Decrypt` acotado a esa llave). Nota de precisión sobre el modelo de permisos: con `aws/ssm` el `kms:Decrypt` es implícito (lo da la key policy de la llave gestionada); con una CMK **hay que concederlo explícito** — que es exactamente lo que da el control que buscamos.

### Lo que sobra sin usuarios reales

Se eliminan del plan: §4.1 (custom domain en Render + esperar adopción del APK), §4.5 (estrategia de migración de datos), §6 completo (runbook de cutover con congelación de escrituras), el plan de rollback DNS, y el paso 7 del runbook (mantener Render vivo apuntando a RDS). El "cutover" se convierte en: desplegar en AWS → verificar → recompilar APK → apagar Render.

## 4. Arquitectura destino (corregida)

```
APK ──HTTPS──> api.micopay.app  (Route53 alias → ALB, cert ACM)
                     │
                ALB (subredes públicas, SG: 443 desde 0.0.0.0/0)
                     │  HTTP :3000, target-type ip
                ECS Fargate  0.25 vCPU / 0.5 GB · desiredCount=1
                     │        (subred pública, assignPublicIp=ENABLED → salida a internet
                     │         por el IGW, sin NAT Gateway)
                RDS PostgreSQL 16  db.t4g.micro · no publicly accessible
                                    SG: 5432 solo desde el SG de la tarea

Secretos:  SSM Parameter Store SecureString → task definition (`secrets`)
Logs:      CloudWatch /ecs/micopay-backend
CI/CD:     GitHub Actions (OIDC, sin llaves largas) → ECR → ECS deploy
```

**Por qué Fargate y no App Runner:** por A3 (CPU en reposo) y A2 (NAT). Fargate en subred pública con IP pública tiene salida a internet sin NAT, la CPU está asignada siempre — los jobs se comportan igual que en Render, sin cambios de código — y es el mismo contenedor que ya se necesitaría para App Runner. El costo del ALB (~$17/mes) es el precio de no tocar el código de los jobs y de no pagar NAT.

**Región `us-east-1`.** La latencia CDMX↔Virginia (~60–80 ms) es irrelevante frente a Soroban RPC y SPEI. Si algún día se exige residencia en México, el mismo task definition se mueve a `mx-central-1`.

**Descartadas:** App Runner (A2/A3), Lightsail (sin camino de crecimiento ni secretos gestionados), Elastic Beanstalk (legacy), EC2 pelón (todo el mantenimiento a mano).

**IaC:** consola/CLI + este documento como runbook es aceptable en el primer pase. Terraform es deseable pero no bloqueante — no retrasar la migración por él. Los comandos de §6 están escritos para poder traducirse 1:1 después.

## 5. Matriz completa de configuración

Verificada con `grep -o 'process\.env\.[A-Z0-9_]*' src/` sobre el backend. Todo lo `SecureString` va a SSM; lo `plain` va inline en la task definition.

| Variable | Tipo | Valor en AWS |
|---|---|---|
| `NODE_ENV` | plain | `production` |
| `PORT` | plain | `3000` |
| `DATABASE_URL` | **SecureString** | `postgresql://micopay:PASS@<rds-endpoint>:5432/micopay?sslmode=require` (A5) |
| `CORS_ALLOWED_ORIGINS` | plain | `https://localhost,capacitor://localhost,http://localhost` (A4) |
| `STELLAR_RPC_URL` | plain | `https://soroban-testnet.stellar.org` |
| `STELLAR_NETWORK` | plain | `TESTNET` |
| `MOCK_STELLAR` | plain | `false` |
| `ESCROW_CONTRACT_ID` | plain | `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ` |
| `MXNE_CONTRACT_ID` | plain | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| `MXNE_ISSUER_ADDRESS` | plain | `GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV` |
| `ETHERFUSE_API_URL` | plain | `https://api.sand.etherfuse.com` (prod: `https://api.etherfuse.com`) |
| `CETES_ISSUER` | plain | dejar default o fijar explícito |
| `BLEND_POOL_ID` | plain | dejar default o fijar explícito |
| `JWT_EXPIRY` | plain | `24h` |
| `EVENT_LISTENER_ENABLED` | plain | decidir: `false` (paridad con Render) o `true` (y entonces A9 aplica) |
| `KYC_GATE_ENABLED` | plain | `false` hasta el dictamen legal (Fase 4 de compliance) |
| `XLM_MXN_FALLBACK`, `USDC_MXN_FALLBACK` | plain | copiar de Render si están puestos |
| `PLATFORM_SECRET_KEY` | **SecureString (CMK propia)** | mismo valor; sobre `alias/micopay-hotwallet`, no la llave default (hot wallet, A15/A19) |
| `JWT_SECRET` | **SecureString** | regenerar |
| `SECRET_ENCRYPTION_KEY` | **SecureString** | mismo valor si se copian datos; nuevo si BD limpia (A15) |
| `ETHERFUSE_API_KEY` | **SecureString** | mismo valor |
| `ETHERFUSE_WEBHOOK_SECRET_ORDER` | **SecureString** | **nuevo** (re-registro de suscripción, A8) |
| `ETHERFUSE_WEBHOOK_SECRET_KYC` | **SecureString** | **nuevo** (re-registro de suscripción, A8) |
| `ADMIN_API_KEY` | **SecureString** | regenerar |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` | plain / plain | copiar |
| `FIREBASE_PRIVATE_KEY` | **SecureString** | copiar **con los `\n` escapados** — `push.service.ts:51` hace `.replace(/\\n/g,'\n')` |
| `ALLOW_IN_MEMORY_DB` | — | **NO definir** (B-3: fail-fast si no hay BD) |
| `SEED_DEMO_DATA` | — | **NO definir** en prod |

> **Antes de apagar Render:** exportar el listado completo de env vars del dashboard y diffearlo contra esta tabla. Es la única forma de cazar variables puestas a mano que no están en `render.yaml` (A4 es exactamente ese caso).

---

## 6. Pasos de ejecución

Los comandos están en PowerShell (shell primario en esta máquina). En bash, cambiar `$Var = "x"` por `Var=x` y `$Var` por `$Var` sin más. Todo asume `--region us-east-1` y un perfil `micopay` ya configurado.

### Fase 0 — Contenedor y CI (local, sin tocar AWS) · ~½ día

**0.1 — `micopay/backend/Dockerfile`** ✅ *creado*

Contexto de build `micopay/` (no `micopay/backend/`) por A1.

```dockerfile
# syntax=docker/dockerfile:1
# Contexto de build: micopay/  (necesario para copiar sql/, ver migrate.ts:20)
FROM node:22-bookworm-slim AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=deps  /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist        ./dist
COPY backend/package.json ./
COPY backend/public ./public
# migrate.ts resuelve ../../../sql desde dist/db → /app/sql
COPY sql /app/sql
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**0.2 — `micopay/.dockerignore`** ✅ *creado*

```
**/node_modules
**/dist
**/.env
**/.env.*
frontend
contracts
scripts
android
ios
**/*.md
```

**0.3 — Build y smoke test local** ✅ *ejecutado y verde el 2026-07-22*

Resultados: imagen de **511 MB**; `/app/sql` con `init.sql` + 25 archivos; `/health` responde `status:"ok"` a los ~25 s (el retry loop de `initPg()` domina el arranque — A12); `assetlinks.json` en 200 `application/json`. Contra un `postgres:16` real: `dbConnected: true` y **16 migraciones aplicadas desde `/app/sql`** (init.sql + 15 `.up`, los 10 `.down` correctamente omitidos), 18 tablas creadas. A1 queda cerrado con evidencia, no por inspección.

```powershell
docker build -f micopay/backend/Dockerfile -t micopay-backend:local micopay
# Verificar A1: los SQL tienen que estar en /app/sql
docker run --rm --entrypoint ls micopay-backend:local /app/sql
docker run --rm --entrypoint ls micopay-backend:local /app/sql/migrations
```

Arranque en modo mock (`NODE_ENV=test` porque `validateConfig()` prohíbe `MOCK_STELLAR=true` con `NODE_ENV=production`):

```powershell
docker run --rm -p 3000:3000 -e NODE_ENV=test -e MOCK_STELLAR=true -e ALLOW_IN_MEMORY_DB=true -e PORT=3000 -e SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 micopay-backend:local
```

En otra terminal: `curl http://localhost:3000/health` → `status: "ok"`; `curl http://localhost:3000/.well-known/assetlinks.json` → 200 `application/json`.

Prueba completa con BD real (es la que de verdad valida A1, porque `runMigrations()` solo corre si `pingDb()` conecta):

```powershell
docker network create micopay-test
docker run -d --name micopay-pg --network micopay-test -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=micopay postgres:16
docker run -d --name micopay-smoke --network micopay-test -p 3000:3000 -e NODE_ENV=test -e MOCK_STELLAR=true -e PORT=3000 -e "DATABASE_URL=postgresql://postgres:dev@micopay-pg:5432/micopay" -e SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 micopay-backend:local
docker logs micopay-smoke        # esperar "🎉 Migrations complete (16 applied this run)."
curl http://localhost:3000/health   # dbConnected: true
docker rm -f micopay-smoke micopay-pg; docker network rm micopay-test
```

**0.4 — Aplicar el fix de A6** en `micopay/backend/src/index.ts:35`: `trustProxy: true` → `trustProxy: 1`.

**0.5 — CI extendido** ✅ *hecho parcialmente*

`.github/workflows/ci.yml` ya tiene un job `image` que en cada PR construye la imagen, **verifica que `/app/sql` existe dentro** (regresión de A1) y arranca el contenedor en modo mock para comprobar `/health` y `assetlinks.json`.

Pendiente: subir `node-version` de 20 a 22 en los jobs `backend` y `frontend`, para que el CI compile con el mismo runtime que corre en producción (A11). Se dejó aparte por ser un cambio con riesgo propio.

**0.6 — Confirmar el dominio.** `micopay.app` (o el que sea) registrado y con NS controlables. Todo lo demás cuelga de esto.

---

### Fase 1 — Cuenta y base AWS · ~2 h

```powershell
# Tras crear la cuenta: MFA en root, usuario admin vía IAM Identity Center, nunca operar como root.
aws configure --profile micopay      # región us-east-1, output json
aws sts get-caller-identity --profile micopay
```

- Budget con alerta a $60/mes + alerta de anomalías de costo (Billing → Budgets).
- **Free tier — evitar el precipicio (A18).** Al abrir la cuenta, en Billing → Free Tier anotar el **plan** (Free vs Paid) y la **fecha de expiración** del Free Plan. Decidir explícitamente:
  - **Recomendado:** hacer upgrade al Paid Plan de una vez. Los créditos se siguen consumiendo primero, pero el servicio ya no se cae solo cuando el Free Plan termine.
  - Si se prefiere quedarse en Free Plan: poner un recordatorio de calendario ~2 semanas **antes** de la fecha de expiración ("upgrade a Paid o AWS pausa la cuenta"). El Budget alert **no** cubre esto — avisa de gasto, no de expiración del plan.

Variables base para el resto de fases:

```powershell
$env:AWS_PROFILE = "micopay"; $env:AWS_DEFAULT_REGION = "us-east-1"
$Acct   = (aws sts get-caller-identity --query Account --output text)
$Vpc    = (aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
$Subnets = (aws ec2 describe-subnets --filters Name=vpc-id,Values=$Vpc --query "Subnets[].SubnetId" --output text) -split "\s+"
$SubnetA = $Subnets[0]; $SubnetB = $Subnets[1]
"$Acct / $Vpc / $SubnetA,$SubnetB"
```

---

### Fase 2 — Red y base de datos · ~1 h (+15 min de espera de RDS)

**2.1 — Security groups**

```powershell
$AlbSg = (aws ec2 create-security-group --group-name micopay-alb --description "ALB publico" --vpc-id $Vpc --query GroupId --output text)
$AppSg = (aws ec2 create-security-group --group-name micopay-app --description "Tarea Fargate" --vpc-id $Vpc --query GroupId --output text)
$DbSg  = (aws ec2 create-security-group --group-name micopay-db  --description "RDS privado"  --vpc-id $Vpc --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $AlbSg --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $AlbSg --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $AppSg --protocol tcp --port 3000 --source-group $AlbSg
aws ec2 authorize-security-group-ingress --group-id $DbSg  --protocol tcp --port 5432 --source-group $AppSg
```

**2.2 — RDS PostgreSQL 16**

```powershell
aws rds create-db-subnet-group --db-subnet-group-name micopay-db-subnets --db-subnet-group-description "MicoPay" --subnet-ids $SubnetA $SubnetB

# Password sin caracteres que rompan el URL (hex puro)
$b = New-Object byte[] 24; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$DbPass = ($b | ForEach-Object { '{0:x2}' -f $_ }) -join ''

# Elegir la última minor de PG16 disponible hoy
aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion,'16.')].EngineVersion" --output text

aws rds create-db-instance --db-instance-identifier micopay-prod --engine postgres --engine-version 16.9 --db-instance-class db.t4g.micro --allocated-storage 20 --storage-type gp3 --storage-encrypted --master-username micopay --master-user-password $DbPass --db-name micopay --db-subnet-group-name micopay-db-subnets --vpc-security-group-ids $DbSg --backup-retention-period 7 --no-publicly-accessible --no-multi-az --auto-minor-version-upgrade --deletion-protection

aws rds wait db-instance-available --db-instance-identifier micopay-prod
$DbHost = (aws rds describe-db-instances --db-instance-identifier micopay-prod --query "DBInstances[0].Endpoint.Address" --output text)
$DbUrl  = "postgresql://micopay:$DbPass@${DbHost}:5432/micopay?sslmode=require"   # sslmode=require es obligatorio (A5)
```

> Sin acceso público, para correr SQL a mano hace falta entrar desde dentro de la VPC (`aws ecs execute-command` a la tarea, una vez exista) o exponer temporalmente la instancia y revertir. No dejar `--publicly-accessible` puesto.

**2.3 — Secretos en SSM**

```powershell
function New-Hex($n) { $x = New-Object byte[] $n; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($x); ($x | ForEach-Object { '{0:x2}' -f $_ }) -join '' }
$Jwt   = New-Hex 32          # >= 32 chars, exigido por validateConfig()
$Admin = New-Hex 24
$Enc   = New-Hex 32          # EXACTAMENTE 64 hex chars (AES-256-GCM) — ver A15 antes de regenerar

# Los secretos "normales" van sobre la llave gestionada por defecto (aws/ssm):
aws ssm put-parameter --name /micopay/prod/DATABASE_URL          --type SecureString --value $DbUrl --overwrite
aws ssm put-parameter --name /micopay/prod/JWT_SECRET            --type SecureString --value $Jwt   --overwrite
aws ssm put-parameter --name /micopay/prod/ADMIN_API_KEY         --type SecureString --value $Admin --overwrite
aws ssm put-parameter --name /micopay/prod/SECRET_ENCRYPTION_KEY --type SecureString --value $Enc   --overwrite
aws ssm put-parameter --name /micopay/prod/ETHERFUSE_API_KEY     --type SecureString --value "..."  --overwrite   # de Render
aws ssm put-parameter --name /micopay/prod/FIREBASE_PRIVATE_KEY  --type SecureString --value "-----BEGIN PRIVATE KEY-----\n..." --overwrite

# La hot wallet va sobre su PROPIA llave KMS (CMK), no la default — ver A19.
# Esto separa el permiso de descifrado de la hot wallet del resto de secretos.
$HotKeyId = (aws kms create-key --description "micopay hot wallet (PLATFORM_SECRET_KEY)" --query "KeyMetadata.KeyId" --output text)
aws kms create-alias --alias-name alias/micopay-hotwallet --target-key-id $HotKeyId
aws ssm put-parameter --name /micopay/prod/PLATFORM_SECRET_KEY --type SecureString --key-id $HotKeyId --value "S..." --overwrite   # de Render
# Los dos ETHERFUSE_WEBHOOK_SECRET_* se cargan en la Fase 7, tras re-registrar las suscripciones.
```

---

### Fase 3 — Imagen en ECR · ~30 min

```powershell
aws ecr create-repository --repository-name micopay-backend --image-scanning-configuration scanOnPush=true
$Registry = "$Acct.dkr.ecr.us-east-1.amazonaws.com"
aws ecr get-login-password | docker login --username AWS --password-stdin $Registry
# Si PowerShell rompe el pipe por el BOM:
#   docker login -u AWS -p (aws ecr get-login-password) $Registry

docker build --platform linux/amd64 -f micopay/backend/Dockerfile -t "$Registry/micopay-backend:v1" -t "$Registry/micopay-backend:latest" micopay
docker push "$Registry/micopay-backend:v1"
docker push "$Registry/micopay-backend:latest"
```

`--platform linux/amd64` importa si alguien construye desde un Mac Apple Silicon; el task definition se declara `X86_64`.

---

### Fase 4 — Roles IAM · ~30 min

**4.1 — Execution role** (ECS lo usa para bajar la imagen, escribir logs y **resolver los secretos de SSM** — este último permiso es el que se olvida y produce `ResourceInitializationError`):

```powershell
'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' | Out-File -Encoding ascii trust-ecs.json
aws iam create-role --role-name micopayEcsExecutionRole --assume-role-policy-document file://trust-ecs.json
aws iam attach-role-policy --role-name micopayEcsExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

$HotKeyArn = (aws kms describe-key --key-id alias/micopay-hotwallet --query "KeyMetadata.Arn" --output text)
@"
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["ssm:GetParameters"],"Resource":"arn:aws:ssm:us-east-1:$Acct`:parameter/micopay/prod/*"},
 {"Effect":"Allow","Action":["kms:Decrypt"],"Resource":"$HotKeyArn"}
]}
"@ | Out-File -Encoding ascii ssm-read.json
aws iam put-role-policy --role-name micopayEcsExecutionRole --policy-name ssm-read --policy-document file://ssm-read.json
```

> **Sobre `kms:Decrypt` (A19).** Los secretos sobre la llave gestionada `aws/ssm` **no** necesitan `kms:Decrypt` explícito: su key policy ya lo concede a la cuenta cuando la llamada pasa por SSM. Por eso el statement de arriba solo referencia la CMK de la hot wallet — que **sí** lo exige, y ese es justo el punto: el descifrado de `PLATFORM_SECRET_KEY` queda gobernado por una llave separada, auditable de forma independiente en CloudTrail, y accesible **solo** por este execution role. Verificable con `aws kms get-key-policy` (nadie más debe tener `Decrypt` sobre `alias/micopay-hotwallet`) — el task role, que corre tu código, no puede descifrarla.

**4.2 — Task role** (permisos del proceso en runtime). Hoy el backend no llama a ninguna API de AWS, así que basta un rol vacío; se crea igual para poder añadir `ssmmessages:*` y usar `aws ecs execute-command`:

```powershell
aws iam create-role --role-name micopayEcsTaskRole --assume-role-policy-document file://trust-ecs.json
aws iam attach-role-policy --role-name micopayEcsTaskRole --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
```

---

### Fase 5 — Certificado, ALB y DNS · ~1 h

```powershell
$CertArn = (aws acm request-certificate --domain-name api.micopay.app --validation-method DNS --query CertificateArn --output text)
aws acm describe-certificate --certificate-arn $CertArn --query "Certificate.DomainValidationOptions[0].ResourceRecord"
```

Crear ese CNAME en el DNS del dominio (si `micopay.app` aún no está en Route53: `aws route53 create-hosted-zone --name micopay.app --caller-reference (Get-Date -Format o)` y apuntar los NS en el registrador). Después:

```powershell
aws acm wait certificate-validated --certificate-arn $CertArn

$AlbArn = (aws elbv2 create-load-balancer --name micopay-alb --type application --scheme internet-facing --subnets $SubnetA $SubnetB --security-groups $AlbSg --query "LoadBalancers[0].LoadBalancerArn" --output text)

$TgArn = (aws elbv2 create-target-group --name micopay-tg --protocol HTTP --port 3000 --vpc-id $Vpc --target-type ip --health-check-path /health --health-check-interval-seconds 15 --health-check-timeout-seconds 5 --healthy-threshold-count 2 --unhealthy-threshold-count 3 --matcher HttpCode=200 --query "TargetGroups[0].TargetGroupArn" --output text)

aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTPS --port 443 --certificates CertificateArn=$CertArn --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 --default-actions Type=forward,TargetGroupArn=$TgArn
aws elbv2 create-listener --load-balancer-arn $AlbArn --protocol HTTP --port 80 --default-actions "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}"
```

Registro alias `api.micopay.app` → ALB:

```powershell
$AlbDns  = (aws elbv2 describe-load-balancers --load-balancer-arns $AlbArn --query "LoadBalancers[0].DNSName" --output text)
$AlbZone = (aws elbv2 describe-load-balancers --load-balancer-arns $AlbArn --query "LoadBalancers[0].CanonicalHostedZoneId" --output text)
$Zone    = (aws route53 list-hosted-zones-by-name --dns-name micopay.app --query "HostedZones[0].Id" --output text).Split('/')[-1]
@"
{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"api.micopay.app","Type":"A","AliasTarget":{"HostedZoneId":"$AlbZone","DNSName":"$AlbDns","EvaluateTargetHealth":true}}}]}
"@ | Out-File -Encoding ascii dns.json
aws route53 change-resource-record-sets --hosted-zone-id $Zone --change-batch file://dns.json
```

> El health check del target group (`/health`) devuelve 503 si la BD está caída (`index.ts:185`). Eso es lo correcto: la tarea sale de rotación en vez de servir errores.

---

### Fase 6 — Servicio ECS · ~1 h

```powershell
aws ecs create-cluster --cluster-name micopay
aws logs create-log-group --log-group-name /ecs/micopay-backend
aws logs put-retention-policy --log-group-name /ecs/micopay-backend --retention-in-days 30
```

`taskdef.json` (sustituir `<ACCT>`; los `secrets` referencian ARNs de SSM, los `environment` van en claro):

```json
{
  "family": "micopay-backend",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256",
  "memory": "512",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "executionRoleArn": "arn:aws:iam::<ACCT>:role/micopayEcsExecutionRole",
  "taskRoleArn": "arn:aws:iam::<ACCT>:role/micopayEcsTaskRole",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "<ACCT>.dkr.ecr.us-east-1.amazonaws.com/micopay-backend:v1",
      "essential": true,
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "CORS_ALLOWED_ORIGINS", "value": "https://localhost,capacitor://localhost,http://localhost" },
        { "name": "STELLAR_RPC_URL", "value": "https://soroban-testnet.stellar.org" },
        { "name": "STELLAR_NETWORK", "value": "TESTNET" },
        { "name": "MOCK_STELLAR", "value": "false" },
        { "name": "ESCROW_CONTRACT_ID", "value": "CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ" },
        { "name": "MXNE_CONTRACT_ID", "value": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" },
        { "name": "MXNE_ISSUER_ADDRESS", "value": "GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV" },
        { "name": "ETHERFUSE_API_URL", "value": "https://api.sand.etherfuse.com" },
        { "name": "EVENT_LISTENER_ENABLED", "value": "false" },
        { "name": "KYC_GATE_ENABLED", "value": "false" },
        { "name": "JWT_EXPIRY", "value": "24h" },
        { "name": "FIREBASE_PROJECT_ID", "value": "<...>" },
        { "name": "FIREBASE_CLIENT_EMAIL", "value": "<...>" }
      ],
      "secrets": [
        { "name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/DATABASE_URL" },
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/JWT_SECRET" },
        { "name": "SECRET_ENCRYPTION_KEY", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/SECRET_ENCRYPTION_KEY" },
        { "name": "PLATFORM_SECRET_KEY", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/PLATFORM_SECRET_KEY" },
        { "name": "ADMIN_API_KEY", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/ADMIN_API_KEY" },
        { "name": "ETHERFUSE_API_KEY", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/ETHERFUSE_API_KEY" },
        { "name": "ETHERFUSE_WEBHOOK_SECRET_ORDER", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/ETHERFUSE_WEBHOOK_SECRET_ORDER" },
        { "name": "ETHERFUSE_WEBHOOK_SECRET_KYC", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/ETHERFUSE_WEBHOOK_SECRET_KYC" },
        { "name": "FIREBASE_PRIVATE_KEY", "valueFrom": "arn:aws:ssm:us-east-1:<ACCT>:parameter/micopay/prod/FIREBASE_PRIVATE_KEY" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/micopay-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "api"
        }
      }
    }
  ]
}
```

> Ni `ALLOW_IN_MEMORY_DB` ni `SEED_DEMO_DATA` aparecen: su ausencia es intencional (§5).

```powershell
aws ecs register-task-definition --cli-input-json file://taskdef.json

aws ecs create-service --cluster micopay --service-name micopay-backend --task-definition micopay-backend --desired-count 1 --launch-type FARGATE --platform-version LATEST --network-configuration "awsvpcConfiguration={subnets=[$SubnetA,$SubnetB],securityGroups=[$AppSg],assignPublicIp=ENABLED}" --load-balancers "targetGroupArn=$TgArn,containerName=api,containerPort=3000" --health-check-grace-period-seconds 180 --deployment-configuration "maximumPercent=100,minimumHealthyPercent=0" --enable-execute-command
```

Las dos decisiones no obvias de ese comando:
- `assignPublicIp=ENABLED` en subred pública → salida a internet por el IGW **sin NAT Gateway** (evita A2 y ~$32/mes).
- `maximumPercent=100, minimumHealthyPercent=0` → nunca hay dos tareas vivas a la vez (A10). Cuesta ~40 s de corte por deploy.

**Verificación:**

```powershell
aws ecs wait services-stable --cluster micopay --services micopay-backend
aws elbv2 describe-target-health --target-group-arn $TgArn --query "TargetHealthDescriptions[].TargetHealth.State"
curl https://api.micopay.app/health
curl https://api.micopay.app/.well-known/assetlinks.json
aws logs tail /ecs/micopay-backend --since 10m
```

Criterios de salida: `/health` → 200 con `dbConnected: true`, `mockStellar: false`, `configCheck` todo en `true`; en logs, `✅ apply` de las migraciones y `🍄 Micopay MVP Backend running`; `eventListenerState` = `"disabled"` (o `"healthy"` si se habilitó, A9); `assetlinks.json` en 200 con `Content-Type: application/json`.

Prueba funcional: `cd micopay/backend; $env:API_URL="https://api.micopay.app"; npm run e2e`.

---

### Fase 7 — Etherfuse, APK y apagado de Render · ~½ día

**7.1 — Re-registrar los webhooks** contra las URLs reales (A8):
`https://api.micopay.app/defi/ramp/webhook/order` y `https://api.micopay.app/defi/ramp/webhook/kyc`.
Cada suscripción entrega su secreto **una sola vez**: capturarlo al crearla y cargarlo antes de nada.

```powershell
aws ssm put-parameter --name /micopay/prod/ETHERFUSE_WEBHOOK_SECRET_ORDER --type SecureString --value "<nuevo>" --overwrite
aws ssm put-parameter --name /micopay/prod/ETHERFUSE_WEBHOOK_SECRET_KYC   --type SecureString --value "<nuevo>" --overwrite
aws ecs update-service --cluster micopay --service micopay-backend --force-new-deployment
```

Después, disparar una orden en el sandbox de Etherfuse y confirmar en logs que la firma valida y la orden se procesa e2e — esto además cierra la verificación pendiente del flujo order/webhook.

**7.2 — Recompilar el APK.** En `micopay/frontend/.env.mainnet` y `.env.testnet`: `VITE_API_URL=https://api.micopay.app`. Borrar o corregir `.env.production.local` (A14). Luego `npm run build:testnet && npx cap sync android` y build del APK. Instalar y probar login → trade → QR.

**7.3 — Datos (opcional).** Si conviene conservar el contenido de la BD de Render:

```bash
pg_dump --no-owner --no-acl "<RENDER_EXTERNAL_URL>" | psql "<DbUrl>"
```

Requiere acceso de red a RDS (ver nota de la Fase 2.2) y que `SECRET_ENCRYPTION_KEY` sea el mismo valor que en Render (A15). Sin usuarios reales, arrancar limpio suele ser la mejor opción.

**7.4 — Apagar Render.** Antes de borrar nada: exportar los env vars del dashboard y diffear contra §5. Luego borrar servicio y BD, eliminar el bloque `micopay-backend` de `render.yaml` (o el archivo entero, ya que `micopay-api` tampoco está desplegado) y actualizar las notas de docs/memoria sobre Render.

---

### Fase 8 — CI/CD con OIDC · ~2 h

```powershell
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
```

Rol `micopayGithubDeploy` con trust en `repo:Micopay/micopay-protocol:ref:refs/heads/main` y permisos de `ecr:*` sobre el repositorio, `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, `ecs:DescribeServices` e `iam:PassRole` sobre los dos roles de tarea. Workflow `.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<ACCT>:role/micopayGithubDeploy
          aws-region: us-east-1
      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr
      - name: build & push
        run: |
          IMG=${{ steps.ecr.outputs.registry }}/micopay-backend:${{ github.sha }}
          docker build --platform linux/amd64 -f micopay/backend/Dockerfile -t $IMG micopay
          docker push $IMG
          echo "IMAGE=$IMG" >> $GITHUB_ENV
      - uses: aws-actions/amazon-ecs-render-task-definition@v1
        id: td
        with:
          task-definition: taskdef.json
          container-name: api
          image: ${{ env.IMAGE }}
      - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.td.outputs.task-definition }}
          service: micopay-backend
          cluster: micopay
          wait-for-service-stability: true
```

Versionar `taskdef.json` en el repo (sin secretos: solo ARNs de SSM).

---

### Fase 9 — Endurecimiento post-deploy · ~1 semana de soak

- **Alarmas CloudWatch:** `UnHealthyHostCount > 0` en el target group, `HTTPCode_Target_5XX_Count`, CPU/memoria de ECS, `FreeStorageSpace` y `CPUUtilization` de RDS. Todas a un SNS topic con tu email.
- **Cortar dev de la BD de prod.** `DATABASE_URL` de desarrollo → Postgres local (`docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16`) + `npm run migrate`. El endpoint de RDS no debe existir en máquinas de desarrollo.
- **Rotar** `JWT_SECRET` y `ADMIN_API_KEY` si estuvieron alguna vez en el dashboard de Render. Sobre `SECRET_ENCRYPTION_KEY` y `PLATFORM_SECRET_KEY`, leer A15 antes de tocar nada.
- **TLS estricto — gatillo: antes de fondos reales / mainnet (A5, Raúl).** Hasta aquí `DATABASE_URL` usa `sslmode=require` (cifra, no autentica al servidor). Pasar a `verify-full`: descargar el **CA bundle global** de RDS (`https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`), embarcarlo en la imagen y usar `sslmode=verify-full&sslrootcert=/app/rds-global-bundle.pem`. El bundle global cubre la rotación automática de la CA moderna, así que es una sola vez. Si algún día se conecta por un CNAME propio en vez del endpoint de RDS, ese hostname tiene que coincidir con el cert o `verify-full` rompe.
- **Escalar >1 instancia** requiere primero `pg_advisory_lock` en `startRefundSweep()`, el event listener y `runMigrations()`. Hasta entonces, `desiredCount` se queda en 1.
- **Backups — hacer un drill de restauración de verdad (Raúl, 2026-07-23).** Salimos de Render precisamente por perder datos; un backup nunca restaurado no sabes si sirve. Ejecutar el runbook de §11 al menos una vez y cronometrarlo. Punto clave que cambia la expectativa: **restaurar en RDS crea una instancia NUEVA con endpoint NUEVO** — no es un botón de "revertir", es "levantar instancia + repuntar la app" (por eso el runbook toca RDS → SSM → ECS, no solo RDS). Opcional: AWS Backup → Restore Testing lo automatiza de forma recurrente.
- Actualizar `README`, `docs/AUDIT_MOBILE_MAINNET.md` §hosting y este documento a estado "ejecutado".

---

## 7. Costos estimados (us-east-1, mensual)

| Recurso | Config | Costo aprox. |
|---|---|---|
| ECS Fargate | 0.25 vCPU / 0.5 GB, 1 tarea 24/7 | ~$9 |
| ALB | 1 ALB + LCU mínimo | ~$17 |
| RDS PostgreSQL | db.t4g.micro single-AZ + 20 GB gp3 + backups | ~$14 |
| Route53 | hosted zone + queries | ~$1 |
| ECR, CloudWatch, transferencia | volúmenes de este tamaño | ~$2 |
| SSM Parameter Store | estándar | $0 |
| KMS CMK (hot wallet, A19) | 1 llave | ~$1 |
| **Total** | | **~$44/mes** |

Comparación con lo que proponía el v1: App Runner (~$14) + NAT Gateway obligatorio (~$32) + RDS (~$15) = **~$61/mes** *y* con los jobs en riesgo (A3). Fargate + ALB sale más barato y correcto.

Sobre free tier: no asumir 12 meses gratis (A18). Con ~$44/mes, los créditos dan **~2.3 meses** (solo el crédito base de $100) a **~4.5 meses** (los $200 completos, si se hacen las actividades). Y ojo: al terminar el Free Plan la cuenta **se pausa** si no se hizo upgrade a Paid — no es una factura, es una caída. Decidir el plan el día 1 (Fase 1).

## 8. Qué NO cambia

- Contratos Stellar, RPC endpoints, flujo Etherfuse (una vez re-registrados los webhooks).
- El frontend solo cambia `VITE_API_URL`.
- Código de aplicación: **un solo cambio obligatorio**, `trustProxy: 1` (A6, 1 línea). El Dockerfile y el workflow son aditivos. Las migraciones ya corren en boot.

## 9. Variante App Runner (si se prefiere sobre Fargate)

Es viable, pero deja de ser "cero código". Deltas respecto de §6:

1. **No** usar VPC connector; en su lugar, poner RDS `--publicly-accessible` con SG restringido — **inaceptable** para la BD de una hot wallet. La alternativa correcta es VPC connector + NAT Gateway (+$32/mes).
2. Sacar el refund sweep del proceso: exponerlo como ruta admin (reutilizando `assertAdmin` de `src/routes/admin.ts:8`) y dispararla con EventBridge Scheduler cada 5 min. `sweepPendingRefunds()` ya filtra por `release_tx_hash IS NULL`, así que es casi idempotente; añadir `pg_advisory_lock` para evitar solapes.
3. Lo mismo para el event listener si se habilita: su cursor ya se persiste en BD (`src/db/event-cursor.model.ts`), así que un "tick" programado funciona; hay que añadirle un modo de una sola pasada.
4. App Runner despliega por tag fijo: el CI tiene que pushear `:latest` además de `:sha`.

Solo tiene sentido si se prioriza no operar un ALB por encima de mantener los jobs tal como están.

## 10. Preguntas abiertas

1. ¿`micopay.app` está registrado y quién controla los NS? Todo cuelga de esto (Fase 0.6).
2. ¿`CORS_ALLOWED_ORIGINS` está seteado a mano en el dashboard de Render? Determina si A4 es un bug latente o algo que ya estaba resuelto fuera del repo.
3. ¿Contra qué URL están registradas hoy las suscripciones de webhook de Etherfuse?
4. ¿`EVENT_LISTENER_ENABLED` debe quedar en `false` (paridad con Render) o se aprovecha la migración para habilitarlo?
5. ¿Se conservan los datos de Render o se arranca limpio? (define si `SECRET_ENCRYPTION_KEY` se regenera o se copia — A15).
6. **Gatillo de `verify-full` (A5, Raúl):** ¿lo atamos a "antes de la primera operación con fondos reales / mainnet", o a una fecha? Hasta entonces `require` queda como interino consciente.
7. **Free Plan (A18, Raúl):** ¿upgrade a Paid Plan el día 1 (sin precipicio) o quedarse en Free con recordatorio de expiración?

---

## 11. Runbook de restauración de la BD (drill + emergencia)

Adoptado de la propuesta de Raúl (2026-07-23). **Cuándo:** pérdida o corrupción de datos, o recuperar a un punto en el tiempo. **Premisa que cambia todo:** un restore de RDS **no reusa el endpoint viejo** — crea una instancia nueva. Por eso los pasos 5–6 (repuntar la app) son obligatorios, no opcionales. La secuencia toca **RDS → SSM → ECS**.

1. **Elegir el punto de recuperación.** Un snapshot concreto, o un timestamp para PITR (point-in-time recovery, dentro de la retención de 7 días).
2. **Restaurar → instancia NUEVA.** Consola RDS → *Restore to point in time* o *Restore snapshot*. Colocarla en la **misma VPC, el mismo `micopay-db-subnets` y el SG `micopay-db`**, para que la app la alcance sin cambiar firewalls.
   ```powershell
   # PITR por CLI (ejemplo); la consola es más cómoda para el primer drill:
   aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier micopay-prod --target-db-instance-identifier micopay-restored --restore-time 2026-07-23T04:00:00Z --db-subnet-group-name micopay-db-subnets --vpc-security-group-ids $DbSg --no-publicly-accessible
   aws rds wait db-instance-available --db-instance-identifier micopay-restored
   ```
3. **Esperar `available` y anotar el endpoint nuevo.**
   ```powershell
   $NewHost = (aws rds describe-db-instances --db-instance-identifier micopay-restored --query "DBInstances[0].Endpoint.Address" --output text)
   ```
4. **Verificar los datos ANTES de repuntar nada.** Conectar a la instancia restaurada (desde la tarea, con `aws ecs execute-command`) y revisar conteos de tablas clave: `users`, `trades`, `wallets`, `ramp_orders`, `schema_migrations`. Si los datos no están, parar aquí — la instancia vieja sigue intacta.
5. **Actualizar `DATABASE_URL` en SSM** → apuntar al endpoint nuevo, **conservando `?sslmode=…`**:
   ```powershell
   aws ssm put-parameter --name /micopay/prod/DATABASE_URL --type SecureString --value "postgresql://micopay:$DbPass@${NewHost}:5432/micopay?sslmode=require" --overwrite
   ```
6. **Forzar redeploy en ECS** para que la app tome el endpoint nuevo (los secretos se leen al arrancar, §7 de la guía). ~40 s de corte (el conocido):
   ```powershell
   aws ecs update-service --cluster micopay --service micopay-backend --force-new-deployment
   aws ecs wait services-stable --cluster micopay --services micopay-backend
   ```
7. **Verificar la app:** `/health` en 200 con `dbConnected: true` + una prueba rápida de un endpoint real (p. ej. listar merchants).
8. **Dar de baja la instancia vieja/rota SOLO tras confirmar** que la nueva sirve. Recordar `--no-deletion-protection` antes de borrar (A17).

**Notas:**
- Si algún día se conecta por un alias/CNAME propio en vez del endpoint de RDS, revisar que el repunte no rompa — especialmente relevante el día que se pase a `verify-full` (el hostname tiene que coincidir con el cert).
- **Tiempo estimado del restore:** de minutos a decenas de minutos según tamaño. Cronometrarlo en el primer drill y anotarlo aquí.
- Alternativa gestionada: **AWS Backup → Restore Testing** automatiza este drill de forma recurrente y valida que el backup es restaurable sin intervención manual.
