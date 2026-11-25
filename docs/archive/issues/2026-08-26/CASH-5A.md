<!-- Title: CASH-5A · Canonicalize trade states across DB, API and retail UI -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:retail, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

The database emits `pending`, `locked`, `revealing`, `completed`, `cancelled`, `expired` and
`refunded`. `TradeDetail` waits for `revealed`; `TradeStateBadge` invents `pending_cash` and
`revealed` while omitting `pending` and `revealing`; `QRReveal` silently converts states.

## Why it matters

Real backend states fall into the wrong view or a fallback view, hiding actions and producing
misleading status labels.

## In scope

- Define one canonical frontend/backend trade-state contract using the persisted DB values.
- Remove `pending_cash`/`revealed` as transport/domain states; presentation labels may differ.
- Make normalization reject or visibly handle unknown states instead of inventing a transition.
- Update `TradeDetail`, `TradeStateBadge`, API types and tests.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/frontend/src/components/TradeStateBadge.tsx:1-176` | one exported canonical state type, labels, badges and unknown-state handling |
| `micopay/frontend/src/services/api.ts:73-95`, `:317-336` | only the `status` member typing in trade/detail/history/inbox transport types |
| `micopay/frontend/src/pages/TradeDetail.tsx:55-89` | removal of duplicate/invented local status config and use of the shared parser/badge |
| `micopay/frontend/src/pages/QRReveal.tsx:113-117` | remove the `revealing -> revealed` fallback conversion |
| `micopay/frontend/src/pages/CashoutRequest.tsx:1-42`, `micopay/frontend/src/pages/DepositRequest.tsx:1-42` | remove the invented `pending_cash` state from request placeholders |

CASH-5B owns the state switch plus actor/flow-specific components and handlers, not this issue.
CASH-6 owns refund eligibility branches. CASH-1 owns only the new `flow`/`provider_id` members in
the shared API interfaces; this issue owns only `status` typing there. Do not change
`micopay/sql/init.sql:60-64`: it is already the authoritative state list.

## Out of scope

- Role/flow-specific actions (`CASH-5B`).
- Changing escrow transitions or adding new product states.
- Expiry/refund affordances (`CASH-6`).

## Acceptance criteria

- [ ] One exported type/constant set contains every persisted state and no invented state.
- [ ] `pending` and `revealing` render deliberate labels/badges.
- [ ] Unknown backend state produces an observable safe fallback and cannot unlock an action.
- [ ] `QRReveal` does not convert `revealing` to `revealed`.
- [ ] Unit tests cover every canonical state and an unknown value.
- [ ] Backend/frontend typecheck and builds pass.

## Dependencies and prior work

Depends on `CASH-1` only as source order for the shared trade transport interfaces; the state
model itself is independent. This is a regression/correctness follow-up to closed issue #19.
