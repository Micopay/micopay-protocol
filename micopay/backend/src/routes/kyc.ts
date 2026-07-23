import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.middleware.js';
import db from '../db/schema.js';
import { UpstreamError, NotFoundError } from '../utils/errors.js';
import { createOnboardingUrl, getKycStatus } from '../services/etherfuse.service.js';
import { createDiditSession, mapDiditStatus } from '../services/didit.service.js';
import { verifyDiditWebhookSignature } from '../lib/webhook-auth.js';

// Etherfuse uses a HOSTED onboarding flow: we generate customerId/bankAccountId
// UUIDs and a presigned URL; the user completes identity verification, document
// upload, bank account (CLABE) linking, and agreement signing on Etherfuse's own
// page. We never collect KYC data ourselves. These IDs are permanently bound to
// the user once submitted — see docs/SPEI_ANCHOR_PLAN.md.

interface UserRow {
  id: string;
  stellar_address: string;
  username: string | null;
  etherfuse_customer_id: string | null;
  etherfuse_bank_account_id: string | null;
}

interface DiditSessionRow {
  session_id: string;
  user_id: string;
  requested_level: number;
  status: 'pending' | 'approved' | 'rejected';
  decision_reason: string | null;
}

/** `vendor_data` we send Didit at session creation — see didit.service.ts. */
function encodeVendorData(userId: string, level: number): string {
  return `${userId}:${level}`;
}

function parseVendorData(vendorData: string | undefined | null): { userId: string; level: number } | null {
  if (!vendorData) return null;
  const [userId, levelStr] = vendorData.split(':');
  const level = Number(levelStr);
  if (!userId || (level !== 1 && level !== 2)) return null;
  return { userId, level };
}

async function startEtherfuseKyc(request: any) {
  if (!process.env.ETHERFUSE_API_KEY) {
    throw new UpstreamError(
      'ETHERFUSE_NOT_CONFIGURED',
      'La verificación de identidad no está disponible por el momento.',
      'ETHERFUSE_API_KEY not configured',
      503,
    );
  }

  const userId = request.user.id;
  const user = await db.getOne<UserRow>(
    'SELECT id, stellar_address, username, etherfuse_customer_id, etherfuse_bank_account_id FROM users WHERE id = $1',
    [userId],
  );
  if (!user) {
    throw new NotFoundError('User not found');
  }

  let { etherfuse_customer_id: customerId, etherfuse_bank_account_id: bankAccountId } = user;
  if (!customerId || !bankAccountId) {
    customerId = customerId ?? randomUUID();
    bankAccountId = bankAccountId ?? randomUUID();
    await db.execute(
      'UPDATE users SET etherfuse_customer_id = $1, etherfuse_bank_account_id = $2 WHERE id = $3',
      [customerId, bankAccountId, userId],
    );
  }

  try {
    const onboardingUrl = await createOnboardingUrl({
      customerId,
      bankAccountId,
      publicKey: user.stellar_address,
      userInfo: { displayName: user.username ?? undefined },
    });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return { onboardingUrl, expiresAt };
  } catch (err: any) {
    throw new UpstreamError(
      'ETHERFUSE_ONBOARDING_FAILED',
      'No se pudo iniciar la verificación de identidad. Intenta de nuevo en unos minutos.',
      err.message || 'Failed to create Etherfuse onboarding URL',
    );
  }
}

async function startDiditKyc(request: any) {
  if (!process.env.DIDIT_API_KEY) {
    throw new UpstreamError(
      'DIDIT_NOT_CONFIGURED',
      'La verificación de identidad no está disponible por el momento.',
      'DIDIT_API_KEY not configured',
      503,
    );
  }

  const userId = request.user.id;
  const level = request.query?.level === '2' ? 2 : 1;

  const user = await db.getOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  try {
    const session = await createDiditSession({ vendorData: encodeVendorData(userId, level) });

    await db.execute(
      `INSERT INTO kyc_didit_sessions (session_id, user_id, requested_level, status)
       VALUES ($1, $2, $3, 'pending')`,
      [session.sessionId, userId, level],
    );

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return { onboardingUrl: session.url, expiresAt };
  } catch (err: any) {
    throw new UpstreamError(
      'DIDIT_ONBOARDING_FAILED',
      'No se pudo iniciar la verificación de identidad. Intenta de nuevo en unos minutos.',
      err.message || 'Failed to create Didit session',
    );
  }
}

async function getEtherfuseStatus(request: any) {
  const userId = request.user.id;
  const user = await db.getOne<UserRow>(
    'SELECT etherfuse_customer_id FROM users WHERE id = $1',
    [userId],
  );
  if (!user?.etherfuse_customer_id) {
    return { status: 'not_started' };
  }

  try {
    const kyc = await getKycStatus(user.etherfuse_customer_id);
    await db.execute('UPDATE users SET kyc_status = $1 WHERE id = $2', [kyc.status, userId]);
    return { status: kyc.status, rejectionReason: kyc.currentRejectionReason };
  } catch (err: any) {
    throw new UpstreamError(
      'ETHERFUSE_KYC_STATUS_FAILED',
      'No se pudo consultar el estado de verificación. Intenta de nuevo en unos minutos.',
      err.message || 'Failed to fetch Etherfuse KYC status',
    );
  }
}

async function getDiditStatus(request: any) {
  const userId = request.user.id;
  // Didit's decision only ever arrives via webhook (no live status API call
  // here, unlike Etherfuse) — so this reads our own last-known session state
  // rather than round-tripping to Didit on every poll.
  const session = await db.getOne<DiditSessionRow>(
    `SELECT session_id, user_id, requested_level, status, decision_reason
     FROM kyc_didit_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!session) {
    return { status: 'not_started' };
  }
  return { status: session.status, rejectionReason: session.decision_reason };
}

export async function kycRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/defi/kyc/start',
    { preHandler: [authMiddleware] },
    async (request: any) => {
      const provider = request.query?.provider === 'didit' ? 'didit' : 'etherfuse';
      return provider === 'didit' ? startDiditKyc(request) : startEtherfuseKyc(request);
    },
  );

  app.get(
    '/defi/kyc/status',
    { preHandler: [authMiddleware] },
    async (request: any) => {
      const provider = request.query?.provider === 'didit' ? 'didit' : 'etherfuse';
      return provider === 'didit' ? getDiditStatus(request) : getEtherfuseStatus(request);
    },
  );

  // Didit webhook — scoped to its own encapsulated Fastify context so the
  // raw-body content-type parser below only applies to this one route and
  // never affects JSON parsing anywhere else in the app. Exact raw bytes are
  // required here (unlike Etherfuse's webhook, which re-canonicalizes the
  // parsed body) — see webhook-auth.ts's verifyDiditWebhookSignature comment.
  await app.register(async function diditWebhookScope(scoped: FastifyInstance) {
    scoped.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body: string, done) => {
        try {
          const json = body.length ? JSON.parse(body) : {};
          done(null, { raw: body, json });
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    scoped.post('/defi/kyc/webhook/didit', async (request: any, reply) => {
      const { raw, json } = request.body as { raw: string; json: any };
      const signature = request.headers['x-signature'] as string | undefined;
      const timestamp = request.headers['x-timestamp'] as string | undefined;
      const secret = process.env.DIDIT_WEBHOOK_SECRET;

      const { valid, error } = verifyDiditWebhookSignature(raw, signature, timestamp, secret);
      if (!valid) {
        return reply.status(401).send({ error: `webhook signature verification failed: ${error}` });
      }

      const sessionId: string | undefined = json?.session_id;
      const vendorData = parseVendorData(json?.vendor_data);
      const status = mapDiditStatus(json?.status);

      if (!sessionId || !vendorData) {
        request.log.warn({ body: json }, 'Didit webhook: missing session_id or unparseable vendor_data');
        return reply.status(200).send({ received: true });
      }

      const reason: string | null = json?.decision?.reason ?? null;

      await db.execute(
        `UPDATE kyc_didit_sessions SET status = $1, decision_reason = $2, updated_at = NOW() WHERE session_id = $3`,
        [status, reason, sessionId],
      );

      if (status === 'approved') {
        await db.execute(
          `UPDATE users SET kyc_level = $1, kyc_provider = 'didit', kyc_level_verified_at = NOW() WHERE id = $2`,
          [vendorData.level, vendorData.userId],
        );
      }

      request.log.info({ sessionId, status, category: 'kyc.didit' }, 'Didit webhook processed');
      return reply.status(200).send({ received: true });
    });
  });
}
