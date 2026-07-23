# MicoPay Drips Team Guide

## Purpose

This guide explains how MicoPay should approach Drips Wave as a team.

The goal is not just to participate. The goal is to turn Drips into a force multiplier for the retail app roadmap.

## What Drips is good for

Drips Wave is best for:

- well-scoped issues
- short contribution cycles
- backlog acceleration
- bringing new contributors into a repo

Drips is not good for:

- vague strategy work
- architecture that changes daily
- secret or highly sensitive infrastructure work
- work that requires constant founder context

## MicoPay strategy for Drips

### Main idea

Use Drips to accelerate `MiCoPay app mobil`, not to split the team's focus across the whole monorepo.

### Recommended distribution

- 70% retail app work
- 20% retail backend and support tooling
- 10% docs, tests, DX, and contributor enablement

### Why

- the retail app is the most concrete path to product maturity
- it is easier to scope and review
- it creates visible progress for both users and judges
- it avoids overloading contributors with the full protocol context

## Repo strategy

Do not split the repo yet.

Keep the monorepo as the source of truth, but define a Wave contribution surface.

### In-scope paths for current Waves

- `micopay/frontend`
- `micopay/backend`
- selected shared docs

### Out-of-scope unless explicitly opened

- `apps/agent`
- `apps/api`
- `apps/web`
- `contracts`
- old prototypes and remix directories
- deployment secrets and operations internals

## Team roles during a Wave

### Product owner

Responsible for:

- deciding scope
- approving issue list
- resolving ambiguity quickly

### Maintainer lead

Responsible for:

- repo setup
- issue quality
- contributor assignment
- PR review coordination

### Reviewer group

Responsible for:

- code review within agreed SLA
- testing changes locally
- asking for focused revisions

### Integrator

Responsible for:

- checking merge order
- resolving integration conflicts
- keeping main stable

### Support owner

Responsible for:

- contributor questions
- issue clarifications
- escalation handling

In a small team, one person may play multiple roles. The responsibilities should still be explicit.

## Before the Wave opens

Complete this checklist first.

### 1. Repo clarity

- confirm the target repo is public and approved for the right Wave program
- ensure the README reflects current structure
- add or update contribution instructions
- define in-scope paths clearly

### 2. Local setup

- make sure contributors can run the target app surfaces
- document environment variables
- document known limitations
- state which flows are demo-only versus production-intent

### 3. Issue preparation

- prepare a backlog before the Wave starts
- avoid writing issues live under deadline pressure
- assign complexity honestly
- add acceptance criteria and out-of-scope notes

### 4. Review operations

- define review SLA
- define who assigns contributors
- define who merges
- define what to do if a good PR is blocked by unrelated dependency work

## Issue design rules

Every Drips issue should be:

- small enough to finish in the Wave
- valuable on its own
- reviewable without a full architecture rewrite
- linked to a specific folder or module

### Required parts of every issue

- problem statement
- why it matters
- in-scope files or directories
- out-of-scope boundaries
- acceptance criteria
- screenshots or mocks if UI-related
- test notes
- dependency notes

### Good issue examples

- add clear trade state labels and recovery UI in `micopay/frontend`
- build merchant profile card with trust signals
- implement account deletion endpoint and UI flow
- add audit log list view for support dashboard
- improve error handling and fallback messaging in API client

### Bad issue examples

- integrate all MicoPay systems
- improve security across the stack
- finish launch readiness
- add DeFi support

## Complexity rubric

Use complexity to match actual implementation weight.

### Trivial

Best for:

- copy fixes
- empty states
- small visual polish
- tiny tests
- docs cleanup

Avoid making these fake-large just to chase points.

### Medium

Best for:

- self-contained screens
- endpoint additions
- state handling improvements
- validation work
- moderate refactors

This should be the default category for most useful Wave work.

### High

Best for:

- meaningful integrations
- deep state machine work
- support tooling with backend and frontend slices
- security-sensitive but still reviewable modules

Use this sparingly and only when the issue is still realistically mergeable inside the Wave.

## Suggested issue tracks

### Track A: Core retail UX

- onboarding
- home
- merchant selection
- trade detail
- notifications
- history

### Track B: Trust and safety

- auth surfaces
- account deletion
- audit logging
- trade recovery states
- support affordances

### Track C: Merchant operations

- merchant profile
- availability
- limits
- trade inbox
- reputation display

### Track D: Contributor enablement

- docs
- test harnesses
- local setup cleanup
- design tokens
- component story examples if added later

## Review and merge policy

### Review SLA

Target:

- application response: same day
- first PR review: within 24 hours
- follow-up review: within 24 hours

The Wave is short. Slow review wastes good contributor energy.

### Review standard

Review for:

- correctness
- trust and UX impact
- regression risk
- scope discipline
- test evidence

Do not over-review style if the contribution solves the issue well and matches the codebase.

### Merge rule

If the contribution is high quality and the issue is effectively solved, merge quickly or mark it resolved per Wave rules if blocked by external timing.

## Risk controls

Do not expose these areas casually in early Waves:

- private keys or signing secrets
- deployment credentials
- production financial controls
- architecture that is still unsettled
- broad refactors across protocol and retail layers at once

## Communication rules for the team

During the Wave:

- keep a single source of truth for issue ownership
- answer contributor questions quickly
- do not change acceptance criteria after work starts unless necessary
- if scope changes, write it down in the issue
- close stale ambiguity fast

## Recommended operating cadence

### Pre-wave

- finalize issue list
- assign internal owners per issue track
- confirm repo and labels are ready

### Daily during wave

- review new applications
- assign contributors
- answer questions
- review PRs
- update internal board

### End of wave

- resolve merge queue
- mark completed issues properly
- leave contributor reviews
- capture lessons for the next cycle

## Labels to add

Recommended labels:

- `wave:retail`
- `wave:frontend`
- `wave:backend`
- `wave:merchant`
- `wave:trust`
- `wave:docs`
- `wave:good-first`
- `wave:blocked`
- `wave:needs-product`
- `research` — market/user validation issues with no code and no PR; they close on a structured, privacy-first answer (see Wave 6 §7 in `AUDIT_APK_WAVE6.md`). Create this label deliberately before opening those issues.

## MicoPay-specific policy for Drips

When there is doubt, prioritize issues that improve:

- trust
- trade completion
- merchant quality
- supportability
- store readiness

Deprioritize issues that mostly improve:

- speculative integrations
- protocol breadth without retail impact
- visual polish without product value

## Final rule

`If an issue cannot be explained clearly in ten minutes, it is probably not ready for Drips.`
