# Plan · Limpiar micopay-protocol: solo el APK y su infraestructura

**Fecha:** 2026-10-04, actualizado el 2026-10-05. **Versión:** 0.5. Incorpora tres revisiones de Codex; desde el 2026-10-05 Codex no está disponible y los PRs se revisan con la misma lista de verificación, con la evidencia en cada PR.
**Base revisada:** `main` en `e35f053`; bridge (`Micopay/micopaybridge`) en `f12ac556`.
**Estado (2026-10-05):** hechos M1, M2, F1, R1, R3, R5, R6 y R7. Faltan D1 → F2 → R4 → R2, R8, R9 (D3), F3 y D2.

## 0. Alcance y criterio

**Objetivo:** dejar `micopay-protocol` centrado en el APK y la infraestructura que necesita, sin romper la app ni perder funciones necesarias.

**Criterio:** se decide por función de producto, no por nombre de carpeta.
- "Agente" puede significar **proveedor de efectivo**, no agente de IA.
- Una función incompleta o sin imports puede seguir siendo necesaria.
- Las dependencias incluyen HTTP, enlaces de Android, scripts, configuración y despliegue.
- Nada pendiente de clasificar se retira por defecto.

**Fuera de alcance de este plan:**
- Organizar la documentación. Los `.md`, requisitos (`.kiro/`, `.opencode/`) e históricos se conservan tal cual; su reorganización es una fase posterior. Solo se ajustan instrucciones operativas cuando cambie un comando o una ruta.
- Archivos locales sin versionar (`video-studio/`, `tmp/`, `.agent-wallet/`, `.docx`, `node_modules/`, `dist/`). No se tocan.

## 1. Se conserva

- `micopay/` completo, incluido `micopay/contracts/escrow` (el escrow del APK).
- `.github/`.
- `contracts/micopay-badges/`, hasta decidir el mecanismo de reputación (D2).
- PostgreSQL local: `docker-compose.yml` y los archivos que usa, incluido `deploy/backup/` mientras el compose lo referencie (`docker-compose.yml:14,42`).
- `render.yaml`, hasta comprobar su uso operativo (D3).
- Documentación, requisitos y archivos históricos.

## 2. Hallazgos verificados en el código

Todo lo de esta sección es lectura de código en `e35f053`. Nada de esto se ha probado en un teléfono, en AWS ni en el bridge desplegado.

**Los tres tipos de QR no son iguales:**

| QR | Lo genera | Lo procesa | Estado |
|---|---|---|---|
| a) Retiro (`micopay://release?trade_id&claim_token`) | El cliente (`QRReveal`) | Bandeja del agente: `merchantConfirmScan` (`MerchantInbox.tsx:377`) | Retiro completado el 2026-09-24 con el bot de demo, que llama al servidor directamente; **el escáner de la bandeja no se probó** |
| b) Depósito (`micopay://confirm?trade_id`) | El cliente (`DepositQR`) | Bandeja del agente: `reveal` (`MerchantInbox.tsx:362`) | Implementado en #396; **sin probar en el teléfono** (el depósito del 2026-09-24 lo hizo el bot por el servidor) |
| c) Cobro por enlace (`micopay://claim?request_id&amount_mxn&htlc`) | `ClaimQR.tsx:69` | **Nadie:** `MerchantInbox` solo acepta `confirm` y `release`; el parser lo reconoce (`qrPayload.ts:126`) pero el escáner lo rechaza | **Incompleto** |

**El cobro por enlace (`ClaimQR`), en detalle:**
- `main.tsx:47` abre `ClaimQR` si `window.location.pathname` es `/claim/:id`.
- `AndroidManifest.xml:35-42` declara App Links para `https://app.micopay.xyz/claim/*` con `autoVerify`.
- **No hay manejo de `appUrlOpen` ni `getLaunchUrl`** en la app. Dentro del APK, el `pathname` es el de la app local, no el del enlace: lo más probable es que un enlace abra la app en el inicio y no en `ClaimQR`. *Inferido del código, no probado.*
- `ClaimQR.tsx:78` consulta `/api/v1/cash/request/:id` en `VITE_PROTOCOL_API_URL`, que no está definida en `.env.production`: **sin configuración adicional, cae en `http://localhost:3000`**. El APK publicado pudo recibir la URL al compilarse; **el artefacto publicado está pendiente de verificar.** `render.yaml:2-7` dice que `apps/api` no está desplegada.
- **`app.micopay.xyz` no existe en DNS** (NXDOMAIN, comprobado el 2026-10-05). Los App Links del `AndroidManifest` apuntan a un dominio que no resuelve: no hay `assetlinks.json` que verificar y un enlace `https://app.micopay.xyz/claim/...` no abre nada. F2 tiene que elegir un dominio real.

**Otros:**
- `scripts/agent-wallet.mjs` es la cuenta de un proveedor de efectivo por terminal ("Juanita Tienda"), que replica la cartera móvil. Calculaba su estado como `resolve(__dirname, '..')/.agent-wallet`: moverla cambiaba esa ubicación (resuelto en M1).
- `src/utils/circuit-breaker.factory.ts` contiene solo un comentario. Existen la configuración (`src/config/circuit-breaker.config.ts`, 56 líneas) y pruebas que importan la fábrica. No hay circuit breakers en `micopay/backend`. `PENDIENTES_2026-09-24.md:66` lo daba por hecho.
- La imagen del backend se construye con contexto `micopay/` y copia `sql` (`Dockerfile:50`) y `backend/public` (`:47`).
- `render.yaml:2-7`: al 2026-06-30, el servicio de Render `micopay-api.onrender.com` corría el bloque `micopay-backend` y se gestionaba a mano. **Comprobado el 2026-10-05:** sigue respondiendo (arranque en frío de 52 s), pero `/health` devuelve 503 con `dbConnected: false`. El APK no lo usa: `.env.production` apunta a `https://api.micopay.app`, que responde 200 con base de datos conectada.
- Los contratos: `micopay/contracts/escrow` (APK, se queda, sin dependencia de `contracts/htlc-core`); `contracts/micopay-escrow` (protocolo x402); `contracts/delegated-release-htlc` (tercera variante, libera sin `require_auth`, depende de `htlc-core`; no sustituye al del APK). Los dos primeros paquetes se llaman igual.
- **`apps/api` usa** `packages/sdk` y `packages/types` (`package.json:27-28`, `tsconfig.json:8-9`, `routes/swaps.ts:3`), `circuits/` (`cli/deploy-zk.ts:31-42`, `cli/rep-engine.ts:27`) y `contracts/zk-verifier` (`cli/deploy-zk.ts:257`). No usa `atomic-swap` ni `micopay-escrow`.
- **Dependientes de `contracts/htlc-core`:** `atomic-swap`, `micopay-escrow` y `delegated-release-htlc`. `zk-verifier` y `micopay-badges` no lo usan.
- **El bridge no es una copia exacta:** `apps/api`, `apps/web`, `packages/sdk`, `packages/types` y `skill/` tienen fuentes distintas o ausentes allá. Que una ruta exista en el bridge no demuestra equivalencia.
- **El CI no basta:** vitest tiene `continue-on-error: true` (`ci.yml:73`) y el frontend se reinstala sin su lockfile (`ci.yml:64`). No construye el APK ni prueba el escrow en Rust.

## 3. Decisiones pendientes

| # | Decisión | Recomendación |
|---|---|---|
| D1 | **Frontera mínima del cobro por enlace.** `ClaimQR` se conserva en la app. Falta decidir dónde vive el endpoint de solicitudes de cobro que consulta: (a) en el backend del bridge, desplegado y con su URL configurada en el APK; o (b) un endpoint mínimo en `micopay/backend`. En ningún caso se copia toda la API del protocolo | Definirla con la lista exacta de endpoints que usan `ClaimQR` y el escaneo del agente |
| D2 | **Mecanismo de reputación de proveedores** | Conservar `contracts/micopay-badges` hasta decidirlo |
| D3 | **`render.yaml`** | Activo pero roto (sin base de datos) y sin uso del APK (§2). Recomendación: apagar el servicio en el panel de Render y retirar `render.yaml` (R9). Apagarlo es decisión de Eric |

## 4. Cambios funcionales (PRs propios, separados de movimientos y retiradas)

**F1 · Resiliencia (circuit breakers).** ✅ **Hecho: #417** (`cbde46a`). Breaker propio sin dependencias en `micopay/backend/src/lib/`, conectado a Didit, Etherfuse, Stellar RPC y al event listener; 25 pruebas (`test:circuit-breaker`, `test:upstream-resilience`) y comprobación por mutaciones. **Sin desplegar** y sin probar contra los servicios reales. Desarrollo, no limpieza; no bloquea el resto del plan.
- Mover la configuración y las pruebas a `micopay/backend/src` y escribir la fábrica.
- Conectarla a `didit.service.ts:11`, `etherfuse.service.ts:14` (y sus `fetch` de tasas en :228 y :236) y al acceso a Stellar RPC (`stellar.service.ts`, `event-listener.service.ts:217`, `routes/stellar.ts:46`).
- Reglas: reintentar solo fallos transitorios y lecturas; **no duplicar órdenes ni transacciones** por una respuesta perdida (la creación de sesión de Didit es un POST); en envíos Stellar inciertos, **reconciliar por hash** antes de reintentar; timeouts con cancelación; el fallback nunca finge KYC aprobado, orden creada ni fondos bloqueados.
- *Terminado cuando:* pruebas reales de apertura, rechazo sin tocar la red, recuperación en semiabierto y timeout, registradas en los scripts del backend; los archivos de `src/` de la raíz no se retiran hasta que esto esté integrado.

**F2 · Cobro por enlace completo** (después de D1).
- Abrir `ClaimQR` desde el enlace con la app cerrada, abierta y sin instalar (`appUrlOpen` y `getLaunchUrl`, o equivalente).
- Configurar la URL de la API en los `.env` de cada entorno.
- Que la bandeja del agente procese el QR `claim`, con la verificación que defina D1.
- *Terminado cuando:* el recorrido completo (enlace → `ClaimQR` → escaneo del agente → cobro) funciona en el teléfono con la app cerrada, abierta y sin instalar; **un mismo QR no permite cobrar dos veces**; y el servidor verifica **monto, destinatario y autorización** (no se confía en lo que trae el QR).

**F3 · Ajustes de `agent-wallet`** (después de M1), si los necesita contra el protocolo actual. Separado del movimiento. Registrado en M1 (#412):
- `@stellar/stellar-sdk` pasó de 13.3.0 (raíz) a 14.6.1 (backend). Construcción y firma offline idénticas en las dos versiones; `register`, `login`, `trustline` y `release` no se han ejecutado contra la red ni el backend.
- `AGENT_API_URL` cae por defecto en `http://localhost:3002`: confirmar contra qué backend debe apuntar hoy.

## 5. Movimientos (sin cambios funcionales)

**M1 · `scripts/agent-wallet.mjs` → `micopay/backend/scripts/`.** ✅ **Hecho:** PR #412, mergeado en `0819496` con visto bueno de Codex. Misma cuenta (`juanita_tienda`) y mismo estado en `.agent-wallet/` de la raíz; SDK 14.6.1 compatible en construcción y firma offline.
- Preservar explícitamente la ubicación del estado existente (`.agent-wallet/` en la raíz del repo).
- No mover ni versionar llaves, cuentas ni JWT.
- *Terminado cuando:* `whoami` muestra la misma cuenta antes y después del movimiento.

**M2 · Al bridge** (PR allá; registrar origen, destino y estado de cada ruta). ✅ **Hecho: `micopaybridge#47`**, mergeado en `5f2528a` con visto bueno de Codex; CI de `main` del bridge en verde. Copia sin cambios desde `0819496` (`a838578`) más un commit de adaptación (`095dac3`):
- `contracts/delegated-release-htlc/` → `contracts/delegated-release-htlc/`, agregado al workspace de Cargo; sus 17 pruebas pasan en el CI.
- `apps/telegram-bot/` → `archive/apps-telegram-bot/` (fuera del workspace de npm, para no tocar `package-lock.json`, que también modifica el PR #25 del bridge), con `ARCHIVO.md` que explica que está preservado y no integrado.
- `examples/agent/` → `examples/agent/`.
- `setup-demo-agent.mjs`, `demo-atomic-swap.mjs` (marcado como demo histórica), `deploy-contracts.sh`, `demo.sh`, `prove-mock-stellar.js` → `scripts/`, con `scripts/README.md` de requisitos.
- `deploy-contracts.sh` ahora compila solo `atomic-swap` y `micopay-escrow`. **Sin verificar en la práctica:** no se pudo compilar a WASM en local y el CI no lo construye.
- Los documentos que el plan v0.2 mandaba al bridge se posponen.

## 6. Retiradas (conjuntos pequeños y comprobables)

Antes de cada una, se registra en la descripción del PR: origen, destino y si cada ruta fue copiada, evolucionada, sustituida por la app o descartada con justificación.

| PR | Qué se retira | Bloqueado hasta |
|---|---|---|
| R1 ✅ #414 | `apps/agent/`, `contracts/atomic-swap/`, `contracts/micopay-escrow/` | Registro de equivalencia con el bridge; `contracts/Cargo.toml` y `Cargo.lock` actualizados para que ningún `member` apunte a algo borrado. `apps/api` no los referencia |
| R2 | `packages/sdk/`, `packages/types/`, `circuits/`, `contracts/zk-verifier/` | **R4.** `apps/api` los usa: `package.json:27-28` y `tsconfig.json:8-9` (paquetes), `routes/swaps.ts:3` (tipos), `cli/deploy-zk.ts:31-42,257` y `cli/rep-engine.ts:27` (circuitos y verificador). Alternativa: trasladar antes esas herramientas de `apps/api` |
| R3 ✅ #416 | `apps/web/` | Registro de qué pantallas retail sustituye la app |
| R4 | `apps/api/` | **F2 terminado** (sin eso se rompe el cobro por enlace) |
| R5 ✅ #414 | Lo movido en M1 y M2, en su ubicación original | M1 y M2 terminados (ya lo están) |
| R6 ✅ #415 | `contracts/htlc-core/` | **R1 y M2**: dependen de él `atomic-swap` y `micopay-escrow` (R1) y `delegated-release-htlc` (M2). `zk-verifier` y `micopay-badges` no lo usan |
| R7 ✅ #418 | `src/` de la raíz | **F1 integrado** |
| R8 | Configuración Node/Turbo de la raíz: `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.base.json`, `.turbo/` | Al final, sin consumidores restantes (R1–R7) |
| R9 | `render.yaml` | D3 |

`prompt.md` (vacío) puede ir en cualquiera de ellos.

## 7. Orden de PRs

1. ✅ **M1** (agent-wallet). Después, si hace falta, **F3**.
2. ✅ **F1** (resiliencia).
3. ✅ **M2** (al bridge).
4. ✅ **R1** y **R5** (juntos, #414), ✅ **R3** (#416), ✅ **R6** (#415).
5. **D1 → F2 → R4 → R2**: cobro por enlace completo, después retirar `apps/api` y, al final, lo que solo ella usaba. **Siguiente paso: D1.**
6. ✅ **R7** (#418).
7. **R8**, al final.
8. **R9**, según D3.

## 8. Verificación

**Antes y después de cada PR**, con dependencias comparables y distinguiendo fallos previos de regresiones:
- Build y pruebas pertinentes del backend y del frontend, con vitest leído del log (no la conclusión del paso).
- Instalación limpia de `micopay/backend` y `micopay/frontend`, sin depender del `node_modules` de la raíz.
- Construcción del APK.
- Construcción de la imagen del backend con contexto `micopay/`, comprobando que contiene `/app/sql` y `public/`.
- Migraciones y pruebas relevantes contra PostgreSQL.
- `cargo test` del escrow del APK (`micopay/contracts/escrow`).

**En el teléfono**, al menos al final de la Fase de retiradas y tras F2:
- Retiro.
- Depósito.
- Cancelación y reembolso.
- Cobro completo por enlace (no solo abrir la página), con la app cerrada, abierta y sin instalar.
- Actualización sobre el APK instalado sin perder la cartera.

Ninguna prueba se marca como hecha si solo se revisó código. "CI verde" no basta por sí solo.

**Limitación del entorno local (Windows):** `cargo` falla al enlazar o al desempaquetar dependencias, incluso con contratos que ya existían; los contratos se verifican en el CI de Linux.

## 9. Historial del plan

- **v0.1:** inventario inicial.
- **v0.2:** primera revisión de Codex: `ClaimQR` depende por HTTP de `apps/api`; `agent-wallet` es de la app; el bridge no es copia exacta; los circuit breakers se completan en vez de borrarse.
- **v0.3:** segunda revisión de Codex: `ClaimQR` se conserva y su cobro por enlace hoy está incompleto (sin manejo de App Links, sin URL de API en producción, la bandeja rechaza el QR `claim`); se separan cambios funcionales, movimientos y retiradas; la documentación queda para después; se conservan PostgreSQL local, `render.yaml` y los badges hasta decidir.
- **v0.4:** tercera revisión de Codex: R2 (`packages/*`) y los circuitos y el verificador ZK esperan a R4, porque `apps/api` los usa; el APK publicado puede tener la URL de la API (pendiente de verificar); F2 exige que un QR no cobre dos veces y que el servidor verifique monto, destinatario y autorización; M1 va primero. Después: M1 (#412) y M2 (`micopaybridge#47`) hechos.
- **v0.5 (2026-10-05):** hechos R1+R5 (#414), R6 (#415), R3 (#416, con el registro de pantallas retail en el PR), F1 (#417) y R7 (#418). Hallazgos nuevos: `app.micopay.xyz` no existe en DNS; Render responde pero sin base de datos y el APK no lo usa. Los `package-lock.json` y `Cargo.lock` de la raíz se editaron a mano en cada retirada (sin regenerar), porque ya estaban desincronizados; se regeneran en R8.
- **Nota:** el 2026-10-04 el archivo quedó vacío al llenarse el disco durante una escritura; se reconstruyó desde la conversación con el mismo contenido.
