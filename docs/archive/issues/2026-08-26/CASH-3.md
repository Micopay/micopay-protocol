<!-- Title: CASH-3 · Show cash-out trades in the Red MicoPay provider inbox -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:merchant, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

`GET /merchants/me/trades` filters by `seller_id`, so a cash-out never appears for its provider,
who is the escrow buyer. The row also labels `buyer_handle` as the counterparty; in cash-out that
is the provider's own handle. `MerchantInbox` has no route to the trade/chat action surface.

## Why it matters

The provider cannot see or open the cash-out request they are expected to fulfill.

## In scope

- Query provider trades by persisted `provider_id`.
- Return a flow-aware counterparty summary based on the authenticated provider and trade.
- Show cash-out and deposit rows with correct amount, status, counterparty and flow label.
- Tapping a row opens the existing trade detail or existing chat route with the selected trade.
- Keep empty, loading, offline and error states.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/trades.ts:268-290` | authenticated provider-inbox endpoint contract |
| `micopay/backend/src/services/trade.service.ts:1174-1197` | `provider_id` query and flow-aware counterparty projection |
| `micopay/frontend/src/services/api.ts:330-344` | provider-inbox row type and fetch client |
| `micopay/frontend/src/App.tsx:166-174` | inbox route adapter and selected-trade navigation plumbing |
| `micopay/frontend/src/pages/MerchantInbox.tsx:227-245`, `:290-336`, `:423-484` | inbox loading/filter/list states, row copy and row navigation |

Do not edit the scan card or scan state machine at `MerchantInbox.tsx:45-225`, `:246-288` or
`:338-421` (CASH-4). CASH-8 owns push delivery, and TRUST-1 may add its canonical trust summary
to these rows only after this query/row shape lands.

## Out of scope

- Rebuilding chat or changing message persistence (#75).
- Push delivery (`CASH-8`).
- Scan/release logic (`CASH-4`).
- A new provider onboarding design (`RED-2`).

## Acceptance criteria

- [ ] A cash-out appears only in the selected provider's inbox.
- [ ] Its counterparty is the client, never the provider themselves.
- [ ] Deposit rows continue to show the correct client.
- [ ] Row navigation opens the matching trade detail/chat with no hardcoded participant.
- [ ] Non-providers cannot use the provider inbox endpoint.
- [ ] Backend and frontend tests cover both flows and cross-account authorization.
- [ ] Typecheck/build pass and UI screenshots for both flows are attached to the PR.

## Dependencies and prior work

Depends on `CASH-1`, `CASH-5A`, `CASH-7` and `RED-1`; the canonical status type and
single-session route adapter land before the inbox transport/navigation is changed. This is a
regression of closed issue #25, whose acceptance
criteria required the buyer handle and navigation to trade detail/chat. If backend chat is
changed, #75 must also be cited and the scope split.
