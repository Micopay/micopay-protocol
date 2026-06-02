import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { config } from '../config.js';
import db from '../db/schema.js';
import pino from 'pino';

const logger = pino({ name: 'push.service' });

let messaging: admin.messaging.Messaging | null = null;
let initialized = false;

/**
 * Initialize Firebase Admin SDK for FCM messaging.
 * Supports both service account JSON file and individual credential env vars.
 */
function initializeFirebase() {
  if (initialized) return;

  try {
    let serviceAccount: any;

    // Try loading from GOOGLE_APPLICATION_CREDENTIALS or FCM_SERVICE_ACCOUNT_JSON
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FCM_SERVICE_ACCOUNT_JSON;

    if (serviceAccountPath && existsSync(serviceAccountPath)) {
      try {
        const content = readFileSync(serviceAccountPath, 'utf-8');
        serviceAccount = JSON.parse(content);
      } catch (err) {
        logger.warn(
          { err, path: serviceAccountPath },
          'Failed to parse service account JSON file'
        );
      }
    }

    // Fallback: use individual env vars
    if (!serviceAccount) {
      if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      ) {
        serviceAccount = {
          type: 'service_account',
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: 'key-id',
          private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: 'client-id',
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
        };
      }
    }

    if (!serviceAccount) {
      logger.warn(
        'Firebase credentials not configured. Push notifications disabled. ' +
        'Set GOOGLE_APPLICATION_CREDENTIALS, FCM_SERVICE_ACCOUNT_JSON, or FIREBASE_* env vars.'
      );
      initialized = true;
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    messaging = admin.messaging();
    logger.info('Firebase Admin SDK initialized for push notifications');
    initialized = true;
  } catch (err) {
    logger.error({ err }, 'Failed to initialize Firebase Admin SDK');
    initialized = true;
  }
}

export interface TradeNotificationPayload {
  tradeId: string;
  amount: string; // formatted with currency (e.g., "500.00 MXN")
  buyerUsername: string;
}

/**
 * Send a push notification to a merchant when a trade is created.
 * Fire-and-forget: never throws or fails the trade creation.
 */
export async function sendTradeNotificationToMerchant(
  merchantUserId: string,
  payload: TradeNotificationPayload
): Promise<void> {
  if (!initialized) {
    initializeFirebase();
  }

  if (!messaging) {
    logger.info(
      { merchant_user_id: merchantUserId },
      'Firebase messaging not available, skipping push notification'
    );
    return;
  }

  try {
    // Fetch the merchant's push_token from DB
    const user = await db.getOne<{ push_token: string | null }>(
      'SELECT push_token FROM users WHERE id = $1',
      [merchantUserId]
    );

    if (!user || !user.push_token) {
      logger.info(
        { merchant_user_id: merchantUserId },
        'Merchant has no push token, skipping push notification'
      );
      return;
    }

    const message: admin.messaging.Message = {
      notification: {
        title: 'Nueva solicitud de intercambio',
        body: `${payload.buyerUsername} quiere intercambiar ${payload.amount}`,
      },
      data: {
        tradeId: payload.tradeId,
        type: 'new_trade',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'trade_alerts',
          priority: 'max',
          defaultSound: true,
          sound: 'default',
        },
      },
      token: user.push_token,
    };

    await messaging.send(message);
    logger.info(
      { merchant_user_id: merchantUserId, trade_id: payload.tradeId },
      'Push notification sent successfully'
    );
  } catch (err: any) {
    // Handle token expiration errors
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      logger.warn(
        { merchant_user_id: merchantUserId, error_code: err.code },
        'FCM token expired, clearing for user'
      );
      try {
        await db.execute(
          'UPDATE users SET push_token = NULL WHERE id = $1',
          [merchantUserId]
        );
      } catch (updateErr) {
        logger.error({ err: updateErr }, 'Failed to clear expired push token');
      }
      return;
    }

    // Log other FCM errors but do not throw
    logger.error(
      { err, merchant_user_id: merchantUserId, trade_id: payload.tradeId },
      'Failed to send push notification'
    );
  }
}
