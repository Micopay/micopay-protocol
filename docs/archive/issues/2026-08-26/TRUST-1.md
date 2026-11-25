<!-- Title: TRUST-1 · Build one flow-aware reputation per person -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:trust, wave:needs-product, complexity: high -->
<!-- Suggested milestone: Wave 8: Product & Release -->

## Problem

MicoPay currently has three incompatible reputation calculations. Public discovery counts only
seller-side trades and emits `Nuevo/Bronce/Plata/Oro`; the self profile mixes buyer and seller
history; and trade completion tries to write `espora/activo/experto/maestro` into a `merchants`
table that does not exist in the audited schema. None gives the cash provider a useful history of
the client who is asking them to hand over physical MXN.

## Why it matters

The QR coordinates the handoff but cannot prove cash changed hands. Both participants need useful
trust signals, but separate client/provider reputations would fragment one person's identity and
complicate the product whenever that person changes function.

## Product rule — requires approval

Each person has one reputation and one visible trust history across MicoPay cash exchanges. Trade
events still record flow, provider, initiator and responsible actor internally so a cancellation,
no-show or upheld support case affects the responsible person rather than both participants. These
are attribution fields, not separate scores or user modes.

KYC is an identity/compliance signal, not reputation. Show only a minimal verified/not-verified
signal, never documents, provider payloads or private identity data.

## In scope

- Define one canonical, flow-aware reputation per identity, derived from durable trade and safety
  events.
- Attribute each event using persisted `flow`, `provider_id`, authenticated initiator and actor
  without exposing separate client/provider scores.
- Include transparent signals such as completed operations, attributed completion/cancellation
  rate, account tenure and server-authoritative general-KYC verification.
- Use attributed outcomes from cancellation/abuse/dispute records; do not blame both parties for
  every failed trade.
- Replace the dead `UPDATE merchants` path and remove incompatible tier vocabularies.
- Use the same summary definition in provider discovery and expose the selected client's minimal
  summary only to the provider for an accepted/active trade.
- Show the relevant counterparty summary in trade detail/provider inbox before cash handoff.
- Make aggregation idempotent and rebuildable from durable records.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| new canonical reputation schema/service and rebuild tests | one per-person aggregation from durable, actor-attributed events |
| `micopay/backend/src/services/trade.service.ts:735-848` | remove the dead `UPDATE merchants` writer and feed canonical completion events |
| `micopay/backend/src/routes/users.ts:108-157` | self-profile trust summary from the canonical definition |
| `micopay/backend/src/services/merchant.service.ts:19-38`, `:190-191`, `:211-215`, `:233-235` | canonical discovery summary, replacing seller-only counts/tier vocabulary |
| `micopay/backend/src/services/trade.service.ts:284-299`, `:1174-1197` | authorized counterparty summary after CASH-8 and provider-inbox summary after CASH-3 |
| `micopay/frontend/src/services/api.ts:57-70`, `:330-344`, `:578-604` | one typed trust summary across self, inbox, trade and discovery responses |
| `micopay/frontend/src/pages/Profile.tsx:217-270`, `micopay/frontend/src/pages/DepositMap.tsx:279-282,:344-347`, `micopay/frontend/src/pages/ExploreMap.tsx:58-60,:267-268,:351` | render the same vocabulary/signals in self and discovery views |
| `micopay/frontend/src/pages/MerchantInbox.tsx:450-484` plus the CASH-5B trade-detail summary slot | show the selected client's allowed summary before handoff |

CASH-8/CASH-9/SAFE-1 own correct event attribution and lifecycle; TRUST-1 consumes their durable
records. RED-1 owns discovery eligibility, RED-3 owns location fields and TRUST-2 owns caps. Land
CASH-3 before extending its inbox row and CASH-8 before extending participant trade detail.

## Out of scope

- Progressive amount caps (`TRUST-2`).
- Public reviews, free-form comments or a single opaque credit score.
- Revealing KYC level, documents, phone, IP/device data or exact address.
- Permanent client/provider roles or separate reputations by role.
- Re-routing existing provider policy (`CASH-8`) or initiator attribution (`CASH-9`).

## Acceptance criteria

- [ ] A completed cash-out contributes once to each participant's single reputation history.
- [ ] Changing between client and provider functions never creates, resets or selects another
      reputation.
- [ ] Provider discovery and self/counterparty views read one canonical definition and vocabulary.
- [ ] A provider can see the selected client's allowed trust summary before handing over cash.
- [ ] Cancellation/dispute impact is attributed to the responsible actor when known.
- [ ] The nonexistent/dead `merchants` reputation write is removed or migrated to the canonical
      store with schema coverage.
- [ ] No private KYC/evidence/device/location data is exposed in a trust response.
- [ ] Tests cover deposit, cash-out, role switching, rebuild/idempotency and access control.

## Dependencies and prior work

Depends on `CASH-1`, `CASH-3`, `CASH-4`, `CASH-8`, `CASH-9`, `KYC-1` and `RED-3`;
dispute-derived signals also depend on `SAFE-1`. CASH-4 first owns the completion hook, KYC-1
first establishes the server-authoritative verified signal, and RED-3 first separates location
fields from the shared discovery type.
This is a corrective extension of closed reputation/safety issues #87 and #82.
Product and campaign owners must approve visible signals and reward treatment before publication.
