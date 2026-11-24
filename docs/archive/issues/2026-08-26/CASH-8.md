<!-- Title: CASH-8 · Route provider policy through persisted provider identity -->
<!-- Suggested labels: wave:backend, wave:merchant, wave:trust, complexity: high -->
<!-- Suggested milestone: Wave 8: Backend Hardening -->

## Problem

Provider policy still assumes `seller_id` is the provider. In cash-out that applies limits,
availability, notifications and automatic pauses to the client instead of the Red MicoPay
provider. Seller-only reputation is a related defect, but its single-history repair belongs to
`TRUST-1`.

## Why it matters

Even after the trade can complete, the network would enforce and report the wrong person's
commercial behavior.

## In scope

Route these consumers through persisted `provider_id` and active provider enrollment:

- provider limits and daily capacity;
- commercial availability checks and unavailable response fields;
- incoming-trade push recipient and counterparty name;
- provider-attributed reliability events consumed by the single reputation in `TRUST-1`;
- automatic provider pause after provider-attributable cancellations/disputes.

Keep user suspension/ban checks on **both participants**; this issue must not remove that existing
control.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/services/trade.service.ts:123-160`, `:211` | provider min/max and daily capacity |
| `micopay/backend/src/services/trade.service.ts:38-60`, `:284-299` | provider availability/unavailable detail |
| `micopay/backend/src/services/trade.service.ts:258-266` | incoming provider notification and client display name |
| `micopay/backend/src/services/abuse.service.ts:239-263` | provider commercial-availability check, **after CASH-9 extracts it** |
| `micopay/backend/src/services/abuse.service.ts:348-383`, `:465-476` | provider target for automatic pause hooks |

Do not edit the initiator blocks at `abuse.service.ts:133-237` or `:265-312` (CASH-9), KYC at
`micopay/backend/src/services/trade.service.ts:193` (CASH-10), cancellation authorization at
`micopay/backend/src/services/trade.service.ts:935-958` (CASH-2), or reputation aggregation at
`micopay/backend/src/services/trade.service.ts:737,763-848` and
`micopay/backend/src/services/merchant.service.ts:190-211` (TRUST-1). SAFE-1 owns dispute lifecycle semantics before the
provider pause hook at `abuse.service.ts:386-464`. CASH-10 may wrap the same `createTrade`
function around `micopay/backend/src/services/trade.service.ts:211`; land CASH-10 first, then
rebase CASH-8. Do not assign them against the same unrebased body.

## Out of scope

- Client/initiator abuse controls (`CASH-9`).
- KYC (`CASH-10`).
- Reputation aggregation and presentation (`TRUST-1`).
- Inbox query/navigation (`CASH-3`).
- Broad legacy `merchant_*` renaming.

## Acceptance criteria

- [ ] Every listed policy reads `provider_id`; no listed consumer infers provider from seller/buyer.
- [ ] Cash-out policy applies to the escrow buyer; deposit policy applies to the escrow seller.
- [ ] Push copy names the actual client and reaches only the provider.
- [ ] Provider-attributable events and auto-pause target the actual provider in both flows; no
      separate provider reputation is created.
- [ ] Both participants remain blocked when suspended/banned.
- [ ] Tests cover both flows and prove no client availability/reputation is mutated by provider policy.
- [ ] Backend typecheck/build pass.

## Dependencies and prior work

Depends on `CASH-1`, `RED-1`, the structural split in `CASH-9`, and `CASH-10` for source order.
Do not assign CASH-8 in parallel with CASH-9 or CASH-10. This is a regression/correctness
follow-up to closed issues #24, #31, #76 and #82; campaign eligibility must be reviewed before
rewarding it again. TRUST-1 owns #87's reputation correction.
