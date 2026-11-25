<!-- Title: RED-3 · Keep exact provider meeting details out of public discovery -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:trust, wave:needs-product, complexity: high -->
<!-- Suggested milestone: Wave 8: Product & Release -->

## Problem

`GET /merchants/available` is public and unauthenticated. The privacy fix in commit `905cf77`
rate-limits that endpoint and rounds latitude/longitude to three decimals, but the same response
still returns `address_text` verbatim. That free-text field may be a broad area such as
“Centro, CDMX”, or it may contain a street address. The backend does not distinguish the two.

The audited code also has no participant-only trade response that implements the stated contract
of revealing an exact meeting point only after a trade is accepted.

## Why it matters

Red MicoPay providers may be shops, informal workers or individuals. A shop may deliberately
publish its storefront, while an individual must not accidentally publish a home address to an
enumerable endpoint. Rounded coordinates do not protect a precise address returned beside them.

## Proposed product rule

- Public discovery exposes only rounded coordinates and an optional non-sensitive area label.
- An exact meeting point is private by default and is shared only with both participants of an
  accepted trade, after explicit provider consent.
- A provider may explicitly opt into publishing a storefront address, but that choice must not be
  inferred merely because `address_text` is populated.

This rule is proposed for product confirmation; it must be settled before implementation.

## In scope

- Separate the public area label from private meeting details in storage and API types.
- Remove the existing free-form `address_text` value from the public discovery response.
- Add an authenticated, participant-authorized way to obtain the meeting point for an accepted,
  non-terminal trade when the provider has chosen to share it.
- Add an explicit storefront-publication consent if public exact addresses are supported.
- Update the map/list UI so it never treats private meeting details as discovery copy.
- Define retention and clearing behavior for private meeting details.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/sql/migrations/002_merchant_discovery.sql:8-34` plus one new ordered up/down migration | separate public area, private meeting point and explicit storefront-publication consent |
| `micopay/backend/src/routes/merchants.ts:11-63`, `:117-154` | public discovery response contract and authenticated location writes |
| `micopay/backend/src/services/merchant.service.ts:7-28`, `:165-189`, `:223-230` | location storage/projection and removal of private `address_text` from anonymous output |
| new authenticated trade meeting-point route/service | participant-authorized projection for accepted non-terminal trades without widening public discovery |
| `micopay/frontend/src/services/api.ts:578-650` | public-area and private-meeting-point API types |
| `micopay/frontend/src/pages/DepositMap.tsx:229-278`, `:283-294` | discovery copy that never renders private meeting details; TRUST-1 keeps the trust row at `:279-282` |

RED-1 owns discovery eligibility at `micopay/backend/src/services/merchant.service.ts:194-199`; TRUST-1 owns reputation
subqueries/mapping at `:190-191,:211-215,:233-235`; TRUST-2 owns amount-limit filtering at
`:197-198`. The participant-only meeting-point endpoint must reuse normal trade-participant
authorization but must not modify CASH-8's provider-unavailable projection.

## Out of scope

- Provider enrollment state (`RED-1`) or onboarding layout (`RED-2`).
- Live-location tracking.
- Route guidance or navigation-provider integration.
- Replacing the existing map implementation.

## Acceptance criteria

- [ ] Anonymous discovery never returns a private free-form address or exact meeting point.
- [ ] Public results contain only rounded coordinates and an explicitly public, non-sensitive
      label unless the provider has separately opted into publishing a storefront.
- [ ] Exact meeting details, when configured, require authentication and participation in the
      accepted trade; unrelated users receive no value.
- [ ] Terminal, cancelled and refunded trades no longer reveal private meeting details according
      to the documented retention policy.
- [ ] The provider UI explains what is public and what is shared only after acceptance.
- [ ] Tests cover anonymous enumeration, unrelated authenticated users, both participants,
      lifecycle transitions and explicit storefront consent.

## Dependencies and prior work

No technical dependency. `RED-2` should depend on this product contract so its location step does
not teach unsafe behavior. Commit `905cf77` / PR #362 implemented rate limiting and coordinate
coarsening but did not cover the free-form address; campaign eligibility therefore requires owner
review before adding a reward label.
