/**
 * Merchant Availability Toggle Component
 * 
 * Provides a UI component for toggling merchant availability with offline support
 */

import { useState } from 'react';
import { updateMerchantAvailabilityWithOfflineSupport } from '../services/api';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

interface MerchantAvailabilityToggleProps {
  token: string | null;
  initialAvailable: boolean;
  onAvailabilityChange?: (available: boolean) => void;
  disabled?: boolean;
}

export default function MerchantAvailabilityToggle({
  token,
  initialAvailable,
  onAvailabilityChange,
  disabled = false,
}: MerchantAvailabilityToggleProps) {
  const [available, setAvailable] = useState(initialAvailable);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offlineQueue = useOfflineQueue(token);

  const handleToggle = async () => {
    if (!token || loading) return;

    const newState = !available;
    setLoading(true);
    setError(null);

    try {
      const result = await updateMerchantAvailabilityWithOfflineSupport(
        token,
        newState,
        offlineQueue.queueMutationAsync,
      );

      setAvailable(newState);
      onAvailabilityChange?.(newState);

      if (result.queued) {
        console.log('✅ Availability change queued for sync');
      }
    } catch (err: any) {
      console.error('Error updating availability:', err);
      setError(err?.message || 'Failed to update availability');
      // Revert the state on error
      setAvailable(!newState);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggle}
        disabled={disabled || loading || !token}
        className={`
          relative inline-flex items-center h-8 rounded-full transition-colors
          ${available ? 'bg-green-500' : 'bg-gray-300'}
          ${disabled || loading || !token ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
        `}
        style={{ width: '48px' }}
      >
        <span
          className={`
            inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform
            ${available ? 'translate-x-5' : 'translate-x-1'}
          `}
        />
        <span className="sr-only">
          {available ? 'Disponible' : 'No disponible'}
        </span>
      </button>

      {error && (
        <p className="text-sm text-red-600">
          ⚠️ {error}
        </p>
      )}

      {offlineQueue.hasPending && (
        <p className="text-xs text-amber-600">
          ⏳ {available ? 'Cambio a disponible' : 'Cambio a no disponible'} pendiente de sincronizar
        </p>
      )}

      {offlineQueue.isSyncing && (
        <p className="text-xs text-blue-600 flex items-center gap-1">
          <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
          Sincronizando cambio...
        </p>
      )}
    </div>
  );
}
