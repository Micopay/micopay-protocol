# Plan — Deploy MicoPay infrastructure + ship a presentable mobile app

> **Re-auditado 2026-06-27 contra el código actual.** Las 6 *findings* y las 4 *audit corrections*
> del plan original (2026-06-26) fueron **re-verificadas una por una contra el source** y siguen
> siendo correctas, salvo las que ya resolvimos (ver banner de estado). Las referencias `archivo:línea`
> de los ítems resueltos se actualizaron.

## Estado al 2026-06-27 (source of truth)

| Ítem del plan | Estado |
|---------------|--------|
| Finding #2 — fallback in-memory silencioso (**B-3**) | ✅ **Resuelto** — PR #180 |
| Finding #6 — seed siempre corre (**B-4**) + health superficial (**B-7**) | ✅ **Resuelto** — PR #180 |
| Workstream B · ítem 4 (hardening B-3/B-4/B-7) | ✅ **Completo** — PR #180 |
| Audit A2 — B-3 como única guarda contra `DATABASE_URL` malo | ✅ **Satisfecho** (la guarda ya existe) |
| Audit A4 — crash de orden de `seedData` | 🟡 **Mitigado a medias** — B-4 ya gatea el seed; falta correr el schema antes del boot |
| Workstream C · fecha go/no-go de #160 | ✅ **Fijada: 2026-06-28** (si #160 no mergea, se toma in-house) |
| Finding #1 / A1 / **B-2** — schema no se auto-aplica; migraciones heterogéneas | 🔴 **Abierto** — mayor riesgo de infra |
| Finding #3 — `SECRET_ENCRYPTION_KEY` falta en `render.yaml` | 🔴 **Abierto** — fix rápido |
| **B-1** — sin Postgres gestionado (no hay bloque `databases:`) | 🔴 **Abierto** |
| `healthCheckPath: /health` en Render | 🔴 **Ausente** (aprovecharía B-7) |
| Finding #4 / Workstream **A** — IDs de contrato no concuerdan | 🔴 **Abierto** |
| A3 / **D-1** — `.env.testnet` sin escrow ID; `VITE_API_URL` a dominio no mapeado | 🔴 **Abierto** |
| Workstream **D** — firma APK (P2-3) + build + distribución | 🔴 **Abierto** |
| Workstream **C** — #160 (P0-1/P0-2) + P0-3 | 🔴 **Abierto** — camino crítico |

**Mayor palanca y desbloqueado de #160 (se puede hacer ya):** (1) arreglar `render.yaml`
(`SECRET_ENCRYPTION_KEY` + `databases:` + `healthCheckPath`); (2) runner de schema idempotente
(A1/B-2); (3) Workstream A (fijar/verificar contratos + fondear plataforma).

---

## Context

We want to take MicoPay from "compiles and runs locally" to a **live, demoable product**: a
signed Android app that two people can install on two phones and use to run a **real P2P
cash trade settled on Stellar testnet**, against a **backend + Postgres hosted on Render**.

Decisions locked with the user:
- **Demo flow:** two-phone real P2P (depends on issue #160 — P0-1 + P0-2 landing).
- **Stellar layer:** real Soroban testnet (`MOCK_STELLAR=false`).
- **Hosting:** Render + managed Postgres (render.yaml already scaffolds it).
- **App delivery:** signed release APK shared by direct link / QR (sideload).

This plan is scoped to the **mobile-app stack** (`micopay/backend` + `micopay/frontend` +
`micopay/contracts`). The separate agent/x402 API (`apps/api`, `micopay-api` in render.yaml)
is out of scope for this push.

### What I found that shapes the plan (not obvious from a glance)
> _Audited against the code 2026-06-26, re-verified 2026-06-27 — all six findings verified against
> the actual source. Four refinements added (see "Audit corrections" at the end of this section)._

1. **Schema is not auto-applied.** 🔴 SQL lives in `micopay/sql/init.sql` + `micopay/sql/migrations/*`,
   but `micopay/backend/src/db/schema.ts` `initPg()` only does `SELECT 1`. A fresh Render
   Postgres will have **no tables** unless we apply the SQL as an explicit deploy step.
2. **Silent in-memory fallback (B-3).** ✅ **RESUELTO (PR #180).** `initPg()` (`schema.ts`) ahora hace
   `process.exit(1)` en `NODE_ENV=production` si Postgres no conecta, salvo opt-in explícito
   `ALLOW_IN_MEMORY_DB=true`. Antes flipeaba a in-memory en silencio (riesgoso para una demo viva).
3. **`SECRET_ENCRYPTION_KEY` gap.** 🔴 `validateConfig()` (`config.ts:99`) requires it, but the
   `micopay-backend` block in `render.yaml` doesn't define it → backend hard-crashes on boot in prod.
4. **Escrow contract IDs disagree.** 🔴 `render.yaml` `micopay-backend` (`CB4M5777…`) vs
   `micopay/frontend/.env` (`CCHV4IXM…`). We must pin ONE canonical set and confirm it's live on
   testnet. (A third value, `CBQINHLR…`, lives in the `micopay-api` block — that's the out-of-scope
   x402 API, **not** a conflict for the mobile stack. Ignore it.)
5. **On-chain still plays both sides.** 🔴 `stellar.service.ts:60,72-73` — both seller and buyer args
   are `platformAddress` ("Platform acts as both seller and buyer for the demo"). So even with #160
   fixing the *app* identities, the *on-chain* leg is platform-custodied. That's acceptable for this
   demo (framed as "platform-operated escrow"), but must be stated honestly and not over-claimed as
   non-custodial.
6. **Seed data always runs (B-4) and health is shallow (B-7).** ✅ **RESUELTO (PR #180).** `seedData()`
   ahora solo corre con `SEED_DEMO_DATA=true`; `/health` hace un `SELECT 1` real (`pingDb()`) y
   responde 503 en prod si la DB está caída.

### Audit corrections (found during code verification — fold these into the workstreams)
- **A1 · Migration set is heterogeneous, not just `*.up.sql`.** 🔴 `micopay/sql/migrations/` mixes
  timestamped `.up.sql`/`.down.sql` pairs **and** plain `.sql` files with no suffix
  (`001_merchant_available.sql`, `001_processed_tx.sql`, `002_merchant_discovery.sql`,
  `20260527_event_infrastructure.sql`, `20260529_offline_mutations.sql`). A naive `*.up.sql` glob
  would **skip 5 migrations**, including `002_merchant_discovery.sql` which creates the
  `merchant_configs` table — the backbone of merchant discovery. The backend would boot green while
  the app's core feature is broken. Also note **two `001_` prefixes** (ordering collision). The
  runner must apply **all `.sql` except `.down.sql`**, in a defined order, idempotently.
  _(Re-verificado 2026-06-27: el directorio sigue exactamente así — 5 `.sql` planos + pares up/down, dos `001_`.)_
- **A2 · `validateConfig` cannot catch a missing `DATABASE_URL`.** ✅ La guarda ya existe. `config.databaseUrl`
  (`config.ts:32`) defaults to a localhost string, so `if (!config.databaseUrl)` is never true. The
  **only** mechanism that would surface a wrong/missing `DATABASE_URL` on Render is the B-3 fix
  (exit in prod on DB failure) — **ya implementado (PR #180)**.
- **A3 · `VITE_ESCROW_CONTRACT_ID` is not in `.env.testnet`.** 🔴 The `CCHV4IXM…` value lives in the
  base `.env` (which Vite merges into every mode). The fix is to **add** the canonical escrow ID
  (+ MXNE + network) to `.env.testnet` so it overrides the base — not to "edit it there". Also
  `.env.testnet`'s `VITE_API_URL=https://testnet-api.micopay.app` points at a domain not yet mapped
  to Render. _(Re-verificado 2026-06-27: `.env.testnet` solo tiene `VITE_API_URL`; no define escrow.)_
- **A4 · `seedData` ordering crash.** 🟡 Mitigado a medias. `start()` runs
  `validateConfig() → seedData() → listen()`. If managed Postgres connects but the schema isn't
  applied, `seedData`'s `SELECT id FROM trades` throws "relation does not exist" → `process.exit(1)`.
  **B-4 (gating `seedData` tras `SEED_DEMO_DATA`) ya está hecho**; falta aplicar el schema runner
  **antes del primer boot** para cerrar esto del todo.

---

## Critical path & blockers

The two-phone real flow has one **external dependency**: issue **#160 (P0-1 + P0-2)**. As of
2026-06-27 it is **assigned to `@Rocket1960`, still OPEN, no PR yet**. Nothing else in the demo
works end-to-end without it (single identity per device + trade against a real counterparty).
Everything else below can proceed in parallel and be ready *before* #160 lands, but the
**go/no-go gate** is whether #160 is merged in time.

> Recommendation: set a hard date. **Fijada: 2026-06-28.** With no PR yet, the in-house fallback risk
> is live. If #160 isn't merged by the go/no-go date, pull P0-1+P0-2 in-house — the deploy infra will
> already be waiting. _(P1-3 — nombre real del agente — quedó plegado a #160; P0-5 onboarding tiene
> borrador en `AUDIT_APK_WAVE6.md` §10, bloqueado por #160.)_

---

## Workstream A — Stellar testnet contracts (pin & verify)

Goal: one canonical, verified-live set of testnet IDs that **backend and frontend agree on**.

- Decide the canonical set for the mobile stack: `ESCROW_CONTRACT_ID`, `MXNE_CONTRACT_ID`,
  `MXNE_ISSUER_ADDRESS`. Only **two** values disagree and must be reconciled: the `micopay-backend`
  block in `render.yaml` (`ESCROW=CB4M5777…`, `MXNE=CDLZFC3S…`, `ISSUER=GBZXN7PI…`, the likely
  source of truth) vs `micopay/frontend/.env` (`VITE_ESCROW_CONTRACT_ID=CCHV4IXM…`). The
  `micopay-api` block's `CBQINHLR…` is the out-of-scope x402 API — **do not touch it**.
- Verify each contract ID is actually deployed/live on testnet (stellar.expert / RPC `getContractData`).
  If any is stale, redeploy from `micopay/contracts/escrow` (`Cargo.toml` present) and record the new ID.
- Fund the **platform account** (`PLATFORM_SECRET_KEY`'s public key) with testnet XLM via friendbot,
  and ensure it holds/trusts MXNE so `callLockOnChain` can sign. This account is the on-chain escrow operator.
- Produce a short `micopay/contracts/TESTNET.md` recording: contract IDs, issuer, platform public
  key, and the friendbot/funding steps — so the values are reproducible and not folklore.

**Files:** `render.yaml`, `micopay/frontend/.env.testnet`, `micopay/contracts/escrow/*`, new `micopay/contracts/TESTNET.md`.

---

## Workstream B — Backend on Render + Postgres (make it truly deployable)

1. **Managed Postgres.** 🔴 Add a Render Postgres (a `databases:` entry in `render.yaml` or provision
   in dashboard) and wire its connection string into `micopay-backend`'s `DATABASE_URL`.
2. **Schema provisioning (the missing step).** 🔴 Apply `micopay/sql/init.sql` then **all migration
   files** to the fresh DB. ⚠️ The migration set is heterogeneous (see Audit correction **A1**):
   it mixes timestamped `.up.sql`/`.down.sql` pairs with plain `.sql` files. The runner must apply
   **every `*.sql` except `*.down.sql`**, in a defined order, idempotently — a `*.up.sql`-only glob
   silently drops `merchant_configs` (merchant discovery) and 4 other migrations. Two acceptable
   options:
   - (Recommended) a small idempotent migration runner invoked from `package.json`
     (`predeploy`/`start`) or a Render one-off job, applying `init.sql` + every non-`.down.sql`
     migration in sorted order. Most files already use `IF NOT EXISTS`, so re-runs are safe.
   - (Minimum) document a manual `psql` apply as a release step in a deploy README.
   - **Run the schema before the first backend boot** — otherwise `seedData` crashes on a missing
     `trades` table (Audit correction **A4**).
3. **Fix `SECRET_ENCRYPTION_KEY` gap.** 🔴 Add it to the `micopay-backend` env block as `sync:false`
   (set the real value in the Render dashboard). Without it the process crashes on boot.
4. **Harden for a live instance (small, targeted):** ✅ **COMPLETO — PR #180.**
   - ✅ **B-3:** in `db/schema.ts`, when `NODE_ENV=production` and Postgres fails to connect, **exit**
     instead of silently falling back to in-memory (opt-in `ALLOW_IN_MEMORY_DB=true` para dev/test).
   - ✅ **B-4:** `seedData()` gateado tras `SEED_DEMO_DATA=true` flag.
   - ✅ **B-7:** `/health` corre un `SELECT 1` real (`pingDb()`) y reporta 503 en prod si la DB está caída.
5. **Confirm full env set** for `MOCK_STELLAR=false`: `DATABASE_URL`, `SECRET_ENCRYPTION_KEY`,
   `JWT_SECRET`, `PLATFORM_SECRET_KEY`, `ESCROW_CONTRACT_ID`, `MXNE_CONTRACT_ID`, `MXNE_ISSUER_ADDRESS`,
   `STELLAR_RPC_URL`, `STELLAR_NETWORK` — all present and matching Workstream A.

**Files:** `render.yaml`, `micopay/backend/src/db/schema.ts` ✅, `micopay/backend/src/index.ts` ✅,
`micopay/backend/src/config.ts` (`SEED_DEMO_DATA` flag ✅), `micopay/sql/*`, new deploy README.

---

## Workstream C — Two-phone product flow (the demo itself)

1. **#160 (P0-1 + P0-2)** 🔴 must land: one identity per device; selecting an offer creates a trade
   against the real `seller_id`; no local dual-user / self-trade. Primary file: `micopay/frontend/src/App.tsx`.
   Track via Drips; fall back to in-house if it slips the go/no-go date (2026-06-28).
2. **P0-3 (real balance)** 🔴 so the buyer's Home shows their own Stellar address balance, not the
   platform wallet. Needed for a believable two-phone demo. Depends on P0-1 landing first.
3. **On-chain honesty note:** `stellar.service.ts` currently signs both legs from the platform
   account ("platform-operated escrow"). For this demo that's fine — frame it as such. Do **not**
   advertise full non-custodial on-chain settlement; that's a later Wave item.

**Files:** `micopay/frontend/src/App.tsx`, `micopay/frontend/src/pages/Home.tsx`,
`micopay/backend/src/services/stellar.service.ts` (verify lock/reveal works against the canonical contract).

---

## Workstream D — Signed Android app, pointed at the live backend

1. **Point the app at the live backend.** 🔴 In `micopay/frontend/.env.testnet`, set `VITE_API_URL`
   to the real Render URL for `micopay-backend` (currently `https://testnet-api.micopay.app`, a
   domain **not yet mapped to Render** — either map it or use the raw `*.onrender.com` URL). ⚠️ Per
   Audit correction **A3**, `.env.testnet` does **not** currently contain the escrow ID — it
   inherits `CCHV4IXM…` from the base `.env`. **Add** `VITE_ESCROW_CONTRACT_ID`, `VITE_MXNE_*`, and
   `VITE_STELLAR_NETWORK` to `.env.testnet` (matching Workstream A) so they override the base. Build
   with `npm run build:testnet` (mode already exists in `package.json`).
2. **Android signing (P2-3).** 🔴 Generate a release keystore (kept out of git), create
   `android/keystore.properties`, confirm `android/app/build.gradle` signing config reads it, and bump
   `versionCode`/`versionName`. Decide push-notifications: either supply `google-services.json` or
   document push as disabled for the demo.
3. **Build the signed release APK:** `npx cap sync android` then assemble a signed release
   (`./gradlew assembleRelease`). Verify it installs on a clean device and reaches the live backend.
4. **Distribute:** host the APK (GitHub Release asset or a static link) and generate a QR to the
   download. Document the install steps (allow unknown sources).

**Files:** `micopay/frontend/.env.testnet`, `.env.production`, `capacitor.config.ts`,
`micopay/frontend/android/app/build.gradle`, new `android/keystore.properties` (local, untracked).

---

## Sequencing

- **Now, in parallel:** A (pin/verify contracts + fund platform), B (Render Postgres + schema runner
  + SECRET_ENCRYPTION_KEY; ✅ B-3/B-4/B-7 ya hechos), D-1/D-2 (env + signing scaffolding).
- **Gate on #160:** C-1/C-2 (two-phone flow). Go/no-go: 2026-06-28; fall back to in-house if needed.
- **Last:** D-3/D-4 (build + distribute signed APK) once the backend is live and #160 merged.

A and B together get a **real backend live on testnet** independent of the app work, so the moment
#160 lands we can build the APK against an already-running stack.

---

## Verification (end-to-end, on testnet)

1. **Infra up:** Render shows `micopay-backend` healthy; `/health` returns DB-connected true;
   Postgres has all tables (`\dt` shows users, trades, merchant_configs, processed_tx, …).
2. **Config sane:** boot logs show `Mock Stellar: OFF`; `validateConfig` passed (no missing-secret crash).
3. **Contracts live:** the canonical escrow + MXNE IDs resolve on stellar.expert; platform account funded.
4. **Two-phone trade:** install the signed APK on two devices. Device A registers as one identity,
   Device B as another. A discovers B as a provider, opens a trade against B's real `seller_id`,
   the on-chain `lock`/`reveal` produce **real testnet tx hashes** visible on stellar.expert, and the
   trade reaches `completed`. Balances reflect each device's own identity (P0-3).
5. **Resilience spot-check:** kill/restart the backend — data persists (no in-memory fallback);
   `/health` correctly reports unhealthy while DB is down. _(B-3/B-7 ya soportan esto.)_

---

## Risks / open items

- **#160 is the single biggest risk** (external Drips dependency). Mitigation: go/no-go date
  (2026-06-28) + in-house fallback.
- **Live on-chain fragility:** testnet RPC latency / platform account running out of XLM. Mitigation:
  pre-fund generously, test the full lock/reveal the day before, keep `MOCK_STELLAR=true` as an
  emergency demo fallback (env flip only).
- **Custodial framing:** be precise that on-chain settlement is platform-operated escrow for now
  (`stellar.service.ts:60,72-73`).
- **Push notifications / Firebase** are optional for the demo — explicitly decide in/out to avoid a build blocker.

---

*Plan original: 2026-06-26 · Re-auditado y guardado en repo: 2026-06-27 · Maintainer: [@ericmt-98](https://github.com/ericmt-98)*
