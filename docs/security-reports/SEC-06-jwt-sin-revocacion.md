# SEC-06 — Server-side JWT Revocation

**Issue:** #213  
**Severity:** High  
**Status:** Resolved — 2026-06-29  
**Affected service:** `micopay/backend`

---

## Root Cause

JWTs issued by `POST /auth/token` were signed with a 24-hour expiry but had no server-side revocation mechanism. After a user called a logout endpoint (which did not exist), the token remained valid for its full lifetime. An attacker who obtained a token — through session hijacking, device theft, or a leaked log — could continue to make authenticated requests until the token expired naturally.

The auth middleware (`auth.middleware.ts`) only called `request.jwtVerify()`, which validates the cryptographic signature and expiry but has no visibility into whether the user intended to end the session.

---

## Revocation Strategy

**JTI (JWT ID) blacklist** — simplest approach that fits the existing architecture without adding a new dependency.

Each issued token now carries a `jti` claim (a `randomUUID()`). When the user logs out, the JTI is recorded in a blacklist. The auth middleware checks the blacklist on every request _after_ the signature is verified.

The blacklist is implemented in two layers:

| Layer | Purpose |
|---|---|
| **In-memory `Map<jti, expiresMs>`** | Fast O(1) lookup on hot path. Pruned of expired entries on each check to prevent unbounded growth. |
| **PostgreSQL `revoked_tokens` table** | Durable. Survives process restarts. Consulted on a cache miss. |

Tokens without a `jti` claim (tokens issued before this change) pass the revocation check unchanged — they are legacy tokens and will expire naturally.

---

## Logout Flow

```
Client                     Backend
  │                           │
  ├── POST /auth/logout ──────►│
  │   Authorization: Bearer   │
  │                           ├─ jwtVerify() — validates signature + expiry
  │                           ├─ isRevoked(jti) — skips (not revoked yet)
  │                           ├─ revokeToken(jti, userId, expiresAt)
  │                           │    ├─ memBlacklist.set(jti, expiresMs)
  │                           │    └─ INSERT INTO revoked_tokens … ON CONFLICT DO NOTHING
  │◄── 200 { message: "…" } ──┤
  │                           │
  ├── GET /any-protected ─────►│
  │   Authorization: Bearer   │
  │                           ├─ jwtVerify() — OK (token not yet expired)
  │                           └─ isRevoked(jti) → true → 401 Unauthorized
  │◄── 401 ───────────────────┤
```

The `ON CONFLICT (jti) DO NOTHING` clause makes duplicate logout calls safe. The DB write is best-effort: if it fails (e.g. table not migrated yet in dev), the in-memory blacklist still enforces revocation for the lifetime of the current process.

---

## Files Changed

| File | Change |
|---|---|
| `micopay/sql/migrations/20260629000000_revoked_tokens.up.sql` | New table `revoked_tokens` |
| `micopay/sql/migrations/20260629000000_revoked_tokens.down.sql` | Rollback migration |
| `micopay/backend/src/services/tokenRevocation.service.ts` | New — `revokeToken` / `isRevoked` |
| `micopay/backend/src/routes/auth.ts` | JTI added to issued tokens; `POST /auth/logout` added |
| `micopay/backend/src/middleware/auth.middleware.ts` | Revocation check after `jwtVerify` |

---

## Validation Steps

```bash
# 1. Run the revocation-specific tests
cd micopay/backend
node --import tsx src/tests/tokenRevocation.test.ts

# 2. TypeScript compilation
npm run build

# 3. Existing test suite
node --import tsx src/tests/accountDeletion.test.ts
node --import tsx src/tests/rateCache.test.ts
```

Expected output: all 7 revocation test scenarios pass with `✅ All JWT Revocation Tests Passed!`

---

## Residual Risk

- The in-memory blacklist is process-local. In a multi-replica deployment, a revoked token will still pass on replicas that have not seen the revocation event until they perform a DB lookup. The DB fallback on cache-miss mitigates this: the first request to any replica will hit the DB, warm the cache, and reject the token.
- Tokens without a `jti` (issued before this change) expire naturally and are excluded from the revocation check. No action required.
- The `revoked_tokens` table accumulates rows until manually pruned. A periodic `DELETE FROM revoked_tokens WHERE expires_at < NOW()` job can be added — entries past their expiry are safe to remove because the underlying JWT is already expired.
