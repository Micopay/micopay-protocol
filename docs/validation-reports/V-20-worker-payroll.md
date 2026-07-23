# V-20 · Receiving part of your pay in digital dollars (worker side)

**Contributor:** [@Killerjunior](https://github.com/Killerjunior) ([@codex-agent](https://github.com/codex-agent))
**PR:** [#270](https://github.com/ericmt-98/micopay-protocol/pull/270)
**Region:** Mexico (central region)
**Wave:** 6 · Validates Claim 1 — demand exists / Claim 4 — Stellar is usable

---

## Response

First-person response (privacy-safe):

- **How I get paid today:** Mostly bank transfer (SPEI), sometimes mixed with cash in hand for side work.
- **What is good and bad about it:** Bank transfer is convenient for paying bills and buying online, but local bank rails can be slow or unavailable at the worst times. Cash is flexible for daily spending, but carrying it is inconvenient and risky.
- **If I already try to hold dollars/stablecoins:** Yes. I sometimes keep part of my savings in digital dollars through a self-custodial wallet because local purchasing power can fluctuate. The hardest part is moving between digital dollars and local cash quickly when needed.
- **Would I want payroll split into digital dollars:** Yes, as an option. I would use it to keep a portion of income in a more stable unit while still receiving local currency for day-to-day expenses. I would not want it to be mandatory.
- **What must be true for me to trust it:** Reliable same-day cash-out nearby, clear places to spend directly without extra hops, transparent fees before confirmation, and a recovery path if I lose access to my phone.
- **What would make me refuse it outright:** Delayed access to funds, unclear or variable fees, no support for failed transactions, forced full-dollar payroll with no local-currency option, or any setup that requires trusting an unverified person without escrow.

---

## SDF narrative

Mexico signal: stablecoin savings behavior already exists among tech-adjacent workers. The demand for split payroll (partial dollars + partial pesos) is real but must be opt-in — forced full-dollar payroll is a dealbreaker.

### Key findings for product

| Signal | Detail |
|--------|--------|
| Current rails | SPEI primary + cash for side work |
| Stablecoin holder | Yes — already self-custodial for savings |
| Split payroll interest | Yes, as an option — not mandatory |
| Trust requirements | Same-day cash-out nearby · transparent fees · key recovery |
| Dealbreakers | Delayed funds · variable fees · no failed-tx support · forced full-dollar · unverified counterparty without escrow |
| Product implication | HTLC escrow directly addresses "unverified counterparty" fear; split payroll UI is a feature worth building |
