# SEC-08 — ZK Merkle Root Validation Non-Fatal: Fabricated Root Attack Window

**Severity:** 🟡 Medium  
**Status:** Fixed  
**Affected file:** `apps/api/src/routes/zk.ts` (lines 172–185 in the pre-fix version)  
**Reporter:** Security audit — Wave 6  

---

## Summary

The API's pre-flight Merkle root check for `reputation_v1` and `access_credential_v1`
circuits was wrapped in a non-fatal `try/catch`. When `fetchReputationRoot()` threw
(e.g., the Soroban RPC endpoint was unreachable), the error was silently swallowed and
the proof was forwarded to the contract without any root verification. An attacker who
could force or predict a brief RPC outage could exploit this window to submit a proof
built against an arbitrary, fabricated Merkle root.

---

## Reproduction Steps

1. Generate a valid UltraHonk proof for `reputation_v1` using an **arbitrary** Merkle
   root (not the one currently published on-chain).
2. Block or timeout the Soroban RPC endpoint (local firewall rule, DNS poisoning, or
   a transient outage).
3. Submit the verification request during the outage window.
4. Observe the API returning `verified: true` — the fabricated root was never checked.

---

## Does the Soroban contract have its own Merkle root guard?

**No.** After reviewing `contracts/zk-verifier/src/lib.rs`, neither `verify` nor
`verify_unique` compare `public_inputs[0]` against the on-chain `REP_ROOT` storage key.
The contract only:

- Looks up the circuit's verification key (`VK_MAP`).
- Runs cryptographic UltraHonk verification.
- Records the nullifier to prevent replay (`verify_unique` only).

The Merkle root cross-check exists **exclusively in the API layer**. Therefore the
non-fatal catch in the API directly corresponds to a security gap with no contract-level
backstop.

---

## Impact

| Scenario | Pre-fix | Post-fix |
|---|---|---|
| RPC up, root matches | ✅ Accepted | ✅ Accepted |
| RPC up, root mismatch | ❌ Rejected (400) | ❌ Rejected (400) |
| RPC down | ⚠️ **Silently accepted** | ❌ Rejected (503) |
| No root configured (`contractId` unset) | ✅ Accepted (no root to check) | ✅ Accepted (no root to check) |

An attacker exploiting the RPC-down window could forge reputation credentials,
bypass access gates, or inflate on-chain reputation without holding a valid
leaf in the actual Merkle tree.

---

## Root Cause

`fetchReputationRoot()` wrapped all RPC calls in a `try/catch` that returned `null`
on any error. The calling code in the route handler treated `null` as "root not
configured, skip check" — the same branch used for an intentionally unconfigured
contract. A transient network failure was indistinguishable from a deliberate
non-configuration.

The outer `try/catch` in the route handler was therefore never reached for
`fetchReputationRoot()` failures; it had a misleading comment:

```ts
} catch (err) {
  // Non-fatal if root unavailable — let contract decide  ← the contract does NOT decide
  fastify.log.warn({ err }, "Could not fetch on-chain root");
}
```

---

## Fix Applied

**`apps/api/src/routes/zk.ts`**

1. Removed the `try/catch` from `fetchReputationRoot()` so RPC failures propagate
   as thrown exceptions rather than silent `null` returns.

2. Changed the route handler's catch block from a non-fatal warning to a fatal
   **503 Service Unavailable** response:

```ts
} catch (err) {
  fastify.log.error({ err }, "Could not fetch on-chain root — rejecting request to prevent fabricated-root attack");
  return reply.status(503).send({
    error: "Cannot verify Merkle root: on-chain root unavailable. Try again later.",
  });
}
```

`fetchReputationRoot()` still returns `null` (non-throwing) when the contract ID is
not configured (`ZK_VERIFIER_CONTRACT_ID` unset) or when the contract itself signals
"root not set" via a simulation error — neither case indicates an attack window.

---

## Tests Added

`apps/api/src/__tests__/zk.test.ts` — three new test cases:

- **`returns 503 for reputation_v1 when RPC is unreachable (SEC-08 fatal guard)`**
- **`returns 503 for access_credential_v1 when RPC is unreachable (SEC-08 fatal guard)`**
- **`poseidon_preimage is unaffected by RPC failure (no Merkle root check)`**

---

## Recommendation: Contract-level Guard

For defence-in-depth, add a Merkle root check inside `verify` / `verify_unique` for
rooted circuits in `contracts/zk-verifier/src/lib.rs`:

```rust
// Inside verify() for reputation_v1 and access_credential_v1
let on_chain_root = env.storage().instance()
    .get(&ROOT_KEY)
    .ok_or(ZkError::ReputationRootNotSet)?;
// public_inputs[0..32] must equal on_chain_root
let proof_root = Bytes::from_slice(&env, &raw_inputs[0..32]);
if proof_root != on_chain_root {
    return Err(ZkError::VerificationFailed);
}
```

This would make the guard redundant at both layers and eliminate the dependency on
API-layer availability for this security property.
