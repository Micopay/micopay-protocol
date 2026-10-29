<!-- Title: CASH-10 · Enforce and account general P2P KYC for both participants atomically -->
<!-- Suggested labels: grantfox:backend, complexity: high -->
<!-- Suggested milestone: none until campaign owner decides -->

## Problem

`createTrade` calls `assertKycTierSufficient` only for `buyer_id`. That omits the cash-out
client/seller even though general MicoPay KYC applies to every participant. The function also
increments monthly volume before both users are loaded and before the trade row exists. A later
failure leaves ghost volume. Its keyed mutex protects only one Node process, not concurrent
backend instances.

## Why it matters

Turning on `KYC_GATE_ENABLED` would enforce the wrong coverage in cash-out. Calling the current
gate twice would make accounting worse: the first participant could be charged volume even when
the second participant fails.

## In scope

- Evaluate the general Didit-backed tier for both seller and buyer in every P2P flow.
- Separate pure eligibility checks from volume mutation.
- Add a database-backed, idempotent volume ledger/reservation tied to `trade_id` and `user_id`.
- Atomically create the trade and reserve volume for both participants, or commit neither.
- Make concurrency safe across processes/instances using database constraints/locking, not only
  an in-memory mutex.
- Finalize counted volume on completed trades and reverse/release reservations for terminal
  non-completed trades, according to one documented lifecycle.
- Keep audit-only mode useful, but record only durable operations—never failed requests.

## Source ownership at `312e921`

| Range | This issue owns |
|---|---|
| `micopay/backend/src/services/trade.service.ts:162-242` | pure two-participant KYC decision plus atomic trade/volume reservation transaction |
| `micopay/backend/src/services/kyc-gate.service.ts:78-245` | split pure tier/cap decisions from writes; remove check-and-increment behavior |
| `micopay/sql/migrations/20260722140000_kyc_monthly_volume_cap.up.sql:1-14` plus one new ordered up/down migration | replace aggregate-only accounting with an idempotent trade/user reservation ledger and DB concurrency invariants |
| `micopay/backend/src/lib/keyedMutex.ts:1-26` | no generic rewrite; remove KYC accounting's reliance on this process-local mutex |
| new KYC volume-ledger service and tests | reserve/finalize/release lifecycle keyed by durable trade and participant IDs |

Prefer a database trigger or an isolated ledger lifecycle adapter for terminal trade states so
this issue does not take ownership of CASH-2 cancellation, CASH-4 completion, CASH-6 refund or
SAFE-1 dispute bodies. It must not route KYC through `provider_id`: both human participants are
checked regardless of product role. KYC-2 owns Etherfuse ramp orders. CASH-10 has no product-data
dependency on CASH-1, but it has a strict source-order dependency: land CASH-1 first, do not assign
them in parallel, and rebase CASH-10 before touching
`micopay/backend/src/services/trade.service.ts:162-242`.

## Out of scope

- Provider enrollment or `provider_id`; KYC applies to people, not provider role.
- Etherfuse-specific KYC or ramp accounting (`KYC-2`).
- Choosing legal thresholds; they remain config-driven and pending legal review.
- Didit UI routing (`KYC-1`).

## Acceptance criteria

- [ ] Seller and buyer both receive tier decisions and monthly-volume handling.
- [ ] If either participant fails, no trade and no volume mutation is committed for either.
- [ ] If trade insertion fails after checks, no volume is left behind.
- [ ] Retry of the same trade cannot count either participant twice.
- [ ] Concurrent requests across separate DB clients cannot jointly exceed an enforced cap.
- [ ] Cancelled/refunded/expired lifecycle handling is documented and tested.
- [ ] Audit entries correlate decisions and volume records with the trade/request ID.
- [ ] Tests cover deposit, cash-out, second-participant failure, rollback, retry and concurrency.

## Dependencies and prior work

Depends on `CASH-1` for source order only, not for its KYC product model. This is a corrective issue
for closed GrantFox issues #314 and #316. It must not receive `Stellar Wave` or `wave:*` labels
unless campaign owners explicitly authorize moving the correction to Drips.
