import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  initializePushNotifications,
  cleanupPushListeners,
} from '../services/pushNotification.service';
import axios from 'axios';

interface UsePushNotificationsProps {
  isMerchant: boolean;
  userToken: string | null | undefined;
  apiUrl: string;
}

interface UsePushNotificationsResult {
  isEnabled: boolean;
}

/**
 * Hook to initialize and manage push notifications for merchants.
 * Handles token registration, deep-linking on notification tap, and cleanup.
 */
export function usePushNotifications({
  isMerchant,
  userToken,
  apiUrl,
}: UsePushNotificationsProps): UsePushNotificationsResult {
  const navigate = useNavigate();
  const isEnabledRef = useRef(false);

  useEffect(() => {
    if (!isMerchant || !userToken) {
      return;
    }

    const setup = async () => {
      try {
        // Initialize push notifications
        const { permitted } = await initializePushNotifications(
          // Callback: token received
          async (token: string) => {
            try {
              await axios.patch(
                `${apiUrl}/users/me/push_token`,
                { push_token: token },
                {
                  headers: { Authorization: `Bearer ${userToken}` },
                }
              );
              console.log('[push] Token registered with backend');
            } catch (err) {
              console.error('[push] Failed to register token:', err);
              // Do not crash app on token registration failure
            }
          },

          // Callback: notification tapped
          (tradeId: string | null) => {
            if (tradeId) {
              // Deep-link to specific trade detail page (pendiente — route not yet in app)
              console.log('[push] Would navigate to trade:', tradeId);
              navigate(`/trade/${tradeId}`);
            } else {
              // No trade ID — navigate to merchant inbox
              navigate('/inbox');
            }
          }
        );

        isEnabledRef.current = permitted;
      } catch (err) {
        console.error('[push] Setup failed:', err);
        isEnabledRef.current = false;
      }
    };

    setup();

    // Cleanup on unmount
    return () => {
      void cleanupPushListeners();
    };
  }, [isMerchant, userToken, navigate, apiUrl]);

  return {
    isEnabled: isEnabledRef.current,
  };
}
