# V-18 · NFC / contactless tap-to-pay familiarity & trust

**Contributor:** [@adepoju2006](https://github.com/adepoju2006)
**PR:** [#253](https://github.com/ericmt-98/micopay-protocol/pull/253)
**Region:** West Africa (Nigeria)
**Wave:** 6 · Validates Claim 4 + 6 — payment UX feasibility · Vertical B (Retail)

---

## Response

- **Country / general region:** West Africa (Nigeria).
- **Have I used tap-to-pay (NFC) with a phone or card? How often?:** Rarely — "sometimes," and almost always with a contactless card rather than a phone. In daily life here the dominant rails are chip-and-PIN on POS terminals, instant bank transfers from a banking app, and USSD codes. Contactless terminals exist but are not the norm, so I don't reach for tap as a default; I only use it on the few modern terminals that clearly support it.
- **Do I trust the tap more or less than a PIN, a QR scan, or cash? Why?:** Less than chip-and-PIN and less than a confirmed bank transfer, because both of those have an explicit "I approved this" moment (I enter a PIN, or I confirm an amount on my own screen). Tap completes so fast and so passively that it feels like nothing happened — there's no deliberate confirmation that I controlled. QR feels natural and trustworthy here because scan-to-transfer and USSD are already the everyday mental model. Cash I trust completely; it's just inconvenient and risky to carry.
- **Has an NFC payment ever failed or felt uncertain?:** Yes. A tap once didn't register cleanly — the terminal gave an ambiguous beep and I couldn't tell if it went through. I was afraid that tapping again would charge me twice, so I just stood there unsure until the cashier checked their side. The core problem was the absence of a clear, immediate confirmation on *my* device.
- **If a local shop accepted NFC from a "dollars" wallet, would tapping feel natural, or would I prefer QR?:** I would prefer to scan a QR. In this market QR/transfer is the established habit, and for a foreign-currency ("dollars") wallet I'd specifically want to *see* the merchant and confirm the details before approving — a QR flow shows me who I'm paying and lets me review on my own phone first. A blind tap into an unfamiliar dollar wallet would feel novel and a little risky.
- **The single on-screen signal that would make me confident the payment succeeded:** An immediate, unmistakable success state on my own phone right after the tap: a green checkmark with the merchant's name and the paid amount, ideally accompanied by a short haptic buzz and my updated balance so I can see the funds actually moved. The confirmation has to be on my screen, not only on the merchant's terminal.

---

## SDF narrative

West Africa (Nigeria) signal: QR is the dominant mental model; NFC carries an inherent trust deficit due to the absence of an explicit confirmation moment.

### Key findings for product

| Signal | Detail |
|--------|--------|
| NFC familiarity | Low — mostly chip-and-PIN + USSD/bank transfer |
| Trust ranking | Cash > chip-and-PIN ≈ bank transfer > QR scan > NFC tap |
| Preferred payment UX | QR scan (explicit confirmation before approving) |
| NFC failure mode concern | Double-charge fear on ambiguous tap |
| Required success signal | Green checkmark + merchant name + amount + haptic on *my* phone |
| Product implication | QR-first is the right default for this market; NFC is a future enhancement requiring strong post-tap confirmation |
