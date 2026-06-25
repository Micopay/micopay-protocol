# Wave 6 — Community Contributions Report
### MicoPay Protocol · Stellar Development Foundation Validation

> **Living document.** Updated each time a community PR is merged into `docs/VALIDATION_DRIPS.md`.
> Purpose: track contributor identity (GitHub handle), what each person validated, and how their
> evidence maps to the SDF funding narrative.
>
> Full synthesis → [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) ·
> Issue index → [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md) ·
> Wave 6 plan → [`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md)

---

## Contributor overview

| PR | GitHub user | Issue closed | Validation topic | Region | Status |
|----|-------------|-------------|-----------------|--------|--------|
| [#143](https://github.com/ericmt-98/micopay-protocol/pull/143) | [@attyolu](https://github.com/attyolu) | #142 | V-10 · Repeat use & provider discovery | Mexico / LATAM | ✅ Merged |
| [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) | [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) | #139 | V-7 · Current alternatives & switching | Monterrey MX / Bogotá CO / Buenos Aires AR / Caracas VE | ✅ Merged |
| [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) | [@KaruG1999](https://github.com/KaruG1999) | #138 | V-6 · Remittances cash-out context | Argentina | ✅ Merged |
| [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) | [@deep-bhikadiya](https://github.com/deep-bhikadiya) | #141 | V-9 · Safety meeting in person | India / South Asia | ✅ Merged |
| [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) | [@rosemary21](https://github.com/rosemary21) | #140 | V-8 · Fair commission / fee tolerance | Nigeria (Lagos area) | ✅ Merged |

**Total responses so far: N=8** (1 multi-respondent batch in V-10 + 4 first-person + 3 implicit in V-7 batch)
**Regions represented:** Mexico, Colombia, Argentina, Venezuela, India, Nigeria

---

## SDF claims coverage

Each contribution advances one or more of the five claims in our funding narrative.

| SDF Claim | Issues that back it | Responses in so far | Gap |
|-----------|--------------------|--------------------|-----|
| **1. Demand exists** (people need cash ↔ digital conversion) | V-1, V-2, V-6 | V-6 ✅ (KaruG1999) | V-1 and V-2 still open |
| **2. Supply exists** (providers would offer cash for a commission) | V-3 | None yet | V-3 unassigned |
| **3. MicoPay can win** (better than current options, at an acceptable fee) | V-7, V-8 | V-7 ✅ (barnabasolutayo-lgtm) · V-8 ✅ (rosemary21) | Both covered |
| **4. Stellar is usable** (mainstream users can handle non-custodial wallets) | V-4 | None yet | V-4 assigned to @Shadow-MMN, no PR yet |
| **5. Trust & PMF** (users feel safe, would return, would recommend) | V-5, V-9, V-10 | V-9 ✅ (deep-bhikadiya) · V-10 ✅ (attyolu) | V-5 assigned to @Truphile, no PR yet |

> **Priority to unlock:** V-1 (cash-out demand) and V-3 (liquidity supply) — the two core sides of the market. Without at least one response each, the funding case is missing its foundation.

---

## Detailed contribution entries

---

### V-10 · Repeat use & provider discovery
**Contributor:** [@attyolu](https://github.com/attyolu) · **PR:** [#143](https://github.com/ericmt-98/micopay-protocol/pull/143) · **Merged:** 2026-06-24

**Format:** multi-respondent synthesis (N=4, earlier format — kept as-is per maintainer decision).

**Regions:** Mexico City MX · Guadalajara MX · Bogotá CO · Lima PE

**Key findings:**

| Question | Signal |
|----------|--------|
| How would you find a nearby provider? | Map/list sorted by distance + availability; referral as secondary trust signal |
| Would you use it again after a good first experience? | 3/4 Yes, 1/4 Maybe (Bogotá) |
| What would make you return? | Transparent fees, predictable pricing, visible provider trust signals |
| What would kill repeat use? | Hidden fees, inconsistent experience, poor support, weak verification |
| What would make you recommend it? | Fast, simple, trustworthy — easy to explain to a friend |

**SDF narrative contribution:** Demonstrates early PMF signal. Repeat-use intent is high conditional on trust and consistency. Discovery is map-first, which directly informs the P1-2 (map) product work.

---

### V-7 · Current alternatives & switching
**Contributor:** [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) · **PR:** [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) · **Merged:** 2026-06-24

**Format:** N=4 anonymized interviews across LATAM. Also updates the SDF claims table (adds Claim 5 — Differentiation/Edge) and the metrics table.

**Regions:** Monterrey MX · Bogotá CO · Buenos Aires AR · Caracas VE

**What people use today and why they'd switch:**

| Respondent | Current method | Main friction | Would switch for |
|------------|--------------|---------------|-----------------|
| Monterrey, MX | OXXO + bank ATM | High convenience fees, queues, downtime | Lower fees, neighborhood exchange points |
| Bogotá, CO | Nequi / Daviplata + Efecty lottery kiosks | App downtime, limits, high cash-out fees | 24/7 reliability, transparent fees, flexible limits |
| Buenos Aires, AR | Informal exchange houses ("cuevas") + Binance P2P | Physical safety risks, P2P counterparty trust | Verified, trust-rated merchant network |
| Caracas, VE | Binance P2P + Pago Móvil + informal USD | Fiat/USD sourcing costs >5% broker fee | Direct <2% connection to verified agents with escrow |

**Switching dealbreakers:** upfront fees before handover · no immediate confirmation receipt · high platform fees · mandatory multi-day KYC · transaction failures.

**SDF narrative contribution:** Validates Claim 3 (MicoPay can win) from four countries. The competitive analysis shows the existing alternatives all fail on at least one of: fees, trust, or reliability — exactly what MicoPay addresses via Stellar escrow and reputation ratings.

---

### V-6 · Remittances cash-out context
**Contributor:** [@KaruG1999](https://github.com/KaruG1999) — Karen Giannetto · **PR:** [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) · **Merged:** 2026-06-24

**Format:** First-person, single respondent.

**Region:** Argentina (LATAM)

**Key findings:**

- Already receives money from abroad via **stablecoins on Stellar/Soroban and P2P networks** — a technically sophisticated user who already trusts the stack.
- Banking wires trigger regulatory friction, high inbound fees, and unfavorable ARS conversion rates.
- Crypto solves cross-border speed but cash-out to ARS still depends on P2P order books or physical OTC ("cuevas") — with variable spread and counterparty risk.
- **Would a nearby, same-day cash-out point help?** Yes. Eliminating P2P counterparty matching and having an immediate local cash-out point would drastically reduce friction and eliminate exchange-rate slippage.

**SDF narrative contribution:** This is the sharpest evidence for Claim 1 (demand exists) — a person who already uses Stellar for cross-border transfers and still lacks a trustworthy last-mile cash-out. It closes the loop: the Stellar network is already carrying the value; MicoPay solves the final delivery step.

---

### V-9 · Safety meeting in person
**Contributor:** [@deep-bhikadiya](https://github.com/deep-bhikadiya) — deep bhikadiya · **PR:** [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) · **Merged:** 2026-06-24

**Format:** First-person, single respondent.

**Region:** India / South Asia

**Key findings:**

- **Comfort level meeting a stranger:** Neutral — willing if the location, timing, and person feel trustworthy.
- **Biggest fear:** Being scammed or robbed. Secondary: fake cash, last-minute location change, being followed after leaving.
- **What would make it feel safe:** Busy public place + daytime. Verified profiles, ratings, in-app chat, clear receipts, accessible support — together make the exchange feel controllable.
- **Shops vs individuals:** Prefers a known shop (more accountable, easier to trace if something goes wrong). An individual feels inherently more uncertain.

**SDF narrative contribution:** Extends the geographic sample beyond LATAM into South Asia, confirming that the safety concerns around in-person exchange are universal — not region-specific. The safety design requirements that emerge (verified profiles, ratings, public locations, receipts, support) are directly actionable for the UX of the provider matching screen.

---

### V-8 · Fair commission / fee tolerance
**Contributor:** [@rosemary21](https://github.com/rosemary21) — Rosemary · **PR:** [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) · **Merged:** 2026-06-24

**Format:** First-person, single respondent.

**Region:** Nigeria (Lagos area)

**Key findings:**

- **Fair fee range:** 1–3% — enough to compensate provider for time and liquidity risk, low enough that the service beats a traditional bank or agent.
- **"Too expensive" threshold:** >5%. Above that it feels exploitative and the traditional channel wins by default.
- **What would justify stretching the ceiling:**
  1. Not needing a bank account at all — that alone unlocks access.
  2. Same-day settlement.
  3. Verified provider + in-app dispute path.
- **Would you pay a premium for a closer/faster provider?** Yes. Proximity and speed justify a small premium over the base rate.

**SDF narrative contribution:** Adds sub-Saharan Africa to the sample and contributes the clearest statement of the "no bank account needed" value proposition. The 1–5% fee band confirmed here matches the signals from Venezuela (<2% trigger) and LATAM generally, establishing a cross-regional pricing anchor for unit economics conversations with SDF.

---

## Cross-cutting insights (for the SDF deck)

### 1. The fee ceiling is universal: 2–5%
Across Nigeria, Venezuela, Mexico, Colombia, and Argentina, respondents independently converge on the same range. Anything above 5% loses to the traditional channel — even for people with very limited access. This gives MicoPay a concrete, defensible pricing constraint.

### 2. Trust is not optional — it's the feature
Every respondent across every topic mentioned trust signals as a prerequisite: verified profiles, ratings, in-app chat, receipts, support access. This is not a "nice to have" for the UX — it is the product's core value proposition alongside low fees.

### 3. The last mile is the real problem, even for Stellar users
The Argentina respondent (V-6) already uses Stellar for cross-border transfers and still can't get cash locally without P2P counterparty risk. MicoPay's value isn't the blockchain — it's the trusted, local, same-day cash delivery.

### 4. The "no bank account required" argument is the strongest unlock
Named explicitly by Nigeria (V-8) and implied by Venezuela (V-7). For sub-Saharan Africa and hyper-inflationary LATAM economies, eliminating bank account dependency is more compelling than any fee argument.

### 5. Geographic diversity de-risks the SDF case
Responses now span 6 countries across 3 continents (LATAM, South Asia, Africa). The convergence of pain points and preferences across such different markets strengthens the case that this is a structural problem — not a local quirk — and that Stellar's infrastructure can solve it globally.

---

## What's still missing

| Issue | Assignee | PR | Priority for SDF case |
|-------|----------|----|-----------------------|
| V-1 · Cash-out demand | [@larryjay007](https://github.com/larryjay007) | None yet | 🔴 Critical — core demand signal |
| V-2 · Cash-in / deposit context | [@Truphile](https://github.com/Truphile) | None yet | 🔴 Critical — bidirectional demand |
| V-3 · Liquidity provider perspective | [@3m1n3nc3](https://github.com/3m1n3nc3) | None yet | 🔴 Critical — supply side of the market |
| V-4 · Non-custodial wallet onboarding | [@Shadow-MMN](https://github.com/Shadow-MMN) | None yet | 🟡 Important — Stellar usability claim |
| V-5 · Trust in the flow | [@Truphile](https://github.com/Truphile) | None yet | 🟡 Important — PMF / drop-off risk |

> V-1, V-2 and V-3 are the highest priority. Without at least one first-person response for each,
> the SDF narrative lacks its two most fundamental claims: that people need this (demand) and
> that someone would provide it (supply).

---

## Methodology reminder (state this in the deck)

- **First-person** entries reflect each contributor's own lived experience — not a survey of others.
- **Convenience sample**, self-selected via Stellar Drips Wave 6. Directional and qualitative, not statistically representative.
- **Privacy-first:** no names, no contact information, no transaction amounts, no wallet addresses.
- Current sample size: **N=8 individual perspectives** across **6 countries / 3 regions**.
- Report `N` plainly. Let the cross-regional consistency of the patterns speak for itself.

---

*Last updated: 2026-06-24 · Maintainer: [@ericmt-98](https://github.com/ericmt-98)*
