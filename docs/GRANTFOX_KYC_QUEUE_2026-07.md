# GrantFox KYC / Compliance Issue Queue (2026-07)

> Backlog derived from [`docs/KYC_COMPLIANCE_PLAN_2026-07.md`](./KYC_COMPLIANCE_PLAN_2026-07.md). This is where KYC/compliance GrantFox issues are drafted, tracked, and picked up for publishing — instead of designing each one ad hoc when the previous one merges.

**How to use this doc:** before publishing a new issue, check its `Depends on` line. If every dependency is already `Merged`, it's ready to publish (parallel or not). Update the `Status` field here when an issue is published, assigned, or merged — this doc is the source of truth for the dependency graph, GitHub/GrantFox labels are not.

**Before publishing any draft:** reconcile its table/column names (`kyc_events`, `users.kyc_level`, `kyc_provider`, `kyc_verified_at`, `compliance_alerts`) against what the dependency actually merged. The drafts use the compliance plan's proposed names, but #314's implementer isn't bound to them — publishing a draft that references columns that don't exist under those names would send a contributor chasing ghosts.

---

## Dependency graph

```
4a (published, #314)
 ├─→ 4b  (Didit provider integration)          — parallel-safe with 4c, 5a
 ├─→ 4c  (Monthly cumulative volume caps)      — parallel-safe with 4b, 5a
 └─→ 5a  (Compliance reporting engine)         — parallel-safe with 4b, 4c
       └─→ 5b (Automated screening/monitoring) — needs 5a's alert table
```

Rule of thumb used below: two issues are **parallel-safe** if neither reads/writes code, schema, or a contract the other one defines. They are **sequential** if one issue's acceptance criteria requires something the other issue creates.

---

## What this queue delivers (mapped to the compliance plan)

The compliance plan's sequence is **A (today, testnet) → B (mainnet gate) → C (before real volume)**, and mainnet must not launch without B working and the SPPLD registration underway. This queue is the engineering half of B and C:

| Plan milestone | Issues | What it unlocks when merged |
|---|---|---|
| **Option B — tiered KYC (the mainnet gate)** | 4a + 4b + 4c | Every user has a KYC level with a real verification path behind it (Didit for 1/2), and every operation (P2P, cash-in/out, CETES) is gated by level with config-driven limits — both per-operation (4a) and monthly cumulative (4c). This satisfies "identificación desde el primer peso" technically. Bonus from 4a: the dormant `phone_hash` anti-abuse controls come alive. |
| **Option C (engineering part) — PLD program** | 5a + 5b | Monthly SAT/UIF aggregation and zero-reports, a 24h-SLA alert pipeline, automated monitoring (structuring/velocity/geography + UIF/OFAC/PEP screening), and 10-year append-only retention — everything automatable of the obligated-subject duties. |

**End state when all five are merged:** the remaining blockers for a compliant mainnet launch are purely legal/organizational (dictamen, SPPLD registration, compliance officer — Fase 4 below), not engineering — plus the one coverage gap listed at the end of this doc (Level M), which depends on the dictamen anyway.

---

## Status

| ID | Title | Status | Depends on | Parallel-safe with |
|---|---|---|---|---|
| 4a | Tiered KYC Gate Engine + Audit Trail | **Published** — [#314](https://github.com/Micopay/micopay-protocol/issues/314), assigned to `samueloyibodevv`, no PR yet | — | — |
| 4b | KYC Provider Integration (Didit) | Draft, ready to publish once 4a merges | 4a | 4c, 5a |
| 4c | Monthly Cumulative Volume Caps | Draft, ready to publish once 4a merges | 4a | 4b, 5a |
| 5a | Compliance Reporting Engine (SAT/UIF) | Draft, ready to publish once 4a merges | 4a | 4b, 4c |
| 5b | Automated Screening & Monitoring (Art. 18 X) | Draft, blocked until 5a merges | 4a, 5a | — |

---

## 4a — Tiered KYC Gate Engine + Operation-Level Audit Trail

**Already published as [#314](https://github.com/Micopay/micopay-protocol/issues/314).** Don't republish — this entry exists only so the dependency graph above is complete. See the GitHub issue for the full body.

---

## 4b — KYC Provider Integration — Didit for Level 1/2 Verification

**Status:** draft, blocked until #314 is merged. **Depends on:** 4a. **Independent of:** 5a, 5b.

```markdown
## Context

Issue #314 ("[4a] Tiered KYC Gate Engine") builds the tier engine and audit trail but is explicitly provider-agnostic — it does not populate `kyc_level` beyond what config allows. Today there is no way for a user to actually reach Level 1 or Level 2: the gate exists, but nothing feeds it real identity verification.

MicoPay already integrates one hosted KYC flow (Etherfuse, `KYCScreen.tsx` → `startKYC` → browser → polling `getKYCStatus`), but it is scoped to the CETES/SPEI ramp only and tied to Etherfuse's own compliance obligation for their service — it does not, and should not, become the general-purpose identity check for P2P/cash-in/cash-out gated by #314's tier engine.

## What this issue proposes

Generalize the existing hosted-KYC pattern to a second, independent provider — **Didit** — used specifically to populate `kyc_level` 1/2 for the tiered gate from #314.

### Provider integration
- `POST /kyc/start?provider=didit` → Didit-hosted verification URL (same open-in-system-browser pattern as `KYCScreen.tsx`)
- Webhook endpoint validates Didit's signature, reads the verification result, and updates `users.kyc_level`, `kyc_provider`, `kyc_verified_at`
- Status polling endpoint mirrors the existing `getKYCStatus` shape so the frontend can reuse `KYCScreen`'s polling logic instead of building a new screen
- Tier expiry/renewal (#314's expiry logic) reuses this same start flow — an expired Level 1/2 user re-verifies through the same `POST /kyc/start`; no separate renewal endpoint

### Frontend
- Generalize `KYCScreen.tsx` to accept a `provider` prop (`etherfuse` | `didit`) instead of being hardcoded to the Etherfuse flow
- Trigger the Didit flow from the tier-gate error surfaced by #314's gate middleware (e.g., "this operation requires Level 1 — verify your identity")

**⚠️ Legal note:** the *mechanism* here (hosted redirect → webhook → status update) is provider plumbing and not legally sensitive on its own. What Didit is asked to collect/validate (INE + selfie liveness + CURP for Level 1, per the compliance plan's market-standard survey) still depends on the same legal dictamen referenced in #314 — do not hardcode a specific document/field checklist into the webhook contract; keep it provider-response-driven so requirements can change post-dictamen without a rewrite.

## Acceptance criteria

- [ ] `POST /kyc/start?provider=didit` returns a hosted onboarding URL from Didit's sandbox
- [ ] Webhook verifies Didit's signature and rejects unsigned/invalid callbacks
- [ ] Successful verification updates `users.kyc_level`, `kyc_provider`, `kyc_verified_at`
- [ ] `KYCScreen.tsx` works against either provider via a `provider` prop, with no duplicated polling logic
- [ ] Etherfuse's existing CETES-only KYC flow is untouched and unaffected by this change
- [ ] `DIDIT_API_KEY` is read from env, never committed, and the integration fails gracefully (like the existing `ETHERFUSE_NOT_CONFIGURED` pattern) when absent
- [ ] Unit tests for webhook signature verification (valid, invalid, replayed)
- [ ] Integration test for the full start → webhook → `kyc_level` update path against Didit's sandbox
- [ ] `tsc --noEmit` passes with no errors

## Out of scope

- The tier engine and audit trail itself (#314)
- Truora or Incode integration (later-stage/scale options — see `docs/KYC_COMPLIANCE_PLAN_2026-07.md`)
- Final Level 1/2 document/field requirements (pending legal dictamen)
- Etherfuse flow changes

## Testing

Unlike the Etherfuse ramp issues, **you do not need shared sandbox credentials for this one.** Didit's free tier (500 verifications/month) lets you create your own sandbox account and test the full start → webhook → status flow end to end.

## Related

- Depends on: #314 (tier engine must exist before this can populate real tiers)
- Compliance context: `docs/KYC_COMPLIANCE_PLAN_2026-07.md`, Fase 2 and provider comparison (§3)
- Existing pattern to generalize: `KYCScreen.tsx`, `startKYC`/`getKYCStatus` in `services/api.ts`
```

Suggested labels: `enhancement`, `backend`, `compliance`, `kyc`, `complexity: high`

---

## 4c — Monthly Cumulative Volume Caps per KYC Level

**Status:** draft, blocked until #314 is merged. **Depends on:** 4a. **Independent of:** 4b, 5a, 5b.

```markdown
## Context

Issue #314 ("[4a] Tiered KYC Gate Engine") gates each operation against the user's KYC level with per-operation limits. The compliance plan additionally requires **monthly cumulative ceilings** per level (e.g. Level 1: ~$3,000 MXN per operation but ~$10,000 MXN per month). Without cumulative caps, a user can stay under the per-operation limit while moving arbitrary volume by splitting it into many small operations — the exact structuring pattern (pitufeo) the monitoring layer is meant to *detect*; enforcing caps prevents most of it *before* detection is even needed.

## What this issue proposes

Extend #314's gate middleware with a monthly cumulative volume check per user, config-driven like everything else in the gate.

### Volume tracking
- Track per-user monthly operation volume — either a `user_monthly_volume` table maintained on each gated operation, or an on-the-fly aggregation over trades (implementer's choice)
- Whichever approach: the check-and-record step must be race-safe — two concurrent operations must not both pass a cap that only one of them fits under

### Gate extension
- After #314's tier check passes, verify `operation amount + current month's accumulated volume ≤ monthly ceiling` for the user's level
- Ceilings live in the same config schema #314 defines (per-level, UMA or MXN) — not hardcoded; same pending-legal-dictamen caveat as #314's thresholds
- Blocked operations return a clear error including the remaining monthly allowance and when it resets
- Cap-block decisions are recorded through #314's audit trail as gate decisions (no parallel logging path)

**⚠️ Legal note:** the example ceilings above come from the pre-reform tier proposal and are pending legal counsel review — that's precisely why they must be config values.

## Acceptance criteria

- [ ] Per-user monthly volume tracked or computed reliably; concurrent operations cannot jointly exceed the cap (race-safe)
- [ ] Gate blocks operations that would exceed the monthly ceiling for the user's level
- [ ] Block error includes remaining monthly allowance and reset date
- [ ] Ceilings are config-driven per level; adjusting them requires no code change
- [ ] Cap decisions appear in #314's audit trail with the standard gate-decision fields
- [ ] Unit tests: under cap, exactly at cap, over cap, month rollover, concurrent operations
- [ ] Integration test through a real gated operation path
- [ ] `tsc --noEmit` / backend build passes

## Out of scope

- Per-operation limits and the tier engine itself (#314)
- Monthly aggregation for SAT/UIF reporting (compliance-reporting issue — different output, keep the implementations independent)
- Structuring *detection* rules (automated-screening issue — this issue prevents, that one detects)

## Related

- Depends on: #314 (extends its gate middleware and config schema) — reconcile field/config names with what actually merged
- Independent of: the Didit provider-integration and compliance-reporting issues
- Compliance context: `docs/KYC_COMPLIANCE_PLAN_2026-07.md`, Fase 1 ("límite por operación + acumulado mensual") and the Option B tier table
```

Suggested labels: `enhancement`, `backend`, `compliance`, `kyc`, `complexity: medium`

---

## 5a — Compliance Reporting Engine — SAT/UIF Monthly Aggregation

**Status:** draft, blocked until #314 is merged. **Depends on:** 4a. **Independent of:** 4b.

```markdown
## Context

LFPIORPI post-reform requires monthly notices to SAT/UIF (day 17), including "zero reports" when nothing is reportable, plus a 24-hour alert window for unusual operations. None of this exists yet. Issue #314 ("[4a] Tiered KYC Gate Engine") gives us the raw material (`kyc_events`, tiered operation records) but nothing aggregates or reports on it.

## What this issue proposes

Build the periodic aggregation and reporting layer on top of #314's audit trail, decoupled from *how* a user got their tier (Etherfuse, Didit, or any future provider — see the Didit integration issue).

### Monthly aggregation & SAT filing
- Scheduled job (day 17 monthly) aggregates operations ≥ 210 UMA per user from `kyc_events`/trade records
- Generates the SAT-required output format for reportable operations
- Generates a "zero report" automatically when nothing is reportable that period (actual submission stays manual — see Out of scope)
- Threshold (210 UMA) read from the same config #314 established — not hardcoded

### Unusual-operation alerting
- Provides a `compliance_alerts` table and a query/admin endpoint that exposes each entry's 24-hour SLA deadline (an admin UI is out of scope — this issue is backend-only)
- Any source (a rule engine, manual review, or #314's own gate `block`/`downgrade` decisions) can insert into this table — this issue owns the alert *pipeline*, not the detection rules themselves
- Detection rules (structuring/velocity/geography) are a separate, later issue that writes into this table

### Audit retention
- `kyc_events` (and any new reporting tables) enforce no-delete / no-update at the DB layer (append-only already required by #314) and are covered by encrypted backups
- Document the 10-year retention requirement in the migration/README so it isn't accidentally shortened by a future cleanup job

## Acceptance criteria

- [ ] Monthly job aggregates ≥210-UMA operations per user, config-driven threshold
- [ ] SAT report output generated in the required format; zero-report path when nothing reportable
- [ ] `compliance_alerts` table exists with a documented insert contract; each entry's 24h SLA deadline is exposed by the query endpoint
- [ ] Query/admin endpoint to review pending and past filings/alerts
- [ ] No new mutation path allows editing/deleting past `kyc_events`, report, or alert records
- [ ] Retention policy documented (10 years, encrypted at rest)
- [ ] Unit tests for aggregation logic (reportable, zero-report, threshold edge cases)
- [ ] Integration test for the scheduled job end to end
- [ ] `tsc --noEmit` / backend build passes

## Out of scope

- Anomaly/structuring detection rules themselves (future issue: automated screening)
- Actual SAT/UIF submission channel (manual filing by a compliance officer is fine for v1 — this issue produces the file/report, not the submission)
- OFAC/PEP list screening (future issue: automated screening)

## Related

- Depends on: #314 (needs `kyc_events` / tier-gated operation records to aggregate)
- Independent of: the Didit provider-integration issue — this issue doesn't care which provider verified the user, only their tier and operations
- The automated-screening issue depends on this one (it writes into `compliance_alerts`)
- Compliance context: `docs/KYC_COMPLIANCE_PLAN_2026-07.md`, Fase 3 / Option C items 3 and 5
```

Suggested labels: `enhancement`, `backend`, `compliance`, `complexity: high`

---

## 5b — Automated Screening & Anomaly Monitoring (Art. 18 X)

**Status:** draft, blocked until 5a is merged (writes into 5a's `compliance_alerts` table). **Depends on:** 4a, 5a. **Do not publish before 5a merges.**

```markdown
## Context

LFPIORPI's Art. 18 X requires automated monitoring for unusual operations (structuring/pitufeo under threshold, velocity, geography) and list screening (UIF, OFAC, PEPs) at onboarding and on a recurring basis. Neither exists today.

## What this issue proposes

A rules-based screening service that runs at two points: once at onboarding (when a user reaches a new `kyc_level`, from #314 or the Didit integration) and on a recurring batch job over existing users/operations. Matches are written into the `compliance_alerts` table from the compliance-reporting issue — this issue does not build its own alert pipeline.

### Rule engine
- Config-driven rules: amount-structuring (multiple sub-threshold operations in a window), velocity (operations/time), geography (if available)
- Runs against the operation stream #314's gate middleware already produces — does not need to know which KYC provider was used
- Matches insert into `compliance_alerts` using the contract the reporting-engine issue defines

### List screening
- Onboarding hook: when a user's `kyc_level` changes, screen identity data against UIF/OFAC/PEP lists
- Recurring batch: re-screen existing verified users on a schedule (lists change)
- Config-driven list source(s); starts with whatever free/low-cost list source is viable pre-dictamen, swappable later

## Acceptance criteria

- [ ] Structuring/velocity/geography rules are config-driven, not hardcoded
- [ ] Rule matches insert into `compliance_alerts` using the existing contract (no second alert table/pipeline)
- [ ] Onboarding screening triggers on `kyc_level` change events, independent of which provider caused it
- [ ] Recurring batch re-screening job exists and is scheduled
- [ ] Screening results (hit/no-hit) are logged to the audit trail, not silently dropped
- [ ] Unit tests for each rule type (structuring, velocity, geography) with known trigger/non-trigger cases
- [ ] Integration test for the onboarding hook and the batch job
- [ ] `tsc --noEmit` / backend build passes

## Out of scope

- The alert/filing pipeline itself (already built by the compliance-reporting issue)
- Choice of a paid/enterprise list-screening vendor (config-driven so it can be swapped; picking one is a product/legal decision, not this issue's scope)
- KYC provider integration (Didit issue)

## Related

- Depends on: #314 (tier-change events, operation stream) and the compliance-reporting issue (the `compliance_alerts` table this issue writes into) — **do not start until both are merged**
- Independent of: the Didit provider-integration issue — hooks into #314's generic tier-change event, not into any provider-specific webhook
- Compliance context: `docs/KYC_COMPLIANCE_PLAN_2026-07.md`, Fase 3 / Option C item 4
```

Suggested labels: `enhancement`, `backend`, `compliance`, `complexity: high`

---

## Known coverage gaps (in the plan, not yet in any issue)

- **Level M (Merchant/Agente) — KYB.** The plan's tier table includes a merchant tier (KYB for personas morales, beneficiario controlador at 25%, business address). #314 only defines Levels 0/1/2. Deliberately unscheduled: it depends on the legal dictamen (who is the obligated subject) more than any other tier. Add it to this queue as a new entry once the dictamen lands.

(Monthly cumulative caps were originally a gap here — resolved by promoting them to issue **4c** above rather than expanding #314's already-assigned scope.)

---

## Not GrantFox issues (Fase 4 — legal/societario)

These are organizational/legal action items from the compliance plan, not engineering work — they don't become GrantFox issues, but they're the real blocker behind the "pending legal counsel" notes in 4a/4b/4c/5a/5b:

- Legal dictamen from a Mexican fintech law firm (the "paso 0" every option in the compliance plan depends on)
- SPPLD registration (requires company RFC + e.firma)
- Compliance officer (outsourced or hired)

Owner: Eric/Jose directly. Tracked outside GrantFox. Until the dictamen lands, treat every threshold/requirement in the issues above as provisional and config-driven — which is why each one already says so.
