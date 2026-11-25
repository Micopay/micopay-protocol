# V-19 · Freelancer / remote worker paid by clients abroad

**Contributor:** [@Thoni76](https://github.com/Thoni76)
**PR:** [#292](https://github.com/ericmt-98/micopay-protocol/pull/292)
**Issue:** [#234](https://github.com/ericmt-98/micopay-protocol/issues/234)
**Region:** LATAM
**Wave:** 6 · Validates Claim 1 — demand exists / Claim 3 — MicoPay can win

---

## Response

First-person response (privacy-safe):

- **How clients/employers abroad pay you today:** I get paid mostly via Wise (which deposits into my local bank) and occasionally via direct crypto (USDC) to a self-custodial wallet for tech-savvy clients.
- **What's the worst part of receiving that money:** The worst part is the unpredictability. With traditional platforms, there are intermediary bank fees that appear out of nowhere, and the exchange rate used is typically lower than the real market rate. For crypto, having to navigate P2P exchanges to get local fiat is stressful due to scams and the risk of my local bank freezing my account for P2P transfers.
- **Roughly what share of the payment is lost to fees + exchange spread combined:** I lose about 5% to 8% overall, sometimes more if the transaction is small due to flat wire fees.
- **Would receiving "dollars" you could then cash out locally or spend at a store solve a real problem for you? Which part matters most:** Yes, absolutely. Cost predictability and certainty of the final local value matter most. If I receive exactly the agreed dollar amount and can convert it to local currency on demand at a transparent rate, it removes all the stress of hidden spread margins and bank delays.
- **What would make you not trust getting paid this way:** I wouldn't trust it if the off-ramp to local currency was run by unverified individuals rather than trusted local shops, or if there were hidden fees during the cash-out process.

---

## SDF narrative

Confirms that remote workers in LATAM face a **5-8% friction** and high unpredictability using current rails. The primary demand driver for dollar-inflow (Vertical C) is **certainty of the final local value** and a safe, reliable cash-out path without the risk of bank freezes.

### Key findings for product

| Signal | Detail |
|--------|--------|
| Current payment methods | Wise + direct USDC to self-custodial wallet |
| Worst pain | Unpredictability: hidden fees + unfavorable exchange rates |
| Fee friction | 5-8% combined (fees + spread) |
| Would MicoPay solve it? | Yes — cost predictability + transparent rate |
| What matters most | Exact dollar amount received + on-demand local conversion at transparent rate |
| Trust killer | Off-ramp run by unverified individuals; hidden fees |
| Product implication | HTLC escrow + verified provider map + transparent fee display directly addresses both trust concerns |
