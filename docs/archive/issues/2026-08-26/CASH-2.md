<!-- Title: CASH-2 · Make locked/revealing cancellation and recovery flow-aware -->
<!-- Suggested labels: wave:backend, wave:trust, wave:retail, wave:needs-product, complexity: high -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

Cancellation in `locked` and `revealing` checks commercial availability on `trade.seller_id`.
That is the provider in deposit but the client in cash-out. With the current default, the
cash-out client cannot recover while the provider can cancel in cases where the client should
control recovery.

## Why it matters

A client can lock USDC and be left without an in-app recovery path because policy is attached to
an escrow role instead of the product flow and actor.

## In scope

- Use persisted `flow` and `provider_id` from `CASH-1` for cancellation authorization and
  provider-unavailable recovery.
- Define and test allowed actors for `locked` and `revealing` in both flows.
- Preserve timeout/refund and on-chain safety invariants.
- Return stable error codes and user-safe messages for disallowed actions.

## Proposed product rule — requires approval

- Before funds are locked (`pending`), either participant may cancel the off-chain reservation.
- After lock, the seller/funds owner cannot reclaim escrow unilaterally before timeout. They may
  request cancellation, but the app must not mark funds as returned.
- A proposed future contract `decline` may let only the escrow buyer renounce the trade and refund
  the seller immediately. If that contract change is not approved, timeout refund remains the
  only on-chain recovery path after lock.
- Once the cash handoff is confirmed (cash-out scan confirmation or the equivalent deposit
  confirmation), cancellation is disabled; the available paths are completion or support/dispute.
- After timeout, either participant may trigger the permissionless refund, which always returns
  funds to the escrow seller. Cancellation/abuse attribution still records who cancelled.

Do not implement this issue until the maintainer approves or replaces this table.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/trades.ts:188-198` | cancel request/response contract and stable error exposure |
| `micopay/backend/src/services/trade.service.ts:861-980` | cancellation state/actor table, provider-unavailable recovery and cancellation audit attribution |
| `micopay/frontend/src/services/api.ts:103-117` | typed cancellation result and stable API error mapping |

Do not edit refund execution/UI (`micopay/backend/src/services/trade.service.ts:982-1150`, `TradeDetail.tsx:782-811,
:876-908,:956-969`, CASH-6), the provider-availability helper itself (CASH-8), or the scan
handoff implementation (CASH-4). If approved cancellation actions must be surfaced in
`TradeDetail`, CASH-5B owns their actor/flow placement and consumes the policy defined here.

## Out of scope

- Refund UI after expiry (`CASH-6`).
- Provider availability/enrollment implementation (`RED-1`).
- Trade-state vocabulary changes (`CASH-5A`).
- Any contract change.

## Acceptance criteria

- [ ] Cash-out recovery evaluates the cash provider via `provider_id`, never `seller_id`.
- [ ] Deposit behavior remains correct when the provider is the escrow seller.
- [ ] The escrow seller cannot unilaterally reclaim locked funds before timeout.
- [ ] A locked cancellation is never presented as an immediate on-chain refund.
- [ ] No participant can cancel after the durable cash-handoff confirmation.
- [ ] A participant cannot cancel another user's unrelated trade.
- [ ] Locked/revealing actor rules are documented as a table in code tests or module docs.
- [ ] Tests cover both flows, both actors, provider available/unavailable, timeout and double action.
- [ ] Backend build and typecheck pass.

## Dependencies and prior work

Depends on `CASH-1` and on `CASH-4`'s durable handoff confirmation. Contract-level immediate
decline/refund is deliberately outside this issue and must be split into a separate body if the
product decision is approved. This is a
regression/correctness follow-up to closed issues #20 and #31;
do not present it as previously unrewarded functionality.
