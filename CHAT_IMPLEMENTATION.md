# Real Buyer-Merchant Chat Implementation

## Overview
This document summarizes the implementation of persistent, real-time messaging for trade participants in the MicoPay P2P trading platform. The system replaces hardcoded chat messages with a backend-driven, database-backed messaging system with participant-gated access and short-polling for real-time updates.

**Status**: Complete
**Issue**: #75
**Commit Message**: `feat: implement real buyer-merchant chat with persistence and participant auth (#75)`

---

## Architecture & Design Decisions

### Real-Time Delivery Strategy: Short Polling
- **Choice**: Short polling (3-second interval) instead of WebSocket/SSE
- **Reason**: No WebSocket infrastructure exists in the project (`socket.io`, `ws` not installed)
- **Implementation**:
  - Client polls `GET /trades/:id/messages` every 3 seconds while chat is open
  - Polling pauses when browser tab is hidden (`document.hidden`)
  - Resumes immediately when tab becomes visible
  - No memory leaks — interval cleared on component unmount

### Participant Authorization
- **Enforcement Point**: `assertTradeParticipant(tradeId, userId)` utility
- **Called on**: Every message endpoint (3 total)
- **Checks**:
  - Trade exists (404 if not)
  - User is buyer OR seller of the trade (403 if neither)
  - Returns the full trade record to avoid second query

### Optimistic Updates (Frontend)
- Append message locally with temporary ID (`temp-<timestamp>-<random>`)
- Replace with real ID on success
- Mark as failed with retry option on error
- No silent failures

---

## Files Created

### Backend (API)

#### 1. Migration: `micopay/sql/migrations/20260529100000_create_trade_messages.*`

**Up Migration** (`...up.sql`):
```sql
CREATE TABLE trade_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ NULL
);

-- Constraint: body must be 1-2000 chars
ALTER TABLE trade_messages
  ADD CONSTRAINT check_trade_messages_body_length
  CHECK (length(body) >= 1 AND length(body) <= 2000);

-- Indexes for query patterns
CREATE INDEX idx_trade_messages_trade_created ON trade_messages (trade_id, created_at ASC);
CREATE INDEX idx_trade_messages_trade_sender ON trade_messages (trade_id, sender_id);
CREATE INDEX idx_trade_messages_unread ON trade_messages (trade_id, read_at) WHERE read_at IS NULL;
```

**Down Migration** (`...down.sql`):
- Drops the `trade_messages` table and all indexes

**Key Design**:
- `read_at` is NULL until OTHER participant reads (unidirectional read receipts)
- On DELETE CASCADE ensures no orphaned messages if trade is deleted
- App-level participant validation (documented in comment)

---

#### 2. Participant Auth Utility: `apps/api/src/lib/trade-auth.ts`

**Exports**:
- `assertTradeParticipant(tradeId, userId): Promise<Trade>`
  - Queries trade from DB
  - Verifies user is buyer OR seller
  - Throws 404 (not found) or 403 (not participant)
  - Returns trade record
- `getUserRole(trade, userId): 'buyer' | 'merchant'`
  - Derives role from trade record

**Usage**: Called at start of every message endpoint

---

#### 3. API Routes: `apps/api/src/routes/trade-messages.ts`

**Endpoint 1: GET /trades/:id/messages**
- **Auth**: Required (JWT via authMiddleware)
- **Query Params**:
  - `before?`: ISO timestamp — fetch messages before this point (pagination)
  - `limit?`: 1-50, default 50
- **Response**:
  ```json
  {
    "messages": [
      {
        "id": "uuid",
        "tradeId": "uuid",
        "senderId": "uuid",
        "senderRole": "buyer|merchant",
        "body": "text",
        "createdAt": "ISO timestamp",
        "readAt": "ISO timestamp|null",
        "isOwn": boolean
      }
    ],
    "hasMore": boolean,
    "oldest": "ISO timestamp|null"
  }
  ```
- **Side Effect**: Marks all unread messages from OTHER participant as read (fire-and-forget)
- **Error Handling**:
  - 404: Trade not found
  - 403: User not a participant
  - 500: Internal error

**Endpoint 2: POST /trades/:id/messages**
- **Auth**: Required
- **Body**: `{ body: string }`
- **Validation**:
  - Body required, string, 1-2000 chars after trim
  - Trade must not be closed (status not in: completed, cancelled, expired, refunded)
  - Returns 422 if invalid
- **Response**: 201 with created message (same shape as GET array item)
- **Security**:
  - HTML tags stripped from body (simple regex approach)
  - Messages never cross trade boundaries (WHERE trade_id = :id)
  - Only participants can send

**Endpoint 3: POST /trades/:id/messages/read**
- **Auth**: Required
- **Action**: Explicitly mark unread messages from OTHER participant as read
- **Response**: 204 No Content
- **Use Case**: When user opens the chat tab (vs relying on GET side effect)

---

#### 4. Route Registration: `apps/api/src/index.ts`

**Changes**:
- Import `tradeMessagesRoutes` from `./routes/trade-messages.js`
- Register via `app.register(tradeMessagesRoutes)`
- Also imported missing `merchantRoutes` (was being used but not imported)

---

#### 5. Tests: `apps/api/src/__tests__/trade-messages.test.ts`

**Test Suite**:
- `assertTradeParticipant`
  - ✓ Returns 404 if trade not found
  - ✓ Returns 403 if user not a participant
  - ✓ Returns trade if user is buyer
  - ✓ Returns trade if user is seller
- `GET /trades/:id/messages`
  - ✓ Returns messages for participant
  - ✓ Rejects non-participants (403)
- `POST /trades/:id/messages`
  - ✓ Allows participant to send message
  - ✓ Rejects sending to closed trade (422)
  - ✓ Rejects non-participants (403)
- `POST /trades/:id/messages/read`
  - ✓ Marks unread messages as read
  - ✓ Rejects non-participants (403)

**Framework**: Vitest with mocked DB

---

### Frontend (React)

#### 1. Hook: `micopay/frontend/src/hooks/useChatMessages.ts`

**Purpose**: Encapsulates all chat logic (fetch, poll, send, optimistic updates)

**Interface**:
```typescript
function useChatMessages(options: {
  tradeId: string;
  userId: string;
  apiBaseUrl?: string;
}): {
  messages: TradeMessage[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (body: string) => Promise<void>;
  isSending: boolean;
  sendError: Error | null;
  retryLoad: () => void;
  retrySend: (messageId: string) => void;
}
```

**Features**:
- **Polling**:
  - Initial load on mount
  - 3s interval polling while mounted
  - Pauses when `document.hidden === true`
  - Resumes immediately on visibility change
  - Cleaned up on unmount
- **Optimistic Sends**:
  - Temp message ID: `temp-<timestamp>-<random>`
  - Replaced on success, marked failed on error
  - Error state tracked separately from load state
- **Deduplication**:
  - Merges new messages with existing, avoiding duplicates by ID
  - Maintains chronological order

---

#### 2. Updated Component: `micopay/frontend/src/pages/ChatRoom.tsx`

**Changes**:
- Removed hardcoded message array
- Added props: `tradeId`, `userId` (required), `apiBaseUrl` (optional)
- Integrated `useChatMessages` hook
- Added loading state (spinner)
- Added error state with retry button
- Added empty state message
- Wired send button to `sendMessage()`
- Input field synced to state
- Enter key sends message (Shift+Enter for newline)
- Auto-scroll to bottom on message update
- Timestamps formatted to locale (es-MX)
- Read receipt icons (filled if read, empty if unread)
- Sending state disables input/buttons
- Error inline display below send button

**Preserved**:
- All CSS classes and styling
- Layout and visual design
- Top app bar (merchant profile, status banner)
- Quick action buttons (Share Location, View QR)

---

#### 3. Updated Component: `micopay/frontend/src/pages/DepositChat.tsx`

**Changes**: Identical to ChatRoom.tsx
- Removed hardcoded message array
- Added props: `tradeId`, `userId`, `apiBaseUrl`
- Integrated `useChatMessages` hook
- Added loading, error, empty states
- Wired send to real API
- Added input state management
- Keyboard handling (Enter to send)
- Auto-scroll behavior

**Preserved**:
- Two-column action buttons layout
- Location card styling
- Verify badge
- All visual design

---

#### 4. Type Definition: `TradeMessage`

```typescript
interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  senderRole: 'buyer' | 'merchant';
  body: string;
  createdAt: string;  // ISO timestamp
  readAt: string | null;
  isOwn: boolean;
}
```

---

## Database Schema

### Table: `trade_messages`
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID | PRIMARY KEY | Auto-generated |
| `trade_id` | UUID | NOT NULL, FK → trades(id) ON DELETE CASCADE | Links to trade |
| `sender_id` | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE | Must be buyer or seller |
| `body` | TEXT | NOT NULL, CHECK (1-2000 chars) | Message content |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Message timestamp |
| `read_at` | TIMESTAMPTZ | NULL | NULL = unread; set when OTHER participant reads |

### Indexes
1. `idx_trade_messages_trade_created (trade_id, created_at ASC)` — Primary query pattern
2. `idx_trade_messages_trade_sender (trade_id, sender_id)` — Count unread per sender
3. `idx_trade_messages_unread (trade_id, read_at) WHERE read_at IS NULL` — Unread queries

---

## Security Considerations

### Participant Authorization
- ✓ `assertTradeParticipant` called on ALL 3 endpoints
- ✓ Never skipped — is the enforcement point
- ✓ Returns 403 if user is neither buyer nor seller
- ✓ No cross-trade message leakage

### Message Body Sanitization
- ✓ Simple HTML tag stripping (regex: `/<[^>]*>/g`)
- ⚠️ For production: consider `xss` or `DOMPurify` library
- ✓ Trimmed before storage (1-2000 char constraint)
- ✓ DB-level CHECK constraint enforced

### Closed Trade Prevention
- ✓ Cannot send to trades in terminal state (completed, cancelled, expired, refunded)
- ✓ Checked before insertion (422 response)

### Rate Limiting
- ⚠️ Currently not applied to POST /trades/:id/messages
- ⚠️ **TODO** (before production): Apply rate limiting middleware to prevent message spam
- Project has `@fastify/rate-limit` installed — should use it

---

## Frontend Integration Points

### How to Use ChatRoom & DepositChat

**Before (Hardcoded)**:
```tsx
<ChatRoom onBack={goBack} onViewQR={showQR} lockTxHash={txHash} />
```

**After (Real Data)**:
```tsx
<ChatRoom 
  tradeId={trade.id}
  userId={currentUser.id}
  onBack={goBack} 
  onViewQR={showQR} 
  lockTxHash={txHash}
  apiBaseUrl="http://localhost:3000"  // optional, defaults to localhost:3000
/>
```

### Auth Token Storage
- Hook reads token from `localStorage.getItem('auth_token')`
- **TODO**: Verify token is set after login/auth flow
- Sent in Authorization header: `Authorization: Bearer <token>`

---

## Testing Checklist

### Unit Tests (Automated - `npm run test`)
- ✓ assertTradeParticipant: all paths
- ✓ GET endpoint authorization
- ✓ POST endpoint authorization
- ✓ Closed trade rejection
- ✓ Non-participant rejection

### Integration Tests (Manual - in browser)
1. **Create Trade**
   - User A (buyer) and User B (merchant) have an active trade

2. **Send as Buyer**
   - Buyer opens ChatRoom, types message, hits Send
   - Message appears optimistically (with spinner)
   - Message persists on refresh (new GET request)
   - Merchant receives message on their screen (via poll)

3. **Send as Merchant**
   - Merchant opens ChatRoom, types message, hits Send
   - Same flow as buyer
   - Buyer receives message on their screen (via poll)

4. **Non-Participant Access**
   - User C (not in trade) tries to access ChatRoom with trade ID
   - GET request returns 403
   - UI shows error state

5. **Closed Trade**
   - Trade marked as completed
   - Buyer tries to send message
   - POST returns 422 with "Cannot send messages to a closed trade"
   - Input field disabled or error shown

6. **Empty State**
   - New trade, no messages yet
   - ChatRoom shows "No messages yet. Start the conversation."

7. **Read Receipts**
   - Buyer sends message
   - Merchant opens chat (GET request with side effect)
   - Buyer's message shows as read (filled icon)
   - Buyer refreshes, still shows as read

8. **Polling Pause/Resume**
   - Open ChatRoom, watch network tab
   - Tab becomes hidden (Alt+Tab or browser switch)
   - Polling stops (no GET requests)
   - Tab becomes visible
   - Polling resumes immediately

---

## Migration Instructions

### 1. Apply Database Migration
```bash
psql $DATABASE_URL -f micopay/sql/migrations/20260529100000_create_trade_messages.up.sql
```

### 2. Deploy Backend
```bash
cd apps/api
npm run build  # Ensure no TypeScript errors
npm run start  # Or deploy to production
```

### 3. Update Frontend Components
- **ChatRoom.tsx**: Ensure `tradeId` and `userId` props are passed from parent
- **DepositChat.tsx**: Same as above
- **Parent Component**: Query trade and current user, pass to chat component

### 4. Verify Auth Token
- Ensure login flow sets token in `localStorage.getItem('auth_token')`
- Token must be a valid JWT from `POST /auth/token`

### 5. Test End-to-End
- Create a trade via existing flow
- Open ChatRoom/DepositChat with both buyer and merchant
- Send messages bidirectionally
- Refresh page, verify messages persist
- Test non-participant access (should fail)

---

## Known Limitations & Future Improvements

### Current Limitations
1. **No WebSocket**: Uses polling instead. Fine for low-frequency chat, may show latency on high-volume.
2. **HTML Sanitization**: Basic regex, not production-grade.
3. **No Rate Limiting**: POST endpoint should have rate limiting (middleware exists but not applied).
4. **No Message Editing**: Users cannot edit sent messages.
5. **No Message Deletion**: Messages cannot be deleted.
6. **No Typing Indicators**: No "user is typing" state.
7. **No Message Search**: No full-text search across messages.

### Roadmap (Future Issues)
1. **WebSocket Real-Time** (Issue #??): Replace polling with Socket.io or Fastify WebSocket
2. **Advanced Sanitization** (Issue #??): Use `xss` or `DOMPurify` library
3. **Message Reactions** (Issue #??): Add emoji reactions to messages
4. **Typing Indicators** (Issue #??): Show "Merchant is typing..." state
5. **Message Threads** (Issue #??): Support reply/thread conversations
6. **Rate Limiting** (Issue #??): Apply middleware to POST endpoint
7. **Audit Logging** (Issue #??): Log all message sends for dispute resolution

---

## Commit Message

```
feat: implement real buyer-merchant chat with persistence and participant auth (#75)

- Add trade_messages table with sender_id, body, created_at, read_at
- Create assertTradeParticipant() utility for participant authorization
- Implement 3 API endpoints:
  - GET /trades/:id/messages (fetch with pagination, mark as read)
  - POST /trades/:id/messages (send with body validation, status check)
  - POST /trades/:id/messages/read (explicit read receipt)
- Wire ChatRoom.tsx and DepositChat.tsx to real API data
- Add useChatMessages hook with 3s polling, visibility pausing, optimistic updates
- Replace hardcoded messages with persistent backend storage
- All endpoints enforce participant gating (buyer or seller only)
- Add comprehensive test suite for authorization and data integrity
```

---

## Files Summary

### Created Files
- `micopay/sql/migrations/20260529100000_create_trade_messages.up.sql` — 30 lines
- `micopay/sql/migrations/20260529100000_create_trade_messages.down.sql` — 3 lines
- `apps/api/src/lib/trade-auth.ts` — 45 lines
- `apps/api/src/routes/trade-messages.ts` — 250 lines
- `apps/api/src/__tests__/trade-messages.test.ts` — 200 lines
- `micopay/frontend/src/hooks/useChatMessages.ts` — 280 lines
- `micopay/frontend/src/pages/ChatRoom.tsx` — 200 lines (refactored)
- `micopay/frontend/src/pages/DepositChat.tsx` — 180 lines (refactored)

### Modified Files
- `apps/api/src/index.ts` — 2 new imports, 2 new registrations

### Total: ~1200 lines of new code (backend + frontend)

---

## Deployment Notes

1. **Database Migration**: Must run before API deployment
2. **JWT Secret**: Ensure `config.jwtSecret` is set (already in config)
3. **CORS**: Already enabled on API (`@fastify/cors`)
4. **Auth Token**: Client must store JWT and send in Authorization header
5. **Database Pool**: PostgreSQL connection pool configured in `apps/api/src/db/schema.ts`

---

## References

- Trade schema: `micopay/sql/init.sql` (lines 59-102)
- Auth middleware: `apps/api/src/middleware/auth.middleware.ts`
- Existing routes: `apps/api/src/routes/` (all follow same pattern)
- Frontend API client pattern: See `useChatMessages` hook for fetch implementation

