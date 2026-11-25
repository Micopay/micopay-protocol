<!-- Title: CASH-7 · Replace duplicated buyerUser/sellerUser session state with one identity -->
<!-- Suggested labels: wave:frontend, wave:trust, complexity: medium -->
<!-- Suggested milestone: Wave 8: Core Retail Flow (P0) -->

## Problem

`micopay/frontend/src/App.tsx` keeps `buyerUser` and `sellerUser`, but every login/register/recovery path assigns the
same `UserData` object to both. The duplicate names preserve the old one-phone/two-role mental
model and make truthy `sellerUser` act as “this user is a provider”.

## Why it matters

A user is one identity and may take different roles per trade. Global role-shaped session state
keeps recreating authorization, navigation and copy bugs.

## In scope

- Replace `buyerUser`/`sellerUser` with one `sessionUser` in app context and routes.
- Pass `sessionUser.id/token` to screens; derive escrow/product role from each loaded trade.
- Remove setters, duplicated login/logout assignments and role-named token fallbacks.
- Preserve existing route behavior until `RED-2` changes provider-specific navigation.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/frontend/src/App.tsx:85-174`, `:337-467`, `:707-738`, `:837-915`, `:1010-1164` | one session user in context, auth lifecycle, route props and removal of truthy-session provider inference |
| `micopay/frontend/src/components/BottomNav.tsx:1-42` | neutral session/navigation contract; RED-2 later gates provider navigation from enrollment status |
| `micopay/frontend/src/pages/TradeDetail.tsx:20-53`, `:672-721`, `:740`, `:759`, `:785`, `:974-975` | one authenticated user/token input and removal of buyer/seller token fallbacks only |
| `micopay/frontend/src/pages/QRReveal.tsx:15-30`, `:41-42`, `:79`, `:85-104` | neutral session token prop names only; no QR or transition behavior change |

Do not change trade creation/flow persistence at `micopay/frontend/src/App.tsx:926-979` (CASH-1), trade-detail
action rules (CASH-5B), refund rules (CASH-6), or provider enrollment/navigation eligibility
(RED-1/RED-2). CASH-3, CASH-5B and CASH-6 land after this prop refactor.

## Out of scope

- Provider enrollment or eligibility (`RED-1`/`RED-2`).
- Changing seller/buyer fields in the escrow API.
- Cash-out business logic owned by the other CASH issues.

## Acceptance criteria

- [ ] App context has one authenticated user object and one login/logout lifecycle.
- [ ] No production code keeps separate buyer/seller session objects or token fallbacks.
- [ ] Trade role is derived from authenticated user ID and trade data.
- [ ] Login, registration, recovery, logout and protected routes still work.
- [ ] Tests cover a user acting as seller in one trade and buyer in another without changing session.
- [ ] Frontend typecheck/build/tests pass.

## Dependencies and prior work

Technically independent. This completes the product invariant from closed issue #160 (“one
identity per device”); it must be described as a follow-up, not unrelated new work.
