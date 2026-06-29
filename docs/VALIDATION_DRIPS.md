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

| Claim                    | Backed by                                                        | One-line thesis                                            |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| **1. Demand exists**     | V-1 (cash-out), V-2 (cash-in), V-6 (remittances), V-12 (unbanked) | A real, recurring pain converting digital ↔ cash        |
| **2. Supply exists**     | V-3 (liquidity providers)                                        | Real people/businesses would provide cash for a commission |
| **3. It can win**        | V-7 (alternatives), V-8 (fair fee)                               | Better than current options, at a fee users accept         |
| **4. Stellar is usable** | V-4 (non-custodial onboarding)                                   | Mainstream users can handle a self-custodial wallet        |
| **5. Trust / PMF**       | V-5 (flow trust), V-9 (safety), V-10 (repeat use)               | Users would adopt, feel safe, and come back                |

> Put together: **demand + supply + a winning, affordable, usable, trusted experience = a
> credible case that a Stellar P2P cash network serves the financially underserved.**

---

## Macro context (TAM — from public data, not from this survey)

The _size_ of the problem comes from public sources; cite them in the deck. The survey adds
_willingness and trust_, which public data can't give. Approximate figures to verify and cite:

- Remittances to Mexico: ~US$60B+/year (cite World Bank / Banxico, latest year).
- Share of population unbanked / underbanked in Mexico: majority (cite ENIF / World Bank Findex).
- (Add the equivalent figure for any other region respondents come from.)

> The survey's job is **not** to size the market — it's to show that, on top of a known huge
> market, real people are **willing** to use this specific Stellar-based solution.

---

## Metrics to extract per issue

Fill these in as answers arrive. Keep counts and percentages only.

| Metric                                                                 | From | Target signal           |
| ---------------------------------------------------------------------- | ---- | ----------------------- |
| % reporting cash-out as a recurring need · top friction                | V-1  | demand                  |
| % with a real cash-in use case · main trust barrier                    | V-2  | bidirectional demand    |
| % willing to provide liquidity · acceptable commission (%)             | V-3  | supply / unit economics |
| % who find non-custodial backup clear (vs confusing)                   | V-4  | onboarding viability    |
| Top trust blocker · top reason to abandon                              | V-5  | PMF / drop-off risk     |
| % who receive remittances · would same-day local cash help             | V-6  | remittance demand       |
| What they use today · top switch trigger · dealbreaker                 | V-7  | differentiation         |
| Fair commission % (distribution) · "too high" threshold                | V-8  | unit economics          |
| Comfort meeting a stranger · top safety fear · shops vs individuals    | V-9  | safety / de-risking     |
| Discovery method · repeat-use (yes/maybe/no) · recommend driver        | V-10 | retention / PMF         |
| Cash storage & income habits · top cash friction · local agent utility | V-12 | bank-free demand        |
| Regions represented (count by region) · total respondents (N)          | all  | spread / sample size    |

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
**Contributor:** [@larryjay007](https://github.com/larryjay007) · **PR:** [#155](https://github.com/ericmt-98/micopay-protocol/pull/155) · **Region:** Nigeria (South West)

First-person response (privacy-safe):

- **Country / region:** Nigeria (South West)
- **Cash-out frequency:** Weekly
- **Current method:** Peer-to-peer exchange or bank transfer to a local bank account, followed by ATM withdrawal or cash-out through a POS agent.
- **Main friction:** High cumulative transaction fees, unreliable ATM availability, and daily withdrawal limits.
- **Personal experience:** I frequently receive digital funds and need physical cash for everyday expenses such as transportation and purchases at local markets. One recent experience was particularly frustrating — I spent more than an hour moving between three different bank locations because the first two had either empty ATMs or network issues. When I finally found a working ATM, the withdrawal limit was so low that I had to make multiple transactions, resulting in additional bank charges.

**SDF narrative:** Adds Nigeria (South West) to the cash-out demand signal for Claim 1. Weekly frequency + ATM reliability failures + daily withdrawal limits combine into a strong recurring pain that a local P2P agent network directly addresses.

### V-2 · Cash-in / deposit context
**Contributor:** [@Truphile](https://github.com/Truphile) · **PR:** [#159](https://github.com/ericmt-98/micopay-protocol/pull/159) · **Region:** Nigeria (West Africa)

First-person response (privacy-safe):

- **Why I'd use cash-in:** Getting paper money out of my hands and into my phone where it's actually useful. If I collect cash from a friend or an offline gig, I can't use that paper to pay for AWS bills, local utility tokens, or fund a fintech savings pocket. I need a quick way to drop the cash and see it hit my digital wallet instantly.
- **Current method:** I walk up to a nearby neighborhood PoS agent. I hand them the physical cash, give them my account details, and wait for them to do a transfer to my wallet on their terminal.
- **Frequency:** A few times a month — whenever paper cash piles up, I need to clear it out.
- **Trust barrier:** Network issues, hands down. The fear of handing over cold hard cash and then hearing the agent say "Network is bad, the money hasn't dropped yet." If the system crashes mid-operation, you're stuck arguing at a kiosk, waiting for a network reversal that could take 24–48 hours.
- **Local trusted providers:** Yes. There are established, branded kiosks and shops right on my street that have been there for years. Everyone in the area uses them, and because they are tied to a permanent physical location, they can't afford to ruin their reputation over a bad transaction.

**SDF narrative:** Confirms bidirectional demand (Claim 1) from West Africa — a user who actively needs to digitize physical cash and already trusts local PoS agents. The main risk to address is mid-operation network failure and confirmation latency.

### V-3 · Liquidity provider perspective

- **Country / general region:** West Africa (Nigeria).
- **Would YOU provide liquidity (give cash, receive digital balance)?:** Yes — with a few conditions in place first.
- **Individual or small business?:** Individual. I run a small informal side-hustle alongside a day job; I regularly handle modest cash flows and already do occasional P2P exchanges for people in my circle.
- **Main motivation:** Extra income from the commission, plus the convenience of converting digital balances I already hold (stablecoins) back into local currency without going through a bank. If neighbours come to me directly, it also builds goodwill and a small reputation locally.
- **Perceived risks:** The biggest one for me is non-payment or a fake/reversed digital transfer — receiving what looks like a confirmation and then finding the funds were never real or got clawed back. A close second is physical safety: carrying or handing over cash in public can attract attention. I would also be cautious about regulatory ambiguity (is this treated as money-service activity in my jurisdiction?) and about disputes with no clear resolution path if something goes wrong.
- **Commission I would expect:** 2–3%. Below 2% does not cover my time and liquidity risk; above 4% would probably push users back to informal channels and I would end up sitting idle.
- **What would make me trust the system enough to try once:** Seeing the USDC locked in escrow *before* I hand over any cash — that single guarantee removes most of my risk. Beyond that: a verified transaction history for the counterparty, clear in-app instructions for each step, and a visible support/dispute path if something breaks. A successful first trade with a small amount would be enough to convince me to continue.

### V-4 · Non-custodial wallet onboarding
**Contributor:** [@Shadow-MMN](https://github.com/Shadow-MMN) · **PR:** [#157](https://github.com/ericmt-98/micopay-protocol/pull/157) · **Region:** —

- **Is it clear to YOU that you hold the key and must back it up?:** Not clear at all. There is no onboarding screen or maybe I am missing something but the keypair was generated (I found out by checking the brower's localStorage).
- **Your biggest doubt or fear about a non-custodial wallet:** Losing the key to a hacker since it is stored on my localStorage.
- **What would make YOU trust this onboarding:** I would not trust it in its current form because there is no onboarding at all. A dedicated screen at first launch explaining that a wallet was created and showing the public key, with a clear call to back up the secret key, would be the minimum.
- **Your preference: create a new wallet vs import an existing Stellar key (and why):** Import an existing wallet key. I already have a wallet with funds and do not want the hassle of moving money between wallets.
- **In your view, should backing up the key be mandatory at sign-up, or optional? (and why):** Optional, but the UI should make it trivially easy i.e a single tap to copy the key, accompanied by a visible note telling the user to save the copied text somewhere safe and never share it. Making it mandatory would frustrate users who just want to try the app, but the option should be prominent enough that nobody misses it.

### V-5 · Trust in the cash-in/cash-out flow
**Contributor:** [@Truphile](https://github.com/Truphile) · **PR:** [#158](https://github.com/ericmt-98/micopay-protocol/pull/158) · **Region:** Nigeria (West Africa)

First-person response (privacy-safe):

- **Most trusted provider type:** A well-established, branded neighborhood PoS agent with a permanent physical kiosk and a steady stream of daily customers. Seeing them use a dedicated, functional Android PoS terminal instantly builds confidence.
- **Least trusted:** A mobile, unbranded agent sitting casually on the street corner with just a phone, or an untrusted shop owner who claims "network is bad" before even attempting the transaction.
- **Minimum info before handing over cash:** The exact commission fee clearly stated upfront · the final locked-in value that will reflect in the wallet · a clear confirmation on the agent's screen showing the system is active and online.
- **Verification signals for providers:** The agent's location and banner name matching exactly what is displayed on the in-app map · a verified merchant status indicator showing a high completion rate or a "Trusted Agent" badge.
- **Support expectations mid-failure:** An immediate, automated SMS receipt or in-app "Pending / Money Received" status to prove the transaction is in flight · a clear WhatsApp support channel or toll-free line to resolve hanging transactions within minutes.
- **Top reason to abandon:** "Network Issues" and delay — if the agent says "network is fluctuating" or the app takes too long to generate the QR code/receipt. Any delay at point of payment triggers a fear of trapped funds.

**SDF narrative:** Directly maps the trust and abandonment signals for Claim 5 (Trust / PMF). The three-part "minimum info before handing over cash" is a concrete UX checklist — transparent fee, locked rate, online status — that the agent flow must display before cash changes hands.

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

### V-11 · Failed transaction / dispute handling
**Contributor:** [@Chigybillionz](https://github.com/Chigybillionz) · **PR:** [#174](https://github.com/ericmt-98/micopay-protocol/pull/174)

- **Country / general region:** Nigeria (West Africa)
- **What happened:** Tried to transfer money from a local bank to an online bank to make a purchase. The transfer failed at the very last stage, right after entering the correct OTP verification code — it just returned a failed error instead of completing.
- **What I did next:** Since the transfer wouldn't go through, I had to find another way. I reached out to my brother, who sent me cash to cover what I was trying to do instead of waiting on the bank.
- **Resolution and timeframe:** Over a week later, still unresolved. I haven't been able to visit the bank's physical branch to report it, but I plan to if the error keeps happening.
- **What was missing:** Some way to immediately know what actually went wrong after entering the OTP — even a basic in-app explanation or status check would have saved me from guessing. Easier access to support without physically visiting a branch would also make resolving this far less of a hassle.
- **How it changed my behavior:** I no longer have full confidence in my local bank's transfer system, since it can fail at any point, even at the final OTP stage. I haven't stopped using the bank entirely — switching banks isn't simple either — but the trust is dented.

### V-12 · Living unbanked — everyday context
**Contributor:** [@Oluwasuyi-Timilehin](https://github.com/Oluwasuyi-Timilehin) · **PR:** [#173](https://github.com/ericmt-98/micopay-protocol/pull/173)

- **Country / general region:** Mexico (CDMX metropolitan area)
- **How do you store money today?:** Mostly cash stored at home in a safe place for daily expenses, and a small amount in a mobile wallet (like Mercado Pago or Spin by OXXO) for occasional digital payments.
- **How do you receive income or payments?:** Cash in hand for local gig work and physical sales, and occasionally via bank transfer (SPEI) to a relative's account when a client does not pay in cash.
- **What is your biggest friction when handling larger amounts of cash?:** Physical safety is the absolute biggest worry. Carrying larger amounts of cash on public transport or walking around the neighborhood is stressful due to the risk of theft. There's also the constant risk of losing it or having notes damaged.
- **Have you ever needed to pay for something digital (online service, bill, transfer) without a bank account? What did you do?:** Yes, many times for online services or bills. I have to walk to the nearest OXXO store, show a payment code, and pay in cash (which incurs an extra convenience fee), or buy physical prepaid gift cards at the register.
- **If there was a local, trusted person in your neighborhood who could convert your cash to a digital wallet instantly — would that be useful? What would make you trust them enough to use them?:** Yes, it would be extremely useful. It would save me trips to convenience stores or bank branches just to deposit cash. To trust them, I would want them to be a recognized local business (like a corner shop, pharmacy, or local bakery) rather than a random individual. I would also need to see ratings from other users in the app, and a secure escrow mechanism that guarantees the digital funds are locked before I hand over physical cash.

### V-13 · Remittance sender context — sending money abroad
**Contributor:** [@Jo-anny](https://github.com/Jo-anny) · **PR:** [#171](https://github.com/ericmt-98/micopay-protocol/pull/171)

- **Country / general region:** Europe sending to Latin America.
- **How do I send money abroad today?:** I use a mix of traditional bank transfers and a digital remittance service that delivers to a local bank deposit or mobile wallet. Sometimes I use a crypto-based P2P service when the recipient needs faster access to cash.
- **What does it cost me?:** It feels like a lot. The total cost is in the high single-digit percent range after both service fees and currency conversion spreads are included.
- **How long does delivery take?:** Usually same day to next day, but banks can take several days if compliance checks or intermediary banks are involved.
- **My biggest frustration:** The flow is opaque and uncertain. I rarely know the exact delivered amount until after the transaction clears, and the recipient often has to deal with separate cash-out steps or agent availability.
- **What does the recipient do with it once it arrives?:** They usually cash out to local currency through a bank deposit or local cash pickup, or receive it into a mobile wallet and withdraw from an agent.
- **What would make me switch?:** A cheaper, faster, and more transparent service with a reliable, immediate local cash-out path. The one thing that would have to be better is certainty: knowing the final amount received and the cash-out option before I send.

### V-14 · Stablecoin / digital peso mental model
**Contributor:** [@Max-Owolabi](https://github.com/Max-Owolabi) · **PR:** [#175](https://github.com/ericmt-98/micopay-protocol/pull/175)

- **Country / general region:** Nigeria (West Africa)
- **Have you ever held or used a digital stablecoin?:** Yes. I have held and used USDC and USDT on Stellar and other networks. I obtained them by purchasing through local exchange agents or peer-to-peer (P2P) platforms, and I used them to preserve value against local currency inflation and to pay for digital services online where local cards fail.
- **How did you think about it compared to physical cash?:** Initially, it felt like an abstract number on a screen rather than "real money" since I couldn't physically spend it at local shops. However, knowing that I could convert it back to local fiat cash or use it for global payments built my trust. The smart contract locking mechanisms and transparent on-chain transactions also made it feel secure.
- **What was the hardest part to understand about holding a digital token?:** The hardest part to understand initially was the gas/network fees concept, the difference between different blockchain networks (e.g., Stellar vs. Ethereum) for the same stablecoin, and managing self-custody keys without a centralized bank to reset passwords.
- **If someone told you "your pesos/funds are now in a digital wallet on your phone," what would be your first reaction?:** My first reaction would be a mix of curiosity and slight caution. I would feel the money is safe from physical theft, but potentially at risk of digital hacking or user error (losing keys) unless the wallet provides clear, simplified security and recovery options.
- **What would make a digital peso/stablecoin feel as reliable as cash in your hand?:** It would feel as reliable as cash if there was a guaranteed, instant way to convert it to physical cash at any local corner store without high fees or complex steps, alongside a clear in-app balance showing that the funds are secured by an escrow contract.

### V-15 · First-time trust threshold
**Contributor:** [@abdullahilateefat03-boop](https://github.com/abdullahilateefat03-boop) · **PR:** [#185](https://github.com/ericmt-98/micopay-protocol/pull/185)

**1. Think of the last time you tried a new financial service or app for the first time. What made you decide to try it?**

The last time I tried a new financial app was because I needed a faster and more convenient way to receive and send payments. I had already heard about it from people around me, and it seemed to solve a problem I was experiencing with my previous payment method. The combination of convenience and the growing number of people using it made me decide to give it a try.

**2. What was the single thing that most reduced your hesitation?**

The biggest factor was a recommendation from someone I trusted who had already used the service successfully. Knowing that someone I knew had a positive experience made me feel much more comfortable than advertisements or promotional messages alone.

**3. For a P2P cash service specifically (one where you hand cash to a local person you don't know), what would you need to see before attempting it for the first time?**

Before using a service like that, I would want to see strong identity verification, visible user ratings from previous transactions, and a clear dispute resolution process. I would also want confidence that the platform actively monitors transactions and provides support if something goes wrong. Those trust signals would make me much more willing to try it for the first time.

**4. What is the one thing that would make you walk away before even trying?**

I would immediately walk away if the platform lacked user verification or encouraged completing transactions outside its official process. If I felt there were no safeguards or accountability, I wouldn't be comfortable trusting the service with my money.

**5. After your first successful transaction with a new service, what would make you tell a friend about it?**

If the entire experience was smooth, secure, and exactly as the platform promised, I would gladly recommend it. A simple onboarding process, reliable transaction completion, and the confidence that my issue would be resolved if anything went wrong would make me comfortable suggesting it to friends.

---

### V-18 · NFC / contactless tap-to-pay familiarity & trust
**Contributor:** [@adepoju2006](https://github.com/adepoju2006) · **PR:** _(this PR)_

_Wave 6 · batch 2 (V-16…V-25) · Validates Claim 4 + 6 — payment UX feasibility · Vertical B (Retail)_

- **Country / general region:** West Africa (Nigeria).
- **Have I used tap-to-pay (NFC) with a phone or card? How often?:** Rarely — "sometimes," and almost always with a contactless card rather than a phone. In daily life here the dominant rails are chip-and-PIN on POS terminals, instant bank transfers from a banking app, and USSD codes. Contactless terminals exist but are not the norm, so I don't reach for tap as a default; I only use it on the few modern terminals that clearly support it.
- **Do I trust the tap more or less than a PIN, a QR scan, or cash? Why?:** Less than chip-and-PIN and less than a confirmed bank transfer, because both of those have an explicit "I approved this" moment (I enter a PIN, or I confirm an amount on my own screen). Tap completes so fast and so passively that it feels like nothing happened — there's no deliberate confirmation that I controlled. QR feels natural and trustworthy here because scan-to-transfer and USSD are already the everyday mental model. Cash I trust completely; it's just inconvenient and risky to carry.
- **Has an NFC payment ever failed or felt uncertain?:** Yes. A tap once didn't register cleanly — the terminal gave an ambiguous beep and I couldn't tell if it went through. I was afraid that tapping again would charge me twice, so I just stood there unsure until the cashier checked their side. The core problem was the absence of a clear, immediate confirmation on *my* device.
- **If a local shop accepted NFC from a "dollars" wallet, would tapping feel natural, or would I prefer QR?:** I would prefer to scan a QR. In this market QR/transfer is the established habit, and for a foreign-currency ("dollars") wallet I'd specifically want to *see* the merchant and confirm the details before approving — a QR flow shows me who I'm paying and lets me review on my own phone first. A blind tap into an unfamiliar dollar wallet would feel novel and a little risky.
- **The single on-screen signal that would make me confident the payment succeeded:** An immediate, unmistakable success state on my own phone right after the tap: a green checkmark with the merchant's name and the paid amount, ideally accompanied by a short haptic buzz and my updated balance so I can see the funds actually moved. The confirmation has to be on my screen, not only on the merchant's terminal.

---

## How findings feed Wave 6 product work

- Cash-out vs cash-in vs remittance demand → which direction to prioritize first.
- Trust + safety signals a provider must show → P1-2 (map), P0-3 (real balance), receipts.
- Clarity of wallet backup → how mandatory to make it at sign-up (P0-5 / open question 3).
- Fair fee range → pricing/economics decisions.
- Discovery + minimum info before committing → Stage 2 UI work.
