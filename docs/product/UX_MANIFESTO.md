# MicoPay UX Manifesto

## Why this exists

MicoPay is not a generic fintech app.

It combines:

- money
- local physical coordination
- crypto rails
- trust between strangers
- operational risk

That means UX is not decoration. UX is risk management, confidence design, and behavior design.

## Product design belief

`The app should make complex money movement feel understandable, safe, and human.`

## The seven principles

### 1. Trust before speed

We do not optimize for the fastest possible click path if it creates doubt.

Design implications:

- show merchant identity and trust signals before commitment
- explain important actions before confirmation
- avoid ambiguous labels
- use visual hierarchy to show what is safe, pending, and irreversible

### 2. The user always knows where their money is

Financial anxiety grows when status is unclear.

Design implications:

- every trade must show a current state
- states must be human-readable
- users must know what comes next
- timeouts, delays, and refunds must be visible

### 3. Complexity stays in the system, not in the user's head

HTLCs, path payments, anchors, signatures, and chain logic belong in the backend and advanced details, not in the core user journey.

Design implications:

- explain value in plain language
- hide advanced mechanics unless needed for support or trust
- prefer recognizable terms over protocol terminology

### 4. Confidence is built progressively

Users should not be asked to trust the whole system at once.

Design implications:

- start with clear value and safety language
- add trust evidence step by step
- show social proof, merchant verification, and transaction history at the right moments

### 5. Important actions deserve meaningful friction

Not every tap should feel the same.

Design implications:

- use confirmation for high-risk and irreversible actions
- do not add friction to low-risk browsing and reading
- the UI must clearly distinguish safe actions from commit actions

### 6. Every flow needs recovery

A financial product is only as good as its failure behavior.

Design implications:

- every trade should support cancel, timeout, retry, or help
- error states must explain what happened and what is safe
- support should be accessible from risky moments, not buried in settings

### 7. Modern means clear, calm, and credible

Modern is not loud gradients and empty polish. Modern is confidence, responsiveness, and coherence.

Design implications:

- clean hierarchy
- strong typography
- controlled motion
- restrained use of color
- premium but trustworthy aesthetic

## Psychology principles we are intentionally using

### Loss aversion

Users fear losing money more than they value upside.

What we do:

- emphasize protection and fallback
- explain when funds are locked, released, or refunded
- avoid hidden fees or surprises

### Uncertainty reduction

Ambiguity increases abandonment.

What we do:

- show time estimates
- show current step and next step
- explain delays and fallback paths

### Recognition over recall

Users should not need to remember important details.

What we do:

- keep trade details visible
- show addresses, amounts, merchant names, and expiration where needed
- avoid forcing users to remember codes or instructions

### Social proof

Users trust verified humans and repeated successful behavior.

What we do:

- show merchant rating, completion rate, trade count, and verification status
- use supportable trust badges, not decorative badges

### Peak-end rule

People remember the highest-anxiety moment and the ending.

What we do:

- make confirmation moments calm and explicit
- make success and resolution states feel complete and trustworthy

## UX standards by product area

## Home

Home should answer three questions immediately:

- how much money do I have access to
- what can I do now
- what is the status of my recent activity

Rules:

- one or two primary actions only
- balance and recent activity above exploration
- no crowded dashboard

## Onboarding

Onboarding must reduce fear, not just collect data.

Rules:

- explain why data is requested
- ask only for what unlocks the next step
- avoid technical wallet language until needed

## Merchant selection

Merchant choice is a trust moment.

Rules:

- show who the merchant is
- show distance, limits, price or spread, hours, and trust signals
- avoid list items that look identical

## Trade detail

Trade detail is the center of user confidence.

Rules:

- show current state clearly
- show amount, merchant, location, timeout, and next action
- make help visible

## QR / claim screen

This screen is a high-stakes handoff.

Rules:

- remove distractions
- show one instruction at a time
- make expiration visible
- clearly show what to do after the merchant interaction

## Errors and support

Errors must preserve trust.

Rules:

- say what happened
- say whether funds are safe
- say what the user can do next
- never leave the user in a generic "processing" state without context

## Tone guide

The product voice should feel:

- calm
- competent
- direct
- reassuring

It should not feel:

- hype-driven
- over-technical
- defensive
- vague

## Design review checklist

Before shipping a screen, ask:

1. Does the user understand what this screen is for?
2. Does the user know where their money is?
3. Is the next action obvious?
4. Does the screen reduce or increase anxiety?
5. Is recovery visible if something goes wrong?
6. Does this look credible enough for a money product?

## Final UX rule

`If a feature is impressive but creates confusion at a moment of financial trust, it is bad UX for MicoPay.`
