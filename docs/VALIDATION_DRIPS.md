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

### V-1 · Cash-out context
_(no responses yet)_

### V-2 · Cash-in / deposit context
_(no responses yet)_

### V-3 · Liquidity provider perspective
_(no responses yet)_

### V-4 · Non-custodial wallet onboarding
_(no responses yet)_

### V-5 · Trust in the cash-in/cash-out flow
_(no responses yet)_

### V-6 · Remittances cash-out context

* **Country / general region:** Argentina (LATAM)
* **Do YOU receive money from abroad?:** Yes
* **How do you receive it today?:** Crypto (Stablecoins via Stellar/Soroban protocols and P2P networks) and global digital platforms.
* **Your main friction receiving + cashing it out:** Fee and trust. Standard international banking wires trigger excessive regulatory friction, high baseline inbound fees, and unfavorable official currency conversion rates. While crypto solves cross-border speed, cashing out stablecoins to local fiat (ARS) still relies heavily on localized P2P order books or physical over-the-counter (OTC) exchanges, introducing variable spread fees and counterparty trust risks.
* **Would getting it as cash nearby, same day, help YOU?:** Yes. Eliminating the P2P counterparty matching phase and having an immediate, compliant, same-day physical cash-out point nearby would drastically reduce transactional friction and eliminate exchange-rate slippage.

### V-7 · Current alternatives & switching
Small anonymized sample (N=4; self + 3 peers, convenience sample across Mexico and other Latin American regions):

- Respondent A — Monterrey region, Mexico
  - What they use today: OXXO stores and traditional bank ATMs.
  - What they like: High availability and the security of established, well-known brands.
  - What frustrates them: High transaction/convenience fees, long wait lines, and occasional ATM outages.
  - What would make them switch: Lower fees, zero queue times, and local neighborhood exchange points.
  - Dealbreaker: Upfront payment/fees before receiving cash, or overly complex apps that require advanced crypto/technical knowledge.

- Respondent B — Bogotá area, Colombia
  - What they use today: Mobile wallets (Nequi, Daviplata) and physical lottery kiosks (Efecty, Paga Todo) for cash-out.
  - What they like: Instant digital transfers and wide physical availability of cash points.
  - What frustrates them: Frequent app system outages, daily transaction limits, and high agent commissions.
  - What would make them switch: A highly reliable system working 24/7 with transparent, lower fees and flexible limits.
  - Dealbreaker: Lack of immediate transaction confirmation or lack of support channels to resolve stuck operations.

- Respondent C — Buenos Aires, Argentina
  - What they use today: Local informal exchange houses ("cuevas") and P2P crypto exchanges (Binance P2P).
  - What they like: Inflation hedging by holding stablecoins (USDT) and converting to fiat cash as needed.
  - What frustrates them: Safety risks of carrying physical cash from physical exchanges, and counterparty trust issues in online P2P.
  - What would make them switch: A secure, trust-rated network of local merchants/providers for safe, local stablecoin-to-cash exchange.
  - Dealbreaker: High platform service fees or mandatory KYC that requires multi-day validation for tiny transactions.

- Respondent D — Caracas metropolitan area, Venezuela
  - What they use today: Binance P2P, Pago Móvil bank transfers, and informal USD cash transactions.
  - What they like: Fast digital payments (Pago Móvil) and holding USD-linked assets.
  - What frustrates them: Scarcity of physical USD/local fiat cash and high exchange/broker fees (often >5%).
  - What would make them switch: Direct connection to nearby verified cash providers at low transaction fees (<2%) with instant escrow settlement.
  - Dealbreaker: High rate of transaction failures or lack of secure escrows to prevent loss/theft of digital assets during cash exchanges.

Aggregate signal:
- **Current alternatives:** Users rely heavily on established retail/agent networks (OXXO, Efecty), mobile wallets, and crypto P2P platforms (Binance) depending on the country's economic context.
- **Key switching drivers:** Lower transaction fees, zero queues, higher system uptime (avoiding wallet outages), and safer/more localized physical exchange points.
- **Key dealbreakers:** Escrow/security concerns (fear of losing funds), high entry friction (e.g. upfront payments or heavy KYC for small amounts), and poor app usability/technical complexity.

### V-8 · Fair commission / fee tolerance

- **Country / region:** Lagos area, Nigeria.
- **Fair commission for cashing out:** 1–3% feels reasonable to me — enough to compensate a provider for their time and liquidity risk, but low enough that the convenience is still worth it over walking to a bank or agent.
- **Too-high threshold:** Anything above 5% and I would rather deal with the friction of a traditional channel. At that point the fee starts to feel exploitative rather than a fair service charge.
- **What would justify a higher fee:** Not having to use a bank account at all is the biggest one for me — that alone unlocks access. Speed (same-day settlement) and a clear safety guarantee (verified provider, in-app dispute path) would also make me willing to stretch a little above my usual ceiling.
- **Would I pay more for a closer / faster provider:** Yes. If the alternative is travelling further or waiting longer, a small premium for proximity and speed is worth it.

### V-9 · Safety meeting in person
First-person response (privacy-safe):

- Country / general region: India / South Asia.
- Comfort meeting a stranger to exchange cash: Neutral. I would not say I am fully comfortable, but I could do it if the meeting place, timing, and person all felt trustworthy.
- Biggest safety fear: My main fear would be getting scammed or robbed during the exchange. I would also be cautious about fake cash, someone changing the location at the last minute, or being followed after leaving.
- What would make it feel safe: I would feel much better meeting in a busy public place during the day. Verified profiles, ratings, in-app chat, clear receipts, and a way to contact support would also make the exchange feel more controlled.
- Preference for known shops over individuals: Yes. I would prefer a known shop because it feels more accountable and easier to find again if something goes wrong. Meeting a random individual feels more uncertain to me.

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

### V-14 · Product validation: stablecoin and digital peso mental model

* **Country / general region:** Nigeria (West Africa)
* **Have you ever held or used a digital stablecoin?:** Yes. I have held and used USDC and USDT on Stellar and other networks. I obtained them by purchasing through local exchange agents or peer-to-peer (P2P) platforms, and I used them to preserve value against local currency inflation and to pay for digital services online where local cards fail.
* **How did you think about it compared to physical cash?:** Initially, it felt like an abstract number on a screen rather than "real money" since I couldn't physically spend it at local shops. However, knowing that I could convert it back to local fiat cash or use it for global payments built my trust. The smart contract locking mechanisms and transparent on-chain transactions also made it feel secure.
* **What was the hardest part to understand about holding a digital token?:** The hardest part to understand initially was the gas/network fees concept, the difference between different blockchain networks (e.g., Stellar vs. Ethereum) for the same stablecoin, and managing self-custody keys without a centralized bank to reset passwords.
* **If someone told you "your pesos/funds are now in a digital wallet on your phone," what would be your first reaction?:** My first reaction would be a mix of curiosity and slight caution. I would feel the money is safe from physical theft, but potentially at risk of digital hacking or user error (losing keys) unless the wallet provides clear, simplified security and recovery options.
* **What would make a digital peso/stablecoin feel as reliable as cash in your hand?:** It would feel as reliable as cash if there was a guaranteed, instant way to convert it to physical cash at any local corner store without high fees or complex steps, alongside a clear in-app balance showing that the funds are secured by an escrow contract.

---

## How findings feed Wave 6 product work

- Cash-out vs cash-in vs remittance demand → which direction to prioritize first.
- Trust + safety signals a provider must show → P1-2 (map), P0-3 (real balance), receipts.
- Clarity of wallet backup → how mandatory to make it at sign-up (P0-5 / open question 3).
- Fair fee range → pricing/economics decisions.
- Discovery + minimum info before committing → Stage 2 UI work.
