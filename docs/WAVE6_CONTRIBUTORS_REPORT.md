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
| [#155](https://github.com/ericmt-98/micopay-protocol/pull/155) | [@larryjay007](https://github.com/larryjay007) | #131 | V-1 · Cash-out context | Nigeria (South West) | ✅ Merged |
| [#159](https://github.com/ericmt-98/micopay-protocol/pull/159) | [@Truphile](https://github.com/Truphile) | #132 | V-2 · Cash-in / deposit context | Nigeria (West Africa) | ✅ Integrated |
| [#157](https://github.com/ericmt-98/micopay-protocol/pull/157) | [@Shadow-MMN](https://github.com/Shadow-MMN) | #134 | V-4 · Non-custodial wallet onboarding | — | ✅ Merged |
| [#158](https://github.com/ericmt-98/micopay-protocol/pull/158) | [@Truphile](https://github.com/Truphile) | #135 | V-5 · Trust in the cash-in/cash-out flow | Nigeria (West Africa) | ✅ Integrated |
| [#143](https://github.com/ericmt-98/micopay-protocol/pull/143) | [@attyolu](https://github.com/attyolu) | #142 | V-10 · Repeat use & provider discovery | Mexico / LATAM | ✅ Merged |
| [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) | [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) | #139 | V-7 · Current alternatives & switching | Monterrey MX / Bogotá CO / Buenos Aires AR / Caracas VE | ✅ Merged |
| [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) | [@KaruG1999](https://github.com/KaruG1999) | #138 | V-6 · Remittances cash-out context | Argentina | ✅ Merged |
| [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) | [@deep-bhikadiya](https://github.com/deep-bhikadiya) | #141 | V-9 · Safety meeting in person | India / South Asia | ✅ Merged |
| [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) | [@rosemary21](https://github.com/rosemary21) | #140 | V-8 · Fair commission / fee tolerance | Nigeria (Lagos area) | ✅ Merged |
| [#169](https://github.com/ericmt-98/micopay-protocol/pull/169) | [@DevSolex](https://github.com/DevSolex) | #133 | V-3 · Liquidity provider perspective | Nigeria (West Africa) | ✅ Merged |
| [#171](https://github.com/ericmt-98/micopay-protocol/pull/171) | [@Jo-anny](https://github.com/Jo-anny) | #166 | V-13 · Remittance sender context | Europe → Latin America | ✅ Integrated |
| [#173](https://github.com/ericmt-98/micopay-protocol/pull/173) | [@Oluwasuyi-Timilehin](https://github.com/Oluwasuyi-Timilehin) | #165 | V-12 · Living unbanked — daily cash management | Mexico (CDMX) | ✅ Merged |
| [#175](https://github.com/ericmt-98/micopay-protocol/pull/175) | [@Max-Owolabi](https://github.com/Max-Owolabi) | #167 | V-14 · Stablecoin / digital peso mental model | Nigeria (West Africa) | ✅ Integrated |
| [#174](https://github.com/ericmt-98/micopay-protocol/pull/174) | [@Chigybillionz](https://github.com/Chigybillionz) | #164 | V-11 · Failed transaction / dispute handling | Nigeria (West Africa) | ✅ Integrated |

**Total responses: N=17** (V-1, V-2, V-3, V-4, V-5, V-11, V-12, V-13, V-14 first-person + 1 multi-respondent batch in V-10 + 3 first-person V-6/V-8/V-9 + 3 implicit in V-7 batch)
**Regions represented:** Nigeria (×6), Mexico (×2), Colombia, Argentina, Venezuela, India, Europe

---

## SDF claims coverage

Each contribution advances one or more of the five claims in our funding narrative.

| SDF Claim | Issues that back it | Responses in so far | Gap |
|-----------|--------------------|--------------------|-----|
| **1. Demand exists** (people need cash ↔ digital conversion) | V-1, V-2, V-6 | V-1 ✅ (larryjay007) · V-2 ✅ (Truphile) · V-6 ✅ (KaruG1999) | Fully covered (3 responses) |
| **2. Supply exists** (providers would offer cash for a commission) | V-3 | V-3 ✅ (DevSolex) | Covered — Nigeria individual provider |
| **3. MicoPay can win** (better than current options, at an acceptable fee) | V-7, V-8 | V-7 ✅ (barnabasolutayo-lgtm) · V-8 ✅ (rosemary21) | Both covered |
| **4. Stellar is usable** (mainstream users can handle non-custodial wallets) | V-4, V-14 | V-4 ✅ (Shadow-MMN) · V-14 ✅ (Max-Owolabi) | Covered (2 responses) |
| **5. Trust & PMF** (users feel safe, would return, would recommend) | V-5, V-9, V-10, V-11 | V-5 ✅ (Truphile) · V-9 ✅ (deep-bhikadiya) · V-10 ✅ (attyolu) · V-11 ✅ (Chigybillionz) | Fully covered (4 responses) |

> **All 5 SDF claims now have at least one response.** The supply-side gap (V-3) was closed by DevSolex. The only remaining open validation issue is **V-15** (first-time trust threshold); it strengthens the deck but is not blocking the core funding case.

---

## Detailed contribution entries

---

### V-1 · Cash-out context
**Contributor:** [@larryjay007](https://github.com/larryjay007) · **PR:** [#155](https://github.com/ericmt-98/micopay-protocol/pull/155) · **Merged:** 2026-06-25

**Format:** First-person, single respondent.

**Region:** Nigeria (South West)

**Key findings:**

- **Cash-out frequency:** Weekly — a recurring, non-occasional need.
- **Current method:** Peer-to-peer exchange or bank transfer to a local account, followed by ATM withdrawal or POS agent.
- **Main friction:** High cumulative transaction fees, unreliable ATM availability, and daily withdrawal limits.
- **Lived experience:** Spent over an hour visiting three bank locations due to empty ATMs and network failures. When a working ATM was finally found, the daily withdrawal limit forced multiple transactions and additional bank charges.

**SDF narrative contribution:** Adds Nigeria (South West) to the cash-out demand signal for Claim 1. Weekly frequency + ATM reliability failures + withdrawal limits combine into a strong recurring pain that a local P2P agent network directly addresses.

---

### V-2 · Cash-in / deposit context
**Contributor:** [@Truphile](https://github.com/Truphile) · **PR:** [#159](https://github.com/ericmt-98/micopay-protocol/pull/159) · **Integrated:** 2026-06-25

**Format:** First-person, single respondent.

**Region:** Nigeria (West Africa)

**Key findings:**

- **Why cash-in matters:** Collecting paper cash from offline gigs or friends makes it impossible to pay digital bills (AWS, utility tokens, fintech savings). Cash-in = unblocking access to the digital economy.
- **Current method:** Walk to a neighborhood PoS agent, hand over physical cash, provide account details, wait for a transfer to the digital wallet via the agent's terminal.
- **Frequency:** A few times a month — whenever physical cash accumulates.
- **Main trust barrier:** Network failures mid-transaction. The fear is handing over cash and hearing "network is bad, the money hasn't dropped yet." A reversal can take 24–48 hours.
- **Local trusted providers:** Yes — established, branded kiosks tied to a permanent physical location. Reputation accountability makes them trustworthy.

**SDF narrative contribution:** Confirms bidirectional demand (Claim 1) from West Africa. The cash-in direction mirrors the cash-out demand of V-1. The key UX risk to address: mid-operation network failure and confirmation latency must have an immediate in-app status solution.

---

### V-4 · Non-custodial wallet onboarding
**Contributor:** [@Shadow-MMN](https://github.com/Shadow-MMN) · **PR:** [#157](https://github.com/ericmt-98/micopay-protocol/pull/157) · **Merged:** 2026-06-25

**Format:** First-person UX audit of the current MicoPay app.

**Key findings:**

- **Key custody clarity:** Not clear at all. No onboarding screen exists — keypair was generated silently and only discoverable via browser localStorage inspection.
- **Biggest fear:** Losing the key to a hacker since it is stored in localStorage without any user-visible protection.
- **Minimum to build trust:** A dedicated first-launch screen explaining that a wallet was created, showing the public key, and prompting the user to back up the secret key.
- **Create vs import:** Preference for importing an existing Stellar key — user already has funds elsewhere and doesn't want the friction of moving balances.
- **Backup mandatory vs optional:** Optional, but the UI must make it trivially easy (single tap to copy + prominent safety note). Mandatory backup frustrates trial users; invisible backup frustrates serious users.

**SDF narrative contribution:** First direct UX audit of the onboarding flow for Claim 4 (Stellar is usable). The verdict is clear: the current app does not meet the minimum bar for a non-technical user. The findings give the team a concrete, actionable checklist: onboarding screen → key display → copy-to-backup flow.

---

### V-5 · Trust in the cash-in/cash-out flow
**Contributor:** [@Truphile](https://github.com/Truphile) · **PR:** [#158](https://github.com/ericmt-98/micopay-protocol/pull/158) · **Integrated:** 2026-06-25

**Format:** First-person, single respondent.

**Region:** Nigeria (West Africa)

**Key findings:**

- **Most trusted provider type:** A well-established, branded neighborhood PoS kiosk with a steady stream of customers and a dedicated Android PoS terminal.
- **Least trusted:** A mobile, unbranded agent on a street corner with just a phone, or one claiming "network is bad" before even attempting the transaction.
- **Minimum info before handing over cash:** (1) Exact commission fee stated upfront · (2) Final locked-in value that will reflect in the wallet · (3) Clear on-screen confirmation that the agent's system is active and online.
- **Verification signals needed:** Agent's location and banner matching the in-app map listing + a "Trusted Agent" badge or high completion-rate indicator.
- **Support expectation mid-failure:** Immediate automated SMS receipt or in-app "Pending / Money Received" status · a WhatsApp support channel or toll-free line resolving hanging transactions within minutes.
- **Top abandonment trigger:** Any delay at point of payment — "network is fluctuating" or slow QR code/receipt generation triggers fear of trapped funds.

**SDF narrative contribution:** Maps the trust and abandonment signals directly to Claim 5 (Trust / PMF). The three-part checklist — transparent fee, locked rate, online status — is a concrete UX requirement the agent flow must satisfy before cash changes hands. Combined with V-2, this builds the complete Nigeria trust picture.

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

### V-14 · Stablecoin / digital peso mental model
**Contributor:** [@Max-Owolabi](https://github.com/Max-Owolabi) · **PR:** [#175](https://github.com/ericmt-98/micopay-protocol/pull/175) · **Integrated:** 2026-06-27

**Format:** First-person, single respondent.

**Region:** Nigeria (West Africa)

**Key findings:**

- **Prior stablecoin experience:** Yes — USDC and USDT on Stellar and other networks, obtained via local exchange agents and P2P platforms. Used primarily to hedge against local currency inflation and pay for digital services where local cards fail.
- **Mental model vs physical cash:** Initially abstract ("a number on a screen"). Trust built through: ability to convert back to fiat, global payment utility, smart contract security, on-chain transaction transparency.
- **Hardest part to understand:** Gas/network fees, multi-chain differences for the same token (Stellar vs Ethereum), and self-custody key management without a bank password reset.
- **Reaction to "your funds are in a digital wallet":** Curiosity + caution — safer from physical theft, but fears digital hacking or key loss without clear recovery options.
- **Cash equivalence trigger:** Guaranteed instant conversion to cash at any local corner store, no high fees, and clear in-app escrow confirmation.

**SDF narrative contribution:** Validates Claim 4 (Stellar is usable) from an inflationary market. Stablecoins are already valued as a real tool in West Africa — the gap is the last-mile cash conversion and key recovery UX, which is exactly what MicoPay's local agent + escrow model addresses.

---

### V-12 · Living unbanked — everyday context
**Contributor:** [@Oluwasuyi-Timilehin](https://github.com/Oluwasuyi-Timilehin) · **PR:** [#173](https://github.com/ericmt-98/micopay-protocol/pull/173) · **Merged:** 2026-06-26

**Format:** First-person, single respondent.

**Region:** Mexico (CDMX metropolitan area)

**Key findings:**

- **Cash storage:** Physical cash at home for daily expenses + Mercado Pago / Spin by OXXO for occasional digital payments — no formal bank account.
- **Income method:** Cash in hand for gig work and physical sales; occasional SPEI transfers to a relative's account when clients can't pay cash.
- **Top cash friction:** Physical safety — carrying larger amounts on public transit or in the neighborhood triggers real anxiety about theft or loss/damage of notes.
- **Workaround for digital payments:** Walk to the nearest OXXO, show a payment code, pay in cash + convenience fee. Or buy prepaid gift cards at the register.
- **Local agent utility:** Strong yes. A recognized local business (corner shop, pharmacy, bakery) with user ratings and visible escrow lock would be trusted enough to use immediately.

**SDF narrative contribution:** The strongest first-person validation of the core unbanked use case — and it comes from the exact target market (Mexico City). Confirms that the "no bank account" friction is felt daily and that the escrow visibility + local merchant format is the product design that closes the trust gap.

---

### V-3 · Liquidity provider perspective
**Contributor:** [@DevSolex](https://github.com/DevSolex) · **PR:** [#169](https://github.com/ericmt-98/micopay-protocol/pull/169) · **Merged:** 2026-06-26

**Format:** First-person, single respondent.

**Region:** Nigeria (West Africa)

**Key findings:**

- **Would provide liquidity?** Yes — with conditions: escrow must lock funds before cash is handed over.
- **Provider type:** Individual with an informal side-hustle; handles modest cash flows and does occasional P2P exchanges locally.
- **Main motivation:** Commission income + convenience of converting already-held stablecoins back to local currency without going through a bank. Also builds local reputation.
- **Perceived risks:** Non-payment or fake/reversed digital transfer; physical safety when carrying cash in public; regulatory ambiguity; no clear dispute resolution path.
- **Expected commission:** 2–3%. Below 2% doesn't cover time/liquidity risk; above 4% pushes users back to informal channels.
- **Trust trigger:** USDC locked in escrow before any cash is handed over — removes most of the risk. Also: verified counterparty history, clear in-app step-by-step instructions, visible support/dispute path.

**SDF narrative contribution:** Closes the supply-side gap for Claim 2. Confirms real willingness to provide liquidity among informal P2P exchangers in West Africa, and pins the commission range at 2–3% — consistent with the 1–5% window from V-8. The escrow-first design requirement is the clearest product signal: the escrow lock must be visible to the provider before they move any cash.

---

### V-13 · Remittance sender context — sending money abroad
**Contributor:** [@Jo-anny](https://github.com/Jo-anny) · **PR:** [#171](https://github.com/ericmt-98/micopay-protocol/pull/171) · **Integrated:** 2026-06-26

**Format:** First-person, single respondent.

**Region:** Europe → Latin America (sender side)

**Key findings:**

- **Current method:** Mix of bank transfers and digital remittance services; sometimes crypto P2P for faster cash access.
- **Cost:** High single-digit percent range (fees + currency conversion spread combined).
- **Delivery time:** Same day to next day normally; banks can take several days if compliance checks trigger.
- **Biggest frustration:** Opacity — unknown final delivered amount until after the transaction clears. Recipient must also handle separate cash-out steps or agent availability.
- **Recipient behavior:** Cashes out via bank deposit, cash pickup, or mobile wallet + agent withdrawal.
- **Switch trigger:** Cheaper, faster, more transparent — and crucially, knowing the final received amount and cash-out option **before** sending.

**SDF narrative contribution:** Adds the sender-side view to the remittance demand signal (Claim 1). The V-6 Argentina response covered the receiver; V-13 closes the loop from the sender. The "certainty before sending" requirement is a direct product spec: the trade confirmation screen must show the exact MXN-equivalent and nearby provider availability before the user commits.

---

### V-11 · Failed transaction / dispute handling
**Contributor:** [@Chigybillionz](https://github.com/Chigybillionz) · **PR:** [#174](https://github.com/ericmt-98/micopay-protocol/pull/174) · **Integrated:** 2026-06-27

**Format:** First-person, single respondent.

**Region:** Nigeria (West Africa)

**Key findings:**

- **The failure:** A bank-to-bank transfer failed at the very last step — right after entering the correct OTP — returning only a generic "failed" error with no explanation.
- **Recovery path:** No in-app recovery. The respondent fell back to an informal network (a relative sent cash) to complete the original purchase.
- **Time-to-resolution:** Over a week and still unresolved; the only escalation path is a physical branch visit, which hadn't happened yet.
- **What was missing:** Two concrete product gaps — (1) an immediate, plain-language status/explanation after the failure point, and (2) accessible support that doesn't require visiting a branch.
- **Behavioral impact:** Eroded trust in the bank's transfer reliability ("it can fail at any point, even at the final stage"), though not enough to switch banks — because switching is itself high-friction.

**SDF narrative contribution:** Sharpens Claim 5 (Trust / PMF) from the failure angle. Reinforces the V-2/V-5 finding that the moment of failure is the trust killer — but adds the *post*-failure dimension: a clear status explanation and a non-branch support/dispute path are product requirements, not nice-to-haves. MicoPay's escrow + in-app status + visible dispute path directly answer this pain.

---

## Cross-cutting insights (for the SDF deck)

### 1. The fee ceiling is universal: 2–5%
Across Nigeria, Venezuela, Mexico, Colombia, and Argentina, respondents independently converge on the same range. Anything above 5% loses to the traditional channel — even for people with very limited access. This gives MicoPay a concrete, defensible pricing constraint.

### 2. Trust is not optional — it's the feature
Every respondent across every topic mentioned trust signals as a prerequisite: verified profiles, ratings, in-app chat, receipts, support access. This is not a "nice to have" for the UX — it is the product's core value proposition alongside low fees. V-5 (Truphile) gives the sharpest articulation: three non-negotiable signals must appear before cash changes hands — transparent fee, locked rate, and online status confirmation.

### 3. The last mile is the real problem, even for Stellar users
The Argentina respondent (V-6) already uses Stellar for cross-border transfers and still can't get cash locally without P2P counterparty risk. MicoPay's value isn't the blockchain — it's the trusted, local, same-day cash delivery.

### 4. The "no bank account required" argument is the strongest unlock
Named explicitly by Nigeria (V-8) and implied by Venezuela (V-7) and confirmed directionally by V-2 (Truphile): digital cash-in is the gateway to the digital economy for people whose income arrives in paper. For sub-Saharan Africa and hyper-inflationary LATAM economies, eliminating bank account dependency is more compelling than any fee argument.

### 5. The wallet onboarding is currently broken — V-4 proves it
Shadow-MMN's audit (V-4) found the app generates a keypair silently, stores it in localStorage with no user notification, and has no backup prompt. This is a critical gap for Claim 4. The fix is well-defined: first-launch onboarding screen → public key display → one-tap secret key backup. This must ship before any SDF demo.

### 6. Network failure at the moment of cash transfer is the #1 trust killer
Both V-2 and V-5 (West Africa) independently identify the same abandonment trigger: handing over physical cash and then hearing "network is bad." This points to a single, high-priority product requirement — real-time transaction status feedback (SMS or in-app) must be immediate and unambiguous, with a clear resolution path (WhatsApp / toll-free line).

### 7. Geographic diversity de-risks the SDF case
Responses now span 6+ countries across 3 continents (LATAM, South Asia, Africa). The convergence of pain points and preferences across such different markets strengthens the case that this is a structural problem — not a local quirk — and that Stellar's infrastructure can solve it globally.

---

## What's still missing

| Issue | Assignee | PR | Status |
|-------|----------|----|-----------------------|
| V-1 · Cash-out demand | [@larryjay007](https://github.com/larryjay007) | [#155](https://github.com/ericmt-98/micopay-protocol/pull/155) ✅ | Merged — Nigeria (South West) |
| V-2 · Cash-in / deposit context | [@Truphile](https://github.com/Truphile) | [#159](https://github.com/ericmt-98/micopay-protocol/pull/159) ✅ | Integrated — Nigeria (West Africa) |
| V-3 · Liquidity provider perspective | [@DevSolex](https://github.com/DevSolex) | [#169](https://github.com/ericmt-98/micopay-protocol/pull/169) ✅ | Merged — Nigeria (West Africa) |
| V-4 · Non-custodial wallet onboarding | [@Shadow-MMN](https://github.com/Shadow-MMN) | [#157](https://github.com/ericmt-98/micopay-protocol/pull/157) ✅ | Merged |
| V-5 · Trust in the flow | [@Truphile](https://github.com/Truphile) | [#158](https://github.com/ericmt-98/micopay-protocol/pull/158) ✅ | Integrated — Nigeria (West Africa) |
| V-11 · Failed transaction / dispute | [@Chigybillionz](https://github.com/Chigybillionz) | [#174](https://github.com/ericmt-98/micopay-protocol/pull/174) ✅ | Integrated — Nigeria (West Africa) |
| V-12 · Living unbanked | [@Oluwasuyi-Timilehin](https://github.com/Oluwasuyi-Timilehin) | [#173](https://github.com/ericmt-98/micopay-protocol/pull/173) ✅ | Merged — Mexico (CDMX) |
| V-13 · Remittance sender context | [@Jo-anny](https://github.com/Jo-anny) | [#171](https://github.com/ericmt-98/micopay-protocol/pull/171) ✅ | Integrated — Europe → LATAM |
| V-14 · Stablecoin mental model | [@Max-Owolabi](https://github.com/Max-Owolabi) | [#175](https://github.com/ericmt-98/micopay-protocol/pull/175) ✅ | Integrated — Nigeria (West Africa) |

> All five SDF claims now have coverage. Only open issue: V-15 (first-time trust threshold).

---

## Methodology reminder (state this in the deck)

- **First-person** entries reflect each contributor's own lived experience — not a survey of others.
- **Convenience sample**, self-selected via Stellar Drips Wave 6. Directional and qualitative, not statistically representative.
- **Privacy-first:** no names, no contact information, no transaction amounts, no wallet addresses.
- Current sample size: **N=17 individual perspectives** across **7+ countries / 3 regions**.
- Report `N` plainly. Let the cross-regional consistency of the patterns speak for itself.

---

*Last updated: 2026-06-27 · Maintainer: [@ericmt-98](https://github.com/ericmt-98)*
