<!-- Title: CASH-9 · Attribute initiator abuse controls and audit events correctly -->
<!-- Suggested labels: wave:backend, wave:trust, complexity: high -->
<!-- Suggested milestone: Wave 8: Backend Hardening -->

## Problem

Trade creation treats `buyer_id` as the caller/client. In cash-out the caller/client is the
escrow seller, so the client's device is stored under the provider, the provider's entire
cash-out volume is attributed to each client device, the same client is not followed across
providers, and daily limits/audit actors point to the wrong user.

## Why it matters

This creates false multi-account signals while leaving the real initiator's cross-provider
behavior unmeasured.

## In scope

- Derive the product client/initiator from authenticated caller plus persisted `flow`.
- Attribute `touchUserDevice`, daily client limits, related-account checks and audit actors to
  that initiator.
- Count historical client-initiated trades using the explicit flow model, not `buyer_id` alone.
- Preserve counterparty and provider checks as separate identities.
- Split the current mixed `assertCanCreateTrade` body into named participant, initiator and
  provider checks. This issue owns the structural extraction and initiator behavior; it must move
  the provider block unchanged so `CASH-8` can modify it afterward without editing the same body.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/services/abuse.service.ts:133-163` | related-account actor and participant attribution |
| `micopay/backend/src/services/abuse.service.ts:166-223` | initiator daily/device/IP aggregation |
| `micopay/backend/src/services/abuse.service.ts:225-313` | structural split of `assertCanCreateTrade`; semantic changes at `:236-237`, `:265-312` |
| `micopay/backend/src/services/trade.service.ts:244-255` | creation audit actor/metadata |

Inside `assertCanCreateTrade`, preserve the both-participant suspension checks at `:234-235`.
Extract the provider availability block at `:239-263` without changing its policy; that extracted
provider check is the later ownership of `CASH-8`. Do not edit
`micopay/backend/src/services/trade.service.ts:193` (CASH-10),
`:123-160`/`:211`/`:258-266` (CASH-8), or reputation code (TRUST-1).

## Out of scope

- Provider availability/reputation/auto-pause (`CASH-8`).
- KYC tier/volume (`CASH-10`).
- New fingerprinting vendors or new PII collection.

## Acceptance criteria

- [ ] The request device/IP is stored under the authenticated initiator.
- [ ] The same cash-out client is recognized across two different providers.
- [ ] Two unrelated clients using one provider are not merged merely because that provider is buyer.
- [ ] Daily client limits count deposit and cash-out initiated by that client.
- [ ] Creation/related-account audit events name the real initiating user.
- [ ] Tests cover both flows, cross-provider reuse and two clients with one provider.
- [ ] No raw phone/IP/device value is added to logs.

## Dependencies and prior work

Depends on `CASH-1` for historical flow attribution. `CASH-8` must run after this issue's shared
function split; the two issues must not be assigned in parallel. This is a regression/correctness
follow-up to closed issues #82 and #2.
