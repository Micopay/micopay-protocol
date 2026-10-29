# Requirements Document

## Introduction

Demo Mode is a feature flag-gated capability that allows Apple and Google app store reviewers
to exercise the full MicoPay application flow without needing a real wallet, real credentials,
or any prior setup. When `DEMO_MODE=true`, the API boots with a deterministic seed account
(known email/password or Stellar keypair), a pre-seeded merchant, and pre-created trades in
every relevant state. A non-intrusive banner in the frontend signals to the reviewer that they
are in demo mode. A `REVIEWER_GUIDE.md` in `docs/` documents the exact click-by-click path.

This feature maps to RETAIL_ROADMAP Phase 5 (reviewer demo account / demo mode planning).

---

## Glossary

- **Demo_Mode**: The application state activated when the `DEMO_MODE` environment variable is
  set to `"true"`. All demo-specific behaviour is gated behind this flag.
- **Demo_Account**: A seeded user account with fixed, publicly documented credentials used
  exclusively for app store review sessions.
- **Demo_Seed**: The idempotent database seed script that creates the Demo_Account, demo
  merchant, and demo trades whenever `DEMO_MODE=true` is detected at startup.
- **Demo_Banner**: A persistent, non-intrusive UI element rendered at the top of every page
  when the frontend detects that the API is running in Demo_Mode.
- **Trade_State**: One of the discrete lifecycle states a trade can occupy: `pending`,
  `funded`, `completed`, `cancelled`, `disputed`.
- **Reviewer_Guide**: The file `docs/REVIEWER_GUIDE.md` that documents the exact click path
  a reviewer will follow to exercise the application.
- **API**: The backend service located at `apps/api/src/`.
- **Web_App**: The frontend application located at `apps/web/src/`.
- **Config**: The configuration module at `apps/api/src/config.ts`.
- **Seed_Script**: The database seeding script at `apps/api/src/scripts/seed.ts`.

---

## Requirements

### Requirement 1: Feature Flag

**User Story:** As a platform operator, I want a single environment variable to enable or
disable demo mode, so that demo behaviour is completely absent in production.

#### Acceptance Criteria

1. THE Config SHALL expose a `demoMode` boolean field derived from the `DEMO_MODE`
   environment variable.
2. WHEN `DEMO_MODE` is absent or set to any value other than `"true"`, THE Config SHALL
   set `demoMode` to `false`.
3. THE `.env.example` file at the repository root SHALL include `DEMO_MODE=false` with a
   comment indicating it must never be set to `true` in production.
4. THE `apps/api/.env.example` file SHALL include `DEMO_MODE=false` with the same
   production warning comment.

---

### Requirement 2: Deterministic Demo Seed

**User Story:** As an app store reviewer, I want the app to always have a ready-to-use
account and data when demo mode is on, so that I can complete the review flow without
any manual setup.

#### Acceptance Criteria

1. WHEN `demoMode` is `true` and the API starts, THE Seed_Script SHALL create or update
   the Demo_Account with fixed, documented credentials before the server begins accepting
   requests.
2. THE Demo_Account SHALL have a fixed Stellar address and a fixed plaintext password
   (or pre-signed JWT) that is documented in the Reviewer_Guide.
3. WHEN `demoMode` is `true`, THE Seed_Script SHALL create or update at least one demo
   merchant record in the `merchants` table with a fixed merchant ID.
4. WHEN `demoMode` is `true`, THE Seed_Script SHALL create or update at least one trade
   record for each Trade_State (`pending`, `funded`, `completed`, `cancelled`) associated
   with the Demo_Account.
5. THE Seed_Script SHALL be idempotent: running it multiple times SHALL produce the same
   database state without duplicating records or raising errors.
6. IF `demoMode` is `false`, THEN THE Seed_Script SHALL skip all demo-specific seed
   operations and leave non-demo data unchanged.

---

### Requirement 3: Demo Login Endpoint

**User Story:** As an app store reviewer, I want to log in with known credentials without
connecting a real wallet, so that I can reach the authenticated screens immediately.

#### Acceptance Criteria

1. WHEN `demoMode` is `true` and a request is received at `POST /auth/demo-login`,
   THE API SHALL return a valid JWT for the Demo_Account without requiring a Stellar
   signature challenge.
2. WHEN `demoMode` is `false` and a request is received at `POST /auth/demo-login`,
   THE API SHALL return HTTP 404.
3. THE JWT issued by `POST /auth/demo-login` SHALL be accepted by all authenticated
   API routes that accept standard JWTs.
4. THE JWT issued by `POST /auth/demo-login` SHALL expire no later than 24 hours after
   issuance.

---

### Requirement 4: Demo Mode Detection Endpoint

**User Story:** As the Web_App, I want to query whether the API is running in demo mode,
so that I can conditionally render the Demo_Banner and pre-fill demo credentials.

#### Acceptance Criteria

1. THE API SHALL expose `GET /api/v1/demo/status` that returns a JSON object containing
   a boolean field `demo_mode`.
2. WHEN `demoMode` is `true`, THE API SHALL return `{ "demo_mode": true }` from
   `GET /api/v1/demo/status`.
3. WHEN `demoMode` is `false`, THE API SHALL return `{ "demo_mode": false }` from
   `GET /api/v1/demo/status`.
4. THE `GET /api/v1/demo/status` endpoint SHALL be accessible without authentication.

---

### Requirement 5: Demo Banner Component

**User Story:** As an app store reviewer, I want a visible indicator that I am in demo
mode, so that I understand the context of what I am seeing.

#### Acceptance Criteria

1. WHEN the Web_App starts, THE Web_App SHALL call `GET /api/v1/demo/status` to determine
   whether Demo_Mode is active.
2. WHILE `demo_mode` is `true`, THE Demo_Banner SHALL be rendered at the top of every
   page in the Web_App above all other content.
3. THE Demo_Banner SHALL display a human-readable message identifying the session as a
   demo or review session.
4. THE Demo_Banner SHALL not obstruct or overlap primary navigation or content elements.
5. WHILE `demo_mode` is `false`, THE Web_App SHALL not render the Demo_Banner.

---

### Requirement 6: Pre-filled Demo Credentials on Login Screen

**User Story:** As an app store reviewer, I want the login screen to pre-fill demo
credentials when demo mode is active, so that I do not need to type or copy credentials
manually.

#### Acceptance Criteria

1. WHILE `demo_mode` is `true`, THE Web_App login screen SHALL pre-populate the
   credential input fields with the Demo_Account credentials.
2. WHILE `demo_mode` is `true`, THE Web_App login screen SHALL display a visible label
   indicating that the pre-filled credentials are for review purposes.
3. WHILE `demo_mode` is `false`, THE Web_App login screen SHALL not pre-populate any
   credential fields.

---

### Requirement 7: Reviewer Can Observe All Trade States

**User Story:** As an app store reviewer, I want to see trades in every lifecycle state
without creating them myself, so that I can verify the full trade UI without performing
real transactions.

#### Acceptance Criteria

1. WHEN the Demo_Account is authenticated and the trades list is requested, THE API SHALL
   return at least one trade record in each of the following states: `pending`, `funded`,
   `completed`, `cancelled`.
2. THE demo trade records SHALL be associated exclusively with the Demo_Account and the
   demo merchant seeded by the Demo_Seed.
3. THE demo trade records SHALL contain realistic field values (amounts, timestamps,
   counterparty addresses) that allow the Web_App to render each trade state screen
   without errors.

---

### Requirement 8: Reviewer Guide Documentation

**User Story:** As an app store reviewer, I want a step-by-step guide that tells me
exactly what to tap and what to expect, so that I can complete the review without
guessing.

#### Acceptance Criteria

1. THE repository SHALL contain a file at `docs/REVIEWER_GUIDE.md`.
2. THE Reviewer_Guide SHALL document the demo credentials (Stellar address or email and
   password) needed to log in.
3. THE Reviewer_Guide SHALL list every screen the reviewer is expected to visit, in order,
   with the action required on each screen.
4. THE Reviewer_Guide SHALL describe the expected outcome of each action so the reviewer
   can confirm the app is behaving correctly.
5. THE Reviewer_Guide SHALL include a section explaining that `DEMO_MODE=true` must be
   set on the review build and `DEMO_MODE=false` (or absent) on the production build.
6. WHEN the Demo_Seed or demo credentials change, THE Reviewer_Guide SHALL be updated in
   the same commit or pull request.

---

### Requirement 9: Production Safety

**User Story:** As a platform operator, I want to be certain that demo mode cannot
accidentally be enabled in production, so that real users are never exposed to seeded
demo data or bypassed authentication.

#### Acceptance Criteria

1. WHEN `NODE_ENV` is `"production"` and `DEMO_MODE` is `"true"`, THE API SHALL log a
   warning and set `demoMode` to `false`, ignoring the `DEMO_MODE` value.
2. THE `POST /auth/demo-login` endpoint SHALL return HTTP 404 whenever `demoMode` is
   `false`, regardless of other request parameters.
3. THE demo seed operations SHALL only execute when `demoMode` is explicitly `true`; no
   demo data SHALL be written during a normal production startup.
