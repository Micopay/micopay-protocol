# CASH-1 Implementation Summary

**Issue:** Canonical Flow & Provider Schema Persistence  
**Date:** 2026-08-28  
**Status:** ✅ Implemented

## Overview

CASH-1 introduces explicit product flow (`deposit` vs `cash_out`) and server-derived `provider_id` columns to the trades table, enabling clearer separation between different trade types and proper provider identification throughout the system.

## Changes Made

### 1. Database Schema Changes

#### Updated: `micopay/sql/init.sql`
- Added `flow VARCHAR(32) NOT NULL` column to `trades` table
- Added `provider_id UUID NOT NULL REFERENCES users(id)` column
- Added check constraint `trades_flow_check` for valid flow values ('deposit', 'cash_out')
- Added check constraint `trades_flow_provider_consistency` to enforce:
  - `flow = 'deposit'` → `provider_id = seller_id` (merchant provides deposit service)
  - `flow = 'cash_out'` → `provider_id = buyer_id` (user withdrawing cash)

### 2. Migration Files

#### Created: `apps/api/src/db/migrations/002_add_flow_and_provider.up.sql`
- Adds `flow` and `provider_id` columns to existing `trades` table
- Includes migration guard that aborts if ambiguous rows exist
- Adds database constraints for data integrity
- Creates index on `(provider_id, status)` for query performance

#### Created: `apps/api/src/db/migrations/002_add_flow_and_provider.down.sql`
- Symmetric rollback that removes all changes from up migration
- Drops constraints, indexes, and columns
- Restores schema to pre-migration state

#### Updated: `apps/api/src/db/migrator.ts`
- Enhanced to support `.up.sql` and `.down.sql` file pattern
- Added `rollbackLastMigration()` function for migration rollback
- Migration metadata tracks base name only (without .up/.down suffix)

#### Updated: Renamed `001_initial_schema.sql` → `001_initial_schema.up.sql`
- Follows new naming convention

#### Created: `apps/api/src/db/migrations/001_initial_schema.down.sql`
- Rollback for initial schema migration

### 3. Backend Service Layer

#### Updated: `apps/api/src/services/trade.service.ts`

**Interface Changes:**
```typescript
export interface CreateTradeInput {
  sellerId: string;
  buyerId: string;
  amountMxn: number;
  flow: 'deposit' | 'cash_out'; // NEW: Required flow parameter
}
```

**Key Changes:**
- `createTrade()` now requires explicit `flow` parameter
- Validates flow is either 'deposit' or 'cash_out'
- Server derives `provider_id` based on flow (never accepts from client)
  - `flow = 'deposit'` → `provider_id = sellerId`
  - `flow = 'cash_out'` → `provider_id = buyerId`
- Inserts both `flow` and `provider_id` into database
- `getTradeHistory()` includes `flow` and `provider_id` in SELECT
- `getTradeById()` returns trades with new fields (no changes needed - uses SELECT *)

### 4. API Routes

#### Updated: `apps/api/src/routes/trades.ts`

**POST /trades:**
- Request schema now requires `flow` field
- Schema explicitly rejects `provider_id` from client (`additionalProperties: false`)
- Added security comment noting provider_id is server-derived only

**Request Schema:**
```typescript
{
  seller_id: string (uuid)
  amount_mxn: number (100-50000)
  flow: 'deposit' | 'cash_out'  // NEW: Required
  // provider_id is NOT accepted from client
}
```

**Response includes:**
- `flow`: The product flow type
- `provider_id`: Server-derived provider identifier

### 5. TypeScript Types

#### Created: `apps/api/src/types/trade.types.ts`

Shared type definitions for trades:
- `TradeFlow` type: `'deposit' | 'cash_out'`
- `CreateTradeRequest` interface
- `TradeResponse` interface (with flow and provider_id)
- `TradeHistoryItem` interface (with flow and provider_id)
- `deriveProviderId()` helper function
- `isValidFlowProviderCombination()` validation function

### 6. Tests

#### Created: `apps/api/src/tests/test-trade-flow-schema.ts`

Comprehensive test suite covering:
1. ✅ Deposit flow derives provider as seller
2. ✅ Cash-out flow derives provider as buyer
3. ✅ Missing flow parameter is rejected
4. ✅ Invalid flow value is rejected
5. ✅ Trade reads include flow and provider_id
6. ✅ Database constraint enforces consistency
7. ✅ Deposit with buyer as provider is rejected
8. ✅ Cash-out with seller as provider is rejected
9. ✅ State transitions preserve flow and provider_id

**Run command:**
```bash
ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 node --import tsx src/tests/test-trade-flow-schema.ts
```

#### Created: `apps/api/src/tests/README.md`
Documentation for test suite structure and running tests

### 7. Documentation

#### Created: `apps/api/src/db/migrations/README.md`
- Migration pattern documentation
- Naming conventions
- Safety guidelines (guards, symmetry)
- Migration list with descriptions
- Testing migration procedures

## Security Considerations

### Provider ID Derivation (Server-Side Only)

**Critical Security Rule:** The `provider_id` field is NEVER accepted from client input.

1. **Route Level Protection:**
   - Fastify schema validation with `additionalProperties: false` rejects any `provider_id` in request body
   - Client attempting to send `provider_id` will receive a 400 Bad Request

2. **Service Level Protection:**
   - `CreateTradeInput` interface does not include `provider_id` parameter
   - `provider_id` is derived in `createTrade()` based on authenticated session and flow type
   - Derivation logic: `const providerId = flow === 'deposit' ? sellerId : buyerId;`

3. **Database Level Protection:**
   - Check constraint `trades_flow_provider_consistency` validates at persistence layer
   - Prevents any manual SQL from inserting inconsistent combinations
   - Constraint enforces: `(flow = 'deposit' AND provider_id = seller_id) OR (flow = 'cash_out' AND provider_id = buyer_id)`

## Migration Safety

### Guard Mechanism

The migration includes a pre-flight check that aborts if ambiguous data exists:

```sql
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count FROM trades WHERE id IS NOT NULL;
  
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % existing trade(s). Manual classification required...', ambiguous_count;
  END IF;
END $$;
```

For production deployment with existing data:
1. The guard will abort the migration
2. Existing trades must be manually classified by flow type
3. A custom data migration script should be created to populate flow/provider_id
4. After manual classification, the migration can proceed

### Up/Down Symmetry

The migration pair (002_add_flow_and_provider.up.sql + 002_add_flow_and_provider.down.sql) is completely symmetric:

- Running up → down leaves the schema identical to pre-migration state
- All constraints, indexes, and columns are cleanly added/removed
- `init.sql` describes the final schema after all migrations

## Verification Steps

1. **Schema Verification:**
   ```sql
   \d trades  -- Verify flow and provider_id columns exist
   \d+ trades -- Check constraints are present
   ```

2. **Constraint Verification:**
   ```sql
   -- Should succeed (deposit with seller as provider)
   INSERT INTO trades (seller_id, buyer_id, flow, provider_id, ...) 
   VALUES (..., 'deposit', seller_id, ...);
   
   -- Should fail (deposit with buyer as provider)
   INSERT INTO trades (seller_id, buyer_id, flow, provider_id, ...) 
   VALUES (..., 'deposit', buyer_id, ...);
   ```

3. **API Verification:**
   ```bash
   # Should succeed
   curl -X POST /trades -d '{"seller_id":"...","amount_mxn":500,"flow":"deposit"}'
   
   # Should fail (400 Bad Request - invalid flow)
   curl -X POST /trades -d '{"seller_id":"...","amount_mxn":500,"flow":"invalid"}'
   
   # Should fail (400 Bad Request - extra properties not allowed)
   curl -X POST /trades -d '{"seller_id":"...","amount_mxn":500,"flow":"deposit","provider_id":"..."}'
   ```

4. **Test Suite:**
   ```bash
   cd apps/api
   ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 node --import tsx src/tests/test-trade-flow-schema.ts
   ```

## Out of Scope (Intentionally NOT Changed)

Per CASH-1 requirements, the following were explicitly NOT modified:

- ❌ Frontend components (UI changes)
- ❌ Inbox queries
- ❌ Scan/completion logic
- ❌ Cancellation flows
- ❌ Provider policy logic
- ❌ Initiator policy
- ❌ KYC accounting (CASH-10)
- ❌ Reputation system
- ❌ Provider enrollment (RED-1/RED-2)
- ❌ Legacy `merchant_*` symbol renames (only added new columns)
- ❌ Multi-asset escrow

These will be addressed in subsequent issues as needed.

## API Contract Changes

### Breaking Changes

**POST /trades** now requires `flow` parameter:

**Before:**
```json
{
  "seller_id": "uuid",
  "amount_mxn": 500
}
```

**After (CASH-1):**
```json
{
  "seller_id": "uuid",
  "amount_mxn": 500,
  "flow": "deposit"  // Required: "deposit" or "cash_out"
}
```

### Response Changes (Non-Breaking Additions)

All trade responses now include:
```json
{
  "id": "...",
  "flow": "deposit",      // NEW
  "provider_id": "...",   // NEW
  // ... existing fields ...
}
```

## Performance Considerations

### New Index
- `idx_trades_provider ON trades(provider_id, status)` - Supports provider-specific queries

### Query Impact
- Trade creation: +2 columns inserted (negligible)
- Trade reads: +2 columns selected (negligible)
- Constraint checks: Evaluated on insert/update (low overhead, CPU-only)

## Rollback Procedure

If issues arise post-deployment:

```typescript
import { rollbackLastMigration } from './db/migrator.js';
await rollbackLastMigration();
```

This will:
1. Execute `002_add_flow_and_provider.down.sql`
2. Remove flow and provider_id columns
3. Drop constraints and indexes
4. Remove migration from migrations_meta table

**Note:** Rollback will lose any flow/provider_id data. Ensure backup exists before rollback.

## Future Considerations

### CASH-10 (KYC Accounting)
Flow and provider_id will enable proper accounting:
- Deposit trades: Merchant receives MXN, platform tracks deposit service
- Cash-out trades: User withdraws MXN, platform tracks withdrawal service

### RED-1/RED-2 (Provider Enrollment)
Provider_id allows querying:
- All trades for a specific provider
- Provider performance metrics
- Provider-specific limits and policies

### Multi-Flow Support
Current flows: `deposit`, `cash_out`  
Future flows could include:
- `p2p_transfer`
- `bill_payment`
- `merchant_settlement`

Extension requires:
1. Update `trades_flow_check` constraint
2. Update flow derivation logic
3. Add corresponding provider rules

## Dependencies

No new external dependencies added. Changes use existing infrastructure:
- PostgreSQL (CHECK constraints)
- Fastify (schema validation)
- Node assert module (tests)

## Compliance

✅ All changes follow project coding standards  
✅ Database constraints enforce data integrity  
✅ Security-first approach (server-only derivation)  
✅ Comprehensive test coverage  
✅ Backward-compatible migrations with guards  
✅ Complete documentation

---

**Implementation Complete:** All CASH-1 requirements satisfied.
