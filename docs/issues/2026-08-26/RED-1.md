<!-- Title: RED-1 · Add explicit Red MicoPay provider enrollment and fail-closed discovery -->
<!-- Suggested labels: wave:backend, wave:merchant, wave:trust, complexity: high -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

Retail registration creates every user with `merchant_available = true`; `init.sql` defaults the
same way. There is no provider-enrollment state. Reading merchant settings auto-creates a config,
and discovery treats any available user with a location as a provider. The frontend reads a
nonexistent `verification_status` field as if it represented provider availability.

## Why it matters

Account creation, Red MicoPay membership, verification and current availability are different
facts. Mixing them can publish a normal user as a cash provider without an explicit decision.

## Product rule

Any MicoPay user—shop owner, taquero or individual—may enroll. Enrollment does not create a
permanent app role and does not require the user to be a registered business. The same person can
still request cash-out or deposit as a client later.

## In scope

- Add an explicit provider enrollment status, at minimum:
  `not_enrolled`, `pending_verification`, `active`, `suspended`.
- Keep commercial availability separate (`online`/`offline`/`paused`).
- Persist that availability consistently. The current endpoint accepts the three values but only
  updates `merchant_available`, leaving `users.availability` stale.
- New users start `not_enrolled` and unavailable.
- Add authenticated, idempotent provider-self endpoints to start enrollment and read readiness.
- Readiness reports profile/location/limits completeness and **general Didit KYC** status.
- Activation requires complete provider config and the configured general-KYC level; Etherfuse
  KYC must not satisfy this requirement.
- Discovery returns only `active`, currently available, non-suspended and non-banned providers.
- Availability updates reject users who are not active providers.
- Manual availability changes and automatic/admin pause/unpause update one canonical state (and
  any compatibility boolean) atomically so discovery cannot show a paused provider.
- Demo seed data may explicitly create active providers; normal registration may not.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/users.ts:83-87`, `micopay/sql/init.sql:14-30` | safe registration/schema defaults |
| `micopay/backend/src/services/merchant.service.ts:99-125` | provider-config creation vs enrollment |
| `micopay/backend/src/services/merchant.service.ts:194-199` | discovery eligibility, including suspension/ban/pause |
| `micopay/backend/src/routes/users.ts:260-279` | canonical manual availability persistence |
| `micopay/backend/src/services/abuse.service.ts:499-544` | canonical automatic/admin pause and unpause persistence |

Do not edit the flow-specific provider check inside `assertCanCreateTrade`
(`abuse.service.ts:239-263`); CASH-9 extracts that block and CASH-8 owns its flow-aware policy.

## Out of scope

- KYB or proving that a person owns a business.
- Provider onboarding UI (`RED-2`).
- Renaming all `merchant_*` tables/routes/files.
- Flow-specific provider policy (`CASH-8`).

## Acceptance criteria

- [ ] A newly registered user is neither enrolled nor discoverable as a provider.
- [ ] Enrollment is explicit and idempotent; it never creates a second user/wallet.
- [ ] Provider activation fails closed when profile or general KYC is incomplete.
- [ ] Etherfuse-only approval cannot activate Red MicoPay membership.
- [ ] `GET /merchants/available` filters active + available providers.
- [ ] Suspended, banned, paused and offline providers are absent from discovery rather than being
      selectable and failing only at trade creation.
- [ ] Provider status and availability are independently represented in `GET /users/me` or a
      dedicated provider-self response; no `verification_status` guess is needed.
- [ ] Availability updates keep the canonical enum and any compatibility boolean consistent.
- [ ] Automatic/admin pause and unpause use the same canonical availability write as the user
      endpoint.
- [ ] The migration enrolls nobody automatically: every existing row defaults to not enrolled.
      Production was confirmed to hold no real users on 2026-08-27, so this is a safe default
      rather than a data-interpretation problem. Demo/seed rows may be made active explicitly.
- [ ] Tests cover enrollment states, activation gates, discovery and availability authorization.

## Test notes

Backend only. Nothing in `micopay/frontend` changes here.

**There is no `npm test` in `micopay/backend`.** Each suite is its own script, and some carry the
environment inline while others do not. The two that matter for this issue:

```bash
cd micopay/backend
npm install

# discovery — the query this issue changes. Env is already inline in the script.
npm run test:discovery

# abuse/pause paths — this one has NO inline env, so pass it yourself:
ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npm run test:abuse
```

`SECRET_ENCRYPTION_KEY` must be exactly 64 hex characters — `validateConfig` rejects anything else
in every environment, not just production. `MOCK_STELLAR=true` avoids needing a real
`PLATFORM_SECRET_KEY`. Locally `NODE_ENV` is unset, so the in-memory store is used automatically
and **you do not need Postgres to run these tests**; `ALLOW_IN_MEMORY_DB` only becomes mandatory in
production.

**On Windows, `npm run test:*` fails.** Several of these scripts set the environment inline with
POSIX syntax (`VAR=value node ...`), and npm runs scripts through `cmd.exe`, which reports
`"ALLOW_IN_MEMORY_DB" no se reconoce como un comando`. Run them from Git Bash or WSL, or invoke
node directly with the variables, as shown above. Both forms were verified working.

Expect five `PostgreSQL connect attempt N/5 failed` lines followed by
`PostgreSQL unavailable — using in-memory store` before the assertions run. That is the normal
local path, not a failure.

`src/tests/merchant.discovery.test.ts` already covers coordinate rounding and the discovery rate
limiter. **Extend that file** for the new eligibility rules rather than starting a new one, and
keep its existing cases passing.

For the schema change:

```bash
DATABASE_URL=<your postgres> npm run migrate   # applies init.sql, then sql/migrations/ in order
```

Run the down migration too and confirm the schema returns to its previous shape. A migration that
only works forward is not finished.

**What to prove, not just assert:** the point of this issue is that discovery fails closed. Show a
suspended, banned, paused or offline provider being absent from `GET /merchants/available` — not
merely rejected later at trade creation. A test that only checks the happy path does not catch the
bug this issue exists to fix.

If you cannot run part of this, say so in the PR and list what you did and did not verify. Do not
claim you tested something you did not.

## Dependencies and prior work

No technical dependency. Closed issue #23 built a merchant-registration API/screen in
`apps/api`/`apps/web`, which are outside the retail contribution surface; its screen is not
mounted by the retail APK. Reuse its product lessons where useful, but do not couple the two
backends. This issue is new retail Merchant Operations work and is a Drips candidate.
