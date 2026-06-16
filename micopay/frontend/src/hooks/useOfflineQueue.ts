import { useState, useEffect, useCallback } from 'react';
import {
  initOfflineQueue,
  queueMutation,
  MutationType,
  getPendingMutationCount,
  getPendingMutations,
  markAsSynced,
} from '../services/offlineQueue';

interface UseOfflineQueueResult {
  queueMutationAsync: (type: string, payload: unknown) => Promise<string>;
  retryAsync: (token: string | null) => Promise<void>;
  hasPending: boolean;
  isSyncing: boolean;
  isOnline: boolean;
}

export function useOfflineQueue(_token: string | null): UseOfflineQueueResult {
  const [hasPending, setHasPending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    initOfflineQueue().catch(() => {});
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshPending = useCallback(() => {
    getPendingMutationCount().then((n) => setHasPending(n > 0)).catch(() => {});
  }, []);

  const queueMutationAsync = useCallback(async (type: string, payload: unknown): Promise<string> => {
    const id = await queueMutation(type as MutationType, payload);
    refreshPending();
    return id;
  }, [refreshPending]);

  const retryAsync = useCallback(async (_token: string | null) => {
    setIsSyncing(true);
    try {
      const pending = await getPendingMutations();
      await Promise.all(pending.map((item) => markAsSynced(item.id).catch(() => {})));
      refreshPending();
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPending]);

  return { queueMutationAsync, retryAsync, hasPending, isSyncing, isOnline };
}
