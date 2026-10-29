<!-- Title: CASH-6 · Expose refund after expires_at without requiring a persisted expired state -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:trust, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

The backend permits refund after `expires_at` when funds were locked, but the UI shows refund
only when status is `expired` or a narrow cancelled case. `expired` is not currently persisted,
so a timed-out `locked`/`revealing` trade can remain unrecoverable in the app.

## Why it matters

Timeout refund is the user's last safety guarantee when the cash handoff does not finish.

## In scope

- Derive an effective “refund available” condition from persisted status, lock/release hashes and
  `expires_at` using server time or a server-provided boolean.
- Expose the existing refund action to an authorized participant after timeout.
- Show countdown/not-yet-available, submitting, success, error and already-refunded states.
- Refresh trade state after refund and prevent duplicate submission.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/trades.ts:200-220` | participant refund endpoint plus server-authoritative eligibility contract |
| `micopay/backend/src/services/trade.service.ts:982-1150` | expiry/refund eligibility, idempotent on-chain execution and sweep consistency |
| `micopay/frontend/src/services/api.ts:302-315` | typed refund request/result |
| `micopay/frontend/src/pages/TradeDetail.tsx:782-811`, `:876-908`, `:956-969` | effective-expiry CTA, confirmation, retry and refreshed terminal state |

Keep server-authoritative eligibility in the refund service/route above instead of extending the
shared trade-detail projection at `micopay/backend/src/services/trade.service.ts:284-299`. Do not change pre-timeout
cancellation (CASH-2), canonical state names (CASH-5A), or contract timeout/refund semantics.

## Out of scope

- Changing contract timeout rules.
- Cancellation policy before timeout (`CASH-2`).
- Broad state vocabulary work (`CASH-5A`).

## Acceptance criteria

- [ ] Timed-out locked and revealing trades expose refund even if DB status never became `expired`.
- [ ] Refund stays unavailable before `expires_at` and after a release.
- [ ] Only a trade participant can request it.
- [ ] Repeated taps/retries cannot refund twice.
- [ ] Tests use controlled time for before/at/after expiry and cover completed/refunded trades.
- [ ] A frontend test verifies the recovery CTA and final refreshed state.

## Dependencies and prior work

Depends on `CASH-7` only for the neutral session/token prop consumed by its frontend handler;
the refund policy itself is independent. This is a regression/correctness follow-up to closed
issue #71.
