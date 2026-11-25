# MicoPay Product Scope

## Purpose

This document aligns the team around the product we are actually building in the next phase.

The repo contains two connected projects:

- `MiCoPay app mobil`: retail product for real users and real merchants
- `MiCoPay protocol`: agent-facing infrastructure and programmable access layer

For the next execution cycle and for Drips, the primary focus is:

`Build a trustworthy retail cash-in / cash-out product on Stellar that can become a real mobile app.`

The protocol remains strategically important, but it is not the main delivery surface for this phase.

## Product thesis

MicoPay should feel simple to the user:

- open app
- authenticate safely
- connect or fund wallet
- request cash-in or cash-out
- get matched with a nearby merchant
- complete the trade with clear status and protection
- see confirmation, history, and support

The user should not need to understand HTLCs, path payments, anchors, or DeFi mechanics.

## Core user promise

MicoPay helps people move between digital money and physical cash in Mexico through a trusted merchant network on Stellar.

## Primary users

### Retail user

Needs:

- access to cash without traditional banking friction
- clear status of funds
- confidence that the merchant is real
- help when something goes wrong

### Merchant / liquidity provider

Needs:

- safe and predictable trade flow
- clear availability and limits
- easy confirmation and settlement
- reputation and repeat demand

### Support / operations team

Needs:

- visibility into trade states
- access to audit data
- ability to resolve incidents
- fraud signals and manual controls

## What is in scope now

### P0 product scope

- mobile-ready retail experience
- onboarding and authentication
- wallet connection strategy
- merchant onboarding and availability
- trade lifecycle
- QR / claim flow
- clear transaction states
- notifications
- history and receipts
- support and dispute entry points
- backend hardening
- App Store / Google Play readiness basics

### P1 product scope

- one real wallet integration
- one real anchor or ramp integration
- merchant reputation system improvements
- support dashboard
- fraud controls
- geolocation and live matching improvements

### P2 product scope

- Etherfuse CETES as a production feature
- Blend DeFi as a production feature
- multi-anchor strategy
- deeper protocol-to-app integration
- agent-assisted retail flows

## What is explicitly out of scope for the current focus

These can exist in the repo, but they should not drive weekly prioritization:

- making the protocol the main public product for this cycle
- cross-chain relayer as the primary delivery goal
- trying to ship all DeFi modules before the retail flow is real
- supporting multiple wallets and multiple anchors at once
- building a broad financial super app before the core trade flow is stable

## Product north star

`A first-time user can complete a safe cash-in or cash-out trade with confidence, without needing crypto expertise.`

## Success criteria for this phase

The phase is successful when the team can demonstrate:

- a real mobile app path, not only a Vite demo
- real user auth flow
- persistent backend and reliable trade states
- one complete happy path for cash-in or cash-out
- clear failure, timeout, cancel, and refund behavior
- merchant visibility and trust signals
- beta-ready quality for private testing

## Decision rules

When there is doubt about priority, use these rules:

1. Trust beats feature count.
2. Trade completion beats exploration features.
3. Operational clarity beats visual novelty.
4. One real integration beats three simulated integrations.
5. Store readiness beats demo-only polish.
