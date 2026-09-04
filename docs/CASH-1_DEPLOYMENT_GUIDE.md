# CASH-1 Deployment Guide

**Issue:** Canonical Flow & Provider Schema Persistence  
**Target:** Production deployment  
**Risk Level:** Medium (Breaking API change + Schema migration)

---

## Pre-Deployment Checklist

### 1. Code Review
- [ ] All code changes reviewed and approved
- [ ] TypeScript compilation successful
- [ ] No linting errors
- [ ] Security review completed

### 2. Database Preparation
- [ ] Production database backup completed
- [ ] Staging database tested with migration
- [ ] Rollback procedure tested on staging
- [ ] Migration timing estimated (<30 seconds expected)

### 3. API Documentation
- [ ] API documentation updated
- [ ] Breaking changes communicated to frontend team
- [ ] Mobile app team notified
- [ ] Third-party integrators notified (if any)

### 4. Client Readiness
- [ ] Frontend code updated to send `flow` parameter
- [ ] Mobile app updated to send `flow` parameter
- [ ] Client apps tested against staging API
- [ ] Backward compatibility verified for read operations

---

## Deployment Steps

### Phase 1: Database Migration (Downtime: ~30 seconds)

#### Step 1.1: Backup Database

```bash
# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -h $DB_HOST -U $DB_USER -d micopay_prod \
  > backup_pre_cash1_${TIMESTAMP}.sql

# Verify backup
ls -lh backup_pre_cash1_${TIMESTAMP}.sql
```

**Verify:** Backup file exists and has reasonable size (>1MB if data exists)

#### Step 1.2: Check for Existing Trades

```sql
-- Connect to production database
psql -h $DB_HOST -U $DB_USER -d micopay_prod

-- Check for existing trades
SELECT COUNT(*) as trade_count FROM trades;
```

**If trade_count > 0:**
- Migration will abort with error
- Need to run data classification script (contact backend team)
- See "Handling Existing Data" section below

**If trade_count = 0:**
- Migration will proceed automatically
- No manual intervention needed

#### Step 1.3: Apply Migration

**Option A: Automatic (Recommended)**

Migration runs automatically when API server starts:

```bash
# Deploy new API version
# Migration runs during startup
npm run start
```

**Option B: Manual**

```bash
# SSH to production server
cd /path/to/micopay-protocol/apps/api

# Run migration manually
npm run db:migrate
```

**Expected Output:**
```
🔄 Running migrations...
  🚀 Executing migration: 002_add_flow_and_provider.up.sql
  ✅ Migration 002_add_flow_and_provider successful
✅ All migrations complete
```

#### Step 1.4: Verify Schema

```sql
-- Verify columns exist
\d trades

-- Expected: flow and provider_id columns listed

-- Verify constraints
SELECT conname, contype 
FROM pg_constraint 
WHERE conrelid = 'trades'::regclass 
  AND conname LIKE 'trades_flow%';

-- Expected:
-- trades_flow_check | c
-- trades_flow_provider_consistency | c

-- Verify index
\di idx_trades_provider

-- Expected: Index definition shown
```

### Phase 2: API Deployment (Downtime: ~2 minutes)

#### Step 2.1: Deploy API Service

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build
npm run build

# Restart service
pm2 restart micopay-api
# or
systemctl restart micopay-api
```

#### Step 2.2: Health Check

```bash
# Check API health
curl http://localhost:3000/health

# Expected: 200 OK

# Check logs for errors
pm2 logs micopay-api --lines 50
# or
journalctl -u micopay-api -n 50
```

### Phase 3: Verification (5 minutes)

#### Step 3.1: Manual API Tests

**Test 1: Create deposit trade (should succeed)**

```bash
curl -X POST https://api.micopay.com/trades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "seller_id": "$MERCHANT_UUID",
    "amount_mxn": 100,
    "flow": "deposit"
  }'

# Expected: 201 Created
# Response includes: flow: "deposit", provider_id: <merchant_uuid>
```

**Test 2: Create cash-out trade (should succeed)**

```bash
curl -X POST https://api.micopay.com/trades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "seller_id": "$MERCHANT_UUID",
    "amount_mxn": 100,
    "flow": "cash_out"
  }'

# Expected: 201 Created
# Response includes: flow: "cash_out", provider_id: <buyer_uuid>
```

**Test 3: Missing flow (should fail)**

```bash
curl -X POST https://api.micopay.com/trades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "seller_id": "$MERCHANT_UUID",
    "amount_mxn": 100
  }'

# Expected: 400 Bad Request
# Error: "body should have required property 'flow'"
```

**Test 4: Client sends provider_id (should fail)**

```bash
curl -X POST https://api.micopay.com/trades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{
    "seller_id": "$MERCHANT_UUID",
    "amount_mxn": 100,
    "flow": "deposit",
    "provider_id": "fake-uuid"
  }'

# Expected: 400 Bad Request
# Error: "body should NOT have additional properties"
```

#### Step 3.2: Database Constraint Tests

```sql
-- Test invalid flow (should fail)
INSERT INTO trades
  (seller_id, buyer_id, amount_mxn, amount_stroops, 
   platform_fee_mxn, secret_hash, flow, provider_id, expires_at)
VALUES 
  ('valid-seller-uuid', 'valid-buyer-uuid', 500, 5000000000, 
   4, 'test_hash', 'invalid_flow', 'valid-seller-uuid', 
   NOW() + INTERVAL '2 hours');

-- Expected: ERROR: new row violates check constraint "trades_flow_check"

-- Test inconsistent provider (should fail)
INSERT INTO trades
  (seller_id, buyer_id, amount_mxn, amount_stroops, 
   platform_fee_mxn, secret_hash, flow, provider_id, expires_at)
VALUES 
  ('valid-seller-uuid', 'valid-buyer-uuid', 500, 5000000000, 
   4, 'test_hash', 'deposit', 'valid-buyer-uuid', 
   NOW() + INTERVAL '2 hours');

-- Expected: ERROR: new row violates check constraint "trades_flow_provider_consistency"
```

#### Step 3.3: Monitoring

**Monitor for 1 hour:**

```bash
# Error rate
# Expected: No increase in 400/500 errors

# Response time
# Expected: P95 < 200ms (no degradation)

# Database CPU
# Expected: No significant increase

# Application logs
pm2 logs micopay-api

# Look for:
# - Constraint violations (should be none)
# - Flow-related errors (should be none)
# - Unexpected 400 errors (investigate if many)
```

---

## Handling Existing Data

If production has existing trades (trade_count > 0), the migration will abort. Follow these steps:

### Step 1: Analyze Existing Trades

```sql
-- Count existing trades
SELECT COUNT(*) FROM trades;

-- Check trade distribution
SELECT status, COUNT(*) 
FROM trades 
GROUP BY status;

-- Sample trade data
SELECT id, seller_id, buyer_id, amount_mxn, status, created_at
FROM trades
LIMIT 10;
```

### Step 2: Classify Trades

Create a data migration script to classify existing trades. Example logic:

```sql
-- For most P2P cash platforms, the typical flow is:
-- Buyer deposits cash with merchant → receives USDC
-- Therefore, existing trades are likely "deposit" flow

-- Classification script (REVIEW WITH BUSINESS TEAM FIRST)
ALTER TABLE trades ADD COLUMN flow VARCHAR(32);
ALTER TABLE trades ADD COLUMN provider_id UUID REFERENCES users(id);

-- Classify all existing trades as "deposit"
-- (Assumes all historical trades are cash deposit transactions)
UPDATE trades
SET 
  flow = 'deposit',
  provider_id = seller_id
WHERE flow IS NULL;

-- Verify classification
SELECT 
  flow, 
  COUNT(*) as count,
  COUNT(CASE WHEN provider_id = seller_id THEN 1 END) as correct_deposit,
  COUNT(CASE WHEN provider_id = buyer_id THEN 1 END) as correct_cashout
FROM trades
GROUP BY flow;

-- After verification, add NOT NULL constraints
ALTER TABLE trades ALTER COLUMN flow SET NOT NULL;
ALTER TABLE trades ALTER COLUMN provider_id SET NOT NULL;

-- Add check constraints
ALTER TABLE trades
ADD CONSTRAINT trades_flow_check CHECK (flow IN ('deposit', 'cash_out'));

ALTER TABLE trades
ADD CONSTRAINT trades_flow_provider_consistency CHECK (
  (flow = 'deposit' AND provider_id = seller_id) OR
  (flow = 'cash_out' AND provider_id = buyer_id)
);
```

**⚠️ IMPORTANT:** 
- Review classification logic with business team
- Test on staging database first
- Verify a sample of classified trades manually
- Consider if any historical trades were actually cash-out flows

### Step 3: Run Modified Migration

After manual data classification, the automated migration will succeed:

```bash
npm run db:migrate
```

---

## Rollback Procedure

If issues arise, follow this rollback procedure:

### Option A: Automatic Rollback

```typescript
import { rollbackLastMigration } from './apps/api/src/db/migrator.js';

// Run rollback
await rollbackLastMigration();
```

### Option B: Manual Rollback

```bash
# Execute down migration
psql -h $DB_HOST -U $DB_USER -d micopay_prod \
  -f apps/api/src/db/migrations/002_add_flow_and_provider.down.sql

# Verify rollback
psql -h $DB_HOST -U $DB_USER -d micopay_prod \
  -c "\d trades"

# Expected: flow and provider_id columns gone
```

### Option C: Restore from Backup

```bash
# Stop API service
pm2 stop micopay-api

# Drop current database
psql -h $DB_HOST -U $DB_USER -c "DROP DATABASE micopay_prod;"

# Recreate database
psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE micopay_prod;"

# Restore backup
psql -h $DB_HOST -U $DB_USER -d micopay_prod \
  < backup_pre_cash1_${TIMESTAMP}.sql

# Verify restoration
psql -h $DB_HOST -U $DB_USER -d micopay_prod \
  -c "SELECT COUNT(*) FROM trades;"

# Restart API service with previous version
git checkout <previous_commit>
npm install
npm run build
pm2 restart micopay-api
```

### Post-Rollback

- [ ] Notify team that rollback occurred
- [ ] Document reason for rollback
- [ ] Fix issues in staging
- [ ] Re-test thoroughly
- [ ] Schedule new deployment attempt

---

## Client Update Coordination

### Frontend Team

**Before deployment:**
```typescript
// Add flow parameter to trade creation
const createTrade = async (merchantId: string, amount: number) => {
  const response = await fetch('/trades', {
    method: 'POST',
    body: JSON.stringify({
      seller_id: merchantId,
      amount_mxn: amount,
      flow: 'deposit'  // NEW: Required
    })
  });
  return response.json();
};
```

**Update UI to show flow type:**
```tsx
<TradeCard>
  <Badge>{trade.flow === 'deposit' ? 'Cash In' : 'Cash Out'}</Badge>
  {/* ... */}
</TradeCard>
```

### Mobile Team

**iOS/Android:**
```swift
// Add flow to trade request model
struct CreateTradeRequest: Codable {
    let sellerId: String
    let amountMxn: Int
    let flow: TradeFlow  // NEW
    
    enum TradeFlow: String, Codable {
        case deposit
        case cashOut = "cash_out"
    }
}
```

### Integration Testing

- [ ] Frontend tested against staging API
- [ ] Mobile app tested against staging API
- [ ] All error cases handled gracefully
- [ ] User experience validated

---

## Post-Deployment Tasks

### Immediate (Day 1)

- [ ] Monitor error rates for 24 hours
- [ ] Review constraint violation logs (should be none)
- [ ] Check customer support tickets for issues
- [ ] Verify analytics tracking includes flow field

### Short-term (Week 1)

- [ ] Analyze flow distribution (deposit vs cash_out)
- [ ] Monitor provider performance metrics
- [ ] Review database query performance
- [ ] Collect feedback from support team

### Medium-term (Month 1)

- [ ] Build provider analytics dashboard
- [ ] Implement flow-specific business rules (if needed)
- [ ] Consider additional flow types for future
- [ ] Document lessons learned

---

## Troubleshooting

### Issue: Migration fails with "ambiguous rows" error

**Cause:** Existing trades in database  
**Solution:** See "Handling Existing Data" section

### Issue: API returns 400 for all trade creation

**Symptoms:** All POST /trades return 400  
**Check:**
```bash
# Check if old client is sending requests
# Old clients don't send 'flow' parameter
grep "flow" /var/log/micopay-api.log

# Check if migration succeeded
psql -c "\d trades" | grep flow
```
**Solution:** Ensure clients are updated to send flow parameter

### Issue: Constraint violation errors in logs

**Symptoms:** Database errors like "violates check constraint trades_flow_provider_consistency"  
**Cause:** Application code bypassing service layer  
**Check:**
```sql
-- Find violating rows (should be none after migration)
SELECT id, flow, provider_id, seller_id, buyer_id
FROM trades
WHERE NOT (
  (flow = 'deposit' AND provider_id = seller_id) OR
  (flow = 'cash_out' AND provider_id = buyer_id)
);
```
**Solution:** Fix application code to use proper service layer

### Issue: Performance degradation

**Symptoms:** Slow query responses  
**Check:**
```sql
-- Check if index is being used
EXPLAIN ANALYZE
SELECT * FROM trades WHERE provider_id = 'some-uuid';

-- Should show: Index Scan using idx_trades_provider
```
**Solution:** If index not used, rebuild index:
```sql
REINDEX INDEX idx_trades_provider;
```

---

## Emergency Contacts

- **Backend Lead:** [Contact info]
- **DevOps:** [Contact info]
- **DBA:** [Contact info]
- **On-Call Engineer:** [Contact info]

---

## Deployment Windows

**Recommended:** Low-traffic period
- Weekday: 2AM - 4AM local time
- Weekend: Saturday 1AM - 5AM

**Estimated Downtime:**
- Database migration: 30 seconds
- API deployment: 2 minutes
- **Total:** ~3 minutes

---

## Success Criteria

Deployment is considered successful when:

✅ Migration completed without errors  
✅ All API health checks passing  
✅ Manual API tests passing  
✅ Database constraints working  
✅ No increase in error rate  
✅ No customer-facing issues  
✅ Clients successfully creating trades with flow parameter  

---

## Communication Plan

### Before Deployment (24h notice)

**Internal:**
- [ ] Email to engineering team
- [ ] Slack announcement in #engineering
- [ ] Update deployment calendar

**External:**
- [ ] Status page notice (if maintenance window)
- [ ] Email to integration partners (if any)

### During Deployment

**Internal:**
- [ ] Real-time updates in #deployment channel
- [ ] Tag on-call engineer

### After Deployment

**Internal:**
- [ ] Deployment success announcement
- [ ] Summary of any issues encountered

**External:**
- [ ] Status page updated (if used)
- [ ] Integration partners notified of completion

---

**Prepared by:** Kiro AI  
**Date:** 2026-08-28  
**Version:** 1.0
