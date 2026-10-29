<!-- Title: TRUST-2 · Enforce progressive exposure limits for new cash-exchange participants -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:trust, wave:needs-product, complexity: high -->
<!-- Suggested milestone: Wave 8: Product & Release -->

## Problem

A newly configured provider defaults to a 50,000 MXN per-trade maximum and 250,000 MXN daily
capacity. General buyer limits default to 20 trades and 100,000 MXN per day. None depends on
behavioral history, and cash-out currently applies several limits to the wrong escrow role.

## Why it matters

For physical cash, reputation and small initial exposure are the practical mitigation when no
contract can prove the handoff. KYC alone establishes identity/compliance; it does not justify
letting a first-time client or provider exchange a large amount.

## Product rule — requires approval

The effective amount is the minimum of:

1. the configured legal/general-KYC ceiling for each participant;
2. the progressive reputation ceiling for each participant;
3. the provider's self-selected per-trade maximum; and
4. the provider's remaining daily capacity.

The exact bands and advancement rules must be configuration, approved by product/risk, and safe
for new accounts. They must not be inferred from the existing 50,000 MXN default.

## In scope

- Add configurable per-trade and rolling/daily exposure bands from each participant's single
  reputation in `TRUST-1`.
- Start new/unproven participants in the lowest approved band and advance only from durable,
  successfully completed history.
- Define deterministic downgrade/freeze behavior for attributed cancellations, disputes,
  suspension, stale KYC and risk review.
- Combine trust limits with `CASH-10` KYC ceilings and existing provider-configured limits using
  the minimum rule above.
- Enforce the effective limit server-side during discovery/quote and atomically again at trade
  creation; frontend hints are not authorization.
- Return a reasoned, privacy-safe explanation and next step when a requested amount is too high.
- Keep bands config-driven and auditable without exposing internal anti-abuse data.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| new trust-band policy/config module and tests | configured progression/downgrade rules and one effective-limit calculation |
| `micopay/backend/src/services/merchant.service.ts:68-96`, `:197-198` | safe provider defaults/validation and discovery amount filtering after RED-1/TRUST-1 |
| `micopay/backend/src/services/trade.service.ts:123-160`, `:211` | combine canonical trust bands with provider limits after CASH-8 |
| `micopay/backend/src/services/abuse.service.ts:133-237`, `:265-312` | combine participant rolling/daily exposure after CASH-9's structural split |
| `micopay/frontend/src/pages/CashoutRequest.tsx:1-42`, `micopay/frontend/src/pages/DepositRequest.tsx:1-42` | explain the effective maximum and next trust-band step on amount entry |
| `micopay/frontend/src/constants/errorMap.js`, `micopay/frontend/src/constants/errorMap.d.ts` and affected amount/discovery views | privacy-safe reason/next-step copy for server limit decisions |

This issue deliberately extends code first owned by CASH-5A, CASH-8, CASH-9, CASH-10, RED-1 and
TRUST-1; it lands after all six and must not be assigned in parallel with them. It never creates
separate client/provider scores and never changes legal KYC thresholds. It consumes but does not
edit `micopay/backend/src/services/kyc-gate.service.ts:78-245` after CASH-10.

## Out of scope

- Choosing legal KYC thresholds.
- A guarantee, insurance fund or proof that cash changed hands.
- A permanent user role or separate client/provider score.
- Multi-asset escrow.

## Acceptance criteria

- [ ] A user with no completed history cannot create a trade above the approved initial band even
      when provider settings allow 50,000 MXN.
- [ ] A user keeps the same reputation band when changing function between trades.
- [ ] The effective amount never exceeds either participant's KYC/reputation ceiling, the
      provider maximum or remaining provider capacity.
- [ ] Limit enforcement is server-authoritative, race-safe and consistent between discovery and
      creation.
- [ ] Failed requests and non-durable trades do not advance trust or consume permanent capacity.
- [ ] The APK explains the current maximum and how to qualify for a higher band without exposing
      private risk rules.
- [ ] Tests cover new accounts, role switching, advancement, downgrade, KYC expiry, concurrency
      and conflicting limits.

## Dependencies and prior work

Depends on `TRUST-1`, `CASH-5A`, `CASH-8`, `CASH-9` and the atomic KYC/accounting work in
`CASH-10`.
Overlaps closed issues #24, #82 and #87, so it must remain product/campaign blocked until its
bands and reward treatment are approved.
