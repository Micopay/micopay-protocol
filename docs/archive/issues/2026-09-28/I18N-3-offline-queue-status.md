<!-- Title: I18N-3 · Move the offline-sync banner's text to i18n -->
<!-- Labels: enhancement, wave:frontend, wave:merchant, wave:good-first, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: UI Truth (P1) -->
<!-- Status: proposal, not published (plan v0.2, reviewed by Codex). Presentation only. Everything above this line is metadata; the issue body starts below. -->

## Problem statement

`micopay/frontend/src/components/OfflineQueueStatus.tsx` shows the provider when there is no connection or when changes are waiting to sync. All of its text is hardcoded in Spanish and it does not use `t()`: "Sin conexión a Internet", "Pendiente de sincronizar", "Tus cambios se guardarán localmente…", "Tienes cambios esperando ser sincronizados con el servidor.", "Reintentar".

## Why it matters

A provider using the app in English sees this banner in Spanish exactly when something is not working.

## In-scope files

- `micopay/frontend/src/components/OfflineQueueStatus.tsx` (text only)
- `micopay/frontend/src/i18n/es.json` and `en.json`
- A test for this component

## Out-of-scope

- **Everything that is not text.** The "Reintentar" button calls an authenticated retry (`offlineQueue.retryAsync(token)`, line 74). Its `onClick`, the `useOfflineQueue` hook, `services/offlineQueueManager.ts` and the conditions that decide which banner shows must not change.
- Any other component.

## Acceptance criteria

- [ ] Every user-visible text in `OfflineQueueStatus.tsx` uses `t(...)`, including the button label.
- [ ] The diff of `OfflineQueueStatus.tsx` only replaces text with `t(...)` calls, plus the two additions this requires: importing `useTranslation` and calling it. Handlers, props and conditions stay intact.
- [ ] The Spanish text is exactly the same as today.
- [ ] Every new key exists in both `es.json` and `en.json`.
- [ ] Tests, with `useOfflineQueue` mocked, cover:
  - compact mode and full mode, each in the offline and the pending-sync states, in Spanish and in English;
  - online with nothing pending: the component renders nothing;
  - in full mode, the retry button still calls `retryAsync` with the token.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
- [ ] The PR only touches the files listed in In-scope files.

## Test notes

- Mock `useOfflineQueue`; do not trigger real network requests.

## Dependency notes

None.
