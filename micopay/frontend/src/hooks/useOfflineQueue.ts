/**
 * useOfflineQueue Hook
 * 
 * React hook for managing offline queue state and status in components
 */

import { useEffect, useState, useCallback } from 'react';
import {
  initOfflineQueue,
  hasPendingMutations,
  queueMutation,
  type MutationType,
} from '../services/offlineQueue.js';
import {
  initNetworkMonitoring,
  flushQueue,
  isCurrentlyOnline,
  subscribeToQueueStatus,
  retryFailedMutations,
  type QueueStatus,
} from '../services/offlineQueueManager.js';

export interface UseOfflineQueueReturn {
  // Queue state
  isOnline: boolean;
  isSyncing: boolean;
  hasPending: boolean;
  queueStatus: QueueStatus;

  // Actions
  queueMutationAsync: (type: MutationType, payload: any) => Promise<string>;
  flushQueueAsync: (token: string | null) => Promise<void>;
  retryAsync: (token: string | null) => Promise<void>;

  // Helpers
  getPendingCount: () => Promise<number>;
}

let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the offline queue system (idempotent)
 */
async function ensureOfflineQueueInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      try {
        await initOfflineQueue();
        console.log('✅ Offline queue system initialized');
      } catch (error) {
        console.error('Failed to initialize offline queue:', error);
        // Non-critical failure - app continues without offline support
      }
    })();
  }
  return initializationPromise;
}

export function useOfflineQueue(token: string | null): UseOfflineQueueReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>('idle');

  // Initialize offline queue and network monitoring on mount
  useEffect(() => {
    (async () => {
      await ensureOfflineQueueInitialized();
      initNetworkMonitoring(token);

      // Check initial pending state
      const pending = await hasPendingMutations();
      setHasPending(pending);
    })();
  }, [token]);

  // Subscribe to queue status changes
  useEffect(() => {
    const unsubscribe = subscribeToQueueStatus((status, pending) => {
      setQueueStatus(status);
      setHasPending(pending);
      setIsOnline(status !== 'offline');
      setIsSyncing(status === 'syncing');
    });

    return unsubscribe;
  }, []);

  const queueMutationAsync = useCallback(
    async (type: MutationType, payload: any): Promise<string> => {
      try {
        const id = await queueMutation(type, payload);
        setHasPending(true);
        return id;
      } catch (error) {
        console.error('Failed to queue mutation:', error);
        throw error;
      }
    },
    [],
  );

  const flushQueueAsync = useCallback(
    async (token: string | null) => {
      try {
        await flushQueue(token);
      } catch (error) {
        console.error('Failed to flush queue:', error);
        throw error;
      }
    },
    [],
  );

  const retryAsync = useCallback(
    async (token: string | null) => {
      try {
        await retryFailedMutations(token);
      } catch (error) {
        console.error('Failed to retry mutations:', error);
        throw error;
      }
    },
    [],
  );

  const getPendingCount = useCallback(async (): Promise<number> => {
    const pending = await hasPendingMutations();
    return pending ? 1 : 0; // Simple count or get detailed list
  }, []);

  return {
    isOnline,
    isSyncing,
    hasPending,
    queueStatus,
    queueMutationAsync,
    flushQueueAsync,
    retryAsync,
    getPendingCount,
  };
}
