import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Initialize push notifications for Android.
 * Returns { permitted: true } if permissions granted, { permitted: false } otherwise.
 * Never throws — permission denial is gracefully handled with polling fallback.
 */
export async function initializePushNotifications(
  onTokenReceived: (token: string) => Promise<void>,
  onNotificationTap: (tradeId: string | null) => void
): Promise<{ permitted: boolean }> {
  // Skip on web/PWA
  if (!Capacitor.isNativePlatform()) {
    return { permitted: false };
  }

  try {
    // Check and request permissions
    const permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      // Show rationale dialog before system prompt (Android best practice)
      await showPushRationaleDialog();

      // Request permissions
      const result = await PushNotifications.requestPermissions();
      if (result.receive !== 'granted') {
        console.warn('[push] Permission denied by user');
        return { permitted: false };
      }
    }

    if (permStatus.receive === 'denied') {
      console.warn('[push] Notifications already denied');
      return { permitted: false };
    }

    // Register for push notifications
    await PushNotifications.register();

    // Listener: token received or refreshed
    PushNotifications.addListener('registration', async (token) => {
      console.log('[push] Token received:', token.value);
      try {
        await onTokenReceived(token.value);
      } catch (err) {
        console.error('[push] Failed to send token to backend:', err);
      }
    });

    // Listener: registration error
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] Registration error:', err);
    });

    // Listener: notification received in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] Notification received in foreground:', notification);
      // In a real app, show an in-app banner or toast here
      // For now, just log it
    });

    // Listener: notification tapped (app in background or closed)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const tradeId = action.notification.data?.tradeId;
      console.log('[push] Notification tapped with trade ID:', tradeId);
      onNotificationTap(tradeId || null);
    });

    console.log('[push] Initialized successfully');
    return { permitted: true };
  } catch (err) {
    console.error('[push] Initialization error:', err);
    return { permitted: false };
  }
}

/**
 * Show a rationale dialog before requesting push permissions.
 * Uses a simple alert for now — can be replaced with a custom dialog.
 */
export async function showPushRationaleDialog(): Promise<void> {
  return new Promise((resolve) => {
    // Use browser confirm for web, or show custom modal for native
    if (typeof window !== 'undefined' && window.confirm) {
      const shouldContinue = window.confirm(
        'Habilita notificaciones para recibir alertas cuando un comprador crea un intercambio contigo — incluso cuando la aplicación está cerrada.'
      );
      resolve();
    } else {
      resolve();
    }
  });
}

/**
 * Clean up all push notification listeners.
 * Call on logout or component unmount to prevent stale listeners.
 */
export async function cleanupPushListeners(): Promise<void> {
  try {
    await PushNotifications.removeAllListeners();
    console.log('[push] Listeners cleaned up');
  } catch (err) {
    console.error('[push] Failed to clean up listeners:', err);
  }
}
