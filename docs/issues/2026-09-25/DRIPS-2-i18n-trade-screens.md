<!-- Title: DRIPS-2 · Move hardcoded text in the trade and provider screens to i18n -->
<!-- Suggested labels: frontend, i18n, complexity: low -->
<!-- Status: proposal, not published. Owner: Drips, second in the scoped reopening (after DRIPS-3). Do not assign while the internal chat work (DRIPS-1) touches TradeDetail.tsx. -->

## Problem

The app has i18n (`micopay/frontend/src/i18n/`: `es.json` and `en.json` with the same 518 keys, fallback `es`), but several screens still have text written directly in the JSX. With the app in English, those screens show Spanish.

## Why it matters

These are the screens of an actual trade and of provider onboarding: the ones a user or provider sees while money and cash are changing hands.

## In scope

Move the visible text of these files to `t(...)`, with keys in **both** `es.json` and `en.json`:

| File | Notes |
|---|---|
| `pages/TradeDetail.tsx` | almost everything is hardcoded (headings, descriptions, buttons, refund messages) |
| `pages/DepositMap.tsx` | |
| `pages/DepositQR.tsx` | |
| `pages/ProviderOnboarding.tsx` | does not use `t()` at all |
| `pages/MerchantInbox.tsx` | partially translated |
| `components/MerchantOfferCard.tsx` | does not use `t()` at all |

Rules:
- The Spanish text must stay **exactly** as it is today. This issue translates; it does not rewrite copy.
- Follow the existing key structure (for example `chatRoom.*`, `inbox.*`); add a new namespace per screen when none exists.
- Text built from data (amounts, names) uses i18next interpolation, not string concatenation.

## Out of scope

- `Terms.tsx` and `Privacy.tsx`: legal text, translated only by the team.
- `DebugOverlay.tsx`, `BlendScreen.tsx`, `CETESScreen.tsx`.
- Server-provided values, such as the trade status shown on the receipt; that is handled internally.
- Any logic change: conditions, navigation and API calls stay identical.
- Changing the **behavior** of the chat buttons in `TradeDetail` (DRIPS-1). Translating their labels **is** in scope. DRIPS-1 and this issue should not be assigned at the same time, because both touch `TradeDetail.tsx`.

## Acceptance criteria

- [ ] No user-visible hardcoded text written in the six files remains: headings, paragraphs, buttons, placeholders, `aria-label`/`title` values and toast or error messages written in the file. Excluded: comments, code identifiers, user content (names, chat messages) and messages received from the server.
- [ ] Every new key exists in `es.json` and `en.json`; both files keep the same key set.
- [ ] For every key, the Spanish and English values use the same interpolation variables (`{{amount}}` in one means `{{amount}}` in the other).
- [ ] With the language in Spanish, the screens show the same text as before: existing tests that assert on Spanish text pass without changing their expected strings.
- [ ] With the language in English, the six screens show English.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
- [ ] The PR only touches the six files, the two JSON files and tests.
