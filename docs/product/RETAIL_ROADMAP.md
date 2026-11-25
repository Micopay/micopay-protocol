# MicoPay Retail Roadmap

## Goal

Turn the current MicoPay retail app from a strong demo into a product path that can support private beta, real merchant testing, and eventual store submission.

## Current reality

The repo already contains:

- a retail frontend in `micopay/frontend`
- a retail backend in `micopay/backend`
- protocol infrastructure in the root monorepo
- demo cash flow, DeFi screens, and contract-backed ideas

What is missing is not ambition. What is missing is a strict sequence.

## Phase 0: Product and architecture alignment

### Outcome

The team agrees on what gets built first and what does not.

### Deliverables

- product scope approved
- target user journey documented
- decision on mobile stack:
  - React Native + Expo
  - or Capacitor around the current frontend
- auth strategy selected
- custody / wallet strategy selected
- data model for users, merchants, trades, and audit agreed

### Notes

Do this before large implementation work. It prevents the team from spreading effort across protocol, app, DeFi, and integrations at the same time.

## Phase 1: Trust foundation

### Outcome

The app stops behaving like a demo and starts behaving like a financial product.

### Priorities

- real authentication
- session handling
- secure environment management
- remove in-memory fallback from critical paths
- persistent storage for users, merchants, trades, replay protection, and audit logs
- rate limiting, logging, and monitoring
- error taxonomy and support-safe messaging

### Why this comes first

Without this, every later feature sits on unstable ground and becomes difficult to review, test, and publish.

## Phase 2: Core retail flow

### Outcome

One complete cash-in / cash-out flow works reliably end to end.

### Priorities

- amount entry and validation
- merchant discovery and ranking
- merchant availability
- trade creation
- lock / reveal / complete / cancel / expire / refund state machine
- QR or claim presentation
- receipts and trade history
- push or in-app notifications

### Definition of done

A user can start a trade, understand the current state at all times, and finish or recover safely.

## Phase 3: Merchant operations

### Outcome

Merchants become a first-class product surface rather than a hidden demo assumption.

### Priorities

- merchant onboarding flow
- merchant profile and verification status
- limits, spread, liquidity, location, and schedule
- merchant trade inbox
- merchant reputation signals
- manual controls for pause / unavailable / issue reported

### Why it matters

The merchant network is the moat. If this layer is weak, the retail app has no real advantage.

## Phase 4: One real integration layer

### Outcome

The product stops being simulation-first.

### Priorities

- one wallet integration, likely LOBSTR or another realistic Stellar wallet path
- one real anchor or ramp integration
- clear fallback if integration is unavailable
- controlled pilot amounts and operational runbooks

### Rule

Integrate one real path deeply before adding optional integrations.

## Phase 5: Store readiness

### Outcome

The app becomes submission-ready for private beta and then public launch preparation.

### Priorities

- privacy policy
- terms of service
- account deletion flow
- data export / privacy choices path
- support contact flow
- accessibility pass
- crash and analytics instrumentation
- device testing matrix
- app metadata and screenshots
- reviewer demo account / demo mode planning

## Suggested sprint sequence

### Sprint 1

- finalize scope
- select mobile architecture
- decide auth strategy
- define domain model
- define event and state model for trades

### Sprint 2

- implement auth foundation
- persistent user and trade storage
- audit logging
- document audit-log PII redaction policy (policy doc only; enforcement rules can ship later)
- secure config cleanup

### Sprint 3

- trade creation flow
- merchant discovery
- trade status machine
- history and receipts

### Sprint 4

- QR / claim hardening
- cancel, timeout, refund logic
- merchant controls
- notifications

### Sprint 5

- wallet integration
- one real anchor path
- controlled internal pilot

### Sprint 6

- support tooling
- policy and store readiness work
- beta hardening

## Prioritization matrix

### Must happen before public beta

- auth
- persistence
- trade state reliability
- support path
- privacy and deletion basics
- merchant operations basics

### Should happen before public launch

- real wallet integration
- one real anchor path
- crash reporting
- fraud controls
- accessibility pass

### Can wait until after core beta

- CETES production
- Blend production
- multiple anchors
- advanced protocol-agent handoff

## Anti-patterns to avoid

- shipping more simulated financial modules instead of stabilizing one real flow
- mixing strategic vision with sprint scope
- opening too many integrations in parallel
- over-optimizing visuals before trust and support are solid
- treating store submission as a packaging step instead of a product requirement
