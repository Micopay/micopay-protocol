# Implementation Plan: Demo Mode

## Overview

Implement the demo mode feature flag, seed script, API routes, and frontend components in TypeScript. Each task builds incrementally toward a fully wired feature with zero demo behaviour leaking into production.

## Tasks

- [x] 1. Extend config module with demoMode flag
  - Add `demoMode` boolean to `apps/api/src/config.ts` derived from `DEMO_MODE` env var
  - Force `demoMode=false` when `NODE_ENV=production` and log a warning if `DEMO_MODE=true` is detected
  - Add `DEMO_MODE=false` with production warning comment to root `.env.example` and `apps/api/.env.example`
  - Export a pure `deriveDemoMode(demoModeEnv, nodeEnv)` helper function to enable property testing
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.1_

  - [x]\* 1.1 Write property test for demoMode derivation
    - **Property 1: demoMode is true iff DEMO_MODE==="true" and NODE_ENV!=="production"**
    - Use `fast-check` with `fc.string()` arbitraries for both env values, 100 runs minimum
    - Tag: `// Feature: demo-mode, Property 1: demoMode is true iff DEMO_MODE==="true" and NODE_ENV!=="production"`
    - **Validates: Requirements 1.1, 1.2, 9.1**

  - [x]\* 1.2 Write unit tests for config demoMode
    - Test `demoMode=false` when `DEMO_MODE` is absent
    - Test `demoMode=false` when `NODE_ENV=production` even if `DEMO_MODE=true`, and that warning is logged
    - _Requirements: 1.1, 1.2, 9.1_

- [x] 2. Implement demo seed function
  - Add exported `seedDemoData()` function to `apps/api/src/scripts/seed.ts`
  - Upsert demo user (`demo_reviewer`) with fixed stellar address and bcrypt-hashed password using `INSERT ... ON CONFLICT DO UPDATE`
  - Upsert demo merchant with `id = 'MERCH_DEMO_001'`
  - Upsert four demo trades with fixed UUIDs covering states: `pending`, `locked`, `completed`, `cancelled`
  - Skip all operations and return early when `config.demoMode === false`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.1, 7.2, 7.3, 9.3_

  - [x]\* 2.1 Write property test for seed idempotence
    - **Property 2: calling seedDemoData() N times produces the same DB state**
    - Call `seedDemoData()` twice against a test DB, compare row counts and PKs for all demo records
    - Tag: `// Feature: demo-mode, Property 2: calling seedDemoData() N times produces the same DB state`
    - **Validates: Requirements 2.5**

  - [x]\* 2.2 Write unit tests for seed function
    - Test that demo user, merchant, and one trade per state exist after `seedDemoData()` with `demoMode=true`
    - Test that no demo records are written when `demoMode=false`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Implement demo API routes
  - Create or extend `apps/api/src/routes/demo.ts` with two new routes:
    - `GET /api/v1/demo/status` — public, no auth, reads `config.demoMode`, returns `{ demo_mode: boolean }`
    - `POST /auth/demo-login` — returns `404` when `demoMode=false`; when `demoMode=true`, issues a JWT signed with `config.jwtSecret` expiring in 24h for the demo user
  - Register both routes in the main Fastify app
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 9.2_

  - [x]\* 3.1 Write property test for demo-login 404 when demoMode=false
    - **Property 4: POST /auth/demo-login always returns 404 when demoMode=false**
    - Use `fast-check` with `fc.record({ email: fc.string(), password: fc.string() })` for arbitrary bodies, 100 runs minimum
    - Tag: `// Feature: demo-mode, Property 4: POST /auth/demo-login always 404 when demoMode=false`
    - **Validates: Requirements 3.2, 9.2**

  - [x]\* 3.2 Write unit tests for demo routes
    - Test `GET /api/v1/demo/status` returns `{ demo_mode: true }` when `demoMode=true`
    - Test `GET /api/v1/demo/status` returns `{ demo_mode: false }` when `demoMode=false`
    - Test `GET /api/v1/demo/status` returns `200` without an Authorization header
    - Test `POST /auth/demo-login` returns a JWT with `exp - iat <= 86400`
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Wire demo seed into API startup
  - In `apps/api/src/index.ts`, call `seedDemoData()` before the server starts accepting requests when `config.demoMode === true`
  - Propagate any seed errors to abort startup (consistent with existing seed failure behaviour)
  - _Requirements: 2.1, 9.3_

  - [ ]\* 5.1 Write property test for demo JWT accepted by authenticated routes
    - **Property 3: demo JWT is accepted by any authenticated route**
    - For each authenticated route in the route registry, inject a demo JWT and verify a non-401 response
    - Tag: `// Feature: demo-mode, Property 3: demo JWT is accepted by any authenticated route`
    - **Validates: Requirements 3.3**

- [x] 6. Implement useDemoStatus hook
  - Create `apps/web/src/hooks/useDemoStatus.ts` that fetches `GET /api/v1/demo/status` once on mount
  - Return `{ isDemoMode: boolean, loading: boolean }`
  - Default to `isDemoMode=false` on network error or unexpected response shape (fail-safe)
  - _Requirements: 5.1_

- [x] 7. Implement DemoBanner component
  - Create `apps/web/src/components/DemoBanner.tsx`
  - Render a fixed-position amber/yellow bar at the very top of the viewport with a human-readable review-session message
  - Component is only rendered when `isDemoMode=true` (caller-controlled via prop)
  - Ensure the banner does not overlap navigation or content (use appropriate z-index and padding offset)
  - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [x]\* 7.1 Write unit tests for DemoBanner
    - Test that `DemoBanner` renders the expected review-session message
    - _Requirements: 5.3_

- [x] 8. Integrate DemoBanner and useDemoStatus into App
  - In `apps/web/src/App.tsx`, call `useDemoStatus()` and render `<DemoBanner />` above all other content when `isDemoMode=true`
  - _Requirements: 5.2, 5.5_

  - [x]\* 8.1 Write property test for DemoBanner presence on every page
    - **Property 5: DemoBanner present on every page when isDemoMode=true**
    - For each page component, render with `isDemoMode=true` and assert `DemoBanner` is in the tree; render with `isDemoMode=false` and assert it is absent
    - Tag: `// Feature: demo-mode, Property 5: DemoBanner present on every page when isDemoMode=true`
    - **Validates: Requirements 5.2, 5.5**

- [x] 9. Implement login screen credential prefill
  - Pass `isDemoMode` to the login page component in `apps/web/src/pages/`
  - When `isDemoMode=true`, pre-populate credential fields with demo account values and show a visible review-purposes label
  - When `isDemoMode=false`, leave fields empty and hide the label
  - _Requirements: 6.1, 6.2, 6.3_

  - [x]\* 9.1 Write unit tests for login credential prefill
    - Test login renders with pre-filled credentials when `isDemoMode=true`
    - Test login renders with empty fields when `isDemoMode=false`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 10. Checkpoint — Ensure all frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Create Reviewer Guide
  - Create `docs/REVIEWER_GUIDE.md` documenting demo credentials (email, password, Stellar address), the ordered click path through every screen, expected outcomes per action, and the `DEMO_MODE=true` / `DEMO_MODE=false` build instructions
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` on both backend and frontend
- The `deriveDemoMode` helper (task 1) must be a pure function to make property testing straightforward
- Demo trades use `locked` in the DB schema; the Reviewer Guide refers to this state as "funded/locked"
