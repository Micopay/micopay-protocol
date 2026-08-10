# Plan de implementación — split del repo de agentes y puente XRPL para atomic swaps

**Fecha:** 2026-08-07
**Repo origen (este):** `micopay-protocol` — `C:\Users\eric\Desktop\HACKATON`
**Repo destino:** **`Micopay/micopaybridge`** — https://github.com/Micopay/micopaybridge
(ya existe: creado 2026-07-23, **público**, rama por defecto `main`, contiene solo
`LICENSE` (MIT, © Micopay). Greenfield en la práctica.)
**Ejecuta:** Sonnet, coordinado por Raúl
**Entregable final:** puente XRPL↔Stellar para atomic swaps HTLC, con demo de agente sin custodio
**Documento de la convocatoria:** [`SUBMISSION.md`](./SUBMISSION.md)

---

## 0. Objetivo y regla de oro

Dos cosas a la vez, en este orden:

1. **Separar.** Todo lo de agentes —AIGENTS/x402, Bazaar, ZK, la API de protocolo, el
   frontend de demos y los contratos de swap— sale de este monorepo y se va a
   `micopaybridge`. Este repo se queda **solo** con el APK y la app móvil.
2. **Terminar el puente.** En el repo nuevo se completa la pata XRPL del atomic
   swap, que hoy no existe: está simulada con una segunda instancia de Soroban.

> **Regla de oro: este repo no se toca hasta que el nuevo esté verde.**
> El split es una copia, no un `git mv`. Primero `micopaybridge` compila, pasa
> tests y corre el demo; **después** se abre un PR aquí que borra lo movido. Si se
> borra primero, cualquier problema deja las dos mitades rotas al mismo tiempo.

---

## 1. Lo que hay que entender antes de copiar un archivo

Este monorepo tiene **duplicados divergentes** de casi todo. Copiar la carpeta
equivocada es el error más probable de esta migración, y es silencioso: compila
igual.

### 1.1 Dos APIs

| | `apps/api` | `micopay/backend` |
|---|---|---|
| Qué es | API de protocolo x402 para **agentes** | Backend del **APK**, en producción |
| Desplegado | **No.** `render.yaml:3` lo documenta | Sí (`micopay-api.onrender.com`, y ahora ALB+ECS) |
| Destino | **se mueve** | **se queda** |

`apps/api` contiene además copias *pre-port* de rutas retail (`auth`, `merchants`,
`stellar`, `trades`, `users`) que quedaron obsoletas cuando el retail se portó a
`micopay/backend`. El commit `1811016` ya borró las de Etherfuse por esta razón:

> *"Keeping the drifted fork risks edits landing in the dead copy."*

**Esas copias no se migran.** Ver §3.2.

### 1.2 Dos escrows en Soroban, y no se deben mezclar

`micopay/contracts/TESTNET.md:3-4` es explícito:

> *Canonical IDs for the **mobile stack**. The `micopay-api` x402 service uses a
> separate escrow contract; **do not mix them**.*

| Copia | Líneas | Último cambio | ID desplegado | Destino |
|---|---|---|---|---|
| `micopay/contracts/escrow` | 277 | 2026-04-11 | `CB4M5777…ALO3HZ` (móvil) | **se queda** |
| `contracts/micopay-escrow` | 259 | 2026-04-09 | `CBQINHLR…WHVQQP3A` (x402) | **se mueve** |

Divergieron en abril. No son intercambiables y **no hay que "unificarlas"** como
parte de esta migración: es un cambio de comportamiento en producción disfrazado
de limpieza.

### 1.3 El "cross-chain" de hoy son dos contratos en la misma cadena

En `render.yaml:18-21`:

```
ATOMIC_SWAP_CONTRACT_A = CCDOUXIXSFXT2HTJAJGFNUJN6CKCYX2M6AL2BHHPEF6ISNHP2BGLS4KX
ATOMIC_SWAP_CONTRACT_B = CBLCGG44QQILWEIVBXDSZSLH7NI7SGJQKXQ7WTKP3W3YSXOBTGMZKSNN
```

y en `.env.example`:

```
ATOMIC_SWAP_CONTRACT_B_ID=   # Second instance for demo (chain B simulation)
```

**Eso es exactamente lo que el puente XRPL viene a reemplazar.** La cadena B
simulada se sustituye por un escrow nativo en XRPL. Tenerlo claro ahorra
discusiones: no se construye algo nuevo desde cero, se sustituye una pata falsa
por una real.

Y ojo: `apps/api/src/routes/swaps.ts` solo expone **lecturas** (dos `GET`), y
`demo.ts` no ejecuta un swap de dos patas — bloquea USDC en `MicopayEscrow` y lo
describe como "cross-chain collateral" (`demo.ts:161,178`). **La orquestación de
dos patas no existe todavía.** Es parte del entregable, no algo que se hereda.

---

## 2. Inventario del split

### 2.1 Se mueve a `micopaybridge`

| Origen | Qué es | L aprox. | Nota |
|---|---|---|---|
| `apps/api/` | API de protocolo x402 | 11 627 | **filtrado**, ver §3.2 |
| `apps/agent/` | AIGENTS: intent parser, executor, tools | 574 | último cambio abr-2026 |
| `apps/web/` | Frontend de demos | 5 638 | **filtrado**, ver §3.3 |
| `packages/sdk/` | `AtomicSwapClient` (`lock/release/refund/getStatus`) | 343 | pieza central del puente |
| `packages/types/` | tipos compartidos | 294 | |
| `contracts/atomic-swap/` | `AtomicSwapHTLC` + `test.rs` | — | **el contrato a espejar** |
| `contracts/htlc-core/` | primitivas HTLC compartidas | — | |
| `contracts/zk-verifier/` | `ZkVerifierRegistry`, desplegado `CBOWU3OV…VREUQC7` | — | |
| `contracts/micopay-badges/` | badges | — | verificar si está en uso |
| `contracts/micopay-escrow/` | escrow del servicio x402 | 259 | **no** el del móvil (§1.2) |
| `circuits/` | Noir: `access_credential_v1`, `poseidon_preimage`, `reputation_v1` | — | |
| `docs/zk-agent-credentials/`, `docs/ZK-as-a-Service/`, `docs/xrpl-hackathon/` | especificaciones y submission | — | |

### 2.2 Se queda en este repo

`micopay/` completo (backend, frontend, contracts, sql, scripts), el APK, y la
documentación del rediseño visual y de cumplimiento.

### 2.3 Sin decidir — **preguntar a Eric, no adivinar**

- **`apps/telegram-bot/`** (257 L, abr-2026): tiene P2P matching y tasas de CETES,
  o sea que parece retail, pero es un canal de bot, no la app. Eric no lo mencionó.
- **`contracts/micopay-badges/`**: no aparece referenciado en `render.yaml` ni en
  `.env.example`. Confirmar si está vivo antes de arrastrarlo.

---

## 3. Fases

### M0 — Preparar el repo destino

1. Clonar `Micopay/micopaybridge` (ya creado). Su `LICENSE` es MIT © Micopay: **no
   sobrescribirlo** con el de aquí, que dice © ericmt-98. Copiar sí el
   `CONTRIBUTING.md` de este repo.
   1.1. **El repo es público.** Todo lo que se copie queda a la vista desde el
   primer push, incluidos `middleware/x402.ts` con **SEC-13 y SEC-14 abiertos**
   (§M5). Antes del primer push: barrer `.env*`, llaves y secretos del material
   copiado, y decidir si SEC-13 se cierra antes de publicar o se documenta como
   agujero conocido en el README. Publicar el hallazgo sin la nota es peor que no
   publicar.
2. Monorepo npm con workspaces, igual que aquí (`apps/*`, `packages/*`) y `turbo`.
   No inventar otra herramienta: el objetivo es que el código copiado compile sin
   reescribir imports.
3. Workspace Rust: copiar `contracts/Cargo.toml`, `Cargo.lock` y
   `rust-toolchain.toml` **tal cual**, y recortar los `members` a los contratos
   que se migran.
4. **CI desde el primer commit**, con tres gates que no se pueden saltar:
   `tsc --noEmit`, `npm test`, `cargo test`. Este repo se rompió antes por no
   tener gate de build; no repetirlo.

**Gate M0:** el repo vacío pasa CI.

### M1 — Copiar el código, en este orden

De abajo hacia arriba, para que cada paso compile por sí solo:

1. `packages/types` → 2. `packages/sdk` → 3. `contracts/*` + `circuits/*` →
4. `apps/agent` → 5. `apps/api` (filtrado) → 6. `apps/web` (filtrado)

Copiar con historia si se puede (`git subtree`/`filter-repo` sobre las rutas
migradas). Si sale caro, copia plana **con un commit inicial que liste los SHAs de
origen de cada carpeta**, para poder rastrear después.

**Gate M1:** `tsc --noEmit` en cero errores y `cargo test` verde en el repo nuevo.

### M2 — Filtrar `apps/api`

`apps/api` arrastra **21 errores de `tsc`** hoy. Están, casi todos, en los módulos
retail que no se migran:

| Archivo | Errores | Acción |
|---|---|---|
| `src/__tests__/merchant.test.ts` | 3 | no migrar |
| `src/__tests__/trade-messages.test.ts` | 2 | no migrar |
| `src/routes/trades.ts` | 13 | no migrar |
| `src/routes/reputation.ts` | 3 | **migrar y arreglar** (§4) |

**Rutas que NO se migran** (duplicados retail — la versión viva está en
`micopay/backend`): `auth.ts`, `merchants.ts`, `stellar.ts`, `trades.ts`,
`users.ts`, `trade-messages.ts`, `cash.ts`, `cetes.ts`, `blend.ts`, `fund.ts`.

**Rutas que sí se migran:** `agent.ts`, `bazaar.ts`, `credentials.ts`,
`inference.ts`, `reputation.ts`, `services.ts`, `swaps.ts`, `zk.ts`, `demo.ts`,
`health.ts`, más `middleware/x402.ts`, `db/x402.ts`, `db/bazaar.ts` y `src/cli/`
(los CLIs de ZK: `deploy-zk`, `rep-engine`, `verify-demo`).

> Cuidado con `demo.ts`: es el guion del demo y hoy toca rutas retail. Al filtrar
> hay que recortarlo, no borrarlo. Es el punto donde después entra el swap real.

**Gate M2:** `apps/api` compila en cero errores **sin** los módulos retail. Si al
quitarlos siguen quedando errores, se arreglan; no se silencian con `any` ni con
`@ts-ignore`.

### M3 — Resolver la dependencia que cruza la frontera

Este es el punto que hace que el split **no** sea limpio, y hay que decidirlo
antes de escribir código.

`apps/api/src/routes/reputation.ts` sirve tiers de reputación a agentes detrás de
x402 (`requirePayment`), pero los calcula leyendo **datos de comercios**
(`getVerifiedMerchants`, `db/merchants.ts`) que después del split son propiedad
del backend móvil. O sea: el repo de agentes necesita datos que ya no le
pertenecen.

Tres salidas, con su costo:

| Opción | Costo | Riesgo |
|---|---|---|
| (a) El repo de agentes lee la misma base en **solo lectura** | bajo | acopla los dos repos a un mismo esquema; una migración del móvil puede romper agentes sin avisar |
| (b) El backend móvil expone un endpoint interno de reputación y agentes lo consume | medio | contrato explícito y versionable — **recomendada** |
| (c) Cada repo con su copia de los datos | bajo hoy | deriva garantizada; es el error que `1811016` ya documentó |

**Recomendación: (b).** Y mientras no exista, (a) con una nota `TODO` visible, no
(c).

**Gate M3:** decidido y escrito en el README del repo nuevo. Sin esto, el resto se
construye sobre arena.

### M4 — El puente XRPL (el entregable de verdad)

#### M4.1 Antes de escribir código: dos verificaciones que pueden cambiar el diseño

1. **¿El activo de la pata XRPL es XRP nativo o un token emitido (RLUSD, IOU)?**
   El escrow nativo de XRPL nació para XRP. El soporte de escrow para activos
   emitidos depende de amendments, y su estado hay que **verificarlo contra la red
   que se vaya a usar** (`server_info` / lista de amendments habilitados), no
   contra un blog. Si el demo necesita un token emitido y el amendment no está
   activo en esa red, el "cero smart contract" del submission se cae y hay que
   replantear.
2. **¿Qué red XRPL?** Testnet o Devnet, y con qué faucet. Fijarlo en el README.

No avanzar a M4.2 sin estas dos respuestas por escrito.

#### M4.2 Reutilizar, no reinventar

Ya hay dos implementaciones propias de HTLC en XRPL, ambas en
`C:\Users\eric\Desktop\Ecosistema XRPL\`:

- **`Avales Liquidos`** — escrow nativo con `Condition` + `CancelAfter`, y
  deliberadamente **sin** `FinishAfter`; 69 tests pasando. **Es el punto de
  partida de la pata XRPL.**
- **`coffee_xrpl_platform`** — modo HTLC con preimage SHA-256.

Primera tarea real: leer esos dos, extraer la construcción de `Condition` y
`Fulfillment`, y portarla. No escribir el encoding de crypto-conditions desde cero.

#### M4.3 La traducción entre ledgers — donde vive el bug

Los dos ledgers no codifican igual **ninguna** de las dos mitades del HTLC:

| | Soroban (`contracts/atomic-swap/src/lib.rs`) | XRPL |
|---|---|---|
| Hash | `sha256` crudo, 32 bytes comparados byte a byte (`lib.rs:134`) | crypto-condition **tipada** (PREIMAGE-SHA-256); el `Fulfillment` va aparte en `EscrowFinish` |
| Expiración | secuencia de ledger absoluta `u32` (`timeout_ledger`, `lib.rs:26`) | **Ripple epoch** — segundos desde 2000-01-01, no Unix — vía `CancelAfter` |
| Revelación | `release` **publica el secreto en un evento** (`lib.rs:154-158`) | el `Fulfillment` queda en la transacción `EscrowFinish` |

Reglas no negociables:

1. **La `Condition` de XRPL se deriva del mismo preimage que usa Soroban.** Nunca
   se genera una independiente. Si se generan por separado, el swap no es atómico:
   son dos escrows sin relación.
2. **El invariante de seguridad se mantiene cruzando bases de tiempo distintas.**
   `lib.rs:37` lo declara: `initiator_timeout > counterparty_timeout`. Al pasar
   secuencia-de-ledger a reloj de pared hay que conservar el margen, no solo
   convertir el número. Que una pata expire antes de que la otra complete es
   **la** clase de bug de este trabajo.
3. `lock` exige `timeout_ledgers >= MIN_TIMEOUT_LEDGERS` (`lib.rs:67`). El
   equivalente XRPL necesita su propio piso, derivado del mismo margen.
4. En XRPL el fee de `EscrowFinish` **escala con el tamaño del fulfillment**.
   Presupuestarlo; no asumir fee base.

**Tests obligatorios de esta parte** (no "probar el happy path"):

- Mismo preimage → la `Condition` de XRPL y el `secret_hash` de Soroban
  corresponden. Vector fijo, comparación byte a byte.
- La pata del iniciador expira **después** que la del contraparte, en las dos
  bases de tiempo, con márgenes de reloj adversos.
- Contraparte revela → el relay completa en la otra cadena.
- Nadie revela → **ambas** patas reembolsan, ninguna queda atrapada.
- Contraparte revela **justo antes** de su `CancelAfter` → el iniciador todavía
  alcanza a reclamar. Este es el test que atrapa el invariante mal traducido.

#### M4.4 El relay

Observa los dos ledgers; cuando el secreto aparece en uno, reenvía el claim en el
otro. **No custodia**: solo reenvía un preimage que ya es público.

Requisitos que no son opcionales para algo que mueve dinero:

- **Idempotente.** Reenviar dos veces no debe romper ni pagar dos veces.
- **Reanudable.** Si el relay muere a mitad, al volver retoma desde el último
  ledger procesado. Persistir el cursor de cada cadena.
- **Observable.** Log estructurado de cada intento con `swap_id` y ledger.
- Sin llaves de usuario: solo la llave del relay, que paga fees y nada más.

#### M4.5 Sustituir la cadena B simulada

Cambiar la orquestación para que la pata B sea XRPL en vez de
`ATOMIC_SWAP_CONTRACT_B`. Aquí es donde se construye lo que hoy no existe: el
flujo `lock → reveal → claim` de dos patas de punta a punta (§1.3).

### M5 — Demo

Dos agentes cerrando un swap XRPL↔Stellar sin custodio, con la UI de `apps/web`
(`SwapStatus.tsx`, `BazaarFeed.tsx`, `DemoTerminal.tsx` ya existen).

**Decidir antes:** ¿el demo necesita AIGENTS real? Porque x402 tiene **dos
agujeros confirmados y abiertos**:

- **SEC-13** — `verifyPayment()` acepta un pago como válido parseando el XDR, **sin
  consultar Horizon ni validar firma ni saldo**. Se puede "pagar" con una
  transacción que nunca se envió.
- **SEC-14** (issue #245) — el anti-replay nunca persiste: `useDatabase` está fijo
  en `false`, todo vive en memoria.

Esto **no** rompe la atomicidad del swap, que es criptográfica. Sí rompe la capa
que el submission presenta como coordinadora. Si el demo se enseña a un jurado,
cerrar SEC-13 es trabajo extra que hay que presupuestar; si basta un agente
guionizado, se documenta como tal y no se presenta como confiable.

---

## 4. Correcciones al `SUBMISSION.md`

Dos afirmaciones no coinciden con el código. Corregirlas en el repo nuevo, y en la
convocatoria si todavía se puede editar:

1. **"Su schema `AssetInfo` tiene reservado un campo `chain` por activo desde el
   día uno."** En el contrato no existe. El struct `AtomicSwap`
   (`contracts/atomic-swap/src/lib.rs:19-28`) no tiene ningún campo de cadena ni
   de metadatos de activo. `AssetInfo { chain, symbol, amount }` es una interfaz
   **TypeScript** en `apps/api/src/routes/bazaar.ts:22`, off-chain. Lo reservado
   está en la capa de aplicación, no en el ledger.
2. **`MicopayEscrow` "corre el flujo retail de producción"** es cierto — pero de la
   copia `micopay/contracts/escrow`, que **se queda en el repo del APK**. La que se
   migra es la del servicio x402. Ver §1.2.

Lo que sí verifiqué y está correcto: la nota de que `MicopayEscrow` implementa solo
`initialize/lock/release/refund/get_trade`, sin disputas ni reputación, y que
`AtomicSwapHTLC` es HTLC puro.

---

## 5. Criterios de aceptación

**Del split:**

- `micopaybridge` pasa `tsc --noEmit`, `npm test` y `cargo test` en CI.
- No queda **ninguna** referencia a `micopay/backend`, `micopay/frontend` ni a los
  IDs de contrato del stack móvil en el repo nuevo.
- Ninguna de las rutas retail listadas en §3.2 existe en el repo nuevo.
- El README dice, en una tabla, qué vive en cada repo y cuál es la frontera de §3.
- Este repo sigue verde: el APK compila e instala, y `micopay/backend` arranca.
- El PR que borra lo migrado de aquí se abre **al final** y no toca `micopay/`.

**Del puente:**

- Un swap XRPL↔Soroban completo contra testnet, con transacciones citables en
  ambos ledgers.
- Los cinco tests de §M4.3 pasando, incluido el de revelación al filo del timeout.
- El relay sobrevive a que lo mates a mitad de un swap y lo reinicies.
- Ni el relay ni la API custodian fondos en ningún momento. Verificado leyendo el
  flujo, no afirmado.
- Reembolso demostrado en las dos patas cuando nadie revela.

---

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R-1 | Copiar el duplicado equivocado (escrow del móvil, rutas retail pre-port). Compila igual, y la deriva aparece semanas después. | §1.2 y §3.2 con rutas exactas. Revisar cada carpeta copiada contra el inventario antes de commitear. |
| R-2 | Que el amendment de escrow para tokens emitidos no esté activo en la red elegida, después de haber construido asumiendo que sí. | M4.1 es un gate, no una nota. |
| R-3 | Traducir el timeout como conversión numérica y perder el invariante. Falla en el peor momento: cuando alguien revela tarde. | Test explícito de revelación al filo (§M4.3). |
| R-4 | Reescribir el encoding de crypto-conditions desde cero teniendo dos implementaciones propias que ya funcionan. | M4.2 antes de M4.3. |
| R-5 | Que la frontera de §3 se resuelva con la opción (c) por ser la más rápida. | Es el error que `1811016` ya documentó en este repo. Decidir en M3 y escribirlo. |
| R-6 | Presentar el demo como confiable con SEC-13 abierto. | Decidir en M5 y documentarlo con honestidad. |
| R-7 | Borrar de este repo antes de que el nuevo esté verde. | La regla de oro de §0. |

---

## 7. Lo que NO hay que hacer

- **No unificar los dos escrows** ni los dos backends. Son divergencias
  deliberadas y una está en producción.
- **No tocar `micopay/`** desde el repo nuevo, ni copiar su código "por si acaso".
- **No arreglar los 21 errores de `tsc`** de los módulos retail: no se migran.
- **No refactorizar mientras se migra.** Copiar, poner verde, y después mejorar.
  Un refactor mezclado con una migración hace imposible saber qué rompió qué.
- **No cambiar el copy del `SUBMISSION.md`** más allá de las dos correcciones
  factuales de §4.

---

## 8. Preguntas abiertas para Eric

1. ~~Nombre y visibilidad del repo nuevo.~~ **Resuelto:** `Micopay/micopaybridge`,
   público. Queda la consecuencia, no la pregunta: ¿se cierra SEC-13 antes del
   primer push o se publica con la nota de "agujero conocido"? (§M0.1, §M5)
2. `apps/telegram-bot` y `contracts/micopay-badges`: ¿se mueven, se quedan o se
   archivan? (§2.3)
3. Pata XRPL: ¿XRP nativo o token emitido? (§M4.1 — bloquea el diseño)
4. Frontera de reputación: ¿opción (b) y quién construye el endpoint en el backend
   móvil? (§M3)
5. ¿El demo necesita AIGENTS real, con SEC-13/14 abiertos? (§M5)
6. ¿El registro del hackathon sigue abierto? El encabezado del `SUBMISSION.md` dice
   deadline 2026-07-21, que ya pasó — de eso depende si las correcciones de §4 se
   pueden aplicar en la convocatoria o solo en el repo.
