# V-16 · Spending digital dollars at a store (consumer side)

**Contributor:** [@Emelie-Dev](https://github.com/Emelie-Dev)
**PR:** [#274](https://github.com/ericmt-98/micopay-protocol/pull/274)
**Region:** Mexico (central region)
**Wave:** 6 · Validates Claim 6 — retail demand / payment UX

---

## Response

- **Country / general region:** Mexico (central region)
- **What I normally use today at small shops, market stalls, or restaurants:** Mostly a mix of cash and card. For very small neighborhood purchases I still expect to use cash, while at restaurants or more established shops I usually prefer card or a local wallet app if they accept it.
- **Have I ever wanted to pay a local merchant directly from a crypto/stablecoin balance?:** Yes, mainly because I like the idea of keeping value in digital dollars without needing an extra cash-out step first.
- **What stopped me:** In practice, almost no local merchant wants to receive crypto directly, and I do not want to explain wallets, networks, or confirmations at the checkout counter. The moment a payment feels experimental or slow, it becomes stressful for both me and the merchant.
- **Would a wallet with a single "dollars" balance that pays the shop in pesos feel useful, confusing, or risky?:** Useful if it is presented like a normal payment flow. The value is obvious: I can hold digital dollars and still pay locally in pesos. It becomes confusing if the app exposes too much blockchain language, or risky if the exchange rate and confirmation are not crystal clear before I approve.
- **What I would need to see on screen at the moment of paying to trust it went through:** The merchant name, the exact peso amount the shop will receive, the exchange rate used, the total fee, and a very clear success state with a timestamp or receipt. I would also want an immediate status indicator so there is no awkward uncertainty while standing at the counter.
- **What would make me choose this over my current payment method?:** Fast checkout, no hidden fees, better reliability than card terminals, and confidence that my digital dollar balance is being converted fairly. It would be especially attractive if it helped me avoid carrying cash while still working at ordinary local businesses.
- **What would make me avoid it?:** Any delay during checkout, unclear pricing, failed transactions, or anything that forces the merchant to trust my explanation instead of the app showing a definitive result. If it feels harder than cash or card, I would not use it in person.

---

## SDF narrative

Supports **Claim 6** (retail demand) from Mexico by showing a concrete consumer-side use case: keeping savings in digital dollars while spending seamlessly at peso-denominated local merchants.

**Key adoption requirement:** the product must hide blockchain complexity and present a checkout experience that is as fast and legible as cash or card.

### Key findings for product

| Signal | Detail |
|--------|--------|
| Willing to pay with digital dollars locally | Yes — if friction is removed |
| Blocker | Merchant resistance + UX complexity at checkout |
| Required UI before payment | Merchant name · peso amount · exchange rate · fee · success state |
| Switch trigger | Speed, no hidden fees, better reliability than card terminals |
| Dealbreaker | Any delay or unclear outcome at the counter |
