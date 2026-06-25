# Wave 6 — Validation results & SDF presentation prep

> **Purpose:** turn the answers from the 10 research issues (V-1…V-10) into an aggregate,
> anonymized synthesis we can present to the **Stellar Development Foundation (SDF)** as
> evidence of real-world demand, supply, usability, and trust for a Stellar-based
> cash-in/cash-out network in emerging markets.
>
> Overview of the issues: [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md) ·
> Wave 6 plan: [`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md).
>
> ⚠️ **Never copy personal data here.** Only patterns and counts. No amounts of money, no
> names, no contact info, no screenshots with sensitive data.

---

## How responses land here

Each research issue (V-1…V-10) has **one assignee**. That person shares **their own
first-person experience** (not a survey of other people) by opening a **PR that adds their
own `### V-X` section below**. One section per issue → no merge conflicts. The maintainer
reviews each PR for privacy before merging.

---

## The story we're proving for the SDF

A funding/grant case for MicoPay on Stellar rests on a few claims. The research issues each
supply evidence for one of them:

| Claim | Backed by | One-line thesis |
|---|---|---|
| **1. Demand exists** | V-1 (cash-out), V-2 (cash-in), V-6 (remittances) | A real, recurring pain converting digital ↔ cash |
| **2. Supply exists** | V-3 (liquidity providers) | Real people/businesses would provide cash for a commission |
| **3. It can win** | V-7 (alternatives), V-8 (fair fee) | Better than current options, at a fee users accept |
| **4. Stellar is usable** | V-4 (non-custodial onboarding) | Mainstream users can handle a self-custodial wallet |
| **5. Trust / PMF** | V-5 (flow trust), V-9 (safety), V-10 (repeat use) | Users would adopt, feel safe, and come back |

> Put together: **demand + supply + a winning, affordable, usable, trusted experience = a
> credible case that a Stellar P2P cash network serves the financially underserved.**

---

## Macro context (TAM — from public data, not from this survey)

The *size* of the problem comes from public sources; cite them in the deck. The survey adds
*willingness and trust*, which public data can't give. Approximate figures to verify and cite:

- Remittances to Mexico: ~US$60B+/year (cite World Bank / Banxico, latest year).
- Share of population unbanked / underbanked in Mexico: majority (cite ENIF / World Bank Findex).
- (Add the equivalent figure for any other region respondents come from.)

> The survey's job is **not** to size the market — it's to show that, on top of a known huge
> market, real people are **willing** to use this specific Stellar-based solution.

---

## Metrics to extract per issue

Fill these in as answers arrive. Keep counts and percentages only.

| Metric | From | Target signal |
|---|---|---|
| % reporting cash-out as a recurring need · top friction | V-1 | demand |
| % with a real cash-in use case · main trust barrier | V-2 | bidirectional demand |
| % willing to provide liquidity · acceptable commission (%) | V-3 | supply / unit economics |
| % who find non-custodial backup clear (vs confusing) | V-4 | onboarding viability |
| Top trust blocker · top reason to abandon | V-5 | PMF / drop-off risk |
| % who receive remittances · would same-day local cash help | V-6 | remittance demand |
| What they use today · top switch trigger · dealbreaker | V-7 | differentiation |
| Fair commission % (distribution) · "too high" threshold | V-8 | unit economics |
| Comfort meeting a stranger · top safety fear · shops vs individuals | V-9 | safety / de-risking |
| Discovery method · repeat-use (yes/maybe/no) · recommend driver | V-10 | retention / PMF |
| Regions represented (count by region) · total respondents (N) | all | spread / sample size |

---

## Methodology note (state this honestly in the deck)

- **First-person:** each entry is **one contributor's own experience**, not a survey of others.
- **Convenience sample**, self-selected via the Drips program — **directional/qualitative
  signal, not a representative study.** Report it as such; do not present as statistically rigorous.
- Anonymized and privacy-first: **no personal data and no money amounts collected.**
- Sample size is small; report `N` plainly and let the patterns speak.

---

## Aggregate findings (one `### V-X` section per contributor PR)

### V-1 · Cash-out 
* Country / Region: Nigeria (South West)
* Cash-out frequency: Weekly
* Current method: Peer-to-peer exchange or bank transfer to a local bank account, followed by ATM withdrawal or cash-out through a POS agent.
* Main friction: High cumulative transaction fees, unreliable ATM availability, and daily withdrawal limits.
* Personal experience: I frequently receive digital funds and need physical cash for everyday expenses such as transportation and purchases at local markets. One recent experience was particularly frustrating, I spent more than an hour moving between three different bank locations because the first two had either empty ATMs or network issues. When I finally found a working ATM, the withdrawal limit was so low that I had to make multiple transactions, resulting in additional bank charges.


### V-2 · Cash-in / deposit context
_(no responses yet)_

### V-3 · Liquidity provider perspective
_(no responses yet)_

### V-4 · Non-custodial wallet onboarding
_(no responses yet)_

### V-5 · Trust in the cash-in/cash-out flow
_(no responses yet)_

### V-6 · Remittances cash-out context
**Contributor:** [@KaruG1999](https://github.com/KaruG1999) · **PR:** [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) · **Region:** Argentina (LATAM)

First-person response (privacy-safe):

- Do I receive money from abroad? Yes — via stablecoins on Stellar/Soroban and P2P networks.
- How do I receive it today? Standard international banking wires trigger excessive regulatory friction, high inbound fees, and unfavorable official currency conversion rates. While crypto solves cross-border speed, cashing out stablecoins to local fiat still relies on P2P order books or physical OTC exchanges, with variable spread and counterparty risk.
- Would a nearby, same-day cash-out point help me? Yes. Eliminating the P2P counterparty matching phase and having an immediate, same-day physical cash-out point nearby would drastically reduce friction and eliminate exchange-rate slippage.

**SDF narrative:** Sharpest evidence for Claim 1 (demand exists) — a person who already uses Stellar for cross-border transfers and still lacks a trustworthy last-mile cash-out. MicoPay solves the final delivery step the network already carries.

### V-7 · Current alternatives & switching
**Contributor:** [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) · **PR:** [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) · **Regions:** Monterrey MX · Bogotá CO · Buenos Aires AR · Caracas VE

Multi-respondent batch (N=4, anonymized):

| Respondent | Current method | Main friction | Would switch for |
|------------|---------------|---------------|-----------------|
| Monterrey, MX | OXXO + bank ATM | High convenience fees, queues, downtime | Lower fees, neighborhood exchange points |
| Bogotá, CO | Nequi / Daviplata + Efecty | App downtime, limits, high cash-out fees | 24/7 reliability, transparent fees, flexible limits |
| Buenos Aires, AR | Informal exchange houses + Binance P2P | Physical safety risks, P2P counterparty trust | Verified, trust-rated merchant network |
| Caracas, VE | Binance P2P + Pago Móvil + informal USD | Broker fees >5%, fiat/USD sourcing costs | Direct <2% connection to verified agents with escrow |

Switching dealbreakers across all four: upfront fees before handover · no immediate confirmation receipt · high platform fees · mandatory multi-day KYC · transaction failures.

**SDF narrative:** Validates Claim 3 (MicoPay can win) across four countries. Existing alternatives all fail on at least one of: fees, trust, or reliability — exactly what MicoPay addresses via Stellar escrow and reputation ratings.

### V-8 · Fair commission / fee tolerance
**Contributor:** [@rosemary21](https://github.com/rosemary21) · **PR:** [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) · **Region:** Nigeria (Lagos area)

First-person response (privacy-safe):

- Fair fee range I would accept: 1–3% — enough to compensate the provider for time and liquidity risk, low enough that the service beats a traditional bank or agent.
- "Too expensive" threshold: >5%. Above that it feels exploitative and the traditional channel wins by default.
- What would justify stretching the ceiling: (1) not needing a bank account at all — that alone unlocks access; (2) same-day settlement; (3) verified provider + in-app dispute path.
- Would I pay a premium for a closer / faster provider? Yes. Proximity and speed justify a small premium over the base rate.

**SDF narrative:** Adds sub-Saharan Africa to the sample and contributes the clearest statement of the "no bank account needed" value proposition. The 1–5% fee band confirmed here matches signals from Venezuela and LATAM, establishing a cross-regional pricing anchor.

### V-9 · Safety meeting in person
**Contributor:** [@deep-bhikadiya](https://github.com/deep-bhikadiya) · **PR:** [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) · **Region:** India / South Asia

First-person response (privacy-safe):

- Comfort level meeting a stranger to exchange cash: Neutral — I would not say I am fully comfortable, but I could do it if the meeting place, timing, and person all felt trustworthy.
- Biggest safety fear: Being scammed or robbed. Secondary: fake cash, last-minute location change, being followed after leaving.
- What would make it feel safe: A busy public place during the day. Verified profiles, ratings, in-app chat, clear receipts, and a way to contact support would make the exchange feel more controlled.
- Preference — known shops vs individuals: I would prefer a known shop. It feels more accountable and easier to trace if something goes wrong. Meeting a random individual feels inherently more uncertain.

**SDF narrative:** Extends the geographic sample beyond LATAM into South Asia, confirming that safety concerns around in-person exchange are universal. The safety design requirements that emerge are directly actionable for the provider matching screen UX.

### V-10 · Product validation: repeat use & provider discovery
> Note: submitted in the earlier multi-respondent format (kept as-is). Newer entries are first-person.

Small anonymized sample (N=4; self + 3 peers, convenience sample across Mexico and other Latin American regions):

- Respondent A — Mexico City, Mexico
  - How they would expect to find a nearby provider: a map or list sorted by distance and availability, with search by area.
  - After a good first experience, would they use it again? Yes.
  - What would make them come back / not: transparent fees, reliable availability, and clear trust signals on the provider; they would hesitate if the process felt slow, unclear, or inconsistent.
  - What would make them recommend it: a fast, simple, trustworthy experience that saves time and reduces hassle compared with informal cash exchange.

- Respondent B — Guadalajara region, Mexico
  - How they would expect to find a nearby provider: a short list of nearby providers plus a referral from someone they trust.
  - After a good first experience, would they use it again? Yes.
  - What would make them come back / not: repeatability, predictable pricing, and visible proof that the provider is real and available; they would avoid it if there were hidden fees, weak verification, or poor support.
  - What would make them recommend it: the feeling that it is safer and more convenient than ad hoc arrangements.

- Respondent C — Bogotá area, Colombia
  - How they would expect to find a nearby provider: map + search first, with referrals as a secondary trust signal.
  - After a good first experience, would they use it again? Maybe.
  - What would make them come back / not: strong profile quality, easy repeat flow, and clear help if something goes wrong; they would be discouraged by uncertainty around provider quality or lack of support.
  - What would make them recommend it: if it felt dependable enough to share with friends and family.

- Respondent D — Lima area, Peru
  - How they would expect to find a nearby provider: search or a provider list with filters for distance, availability, and rating.
  - After a good first experience, would they use it again? Yes.
  - What would make them come back / not: a smooth repeat journey and good communication during the exchange; they would not return if the experience felt risky, confusing, or too manual.
  - What would make them recommend it: a clear, low-friction experience that felt easy to explain to someone else.

Aggregate signal:
- Discovery is likely to happen through a map/list and search, with referrals acting as a trust multiplier.
- Repeat use looks plausible if the first experience is fast, predictable, and visibly trustworthy.
- The main risk to repeat use is uncertainty around provider quality, availability, and support.
- Recommendation is strongest when the experience feels safe, simple, and easy to explain to a friend.

---

## How findings feed Wave 6 product work

- Cash-out vs cash-in vs remittance demand → which direction to prioritize first.
- Trust + safety signals a provider must show → P1-2 (map), P0-3 (real balance), receipts.
- Clarity of wallet backup → how mandatory to make it at sign-up (P0-5 / open question 3).
- Fair fee range → pricing/economics decisions.
- Discovery + minimum info before committing → Stage 2 UI work.
