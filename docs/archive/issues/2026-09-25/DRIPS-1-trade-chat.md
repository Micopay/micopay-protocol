<!-- Title: DRIPS-1 · Open the chat of the trade being viewed from TradeDetail -->
<!-- Suggested labels: frontend, complexity: medium -->
<!-- Status: proposal, not published. Owner: INTERNAL (decided 2026-09-25): isolation, session and concurrency need a full internal review. Not for Drips. -->

## Problem

In `TradeDetail`, the "Abrir chat con el vendedor" button in `LockedView` has no `onClick`: it does nothing.

The other chat buttons on the same screen (`RevealingView` and `ConfirmReleaseView`) do navigate, but always to `/chat`. That route renders `ChatRoom` with `activeTrade` from the app context, which is the trade of the user's *own* current client flow, not the trade on screen. Consequences:

- A provider who opens a trade from the inbox (`/trade/:id`) lands in a chat for another trade, or an empty one.
- A deposit always opens the cash-out chat (`/chat`) instead of `DepositChat`.

Pointing the buttons at the right component is not enough either. `ChatRoom` and `DepositChat` are written for the client's side of the flow: `DepositChat` tells the viewer "El agente bloqueó los activos que recibirás… entrégale el efectivo" and labels the counterparty as a verified agent. Opened by the provider, it would give the provider the client's instructions. And `useChatMessages` keeps its messages and does not cancel pending requests when `tradeId` changes, so switching trades can show another trade's messages.

## Why it matters

The two parties cannot talk from the trade screen, which is where they are while funds are locked and cash is being handed over.

## In scope

- A route that opens the chat of a specific trade by id, for example `/trade/:id/chat`. It reads the id from the URL.
- The route shows a **conversation-only** chat for both flows and both roles: the messages, the composer and the counterparty's name, resolved with `resolveTradeActor(userId, trade)` (`utils/tradeActor.ts`) so client and provider each see the other party.
- Conversation-only means **no** hand-over instructions, **no** escrow or deposit status banners, **no** "verified" or "authorized agent" labels, and **no** financial action (QR, lock, reveal, release, refund).
- It can be a new component or a `conversationOnly` mode of the existing ones; either way, `ChatRoom` and `DepositChat` may be modified only to support that mode, and `/chat` and `/chat-deposit` must render exactly as today.
- Isolation between trades: a late response for trade A must never appear in trade B, and B must not inherit A's messages, draft or failed messages. Mounting one instance per trade (for example keyed by trade id) or explicit request management are both acceptable.
- Back navigation returns to `/trade/:id`.
- Wire every chat button in `TradeDetail` to that route: `LockedView` (button without `onClick`) and the `onOpenChat` passed to `RevealingView` (today `navigate('/chat')`).
- The new route **must not** read or write `activeTrade`.

## Source at `d42e41d`

| Location | What changes |
|---|---|
| `micopay/frontend/src/pages/TradeDetail.tsx:218-261` (`LockedView`) | add `onOpenChat` and wire the button |
| `micopay/frontend/src/pages/TradeDetail.tsx` around lines 1073 and 1099 | pass the new navigation instead of `navigate('/chat')` |
| `micopay/frontend/src/App.tsx` around line 1388 | new route |
| `micopay/frontend/src/pages/ChatRoom.tsx`, `DepositChat.tsx`, `hooks/useChatMessages.ts` | only to support the conversation-only mode and trade isolation |

## Out of scope

- Any lock, reveal, release, refund or "cash received" action. The provider's "Recibí el efectivo" button is being done internally.
- Backend changes. `GET /trades/:id` and the chat API already take the trade id.
- Changing texts or translations (DRIPS-2).

## Acceptance criteria

- [ ] In `locked`, the chat button opens the chat of the trade on screen.
- [ ] In `revealing`, the chat buttons open the chat of the trade on screen, not the one in `activeTrade`.
- [ ] Opening the chat from the provider inbox shows the messages of that trade, for both flows.
- [ ] The counterparty shown is correct for client and provider, in cash-out and in deposit.
- [ ] The conversation-only chat shows no hand-over instructions, status banners, verification labels or financial actions.
- [ ] The new route does not modify `activeTrade`.
- [ ] `/chat` and `/chat-deposit` behave exactly as before.
- [ ] Vitest tests cover:
  - button wired in `LockedView`;
  - `activeTrade` = A and URL = B: messages are fetched from and sent to B only;
  - switching from A to B while A is still loading: nothing from A appears in B;
  - unknown trade id, access denied (403) and expired session;
  - correct counterparty for client and provider in both flows;
  - no calls to lock, reveal, release or refund from the new route.
- [ ] `npm run build` and `npm run test` in `micopay/frontend` pass.
