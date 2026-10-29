# Offline-First Queue for Merchant Mutations

## Overview

This implementation adds offline-first support for idempotent merchant mutations (availability and settings changes) in the MicoPay mobile app. When a merchant changes their availability or settings in an area with intermittent connectivity, the change is stored locally in IndexedDB and automatically synced when the connection is restored.

## Architecture

### Components

#### 1. **IndexedDB Queue Service** (`offlineQueue.ts`)
- Manages local storage of mutations using IndexedDB
- Provides CRUD operations for queue items
- Tracks sync status and errors
- Persists queue across page reloads

**Key Functions:**
- `initOfflineQueue()` - Initialize IndexedDB connection
- `queueMutation(type, payload)` - Add a mutation to the queue
- `getPendingMutations()` - Get all unsynced mutations
- `markAsSynced(id)` - Mark mutation as successfully synced
- `markWithError(id, error)` - Record sync failures

#### 2. **Offline Queue Manager** (`offlineQueueManager.ts`)
- Orchestrates network monitoring and automatic sync
- Handles conflict resolution and retries
- Emits status change events for UI updates
- Automatically flushes queue on reconnection

**Key Functions:**
- `initNetworkMonitoring(token)` - Set up online/offline listeners
- `flushQueue(token)` - Sync all pending mutations
- `subscribeToQueueStatus(listener)` - Listen for status changes
- `retryFailedMutations(token)` - Manual retry mechanism

#### 3. **React Hook** (`useOfflineQueue.ts`)
- Provides convenient React integration
- Manages offline queue state in components
- Handles initialization and cleanup

**Hook Usage:**
```typescript
const offlineQueue = useOfflineQueue(token);

// Access state
offlineQueue.isOnline
offlineQueue.hasPending
offlineQueue.isSyncing
offlineQueue.queueStatus

// Trigger actions
await offlineQueue.queueMutationAsync(type, payload)
await offlineQueue.flushQueueAsync(token)
await offlineQueue.retryAsync(token)
```

#### 4. **UI Components**

##### `MerchantAvailabilityToggle.tsx`
Availability toggle with offline support. Shows:
- Real-time toggle state
- Pending sync indicator
- Error messages
- Sync status

##### `OfflineQueueStatus.tsx`
Global queue status display. Shows:
- Connection status
- Pending mutations count
- Manual retry button
- Syncing progress

#### 5. **API Service Updates** (`api.ts`)
New offline-aware wrapper functions:
- `updateMerchantAvailabilityWithOfflineSupport()` - Queues availability changes if offline
- `updateMerchantConfigWithOfflineSupport()` - Queues config changes if offline

## Data Flow

### Online Flow (Normal)
```
User Changes Availability
    ↓
API Request to Server
    ↓
Success Response
    ↓
UI Updated
```

### Offline Flow
```
User Changes Availability
    ↓
API Request Fails (Network Error)
    ↓
Detect Offline Status
    ↓
Queue Mutation in IndexedDB
    ↓
Show "Pendiente de sincronizar" UI
    ↓
[User stays offline...]
    ↓
Network Restored
    ↓
Auto-Flush Queue
    ↓
API Request Retried
    ↓
Success → Remove from Queue
    ↓
Failure → Show Error & Retry Button
```

## Implementation Details

### Mutation Types
- `availability` - Merchant online/offline/paused status
- `config` - Rate, min/max trade amounts, daily cap

### Queue Item Structure
```typescript
{
  id: string                    // Unique identifier
  type: 'availability' | 'config'
  payload: any                  // The actual mutation data
  timestamp: number             // When queued
  synced: boolean              // Sync status
  error?: string               // Error message if failed
}
```

### Status States
- `idle` - No pending mutations
- `online` - Connected to internet
- `offline` - Disconnected from internet
- `syncing` - Currently flushing queue
- `error` - Last sync attempt failed

## UI Integration

### In MerchantSettings Component
```typescript
// Shows status banners:
// - "Sin conexión" - when offline
// - "Pendiente de sincronizar" - when items queued
// - "Sincronizando..." - during sync

// Disable save button during sync
disabled={saving || !token || offlineQueue.isSyncing}

// Show message indicating queue vs server save
if (result.queued) {
  message = "Cambios guardados localmente. Se sincronizarán..."
} else {
  message = "Configuración guardada exitosamente."
}
```

## Conflict Resolution

### Strategy
- **Server wins** for conflicting trade data (read-only for offline users)
- **Client retry** for merchant settings (idempotent, user can retry)
- Clear error messages guide user to retry or investigate

### Error Scenarios
1. **Network timeout** → Queue locally, auto-retry on reconnect
2. **Validation error** → Show error, don't queue
3. **Server conflict** → Show conflict UI, allow manual retry
4. **Sync partial failure** → Show failed items, allow bulk retry

## Testing Guide

### Manual Testing Steps

#### 1. **Offline Availability Change**
- [ ] Open Merchant Settings
- [ ] Toggle to Airplane Mode
- [ ] Change availability setting
- [ ] Verify "Pendiente de sincronizar" indicator appears
- [ ] Verify app doesn't crash
- [ ] Verify data persists (reload page)

#### 2. **Queue Flushing on Reconnect**
- [ ] Change setting while offline
- [ ] Disable Airplane Mode
- [ ] Verify automatic sync begins
- [ ] Verify "Sincronizando..." appears briefly
- [ ] Verify UI updates when sync completes
- [ ] Verify no pending indicators remain

#### 3. **Conflict Handling**
- [ ] Offline: Change setting A
- [ ] Online (different device): Change setting A to different value
- [ ] First device reconnects
- [ ] Verify server value wins (reload shows server value)
- [ ] Verify clear error message shown
- [ ] Verify retry button available

#### 4. **Multiple Mutations**
- [ ] Offline: Queue 3+ different mutations
- [ ] Online: Verify all sync in order
- [ ] Verify single connection error stops others
- [ ] Verify retry button retries all

#### 5. **Persistence**
- [ ] Queue mutation while offline
- [ ] Close browser tab/app
- [ ] Reopen app
- [ ] Verify queue items still present
- [ ] Verify auto-sync still works

## Performance Considerations

### IndexedDB Limits
- Modern browsers: 50MB+ available
- ~100KB per mutation expected
- Support for thousands of queued items

### Sync Strategy
- Batch sync on reconnection
- 100ms delay between mutations (prevents server overload)
- Exponential backoff for retries (not implemented in v1)

## Limitations & Future Work

### Current (v1)
- ✅ IndexedDB queue storage
- ✅ Availability + settings mutations only
- ✅ Automatic sync on reconnection
- ✅ Pending UI indicators
- ✅ Error handling & manual retry

### Out of Scope (v1)
- ❌ Full offline trade lifecycle
- ❌ Service worker caching
- ❌ Exponential backoff retries
- ❌ Conflict merging strategies
- ❌ Backend audit logging

### Future Enhancements
- Exponential backoff for retries
- Backend mutation audit trail
- Advanced conflict detection
- Bi-directional sync
- Offline chat/messaging

## Error Handling

### Network Error Detection
```typescript
if (!navigator.onLine || 
    error.message?.includes('Network') || 
    error.code === 'ECONNABORTED') {
  // Queue locally
}
```

### Sync Failure Handling
```typescript
try {
  // Attempt sync
  await syncMutation(item, token)
  // Mark as synced
  await markAsSynced(item.id)
} catch (error) {
  // Record error for retry
  await markWithError(item.id, error.message)
  // Notify user
}
```

## API Endpoint Compatibility

Requires these backend endpoints:
- `PATCH /users/me` - Update merchant_available
- `PUT /merchants/me/config` - Update rate, min/max, daily_cap

No new backend endpoints required (v1).

## Documentation Files

- This file: Architecture and implementation guide
- `offlineQueue.ts`: IndexedDB API documentation
- `offlineQueueManager.ts`: Queue manager API documentation
- `useOfflineQueue.ts`: React hook documentation
- `MerchantSettings.tsx`: Usage example in component
- `MerchantAvailabilityToggle.tsx`: Availability toggle example
- `OfflineQueueStatus.tsx`: Status display example

## Troubleshooting

### Queue Items Not Syncing
1. Check browser console for errors
2. Verify network connection detection working
3. Check IndexedDB quota not exceeded
4. Verify token still valid

### UI Not Updating
1. Check hook is properly initialized
2. Verify listener subscription active
3. Check for React strict mode double-renders

### Data Loss
1. IndexedDB data persists across reloads
2. Check browser privacy settings (incognito blocks IndexedDB)
3. Verify browser storage quota not exceeded

## Browser Support

Requires:
- IndexedDB support (all modern browsers)
- ES2020+ (async/await, Promise.all, etc.)
- localStorage for fallback (future)

Tested on:
- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- iOS Safari 14+
- Android Chrome

## Security Considerations

### Data at Rest
- IndexedDB data not encrypted (browser security boundary)
- Same-origin policy enforced by browser
- Cleared on logout/account deletion

### Data in Transit
- HTTPS required for production
- Bearer token in Authorization header
- No sensitive data in queue payload

### Conflict Scenarios
- Server state is authoritative for trades
- Client can retry for settings (safe, idempotent)
- User approval required for critical conflicts

## Maintenance

### Monitoring
- Log queue size and sync times
- Monitor sync failure rates
- Track pending item age
- Alert on stale items (>24h)

### Cleanup
- Auto-remove synced items after 24h
- Limit queue to last 100 items
- Clear old errors after 7 days

### Migration Path (v2)
- Add backend mutation audit table
- Implement server-side deduplication
- Add exponential backoff for retries
- Support for more mutation types
