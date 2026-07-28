# Wave 6 — Research batch 2 (V-16…V-25) · Retail, payroll & the integrated economy

> **What this is:** 10 new market/user-validation issues (V-16…V-25) designed to go up on
> Drips, continuing the model that worked for V-1…V-15. Where the first batch validated the
> **cash-out wedge** (Vertical A), this batch validates the next two verticals from the vision —
> **retail spending (B)** and **payroll / dollar inflows (C)** — plus the open product questions
> they raise (key recovery, canonical peso, supply bootstrap).
>
> Sources reviewed: [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md) (V-1…V-15 index),
> [`WAVE6_CONTRIBUTORS_REPORT.md`](./WAVE6_CONTRIBUTORS_REPORT.md) /
> [`…_ES.md`](./WAVE6_CONTRIBUTORS_REPORT_ES.md) (the 17 first-person responses), and
> [`VISION_ECONOMIA_INTEGRADA.md`](./VISION_ECONOMIA_INTEGRADA.md) (the arc cash-out → retail → nómina).

---

## Why these 10 (gap analysis)

The first 15 validations fully covered the **5 SDF claims for cash-out**:

| Vertical | Validated by batch 1? | Gap this batch closes |
|----------|----------------------|-----------------------|
| **A · Cash-out** (the moat) | ✅ Demand (V-1/2/6), supply (V-3), win (V-7/8), Stellar usable (V-4/14), trust (V-5/9/10/11) | — already strong |
| **B · Retail** (spend at the store, NFC) | ❌ Not validated | V-16, V-17, V-18, V-23 |
| **C · Payroll / dollar inflows** | ❌ Not validated | V-19, V-20, V-21 |
| **Open product questions** (vision §4, §7) | ❌ Key recovery, peso canónico, supply bootstrap | V-22 (recovery), V-23 (peso vs USD), V-24 (supply bootstrap) |
| **Digital-economy access** (deepen V-2) | partial | V-25 |

This adds **two new claims** to the SDF narrative, beyond the original five:

- **Claim 6 — The dollars get spent** (retail demand exists; merchants will accept; NFC is usable).
- **Claim 7 — The dollars flow in** (people would receive income/pay in digital dollars — the engine that fills the network).

---

## The model (unchanged from batch 1)

- **First-person only.** Each contributor shares **their own** experience — no surveying others, no invented samples.
- **One assignee per issue.** Apply via the Drips bot; maintainer assigns one person; bot notifies.
- **Delivery = PR.** The assignee adds their own `### V-X` section to [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) (one section per issue → no merge conflicts). Maintainer reviews for privacy and merges.
- **Labels (every issue):** `research` · `wave:docs` · `complexity: low` · `Stellar Wave`. (Add `wave:retail` to V-16/17/18/23/24, `wave:trust` to V-22, where useful for triage — the `research` label remains the routing label.)
- **Milestone:** *Wave 6: Market & User Validation* (#18), same as V-1…V-15.

### Privacy-first (⚠️ applies to every issue)

> No real names, phone numbers, addresses, wallet addresses, private keys, documents, receipts,
> transaction hashes, or financial details. **We do not ask for any amounts of money** — not even
> ranges. A commission/fee **percentage** is fine. Share only a **general country/region** and your
> **own anonymized** experience. Responses in English or Spanish.

---

## Index

> Published 2026-06-29 to the *Wave 6: Market & User Validation* milestone (#18).

| ID | Issue | Topic | Vertical | What it validates (SDF) |
|----|-------|-------|----------|-------------------------|
| V-16 | [#231](https://github.com/ericmt-98/micopay-protocol/issues/231) | Spending digital dollars at a store (consumer) | B · Retail | Claim 6 — retail demand |
| V-17 | [#232](https://github.com/ericmt-98/micopay-protocol/issues/232) | Accepting "dollars" and receiving pesos (merchant) | B · Retail | Claim 6 — merchant-side supply |
| V-18 | [#233](https://github.com/ericmt-98/micopay-protocol/issues/233) | NFC / contactless tap-to-pay familiarity | B · Retail | Claim 4 + 6 — payment UX feasibility |
| V-19 | [#234](https://github.com/ericmt-98/micopay-protocol/issues/234) | Freelancer / remote worker paid by clients abroad | C · Inflows | Claim 7 — dollar-inflow demand (gig) |
| V-20 | [#235](https://github.com/ericmt-98/micopay-protocol/issues/235) | Receiving part of your pay in digital dollars (worker) | C · Payroll | Claim 7 — payroll demand (worker) |
| V-21 | [#236](https://github.com/ericmt-98/micopay-protocol/issues/236) | Small employer paying people in digital dollars | C · Payroll | Claim 7 — payroll supply (employer) |
| V-22 | [#237](https://github.com/ericmt-98/micopay-protocol/issues/237) | Key recovery — what makes self-custody trustworthy | cross | Claim 4 — passkey recovery decision |
| V-23 | [#238](https://github.com/ericmt-98/micopay-protocol/issues/238) | Peso vs dollar — what you prefer to hold | cross | Product — canonical peso / inflation hedge |
| V-24 | [#239](https://github.com/ericmt-98/micopay-protocol/issues/239) | Corner shop as a liquidity provider (bootstrap) | A · Supply | Claim 2 — supply density / chicken-egg |
| V-25 | [#240](https://github.com/ericmt-98/micopay-protocol/issues/240) | Paying bills & services from a digital wallet | A→B bridge | Claim 1/5 — digital-economy access, retention |

---

## The issues (ready to paste into GitHub)

---

### V-16 · Spending digital dollars at a store (consumer side)
**Validates:** Claim 6 — retail demand · **Vertical:** B (Retail) · **Labels:** `research` `wave:docs` `wave:retail` `complexity: low` `Stellar Wave`

**Context.** Our cash-out research (V-1…V-15) showed people want to turn digital value into cash.
The next question is whether they'd also want to *spend* it directly at a store, paying "in dollars"
from a wallet while the shop receives pesos — without thinking about any blockchain.

**Share your own experience (privacy-first):**
1. In your country/region, when you pay at a small shop, market stall, or restaurant, what do you
   normally use today — cash, a card, a wallet app (which kind), or a mix?
2. Have you ever wanted to pay a local merchant directly from a crypto/stablecoin balance? What
   stopped you (or what happened)?
3. If your wallet showed a single "dollars" balance and you could pay a local shop with it — and the
   shop got pesos — would that feel useful, confusing, or risky? Why?
4. What would you need to *see on screen* at the moment of paying to trust it went through?
5. What would make you choose this over your current payment method? What would make you avoid it?

**Delivery.** Add a `### V-16` section to `VALIDATION_DRIPS.md` with your first-person answer. No
amounts, no names, no wallet addresses — region + your own experience only.

---

### V-17 · Accepting "dollars" and receiving pesos (merchant side)
**Validates:** Claim 6 — merchant-side acceptance/supply · **Vertical:** B (Retail) · **Labels:** `research` `wave:docs` `wave:retail` `complexity: low` `Stellar Wave`

**Context.** The retail vertical only works if merchants will accept it. The vision is: customer pays
"in dollars," the merchant receives a stable peso (or cash via the same escrow), and the merchant can
*also* act as a liquidity provider. We want a real merchant's-eye view.

**Share your own experience (if you run, help run, or have run a small business — privacy-first):**
1. What kind of small business is it (general category — e.g. corner shop, food stall, pharmacy)?
   What payment methods do you accept today and why?
2. What is the most annoying part of the payment methods you accept now (fees, settlement delay,
   chargebacks, terminals, cash handling)?
3. Would you accept a payment where the customer pays "in dollars" and you receive pesos that settle
   the same day? What would worry you about it?
4. Would you want to settle in a **stable digital peso** or in **physical cash** — or both? Which would
   be your default?
5. Would you be interested in also handing out cash to customers (as a paid liquidity provider) using
   the same app? What commission % would feel fair for that?

**Delivery.** `### V-17` in `VALIDATION_DRIPS.md`. A fee **percentage** is fine; no amounts, no
business name, no location beyond general region.

---

### V-18 · NFC / contactless tap-to-pay familiarity & trust
**Validates:** Claim 4 + 6 — payment UX feasibility · **Vertical:** B (Retail) · **Labels:** `research` `wave:docs` `wave:retail` `complexity: low` `Stellar Wave`

**Context.** The retail flow in the vision uses **NFC tap-to-pay**. Before we build it we need to know
whether NFC is familiar and trusted in our target markets, or whether QR is more natural.

**Share your own experience (privacy-first):**
1. In your country/region, have you used tap-to-pay (NFC) with a phone or card? How often — daily,
   sometimes, never?
2. When you tap to pay, do you trust it more or less than typing a PIN, scanning a QR, or paying cash?
   Why?
3. Have you ever had an NFC payment fail or feel uncertain (no confirmation, double charge fear)? What
   happened?
4. If a local shop accepted NFC from a "dollars" wallet, would tapping your phone feel natural — or
   would you prefer to scan a QR code instead?
5. What single on-screen signal after the tap would make you confident the payment succeeded?

**Delivery.** `### V-18` in `VALIDATION_DRIPS.md`. Region + your own habits only.

---

### V-19 · Freelancer / remote worker paid by clients abroad
**Validates:** Claim 7 — dollar-inflow demand (gig / freelance) · **Vertical:** C (Inflows) · **Labels:** `research` `wave:docs` `complexity: low` `Stellar Wave`

**Context.** Payroll (Vertical C) is the volume engine, but it starts smaller: freelancers and remote
workers in LATAM/Africa already get paid by foreign clients and fight to land that money locally. This
is the lightweight precursor to full payroll and a direct dollar-inflow signal.

**Share your own experience (if you've been paid by a client/employer abroad — privacy-first):**
1. How do clients/employers abroad pay you today (bank wire, PayPal/Wise-style service, crypto, other)?
2. What's the worst part of receiving that money — fees, conversion rate, delays, account freezes,
   paperwork? (No amounts — describe the friction.)
3. Roughly what share of the payment is lost to fees + exchange spread combined? (A **percentage** range
   is fine; no money amounts.)
4. Would receiving "dollars" you could then cash out locally or spend at a store solve a real problem
   for you? Which part matters most — speed, cost, or certainty of the final local value?
5. What would make you *not* trust getting paid this way?

**Delivery.** `### V-19` in `VALIDATION_DRIPS.md`. Percentages OK; no amounts, no client names.

---

### V-20 · Receiving part of your pay in digital dollars (worker side)
**Validates:** Claim 7 — payroll demand (worker) · **Vertical:** C (Payroll) · **Labels:** `research` `wave:docs` `complexity: low` `Stellar Wave`

**Context.** The vision puts payroll last because it's the most regulated — but we still need to know if
*workers* would even want it. This validates demand, not the legal mechanics.

**Share your own experience (privacy-first):**
1. How do you get paid today (cash in hand, bank transfer/SPEI, app, mixed)? What's good and bad about it?
2. If you live in a place where the local currency loses value, do you already try to hold part of your
   money in dollars or stablecoins? How?
3. Would you want the *option* to receive part of your pay as digital dollars you could spend or cash out
   locally? Why or why not?
4. What would have to be true for you to trust it — instant access to cash, a known place to spend it,
   recovery if you lose your phone?
5. What would make you refuse it outright?

**Delivery.** `### V-20` in `VALIDATION_DRIPS.md`. No amounts, no employer names — your own view only.

---

### V-21 · Small employer paying people in digital dollars
**Validates:** Claim 7 — payroll supply (employer) · **Vertical:** C (Payroll) · **Labels:** `research` `wave:docs` `complexity: low` `Stellar Wave`

**Context.** The other side of payroll: would a small business owner or team lead actually *pay* staff
or contractors in digital dollars? We want the payer's real friction, not a survey.

**Share your own experience (if you've paid staff, contractors, or freelancers — privacy-first):**
1. How do you pay people today (cash, bank/SPEI, remittance service, crypto)? What's the most painful part
   (timing, fees, cross-border, reconciliation)?
2. Have you ever had to pay someone in another country? What made it hard?
3. Would automating dispersal so each person gets "dollars" they can spend or cash out locally save you
   real effort? What would worry you most — control over funds, compliance, or recipients' trust?
4. Would you want a rule like "this key can only pay my registered roster, up to the period budget" before
   you'd trust automation? (We're testing the appetite, not the legality.)
5. What would stop you from ever using something like this?

**Delivery.** `### V-21` in `VALIDATION_DRIPS.md`. No amounts, no company/person names.

---

### V-22 · Key recovery — what makes self-custody trustworthy
**Validates:** Claim 4 — validates the passkey-recovery architecture decision · **Vertical:** cross · **Labels:** `research` `wave:docs` `wave:trust` `complexity: low` `Stellar Wave`

**Context.** V-4 (Shadow-MMN) showed the onboarding hides the key. V-14 (Max-Owolabi) named "losing the
key with no recovery" as the top fear. The vision answers with **smart accounts + passkey recovery** instead
of raw seed phrases. This issue tests whether that actually earns trust.

**Share your own experience (privacy-first):**
1. Have you ever used a self-custody wallet (you held the keys/seed phrase)? How did managing the backup
   feel — fine, stressful, confusing?
2. Have you ever lost access to an account or wallet, or feared you would? What happened?
3. Which would make you trust a wallet more: writing down a 12/24-word phrase, or unlocking/recovering with
   your phone's fingerprint/face (passkey)? Why?
4. For everyday money, do you *want* "only you can recover it," or would you accept some recovery help (e.g.
   device-based) in exchange for not losing everything if your phone is lost?
5. What recovery option would make you comfortable keeping meaningful value in the app?

**Delivery.** `### V-22` in `VALIDATION_DRIPS.md`. Your own experience only — no keys, no amounts.

---

### V-23 · Peso vs dollar — what you prefer to hold
**Validates:** Product — canonical-peso decision + inflation-hedge thesis · **Vertical:** cross · **Labels:** `research` `wave:docs` `wave:retail` `complexity: low` `Stellar Wave`

**Context.** The vision promises "you just see dollars," but the cash-out and retail legs touch the local
peso, and we still have to pick a canonical stable peso. We need to know how users actually think about
holding dollars vs their local currency.

**Share your own experience (privacy-first):**
1. In your country/region, when you have money you don't need right now, do you prefer to keep it in your
   local currency, in dollars, or something else? Why?
2. Has inflation or devaluation ever changed how you store money? What did you do?
3. If an app let you hold "dollars" but spend and cash out in your local currency automatically, would you
   trust the conversion happening behind the scenes — or would you want to see and control the rate?
4. Would you rather the app show your balance in dollars, in your local currency, or let you switch?
5. What would make you distrust a "digital dollar" or "digital peso" — what would make it feel as real as
   cash?

**Delivery.** `### V-23` in `VALIDATION_DRIPS.md`. No amounts; region + your own preference only.

---

### V-24 · Corner shop as a liquidity provider (supply bootstrap)
**Validates:** Claim 2 — supply density / the chicken-and-egg of the moat · **Vertical:** A (Supply) · **Labels:** `research` `wave:docs` `wave:retail` `complexity: low` `Stellar Wave`

**Context.** V-3 (DevSolex) validated an *individual* provider. The vision needs **density** — established
local businesses (shops, pharmacies, bakeries) doubling as cash-out points. Open question §7.4 in the vision:
how do the first providers join before there's cash-out volume? This validates the established-business angle.

**Share your own experience (if you run/help run a local business, or know that world well — privacy-first):**
1. What kind of local business, and does it already handle a lot of cash day to day?
2. Would earning a commission for handing out cash to app users (with the customer's dollars locked in
   escrow first) be attractive — or more hassle than it's worth? Why?
3. What commission **percentage** would make it worth your time and cash-on-hand? (Percentage only.)
4. What would you need before handing over any cash — what proof that the customer's funds are really locked?
5. Without many customers at the start, what would make you sign up anyway (foot traffic, reputation,
   convenience of converting your own digital dollars)?

**Delivery.** `### V-24` in `VALIDATION_DRIPS.md`. Fee **percentage** OK; no amounts, no business name.

---

### V-25 · Paying bills & services from a digital wallet
**Validates:** Claim 1/5 — digital-economy access & retention (deepens V-2) · **Vertical:** A→B bridge · **Labels:** `research` `wave:docs` `complexity: low` `Stellar Wave`

**Context.** V-2 (Truphile) framed cash-in as "the gateway to the digital economy" — paying bills, top-ups,
and online services. This issue tests the *recurring* reason people would keep value in the wallet at all:
the everyday digital payments that cash can't reach.

**Share your own experience (privacy-first):**
1. What digital things do you regularly need to pay for that are hard or impossible with cash (utilities,
   phone top-up, streaming, cloud/AWS, online stores)?
2. How do you pay for those today when your money is in cash? What's the workaround and what does it cost
   you (a **percentage** or "convenience fee," no amounts)?
3. If a wallet let you cash-in once and then pay all those digital things directly, how often do you think
   you'd actually use it?
4. Which would keep you coming back: bill pay, cash-out, spending at shops, or saving in dollars?
5. What would make you stop using it after the first try?

**Delivery.** `### V-25` in `VALIDATION_DRIPS.md`. Percentages OK; no amounts, no account names.

---

## After answers come in

Same as batch 1: each issue closes when its assignee's PR merges (privacy-safe, first-person). The
maintainer keeps the aggregate, anonymized synthesis in [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md)
and rolls the new signals into the SDF deck — now under **7 claims** (the original 5 + Claim 6 retail +
Claim 7 inflows). These also feed the next product drafts (compare with T-1…T-5 in
[`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md) §11): V-16/17/18 → retail/NFC flow, V-22 → passkey onboarding,
V-23 → canonical-peso decision, V-24 → provider-onboarding funnel.

---

*Drafted: 2026-06-29 · Maintainer: [@ericmt-98](https://github.com/ericmt-98) · Continues V-1…V-15 from [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md)*
