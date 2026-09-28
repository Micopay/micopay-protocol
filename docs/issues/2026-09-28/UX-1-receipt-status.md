<!-- Title: UX-1 · The receipt shows the trade status in raw English -->
<!-- Labels: bug, wave:frontend, wave:retail, wave:good-first, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: UI Truth (P1) -->
<!-- Status: proposal, not published (plan v0.2, reviewed by Codex). Everything above this line is metadata; the issue body starts below. -->

## Problem statement

The receipt (`micopay/frontend/src/pages/SuccessScreen.tsx:210`) renders the trade status straight from the server, `{trade.status}`, with CSS `capitalize`. In a Spanish app, the receipt reads **"Completed"**.

Translated labels already exist in `src/i18n/es.json` and `en.json` under `home.status` for six states (`completed`, `locked`, `revealing`, `pending`, `cancelled`, `refunded`). The app defines seven: `TRADE_STATES` in `src/components/TradeStateBadge.tsx:13` also includes **`expired`**, which has no label yet.

## Why it matters

The receipt is the proof a person keeps after handing over cash. Its status should be in their language.

## In-scope files

- `micopay/frontend/src/pages/SuccessScreen.tsx` (the status line only)
- `micopay/frontend/src/i18n/es.json` and `en.json`
- A test for the receipt status

## Out-of-scope

- Amounts, `receiptFromServer`, transaction hashes and any escrow logic. The change is presentation only.
- Other screens that show a status (for example `History.tsx`, which has its own issue).

## Acceptance criteria

- [ ] The receipt shows the translated label for the status instead of the raw value.
- [ ] `home.status.expired` exists in both languages (`es`: "Expirado", `en`: "Expired").
- [ ] An unknown status shows a translated fallback, `home.status.unknown` (`es`: "Estado desconocido", `en`: "Unknown status"), never the raw value or the key.
- [ ] A vitest test covers **all seven** states in Spanish and in English, plus one unknown value.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
- [ ] The PR only touches the files listed in In-scope files.

## Test notes

- Render the status part of the receipt with each state and assert the visible text in both languages.

## Dependency notes

None. The History translation issue will reuse the keys added here, so this one should land first.
