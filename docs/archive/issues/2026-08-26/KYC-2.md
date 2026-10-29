<!-- Title: KYC-2 · Account Etherfuse ramp volume on durable orders, not quote requests -->
<!-- Suggested labels: grantfox:backend, complexity: high -->
<!-- Suggested milestone: none until campaign owner decides -->

## Problem

`POST /defi/ramp/quote` calls the KYC gate. For onramp, that call increments monthly volume before
the external quote succeeds and even if no order is created. For offramp, `amountMxn` is omitted,
so monthly volume is not recorded at all. `POST /defi/ramp/order` does not perform the volume
lifecycle check.

## Why it matters

Refreshing a quote can consume allowance without moving money, while an Etherfuse cash-out order
can escape monthly accounting. This is separate from P2P cash-out but part of the same closed
monthly-cap implementation.

## In scope

- Keep quote-time KYC eligibility checks pure: no monthly-volume mutation.
- Persist enough authenticated quote context to bind user, direction and trusted MXN equivalent
  to the later order; do not trust a client-resubmitted amount.
- Reserve volume idempotently when a durable Etherfuse order is created.
- Finalize volume on the successful order/webhook state and release/reverse it on terminal
  failed/expired/cancelled states.
- Handle onramp and offramp with a trusted MXN value from the quote/anchor response.
- Make webhook/order retries idempotent and concurrency safe at the database layer.
- Keep Etherfuse KYC and general Didit tier checks separate and both visible in code/tests.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/ramp.ts:44-71`, `:73-168`, `:170-237` | authenticated quote context, durable order ownership, volume reservation and webhook finalization |
| `micopay/backend/src/services/etherfuse.service.ts:94-190` | trusted quote/order direction and MXN-equivalent fields needed for accounting |
| `micopay/sql/migrations/20260630220000_etherfuse_ramp.up.sql`, `micopay/sql/migrations/20260702090000_ramp_order_ownership.up.sql` plus one new ordered up/down migration | bind quote/order/user/direction/MXN value and idempotent volume state |
| new Etherfuse volume-lifecycle tests | both directions, retries, terminal states and concurrent webhooks |

CASH-10 owns the general P2P ledger design and purity refactor. KYC-2 may reuse that ledger
primitive after CASH-10, but owns only Etherfuse quote/order records and must not treat Etherfuse
approval as general Didit KYC. It consumes but does not edit
`micopay/backend/src/services/kyc-gate.service.ts:78-245`. KYC-1 owns KYC routes/UI, not ramp
accounting.

## Out of scope

- P2P trade KYC (`CASH-10`).
- Changing Etherfuse's hosted KYC requirements.
- Legal threshold selection or actual production gate enablement.
- UI redesign of the CETES/SPEI flow.

## Acceptance criteria

- [ ] Repeating or failing a quote never changes monthly used volume.
- [ ] Creating an onramp or offramp order creates at most one volume reservation.
- [ ] Successful settlement finalizes the trusted MXN amount exactly once.
- [ ] Failed/expired/cancelled orders do not remain counted as completed volume.
- [ ] A forged client amount cannot alter accounted MXN volume.
- [ ] Concurrent/replayed order and webhook calls cannot double count.
- [ ] Tests cover both directions, quote failure/retry, order failure, settlement and webhook replay.
- [ ] Backend typecheck/build pass.

## Dependencies and prior work

Depends on the pure/database-backed accounting primitive from `CASH-10`, but is independent of
the P2P trade model. This is a corrective issue for closed GrantFox issue #316 and should stay
out of Stellar Drips unless campaign owners explicitly decide otherwise.
