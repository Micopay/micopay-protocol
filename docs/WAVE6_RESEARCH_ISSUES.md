# Wave 6 — Research (market & user validation) issues

> **What this is:** an overview of the 10 validation issues (V-1…V-10) that feed the
> [SDF presentation prep](./VALIDATION_DRIPS.md). The full questions live in each GitHub
> issue; this file is the index + the rules.
>
> Part of the Wave 6 plan: [`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md) §7.

---

## The model

- **First-person only.** Each contributor shares **their own** experience — no surveying other
  people, no invented samples.
- **One assignee per issue.** People apply via the Drips bot; the maintainer assigns one person
  per issue; the bot notifies them.
- **Delivery = PR.** The assignee opens a PR that adds their own `### V-X` section to
  [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) (one section per issue → no conflicts). The
  maintainer reviews for privacy and merges.
- **Labels:** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`.

## Privacy-first (applies to every issue)

> ⚠️ No real names, phone numbers, addresses, wallet addresses, private keys, documents,
> receipts, transaction hashes, or financial details. **We do not ask for any amounts of
> money** — not even ranges. A commission **percentage** (V-3, V-8) is fine. Share only a
> **general country/region** and your **own anonymized** experience. Responses in English or Spanish.

## The issues

| ID | Issue | Topic | What it validates (SDF) | Status |
|----|-------|-------|-------------------------|--------|
| V-1 | [#131](https://github.com/ericmt-98/micopay-protocol/issues/131) | Cash-out context | User-side demand (digital → cash) | ✅ PR #155 · @larryjay007 |
| V-2 | [#132](https://github.com/ericmt-98/micopay-protocol/issues/132) | Cash-in / deposit | Bidirectional demand (cash → digital) | ✅ PR #159 · @Truphile |
| V-3 | [#133](https://github.com/ericmt-98/micopay-protocol/issues/133) | Liquidity provider | Supply side (who provides the cash) | ✅ PR #169 · @DevSolex |
| V-4 | [#134](https://github.com/ericmt-98/micopay-protocol/issues/134) | Non-custodial onboarding | Stellar self-custody usable by normal users | ✅ PR #157 · @Shadow-MMN |
| V-5 | [#135](https://github.com/ericmt-98/micopay-protocol/issues/135) | Trust in the flow | Trust / product-market fit | ✅ PR #158 · @Truphile |
| V-6 | [#138](https://github.com/ericmt-98/micopay-protocol/issues/138) | Remittances cash-out | Cross-border remittance demand (receiver) | ✅ PR #146 · @KaruG1999 |
| V-7 | [#139](https://github.com/ericmt-98/micopay-protocol/issues/139) | Alternatives & switching | Differentiation vs current options | ✅ PR #145 · @barnabasolutayo-lgtm |
| V-8 | [#140](https://github.com/ericmt-98/micopay-protocol/issues/140) | Fair commission / fee | Unit economics (acceptable fee %) | ✅ PR #148 · @rosemary21 |
| V-9 | [#141](https://github.com/ericmt-98/micopay-protocol/issues/141) | Safety meeting in person | De-risking P2P adoption | ✅ PR #147 · @deep-bhikadiya |
| V-10 | [#142](https://github.com/ericmt-98/micopay-protocol/issues/142) | Repeat use & discovery | Retention / sustained usage | ✅ PR #143 · @attyolu |
| V-11 | [#164](https://github.com/ericmt-98/micopay-protocol/issues/164) | Failed transaction / dispute | Trust recovery after failure | 🆕 Open |
| V-12 | [#165](https://github.com/ericmt-98/micopay-protocol/issues/165) | Living unbanked | Core demand — bank-free users | ✅ PR #173 · @Oluwasuyi-Timilehin |
| V-13 | [#166](https://github.com/ericmt-98/micopay-protocol/issues/166) | Remittance sender | Cross-border demand (sender side) | ✅ PR #171 · @Jo-anny |
| V-14 | [#167](https://github.com/ericmt-98/micopay-protocol/issues/167) | Stablecoin / digital peso mental model | Stellar stablecoin layer trust | ✅ PR #170 · @Max-Owolabi |
| V-15 | [#168](https://github.com/ericmt-98/micopay-protocol/issues/168) | First-time trust threshold | PMF — first adoption barrier | 🆕 Open |
| V-22 | [#237](https://github.com/ericmt-98/micopay-protocol/issues/237) | Key recovery — self-custody trust | Validates passkey recovery architecture (Claim 4) | ✅ PR · contributor |

## After answers come in

Each issue closes once its assignee's PR is merged (privacy-safe, first-person). The maintainer
keeps the aggregate, anonymized synthesis in [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) —
never copying personal data or anything that could identify a participant.
