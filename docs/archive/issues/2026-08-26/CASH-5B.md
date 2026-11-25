<!-- Title: CASH-5B · Render revealing actions by trade flow and authenticated actor -->
<!-- Suggested labels: wave:frontend, wave:retail, wave:trust, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

The only `TradeDetail` view with a completion action is attached to the non-persisted
`revealed` state. The real `revealing` view contains “View QR” and “Open chat” buttons without
handlers. A global rename is unsafe because cash-out client/provider and deposit client/provider
need different instructions and actions.

## Why it matters

Users can reach a real trade detail and still have no working next action, or see an action that
belongs to the counterparty.

## In scope

- Pass the authenticated user ID plus `flow` and participant IDs into trade detail.
- Derive the current actor per trade, not from an app-wide role.
- Render `revealing` instructions/actions for all four combinations:
  cash-out client, cash-out provider, deposit client, deposit provider.
- Wire existing QR, scan/confirm and chat routes; remove dead buttons.
- Keep inaccessible actions hidden or disabled with truthful explanations.

## UX contract

```text
flow + authenticated participant -> role in this trade -> next safe action
cashout + seller(client)          -> show claim QR / wait / recovery
cashout + buyer(provider)         -> scan or confirm cash handoff
deposit + buyer(client)           -> confirm receipt / existing completion path
deposit + seller(provider)        -> show provider QR / wait
```

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/frontend/src/pages/TradeDetail.tsx:105-284` | state views, truthful instructions and working action handlers by flow/actor |
| `micopay/frontend/src/pages/TradeDetail.tsx:854-875`, `:909-920` | actor/flow action routing after CASH-5A canonicalizes the switch vocabulary; CASH-6 owns refund branches `:876-908` |
| `micopay/frontend/src/App.tsx:154-164`, `:1089` | trade-detail navigation inputs needed by the action surface, after CASH-7 |

Do not restore role-named tokens or session lookups in `TradeDetail.tsx:20-53,672-721`
(CASH-7). Do not implement the scan/release protocol (CASH-4), the inbox list (CASH-3), refund
eligibility (CASH-6) or cancellation policy (CASH-2); this issue consumes those capabilities and
decides which authenticated actor can see them.

## Out of scope

- Implementing scan/release (`CASH-4`).
- Chat backend changes (#75).
- A new state machine (`CASH-5A` owns vocabulary only).

## Acceptance criteria

- [ ] The four actor/flow combinations render distinct, truthful next steps.
- [ ] Every visible primary/secondary action has a working handler.
- [ ] No user can invoke the counterparty-only action from this screen.
- [ ] Copy identifies who locked funds, who hands cash and what happens next.
- [ ] Component/navigation tests cover all four combinations and direct deep links.
- [ ] UI screenshots for all four combinations are attached to the PR.

## Dependencies and prior work

Depends on `CASH-1`, `CASH-5A` and the session-prop refactor in `CASH-7`. Do not assign CASH-5B
and CASH-7 in parallel. This is a regression/correctness follow-up to closed issue #18.
`CASH-4` may be mocked while this UI work is reviewed.
