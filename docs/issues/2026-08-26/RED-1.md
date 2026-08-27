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
- [ ] Migration defaults existing non-demo users to not enrolled; no heuristic auto-enrollment.
- [ ] Tests cover enrollment states, activation gates, discovery and availability authorization.

## Dependencies and prior work

No technical dependency. Closed issue #23 built a merchant-registration API/screen in
`apps/api`/`apps/web`, which are outside the retail contribution surface; its screen is not
mounted by the retail APK. Reuse its product lessons where useful, but do not couple the two
backends. This issue is new retail Merchant Operations work and is a Drips candidate.
