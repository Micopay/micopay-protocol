<!-- Title: RED-2 · Add Red MicoPay provider onboarding to the retail APK -->
<!-- Suggested labels: wave:frontend, wave:merchant, wave:retail, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

The APK has a Red MicoPay label, provider settings and an inbox, but no normal path to join the
network. Every logged-in user currently gets provider-shaped navigation because duplicated
session state is treated as provider membership.

## Why it matters

A willing neighborhood shop or individual needs a short, understandable path from “I have MXN
cash” to “I am available to fulfill cash-out requests,” without being forced into a permanent
merchant mode.

## UX contract

```text
Profile: "Únete a Red MicoPay"
  -> explain: give MXN cash, receive USDC + configured fee
  -> checklist: general KYC (Didit), location, limits/rate
  -> review and activate
  -> availability toggle: online / paused
  -> provider inbox appears while the rest of the app remains unchanged
```

Use “agente” or “proveedor de liquidez” in user copy. Do not require or imply that the person owns
a formal business.

## In scope

- Add an entry point in Profile and a resumable enrollment/checklist screen.
- Reuse the existing limits and rate settings. Integrate the already implemented location picker
  from `feat/map-real` commit `1cf99eb` (or port that commit if the branch is not merged); do not
  build a second location form.
- Follow the public-area/private-meeting-point contract settled in `RED-3`; onboarding must tell
  the provider exactly which location data is public.
- Route the KYC checklist item to general MicoPay Didit KYC (`KYC-1`).
- Show pending, active, paused and suspended states with clear next steps.
- Show provider Inbox/navigation only from explicit provider status, never from a truthy session.
- Let an active provider continue using cash-out/deposit as a client without switching app mode.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| new `ProviderOnboarding` page/components and route tests | resumable checklist, status screens and activation UX |
| `micopay/frontend/src/pages/Profile.tsx:29-41`, `:273-373` | “Únete a Red MicoPay” entry point and provider-status summary outside TRUST-1's trust card |
| `micopay/frontend/src/App.tsx:595-629`, `:674-730` plus one new protected onboarding route | onboarding/settings adapters and provider-gated inbox/navigation after CASH-7 |
| `micopay/frontend/src/components/BottomNav.tsx:1-42` | consume explicit enrollment status after CASH-7 removes `isMerchant` session inference |
| `micopay/frontend/src/pages/MerchantSettings.tsx:1-207` | reuse rate/limits/availability controls inside the checklist; no duplicate settings form |
| `micopay/frontend/src/services/api.ts:353-384`, `:520-574` | typed current-user enrollment status and existing config/availability clients |
| location-picker files from commit `1cf99eb` | port/reuse the existing location UI once; these files are not present in `312e921` |

RED-1 exclusively owns backend enrollment state/readiness. RED-3 owns public/private location
semantics, and KYC-1 owns Didit routing/status truth. Do not port `1cf99eb` and merge its source
branch independently into the same assignment; the maintainer must choose one integration path.

## Out of scope

- Backend enrollment state (`RED-1`).
- KYB, business documents or Etherfuse onboarding.
- Multi-asset inventory or USDC-to-USDC exchange.
- Redesigning cash-out, map, inbox or settings screens.

## Acceptance criteria

- [ ] A normal user can discover and start provider enrollment from Profile.
- [ ] Progress survives app restart and resumes from backend truth.
- [ ] Didit, profile/location and limits/rate checklist items reflect real status.
- [ ] Activation is impossible until `RED-1` reports readiness.
- [ ] Inbox/provider controls are hidden for non-enrolled users and available to active providers.
- [ ] An active provider can immediately start a client cash-out without changing roles/modes.
- [ ] Loading/offline/error/suspended states are covered.
- [ ] Navigation/component tests pass and screenshots of each onboarding stage are attached.

## Dependencies and prior work

Depends on `RED-1`, `RED-3`, `KYC-1` and `CASH-7`. Related to closed issue #23, but that issue
targeted the protocol dashboard rather than the retail APK. This is new retail work and a Drips candidate; if
published before dependencies merge, label it blocked and do not assign it. Before assignment,
also resolve whether `1cf99eb` lands through `feat/map-real`/`feat/rediseno-rotulo` or is ported
directly so contributors do not duplicate the location work.
