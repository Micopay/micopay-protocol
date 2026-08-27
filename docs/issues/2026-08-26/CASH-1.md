<!-- Title: CASH-1 · Persist trade flow and liquidity-provider identity -->
<!-- Suggested labels: wave:backend, wave:retail, complexity: high -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

`trades` stores only escrow roles (`seller_id`, `buyer_id`). Those roles reverse between deposit
and cash-out, so consumers cannot determine the product flow or which participant is the Red
MicoPay liquidity provider. The code currently guesses that `seller_id` is always the provider,
which is false for cash-out.

## Why it matters

Cash-out cannot be fixed reliably while inbox, authorization, availability, limits,
notifications, reputation and recovery all infer product roles from escrow roles.

## In scope

- Add a required canonical `flow` field: `deposit` or `cashout`.
- Add a required `provider_id` referencing `users.id`.
- For new rows, enforce `cashout -> provider_id = buyer_id` and
  `deposit -> provider_id = seller_id` at the database boundary.
- Make `POST /trades` require an explicit flow and derive `provider_id` server-side from the
  authenticated caller, counterparty and flow. Never trust a client-supplied provider ID.
- Update API types, serializers, `init.sql`, ordered up/down migrations, fixtures and tests.
- Add an index suitable for provider inbox queries, e.g. `(provider_id, status)`.

## Data migration policy

Do not guess from `seller_id`/`buyer_id` and do not preserve an ambiguous legacy state in the
product model.

**Precondition settled (2026-08-27):** the maintainer confirmed production holds no real trades
and no real users, so there is no historical data to interpret and no `legacy` path to support.
Demo/test rows are cleared or reseeded explicitly and both new columns are `NOT NULL` from the
start.

The migration must still abort with a clear error if ambiguous rows exist when it runs. That check
is an execution safeguard against a stale or unexpected database, not an open product question.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/sql/init.sql:43-75` plus one new ordered up/down migration | canonical `flow`/`provider_id` columns, constraints and provider-status index |
| `micopay/backend/src/routes/trades.ts:27-63` | explicit flow input and server-side participant/provider derivation for `POST /trades` |
| `micopay/backend/src/services/trade.service.ts:162-269` | create input, durable insert and returned canonical identifiers |
| `micopay/backend/src/services/trade.service.ts:302-320` | generic active/history projections needed to preserve the new fields |
| `micopay/frontend/src/services/api.ts:73-95`, `:203-219`, `:317-328` | shared trade types, create payload and generic history types |
| `micopay/frontend/src/App.tsx:926-979` | send explicit product flow instead of using escrow `role` as the product model |

Do not reroute inbox queries (`micopay/backend/src/services/trade.service.ts:1174-1197`, CASH-3), scan/completion
(`:548-745`, `:1210-1301`, CASH-4), cancellation (`:861-980`, CASH-2), provider policy
(CASH-8), initiator policy (CASH-9), KYC accounting (`:191-193`, CASH-10), reputation
(TRUST-1) or provider enrollment (RED-1) in this issue. Later issues consume the persisted
fields introduced here. Land CASH-1 before CASH-10: both restructure `createTrade`, and CASH-10
must rebase its atomic transaction around the canonical columns introduced here.

## Out of scope

- Changing inbox, cancellation, scan, reputation, notifications or abuse consumers.
- Red MicoPay provider enrollment (`RED-1`/`RED-2`).
- Renaming every legacy `merchant_*` symbol.
- Multi-asset escrow.

## Acceptance criteria

- [ ] New deposit and cash-out rows persist the correct `flow` and `provider_id`.
- [ ] Database constraints reject an inconsistent flow/provider/escrow-role combination.
- [ ] The API rejects missing/invalid flow and ignores or rejects client-supplied provider IDs.
- [ ] The migration refuses to guess when rows exist and leaves no nullable/legacy product state.
- [ ] `provider_id` is returned by trade detail/list APIs needed by later issues.
- [ ] Up/down migrations and `micopay/sql/init.sql` describe the same schema.
- [ ] Tests cover deposit, cash-out, self-trade rejection, forged provider identity and migration
      refusal when ambiguous rows exist.
- [ ] Backend build and typecheck pass.

## Test notes

Backend and schema only. No frontend behavior changes here.

**There is no `npm test` in `micopay/backend`.** Suites are individual scripts. The closest models
for what this issue needs are `test:trade-auth` and `test:refund`, which already exercise trade
creation and carry their environment inline:

```bash
cd micopay/backend
npm install
npm run test:trade-auth
npm run test:refund
```

If you add a suite without inline env, pass it yourself:

```bash
ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 node --import tsx src/tests/<your-test>.ts
```

`SECRET_ENCRYPTION_KEY` must be exactly 64 hex characters — `validateConfig` rejects anything else
in every environment. Locally `NODE_ENV` is unset, so the in-memory store is used automatically and
**Postgres is not required for the service-level tests**.

**On Windows, `npm run test:*` fails.** Several of these scripts set the environment inline with
POSIX syntax (`VAR=value node ...`), and npm runs scripts through `cmd.exe`, which reports
`"ALLOW_IN_MEMORY_DB" no se reconoce como un comando`. Run them from Git Bash or WSL, or invoke
node directly with the variables, as shown above. Both forms were verified working.

Expect five `PostgreSQL connect attempt N/5 failed` lines followed by
`PostgreSQL unavailable — using in-memory store` before the assertions run. That is the normal
local path, not a failure.

**The migration does need a real Postgres**, because the constraint and the abort path cannot be
proven against the in-memory store:

```bash
DATABASE_URL=<your postgres> npm run migrate   # init.sql, then sql/migrations/ lexicographically
```

Run `up` and `down`, in that order, and confirm the schema returns to its previous shape.

**Three things to prove, not assert:**

1. The database itself rejects an inconsistent `flow`/`provider_id`/escrow-role combination. Insert
   a bad row by hand and show the constraint firing — an application-level check alone does not
   satisfy the criterion.
2. A client-supplied `provider_id` in the request body cannot influence the stored value.
3. The migration **aborts** when ambiguous rows exist. Insert one deliberately and show it stopping
   with a clear error. Production was confirmed empty on 2026-08-27, so this path will not trigger
   on deploy — which is exactly why it needs a test, or nobody will ever find out it is broken.

If you cannot run part of this, say so in the PR and list what you did and did not verify. Do not
claim you tested something you did not.

## Dependencies and prior work

No technical dependency. This is new model work, but it unlocks regression fixes for closed issues
#18, #20, #25, #31 and #70. Reward eligibility should be decided before adding `Stellar Wave`.
