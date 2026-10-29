<!-- Title: SAFE-1 · Make disputes an honest non-custodial support and reputation process -->
<!-- Suggested labels: wave:backend, wave:frontend, wave:trust, complexity: high -->
<!-- Suggested milestone: Wave 8: Backend Hardening -->

## Problem

The dispute surface exists but cannot deliver the outcomes it advertises. The route allows some
states that the service rejects; dispute creation inserts a row and then writes a `disputed`
trade status that the database CHECK does not allow; the retail APK has no dispute CTA; and both
admin fund outcomes call the contract's timeout-only `refund()` path.

The deployed escrow has no arbiter. `release()` requires escrow-buyer authorization and pays the
buyer. `refund()` is permissionless only after timeout and always pays the seller. An admin API
cannot truthfully promise a different allocation.

## Why it matters

Physical cash has no on-chain oracle. Presenting a support decision as a fund transfer creates a
false safety guarantee and can leave database status contradicting Stellar.

## Non-custodial invariant

A dispute is a support, evidence and reputation case. It does not pause or reassign on-chain
funds. Funds continue to follow buyer-authorized release or seller refund after timeout. Support
may record an outcome, pause/suspend an account and guide recovery, but the UI must state clearly
what happened on-chain.

Administrative custody or arbitration is not a product option. No backend, support or admin path
may claim authority that the non-custodial contract does not grant.

## In scope

- Represent support-case status separately from the canonical on-chain trade lifecycle; do not
  write an unsupported `trades.status = 'disputed'` value.
- Make allowed opening states consistent across route and service, including a documented rule
  for post-completion reports.
- Create/update the case and its audit record transactionally and idempotently.
- Replace `refund_buyer`/`release_seller` with support outcomes that do not claim funds moved.
- Remove admin calls that pretend to force an unavailable contract outcome.
- Add participant-only APK actions to open a case, attach permitted evidence, see its status and
  see the actual Stellar trade/refund state.
- Let support apply existing pause/suspension controls with an attributed, audited reason.
- Feed the final attributed outcome to the trust history consumed by `TRUST-1`.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/routes/trade-safety.ts:82-113` | participant route states and dispute creation contract |
| `micopay/backend/src/services/abuse.service.ts:386-464` | case validation, transactional creation and audit semantics |
| `micopay/backend/src/routes/admin.ts:96-126`, `micopay/backend/src/services/admin.service.ts:198-304` | truthful non-custodial support outcomes |

The automatic provider-pause target immediately after case creation
(`abuse.service.ts:465-476`) belongs to CASH-8. Coordinate the call boundary, but do not make
SAFE-1 infer a provider from `seller_id` or reintroduce a provider-specific reputation. Do not
add `disputed` to `init.sql:60-64`; CASH-5A owns the canonical state vocabulary, while SAFE-1
removes the invalid trade-status write from the dispute lifecycle.

## Out of scope

- A contract arbiter, multisig ruling or any custody/governance model.
- The optional buyer-signed pre-handoff `decline` discussed in `CASH-2`.
- Pretending the QR proves physical cash delivery.
- An off-chain reimbursement policy or insurance fund.

## Acceptance criteria

- [ ] Opening a permitted case cannot leave a partial dispute/trade-state write.
- [ ] The database and API no longer require an unsupported `disputed` trade status.
- [ ] Route, service and APK agree on when a case may be opened.
- [ ] Admin outcomes never report release/refund unless the corresponding on-chain transaction
      actually occurred and names its real recipient.
- [ ] No admin endpoint claims authority to reassign escrowed funds.
- [ ] Both participants can reach support from the active/completed trade and see truthful next
      steps, including timeout when applicable.
- [ ] Evidence access is participant/support-only and does not leak through public discovery.
- [ ] Tests cover partial-write rollback, duplicate requests, completed reports, both product
      flows and real-vs-database outcome reconciliation.

## Dependencies and prior work

Depends on `CASH-1` for flow-aware copy and `CASH-4` if the durable QR handoff event is included
as evidence. This corrects/finishes safety work related to closed issue #82 and the admin dispute
work merged through PR #333. The non-custodial rule is settled; only campaign eligibility still
requires review before rewarding the correction again.
