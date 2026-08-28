# CASH-1 Quick Reference Guide

**For Developers:** Quick guide to using the new flow and provider_id fields.

---

## TL;DR

- ✅ All trade creation now requires a `flow` parameter: `'deposit'` or `'cash_out'`
- ✅ The `provider_id` is automatically derived server-side—DO NOT send it from client
- ✅ All trade responses include `flow` and `provider_id` fields

---

## Creating Trades

### Before CASH-1 ❌
```typescript
const response = await fetch('/trades', {
  method: 'POST',
  body: JSON.stringify({
    seller_id: merchantId,
    amount_mxn: 500
  })
});
```

### After CASH-1 ✅
```typescript
const response = await fetch('/trades', {
  method: 'POST',
  body: JSON.stringify({
    seller_id: merchantId,
    amount_mxn: 500,
    flow: 'deposit'  // REQUIRED: 'deposit' or 'cash_out'
  })
});
```

---

## Flow Types

### Deposit (`'deposit'`)
**Use when:** User wants to deposit cash and receive USDC

```typescript
{
  seller_id: merchantId,  // Merchant provides service
  amount_mxn: 500,
  flow: 'deposit'
}
```

**Provider:** Merchant (seller_id)  
**Scenario:** User walks into merchant location, hands cash, receives USDC

### Cash Out (`'cash_out'`)
**Use when:** User wants to withdraw cash from their USDC balance

```typescript
{
  seller_id: merchantId,  // Merchant facilitates withdrawal
  amount_mxn: 500,
  flow: 'cash_out'
}
```

**Provider:** User (buyer_id/current user)  
**Scenario:** User converts their USDC to physical cash

---

## Response Structure

All trade responses now include:

```typescript
interface TradeResponse {
  id: string;
  seller_id: string;
  buyer_id: string;
  amount_mxn: number;
  flow: 'deposit' | 'cash_out';     // NEW
  provider_id: string;                // NEW
  status: string;
  // ... other fields
}
```

### Provider ID Rules

| Flow | Provider ID | Logic |
|------|-------------|-------|
| `deposit` | `seller_id` | Merchant provides deposit service |
| `cash_out` | `buyer_id` | User is withdrawing their funds |

---

## Frontend Examples

### React/TypeScript

```typescript
import { TradeFlow } from '@/types/trade';

// Creating a deposit trade
async function createDepositTrade(merchantId: string, amount: number) {
  const response = await fetch('/trades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      seller_id: merchantId,
      amount_mxn: amount,
      flow: 'deposit' as TradeFlow
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create trade');
  }
  
  return await response.json();
}

// Creating a cash-out trade
async function createCashOutTrade(merchantId: string, amount: number) {
  const response = await fetch('/trades', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      seller_id: merchantId,
      amount_mxn: amount,
      flow: 'cash_out' as TradeFlow
    })
  });
  
  return await response.json();
}

// Displaying trade info
function TradeCard({ trade }) {
  const providerLabel = trade.flow === 'deposit' 
    ? 'Deposit at' 
    : 'Withdraw from';
  
  return (
    <div>
      <h3>{providerLabel} {trade.provider_name}</h3>
      <p>Amount: ${trade.amount_mxn} MXN</p>
      <p>Type: {trade.flow}</p>
    </div>
  );
}
```

### JavaScript/Vanilla

```javascript
// Deposit
async function createTrade(type, merchantId, amount) {
  const body = {
    seller_id: merchantId,
    amount_mxn: amount,
    flow: type  // 'deposit' or 'cash_out'
  };
  
  const response = await fetch('/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return response.json();
}

// Usage
const depositTrade = await createTrade('deposit', merchantId, 500);
const cashOutTrade = await createTrade('cash_out', merchantId, 300);
```

---

## Common Errors

### Error: Missing flow parameter
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body should have required property 'flow'"
}
```
**Fix:** Add `flow: 'deposit'` or `flow: 'cash_out'` to request body

### Error: Invalid flow value
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "flow must be either \"deposit\" or \"cash_out\""
}
```
**Fix:** Use only `'deposit'` or `'cash_out'` (lowercase, exact spelling)

### Error: Extra properties not allowed
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body should NOT have additional properties"
}
```
**Fix:** Remove `provider_id` from request body (it's server-derived)

---

## Database Queries

### Filtering by flow

```sql
-- Get all deposit trades
SELECT * FROM trades WHERE flow = 'deposit';

-- Get all cash-out trades
SELECT * FROM trades WHERE flow = 'cash_out';

-- Get trades for a specific provider
SELECT * FROM trades WHERE provider_id = 'provider-uuid';
```

### Aggregations

```sql
-- Count trades by flow
SELECT flow, COUNT(*) 
FROM trades 
GROUP BY flow;

-- Total volume by provider
SELECT provider_id, SUM(amount_mxn) as total_volume
FROM trades
WHERE status = 'completed'
GROUP BY provider_id;
```

---

## TypeScript Types

```typescript
// Available in: apps/api/src/types/trade.types.ts

type TradeFlow = 'deposit' | 'cash_out';

interface CreateTradeRequest {
  seller_id: string;
  amount_mxn: number;
  flow: TradeFlow;
  // NOTE: provider_id is NOT included (server-derived)
}

interface TradeResponse {
  id: string;
  seller_id: string;
  buyer_id: string;
  amount_mxn: number;
  flow: TradeFlow;
  provider_id: string;
  status: string;
  // ... other fields
}

// Helper function
function deriveProviderId(
  flow: TradeFlow, 
  sellerId: string, 
  buyerId: string
): string {
  return flow === 'deposit' ? sellerId : buyerId;
}
```

---

## Testing

### Unit Tests

```typescript
import { createTrade } from './trade.service';

test('deposit flow sets provider as seller', async () => {
  const trade = await createTrade({
    sellerId: 'seller-123',
    buyerId: 'buyer-456',
    amountMxn: 500,
    flow: 'deposit'
  });
  
  expect(trade.flow).toBe('deposit');
  expect(trade.provider_id).toBe('seller-123');
});

test('cash_out flow sets provider as buyer', async () => {
  const trade = await createTrade({
    sellerId: 'seller-123',
    buyerId: 'buyer-456',
    amountMxn: 500,
    flow: 'cash_out'
  });
  
  expect(trade.flow).toBe('cash_out');
  expect(trade.provider_id).toBe('buyer-456');
});
```

---

## Migration Notes

### For DBAs

The migration adds two columns to the `trades` table:

```sql
ALTER TABLE trades ADD COLUMN flow VARCHAR(32) NOT NULL;
ALTER TABLE trades ADD COLUMN provider_id UUID NOT NULL REFERENCES users(id);
```

Plus constraints:
- `trades_flow_check`: flow IN ('deposit', 'cash_out')
- `trades_flow_provider_consistency`: ensures flow/provider alignment

### For DevOps

No new environment variables required. Existing setups will work after migration.

---

## FAQ

**Q: Can I send provider_id from the client?**  
A: No. The API will reject requests with `provider_id`. It's derived server-side for security.

**Q: What if I don't know the flow type?**  
A: You must determine the flow type in your UI logic. If the user is depositing cash → `'deposit'`. If withdrawing → `'cash_out'`.

**Q: Can I update the flow after creation?**  
A: No. The flow is immutable after trade creation. Create a new trade if needed.

**Q: Are there other flow types coming?**  
A: Possibly in the future (e.g., `'p2p_transfer'`, `'bill_payment'`). Currently only `'deposit'` and `'cash_out'`.

**Q: How do I migrate existing trades?**  
A: The migration includes a guard that requires manual classification of existing trades. Contact the backend team for a data migration script.

---

## Support

- **Implementation docs:** `/docs/CASH-1_IMPLEMENTATION.md`
- **Type definitions:** `/apps/api/src/types/trade.types.ts`
- **Test examples:** `/apps/api/src/tests/test-trade-flow-schema.ts`
- **Migration guide:** `/apps/api/src/db/migrations/README.md`

---

**Last Updated:** 2026-08-28  
**Version:** CASH-1 Initial Release
