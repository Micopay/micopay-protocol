<!-- Title: I18N-1 · Move hardcoded text in four deposit and provider screens to i18n -->
<!-- Labels: enhancement, wave:frontend, wave:merchant, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: UI Truth (P1) -->
<!-- Status: second issue of the scoped Wave 9 reopening (decided 2026-09-25). Scope reduced to four screens: TradeDetail.tsx and DepositQR.tsx are excluded because internal work is changing them. Everything above this line is metadata; the issue body starts below. -->

## Problem statement

The frontend has i18n (`micopay/frontend/src/i18n/`: `es.json` and `en.json`, with the same 518 keys and `es` as fallback), but these four screens still have text written directly in the JSX. With the app in English they keep showing Spanish.

| File | `t()` calls today | Examples of hardcoded text |
|---|---|---|
| `pages/ProviderOnboarding.tsx` | 0 | "Los agentes son quienes hacen posible el efectivo en MicoPay…", "No necesitas tener un negocio." |
| `components/MerchantOfferCard.tsx` | 0 | "Costo total efectivo", "Mejor oferta", "Comisión" |
| `pages/DepositMap.tsx` | 3 | "Ofertas de depósito", "Solicitud de depósito", "Costo total efectivo" |
| `pages/MerchantInbox.tsx` | 15 (partial) | "QR verificado", "Trade confirmado por el servidor", "Expira en" |

## Why it matters

These are the screens where someone joins the network as a provider, chooses a deposit offer and handles incoming trades. In English, they are the part of the app that is still only in Spanish.

## In-scope files

- `micopay/frontend/src/pages/ProviderOnboarding.tsx`
- `micopay/frontend/src/components/MerchantOfferCard.tsx`
- `micopay/frontend/src/pages/DepositMap.tsx`
- `micopay/frontend/src/pages/MerchantInbox.tsx`
- `micopay/frontend/src/i18n/es.json` and `en.json`
- Tests for these screens

## Out-of-scope

- Every other screen, including `TradeDetail.tsx` and `DepositQR.tsx`.
- `Terms.tsx` and `Privacy.tsx` (legal text).
- Values that come from the server or from users: statuses, names, chat messages.
- Any change in logic: conditions, navigation and API calls stay identical.
- Rewriting copy. This issue translates; it does not change what the Spanish says.

## Acceptance criteria

- [ ] No user-visible text written in the four files remains hardcoded: headings, paragraphs, buttons, labels, placeholders, `aria-label` and `title` values, and toast or error messages written in the file. Comments and code identifiers are excepted.
- [ ] The Spanish text is **exactly** the same as today. Existing tests that assert on Spanish text pass without changing their expected strings.
- [ ] With the language set to English, the four screens show English.
- [ ] Every new key exists in both `es.json` and `en.json`, and both files keep the same key set.
- [ ] For every key, the Spanish and English values use the same interpolation variables (`{{amount}}` in one means `{{amount}}` in the other).
- [ ] Text built from data (amounts, names) uses i18next interpolation, not string concatenation.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
- [ ] The PR only touches the files listed in In-scope files.

## Test notes

- Follow the existing key structure (for example `inbox.*`); add one namespace per screen when none exists.
- Add at least one test per screen that renders it in English and checks a translated string.
- A quick check for leftovers: search the four files for Spanish text between JSX tags.

## Dependency notes

None. Do not touch `TradeDetail.tsx` or `DepositQR.tsx`, even to translate them.
