# Draft cash-out, Red MicoPay and KYC issue queue — 2026-08-26

Source audit: [`docs/AUDITORIA_CASHOUT_AGENTE_2026-08-26.md`](../../AUDITORIA_CASHOUT_AGENTE_2026-08-26.md)

Verified against commit `312e921053efe32f555d67bc1807a4e36cddc29a` (`origin/main` still
pointed there on 2026-08-27). Issue bodies are in English to match the repository convention.

**Status: review only. Do not publish this queue until the product and campaign decisions below
are approved.**

## Product decisions used by every issue

- MicoPay has one identity per person/device. A person can be a client in one trade and a
  liquidity provider in another; there is no permanent app-wide buyer/seller mode.
- The user-facing network is **Red MicoPay**. Use **agent** or **liquidity provider** in product
  copy. `merchant_*` names may remain temporarily in legacy code and endpoints; a mass rename is
  not part of this queue.
- Escrow `seller_id` and `buyer_id` retain their contract meaning. Product behavior must use
  explicit `flow` and `provider_id`, not infer the provider from `seller_id`.
- Cash-out is the star case: the client locks USDC as escrow seller; the provider gives MXN cash
  and receives USDC as escrow buyer.
- General MicoPay KYC is Didit. Etherfuse KYC is an additional, separate requirement only for the
  Etherfuse anchor/CETES/SPEI surface. Passing one must never be presented as passing the other.
- The escrow model is non-custodial and is not open for reconsideration. Support/admin cannot
  release, refund or reassign funds outside buyer-authorized release and timeout refund.
- Each person has one reputation and one progressive trust band. Flow/provider/initiator fields
  attribute events internally; they do not create separate client/provider scores.
- Multi-asset escrow is future scope. Every issue here stays on USDC <-> physical MXN cash unless
  it explicitly addresses the existing Etherfuse anchor. The separate future plan is
  [`MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md`](../../MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md).

## Publication matrix

| ID | Title | Dependency | Campaign treatment |
|---|---|---|---|
| [CASH-1](./CASH-1.md) | Persist trade flow and provider identity | — | New foundation; Drips candidate after data preflight |
| [CASH-2](./CASH-2.md) | Make cancellation flow-aware | CASH-1, CASH-4 | Product rule + regression campaign review required |
| [CASH-3](./CASH-3.md) | Show cash-outs in the provider inbox | CASH-1, CASH-5A, CASH-7, RED-1 | Regression of #25; campaign review required |
| [CASH-4](./CASH-4.md) | Complete cash-out from provider scan | CASH-1 | Regression of #70; campaign review required |
| [CASH-5A](./CASH-5A.md) | Canonicalize trade states | CASH-1 source order | Regression of #19; campaign review required |
| [CASH-5B](./CASH-5B.md) | Render revealing by flow and actor | CASH-1, CASH-5A, CASH-7 | Regression of #18; campaign review required |
| [CASH-6](./CASH-6.md) | Expose refund after timeout | CASH-7 for frontend prop | Regression of #71; campaign review required |
| [CASH-7](./CASH-7.md) | Remove duplicated buyer/seller session state | — | Follow-up to #160; campaign review required |
| [CASH-8](./CASH-8.md) | Route provider policy through `provider_id` | CASH-1, CASH-9, RED-1, CASH-10 source order | Regression of #24/#31/#76/#82; campaign review required |
| [CASH-9](./CASH-9.md) | Attribute initiator abuse controls correctly | CASH-1 | Regression of #2/#82; campaign review required |
| [CASH-10](./CASH-10.md) | Enforce and account P2P KYC for both participants | CASH-1 source order | Correction of GrantFox #314/#316; do not label Drips by default |
| [RED-1](./RED-1.md) | Add explicit Red MicoPay provider enrollment | — | New Merchant Operations work; Drips candidate |
| [RED-2](./RED-2.md) | Add provider onboarding to the retail APK | RED-1, RED-3, KYC-1, CASH-7 | New retail work; publish blocked or after dependencies |
| [RED-3](./RED-3.md) | Keep exact meeting details out of public discovery | — | Product rule + privacy campaign review required |
| [KYC-1](./KYC-1.md) | Make general Didit KYC usable in the APK | CASH-7 for route adapter | Correction of GrantFox #315; do not label Drips by default |
| [KYC-2](./KYC-2.md) | Account Etherfuse ramp volume on orders, not quotes | CASH-10 | Correction of GrantFox #316; do not label Drips by default |
| [SAFE-1](./SAFE-1.md) | Make disputes honest and non-custodial | CASH-1, CASH-4 | Settled architecture; regression campaign review required |
| [TRUST-1](./TRUST-1.md) | Build one flow-aware reputation per person | CASH-1, CASH-3, CASH-4, CASH-8, CASH-9, KYC-1, RED-3, SAFE-1 for dispute signals | Product signals + regression campaign review required |
| [TRUST-2](./TRUST-2.md) | Enforce progressive exposure limits | TRUST-1, CASH-5A, CASH-8, CASH-9, CASH-10 | Product bands + regression campaign review required |

“Campaign review required” means the body can remain in this local queue, but publication and
`Stellar Wave` eligibility require maintainer/campaign-owner confirmation because the scope
overlaps already closed, reward-eligible work. The issue body must keep the prior references.

## Current Drips readiness — 2026-08-27

`Ready` below means that the local issue body, source ownership and current GitHub metadata are
complete. It does not mean that the issue has been authorized, published or accepted for a reward.

| Candidate | Draft readiness | Remaining gate |
|---|---|---|
| `RED-1` | Ready for maintainer review | Explicit publication authorization and campaign/reward confirmation |
| `CASH-1` | Ready for maintainer review | Campaign/reward confirmation. Data preflight settled 2026-08-27: production has no real trades or users |
| `RED-2` | Not ready for assignment | `RED-1`/`RED-3`/`KYC-1`/`CASH-7` and the `1cf99eb` integration decision |

The public repository has no issue with any of these three exact titles as of 2026-08-27. No
GitHub issue has been created from this queue. The other 16 bodies are corrections, regressions or
supporting work and must not be presented as new Drips work without the campaign-owner review
recorded in their individual bodies.

## Dependency graph

```text
RED-1 ───────────────┬── CASH-3
                    ├── CASH-8 ── depends also on CASH-9
                    └── RED-2 ── depends also on RED-3, KYC-1 and CASH-7

RED-3 ───────────────── RED-2

CASH-1 ──┬── CASH-5A ── CASH-3 ── TRUST-1
         │              └── CASH-5B (with CASH-7)
         ├── CASH-4
         └── CASH-9 ── CASH-8

CASH-7 ──┬── CASH-3
         ├── CASH-5B
         ├── CASH-6
         └── KYC-1

CASH-4 ───────────────── CASH-2

CASH-1 + CASH-4 ───────── SAFE-1

CASH-1 + CASH-3 + CASH-4 + CASH-8 + CASH-9 + KYC-1 + RED-3 ─ TRUST-1
SAFE-1 ────────────────────────────────────────────────────────┘ dispute signals only

TRUST-1 + CASH-5A + CASH-8 + CASH-9 + CASH-10 ─ TRUST-2

CASH-1 ── CASH-10 ──┬── KYC-2
                    └── CASH-8 (source order; also depends on RED-1 and CASH-9)

CASH-7 and RED-3 are otherwise technically independent. CASH-10 has no product-data dependency
on CASH-1, but their shared `createTrade` body makes the source order mandatory.
```

## Recommended release order

1. `CASH-1`, `RED-1`, `RED-3` and `CASH-7`.
2. `CASH-5A`, `CASH-4`, `CASH-6`, `CASH-9`, `KYC-1` and `CASH-10` after their source
   foundations merge. CASH-1 lands before CASH-10; they must not be assigned in parallel even
   though CASH-10 has no product-data dependency on CASH-1.
3. `CASH-3` and `CASH-5B` after CASH-5A/CASH-7; `CASH-8` after CASH-9 **and CASH-10**;
   `KYC-2` after CASH-10's pure, database-backed accounting primitive.
4. `CASH-2` after `CASH-4` defines durable handoff confirmation.
5. `RED-2` after provider status, location privacy, general KYC routing and the single-session
   refactor are stable.
6. `SAFE-1` after the durable QR event; then `TRUST-1`, followed by `TRUST-2` after its exposure
   bands are approved. Non-custodial authority is already settled.

## Before publishing

- [x] **Settled 2026-08-27:** the maintainer confirmed production has no real trades and no real
  users. `CASH-1` ships the strict non-null schema and clears/reseeds demo data; there is no
  `legacy` path. The migration still aborts on ambiguous rows as an execution safeguard.
- Approve or replace the proposed cancellation rule in `CASH-2`.
- Approve or replace the public-area/private-meeting-point rule in `RED-3`.
- Verify that every `SAFE-1` path preserves the settled non-custodial invariant.
- Approve which single-reputation trust signals are visible in `TRUST-1` and the configurable
  initial/progression bands in `TRUST-2`.
- Keep the required Didit tier and production gate flag config-driven until legal/operations sign off.
- Create issues without reward labels first when campaign treatment is not settled.
- Assign exactly one milestone and one campaign per issue.
- Keep the `Source ownership at 312e921` map present in all 19 bodies. CASH-9 owns the structural
  split of `assertCanCreateTrade`; CASH-8 must not run in parallel against the original mixed
  function. Respect every additional serialization note in the individual maps.
- Do not publish multi-asset, KYB or broad terminology-renaming work as part of this queue.
- Do not reimplement provider location capture: commit `1cf99eb` already contains it outside
  `main`; decide whether to merge or port it before assigning `RED-2`.
