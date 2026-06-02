/**
 * Offline Queue Manager
 * 
 * Manages the lifecycle of offline mutations:
 * - Detects network changes
 * - Automatically syncs queued mutations when online
 * - Handles conflicts and retries
 * - Notifies subscribers of queue status changes
 */

import {
  getPendingMutations,
  markAsSynced,
  markWithError,
  removeMutation,
  hasPendingMutations,
  type MutationType,
  type QueueItem,
} from './offlineQueue.js';

export type QueueStatus = 'idle' | 'syncing' | 'error' | 'online' | 'offline';

export interface SyncResult {
  success: boolean;
  itemId: string;
  error?: string;
}

export type QueueStatusListener = (status: QueueStatus, hasPending: boolean) => void;

let statusListeners: QueueStatusListener[] = [];
let isOnline = navigator.onLine;
let isSyncing = false;

/**
 * Handle availability mutation sync
 */
async function syncAvailabilityMutation(
  payload: any,
  token: string | null,
): Promise<boolean> {
  if (!token) {
    throw new Error('No authentication token available');
  }

  const response = await fetch('/users/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ merchant_available: payload.merchant_available }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return true;
}

/**
 * Handle config mutation sync
 */
async function syncConfigMutation(
  payload: any,
  token: string | null,
): Promise<boolean> {
  if (!token) {
    throw new Error('No authentication token available');
  }

  const response = await fetch('/merchants/me/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return true;
}

/**
 * Sync a single mutation to the backend
 */
async function syncMutation(
  item: QueueItem,
  token: string | null,
): Promise<SyncResult> {
  try {
    let success = false;

    switch (item.type) {
      case 'availability':
        success = await syncAvailabilityMutation(item.payload, token);
        break;
      case 'config':
        success = await syncConfigMutation(item.payload, token);
        break;
      default:
        throw new Error(`Unknown mutation type: ${item.type}`);
    }

    if (success) {
      await markAsSynced(item.id);
      console.log(`✅ Synced ${item.type} mutation:`, item.id);
      return { success: true, itemId: item.id };
    }

    throw new Error('Unknown sync error');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await markWithError(item.id, errorMsg);
    console.error(`❌ Failed to sync ${item.type} mutation:`, item.id, errorMsg);
    return { success: false, itemId: item.id, error: errorMsg };
  }
}

/**
 * Flush all pending mutations to the backend
 */
export async function flushQueue(token: string | null): Promise<SyncResult[]> {
  if (isSyncing) {
    console.log('Queue sync already in progress...');
    return [];
  }

  try {
    isSyncing = true;
    notifyStatusListeners('syncing');

    const pending = await getPendingMutations();
    if (pending.length === 0) {
      console.log('No pending mutations to sync');
      notifyStatusListeners('idle', false);
      return [];
    }

    console.log(`Syncing ${pending.length} pending mutation(s)...`);

    const results: SyncResult[] = [];
    for (const item of pending) {
      const result = await syncMutation(item, token);
      results.push(result);
      
      // Small delay between syncs to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const failedCount = results.filter(r => !r.success).length;
    const successCount = results.filter(r => r.success).length;

    console.log(
      `Sync complete: ${successCount} succeeded, ${failedCount} failed`,
    );

    const stillHasPending = await hasPendingMutations();
    notifyStatusListeners(failedCount > 0 ? 'error' : 'online', stillHasPending);

    return results;
  } finally {
    isSyncing = false;
  }
}

/**
 * Subscribe to queue status changes
 */
export function subscribeToQueueStatus(listener: QueueStatusListener): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

/**
 * Notify all listeners of status changes
 */
function notifyStatusListeners(status: QueueStatus, hasPending?: boolean): void {
  (async () => {
    const pending = hasPending !== undefined ? hasPending : await hasPendingMutations();
    statusListeners.forEach(listener => {
      try {
        listener(status, pending);
      } catch (error) {
        console.error('Error in queue status listener:', error);
      }
    });
  })();
}

/**
 * Initialize network monitoring
 */
export function initNetworkMonitoring(token: string | null): void {
  // Handle online event
  const handleOnline = () => {
    console.log('📡 Network online detected');
    isOnline = true;
    notifyStatusListeners('online');
    
    // Automatically flush queue when coming back online
    flushQueue(token);
  };

  // Handle offline event
  const handleOffline = () => {
    console.log('📡 Network offline detected');
    isOnline = false;
    notifyStatusListeners('offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Notify current state
  notifyStatusListeners(isOnline ? 'online' : 'offline');
}

/**
 * Check if currently online
 */
export function isCurrentlyOnline(): boolean {
  return isOnline;
}

/**
 * Check if currently syncing
 */
export function isCurrentlySyncing(): boolean {
  return isSyncing;
}

/**
 * Get current queue status
 */
export async function getQueueStatus(): Promise<{
  online: boolean;
  syncing: boolean;
  hasPending: boolean;
}> {
  return {
    online: isOnline,
    syncing: isSyncing,
    hasPending: await hasPendingMutations(),
  };
}

/**
 * Manually retry failed mutations
 */
export async function retryFailedMutations(token: string | null): Promise<SyncResult[]> {
  console.log('Retrying failed mutations...');
  return flushQueue(token);
}
