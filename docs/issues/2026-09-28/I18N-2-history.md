<!-- Title: I18N-2 · Move the History screen's hardcoded text to i18n -->
<!-- Labels: enhancement, wave:frontend, wave:retail, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: UI Truth (P1) -->
<!-- Status: proposal, not published (plan v0.2, reviewed by Codex). Publish after UX-1 is merged. Everything above this line is metadata; the issue body starts below. -->

## Problem statement

`micopay/frontend/src/pages/History.tsx` is almost entirely hardcoded in Spanish:
- The status map `STATUS_LABEL` (line 8) and the filter list `FILTERS` (line 24): "Todos", "Completados", "Cancelados", "Expirados", "Reembolsados".
- The title "Historial de Transacciones" (line 71), the loading text (line 103) and the empty state (lines 110–112).

With the app in English, the whole screen stays in Spanish.

## Why it matters

History is where a person checks what happened to their money. It should be readable in their language.

## In-scope files

- `micopay/frontend/src/pages/History.tsx`
- `micopay/frontend/src/i18n/es.json` and `en.json`
- Tests for this screen

## Out-of-scope

- Fetching, filtering, pagination and navigation: conditions and API calls stay identical.
- Status colors and styles: keep the current colors, including for unknown states.
- Date and amount formatting: `History.tsx` formats with `es-MX` (lines 120 and 143). Leave it as is.
- Any other screen.

## Acceptance criteria

- [ ] Every interface text written in `History.tsx` uses `t(...)`: title, filters, status labels, loading, empty state and pagination labels. User data, currency codes (such as `MXN`) and internal icon names are not translated.
- [ ] **Status labels reuse `home.status.*`** (including `expired` and `unknown`, added by UX-1) instead of new duplicate keys. Filter labels (plural, like "Completados") may have their own keys.
- [ ] The Spanish text is exactly the same as today, **with one intended exception**: an unknown status, which today shows "Pendiente" (line 118), will show "Estado desconocido". Existing tests pass without changing their expected strings.
- [ ] A test covers the unknown-status case (label and current color).
- [ ] Every new key exists in both `es.json` and `en.json`, with the same interpolation variables.
- [ ] A test renders the screen in English and checks the title, a filter and a status label.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
- [ ] The PR only touches the files listed in In-scope files.

## Test notes

- Mock the history API call; do not depend on a real backend.

## Dependency notes

Depends on **UX-1**, which adds `home.status.expired` and `home.status.unknown`. Start after UX-1 is merged.
