<!-- Title: CASH-4 · Complete cash-out end to end from the provider scan -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:merchant, wave:trust, complexity: high -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

The provider scan route authorizes `seller_id`, but the provider is `buyer_id` in cash-out. Even
if authorization passed, the route only consumes the claim token and returns a display summary;
it does not release the escrow. The response can therefore report success with
`release_tx_hash = null` and can display the provider's own handle as the counterparty.

## Why it matters

This is the final step of the star USDC-to-MXN cash flow. Today the client can lock funds but the
provider cannot complete settlement.

## In scope

- Authorize the authenticated scanner against persisted `provider_id` and `flow`.
- Exchange the single-use claim token for a durable, idempotent cash-handoff confirmation bound
  to this trade and provider. A retry by the same provider can resume it; another actor cannot.
- After scan confirmation, call the existing non-custodial completion flow: request the unsigned
  release XDR, sign it with the provider/buyer's device key, and submit it to `completeTrade`.
  The backend must never hold or emulate the provider's private key.
- Return the client as counterparty and flow-correct instructions/summary.
- Make retries idempotent across scan confirmation, signing/submission and response loss: a
  successful release may be read again safely, while a failed attempt can resume without a
  second cash handoff or a second on-chain release.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/sql/migrations/20260728220000_trade_claim_tokens.up.sql:11-22` plus a new ordered migration | durable handoff/idempotency record bound to trade and provider |
| `micopay/backend/src/routes/trades.ts:158-186`, `:244-266` | existing completion endpoints and provider-scan handoff contract |
| `micopay/backend/src/services/trade.service.ts:546-630`, `:640-750`, `:1210-1301` | claim-token lifecycle, local-signature completion integration, scanner authorization and resumable result |
| `micopay/frontend/src/services/api.ts:265-300`, `:652-687` | claim/complete/scan API types and locally signed submission |
| `micopay/frontend/src/utils/qrPayload.ts:1-102` | cash-handoff QR parsing contract |
| `micopay/frontend/src/pages/MerchantInbox.tsx:45-225`, `:246-288`, `:338-421` | scanner UI, durable confirmation state, retry and final transaction result |

Do not edit the provider inbox query/list at `micopay/backend/src/services/trade.service.ts:1174-1197` or
`MerchantInbox.tsx:227-245,:290-336,:423-484` (CASH-3), trade-detail action placement
(CASH-5B), or the contract. SAFE-1 may consume the durable handoff evidence but does not own
this transition.

## Out of scope

- Contract redesign.
- Deposit QR protocol repair unless a shared parser change is strictly required and tested.
- Inbox discovery (`CASH-3`) and provider onboarding (`RED-2`).

## Acceptance criteria

- [ ] The selected cash-out provider can scan and complete; either participant in another trade gets 403.
- [ ] The release transaction is signed locally by the authenticated provider/buyer's device key.
- [ ] Cash-out provider completion requires the durable confirmation produced by a valid scan for
      this provider; the existing deposit completion path is not regressed.
- [ ] Success is shown only after a non-null, non-mock `release_tx_hash` is persisted.
- [ ] Network/signing/submission failure can resume from the durable confirmation without
      reusing the QR as a new handoff.
- [ ] Replaying a confirmed/completed token is idempotent for the same provider and cannot release twice.
- [ ] The summary identifies the client, provider, amount and flow correctly.
- [ ] Tests cover wrong actor, invalid/expired token, failed release, retry and successful release.
- [ ] A two-account integration test demonstrates locked -> revealing -> completed.

## Dependencies and prior work

Depends on `CASH-1`. This is an explicit regression/correctness follow-up to closed issue #70,
whose acceptance criteria required success only after a real backend `release_tx_hash`.
