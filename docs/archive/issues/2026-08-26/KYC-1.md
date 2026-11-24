<!-- Title: KYC-1 · Make general Didit KYC usable in the retail APK without conflating Etherfuse -->
<!-- Suggested labels: grantfox:backend, grantfox:frontend, complexity: high -->
<!-- Suggested milestone: none until campaign owner decides -->

## Problem

The backend has Didit start/status/webhook plumbing and `KYCScreen` accepts a provider prop, but
the APK exposes only `/kyc`, renders the default Etherfuse provider and returns approval to CETES.
No P2P tier-gate error or Red MicoPay onboarding path can open Didit. The Didit client/webhook code
also states that it was not verified against a live Didit sandbox. The current screen trusts a
locally cached `approved` value before checking the backend, while the webhook updates a user from
returned `vendor_data` without binding that decision to the stored session row.

## Why it matters

MicoPay has two separate identity checks:

- Didit: general MicoPay KYC for P2P users/providers;
- Etherfuse: additional anchor onboarding for CETES/SPEI.

The plumbing exists, but general KYC is not a complete user journey and the current generic route
can send the user to the wrong provider/product.

## In scope

- Validate the Didit session request, response and webhook signature contract against a maintainer
  sandbox; fix discrepancies without committing credentials or personal data.
- Add explicit app routes/purposes for general MicoPay KYC and Etherfuse KYC. The general route
  must pass `provider="didit"`; the anchor route must pass `provider="etherfuse"`.
- Use an allowlisted return destination so approval resumes the action that required KYC; never
  accept an arbitrary external redirect.
- Treat backend status as authoritative. A local cache may improve loading UX but must not call
  `onApproved` or unlock navigation until the current server status confirms approval.
- Resolve the signed webhook's `session_id` to the stored `kyc_didit_sessions` row and take
  `user_id`/`requested_level` from that row. Reject or safely ignore unknown, mismatched or
  invalid-transition decisions instead of trusting returned `vendor_data` for the user update.
- Define idempotent and monotonic tier behavior so duplicate deliveries cannot refresh expiry and
  a later lower-level approval cannot accidentally downgrade a higher valid tier. Document any
  provider-supported review/appeal transition explicitly.
- Log only identifiers/status needed for audit; never log the complete KYC webhook body or PII.
- Surface `kyc_level`, `kyc_provider` and expiry/status in the typed current-user response.
- Give tier-gate errors a clear “Verify identity” action into the Didit route.
- Preserve per-provider secure-storage keys and independent status.
- Document the maintainer-only live sandbox verification result.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/services/didit.service.ts:1-77` | verified Didit hosted-session contract and privacy-safe response handling |
| `micopay/backend/src/routes/kyc.ts:24-43`, `:92-128`, `:153-167`, `:169-245` | Didit start/status, stored-session webhook binding, monotonic transitions and safe logging |
| `micopay/backend/src/lib/webhook-auth.ts:45-91` | Didit signature verification only, validated against the maintainer sandbox contract |
| `micopay/sql/migrations/20260722130000_didit_kyc_provider.up.sql:1-28` plus corrective up/down migration if needed | provider-separated session/status invariants |
| `micopay/backend/src/routes/users.ts:108-157` | typed, server-authoritative general-KYC fields in `GET /users/me` |
| `micopay/frontend/src/services/api.ts:19-53`, `:57-71` | provider-specific KYC calls and current-user KYC types |
| `micopay/frontend/src/pages/KYCScreen.tsx:1-220` | server-authoritative polling/cache behavior and provider-specific return purpose |
| `micopay/frontend/src/App.tsx:561-590`, `:1107-1108` | explicit Didit and Etherfuse routes with allowlisted return destinations |

Do not edit threshold/accounting logic in `kyc-gate.service.ts` (CASH-10/KYC-2), provider
enrollment UI (RED-2), or Etherfuse ramp order lifecycle (KYC-2). Sandbox credentials and KYC
payloads never enter the repository or issue attachments.

## Out of scope

- Turning provisional thresholds into legal rules or enabling the production gate.
- Provider enrollment UI (`RED-2`).
- P2P volume/participant correctness (`CASH-10`).
- Treating Etherfuse approval as general KYC or vice versa.

## Acceptance criteria

- [ ] A P2P-required verification opens Didit and returns to the original allowlisted app action.
- [ ] CETES/SPEI-required verification opens Etherfuse and preserves the existing CETES return.
- [ ] Didit and Etherfuse cached/status data cannot overwrite each other.
- [ ] A stale local `approved` cache cannot navigate as verified after backend expiry/revocation.
- [ ] An approved callback updates only the user and level bound to its stored session; unknown,
      mismatched and replayed callbacks cannot mutate another/current tier incorrectly.
- [ ] No KYC document, biometric field or complete provider payload is written to application logs.
- [ ] Current-user types expose real general KYC fields; no `verification_status` cast is used.
- [ ] Invalid/unconfigured provider and webhook-signature failures are user-safe and fail closed.
- [ ] Mocked start/poll/webhook tests pass for both providers.
- [ ] A maintainer records a privacy-safe live Didit sandbox checklist/result before merge.
- [ ] Frontend/backend typecheck and builds pass.

## Dependencies and prior work

Depends on `CASH-7` only for the single-session route adapter. Issues #314 and #315 are closed.
#315 explicitly required triggering Didit from the tier-gate
error and a sandbox integration test; the merged commit added provider plumbing but no APK route
and records that the live sandbox was not verified. Preserve #355's Etherfuse-to-CETES navigation.
This is a GrantFox correction and must not receive Drips labels by default.
