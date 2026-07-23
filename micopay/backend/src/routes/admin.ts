import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config, type KycOperationType } from '../config.js';
import { pauseUser, unpauseUser } from '../services/abuse.service.js';
import { getKycAuditTrail, type GateDecision } from '../services/kyc-gate.service.js';
import { generateMonthlyFiling } from '../services/compliance.service.js';
import { listAdminDisputes, resolveAdminDispute } from '../services/admin.service.js';
import { AuthError, NotFoundError } from '../utils/errors.js';
import db from '../db/schema.js';

async function assertAdminAccess(request: FastifyRequest, reply: FastifyReply) {
  // Check ADMIN_API_KEY if present in headers
  const apiKey =
    (request.headers['x-admin-api-key'] as string) ||
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : '');

  if (config.adminApiKey && apiKey === config.adminApiKey) {
    return;
  }

  // Fallback to JWT admin check
  try {
    await request.jwtVerify();
    const { id } = request.user as { id: string };
    const user = await db.getOne<{ is_admin?: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [id],
    );

    if (user?.is_admin) {
      return;
    }
  } catch {}

  throw new AuthError(
    'ADMIN_UNAUTHORIZED',
    'No autorizado para esta acción.',
    'Invalid or missing admin credentials or API key',
  );
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    await assertAdminAccess(request, reply);
  });

  /**
   * GET /admin/disputes
   * List open disputes with trade context (amounts, parties, evidence/messages, audit trail).
   */
  app.get('/admin/disputes', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'resolved', 'all'], default: 'open' },
          page: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request) => {
    const { status, page, limit } = request.query as {
      status?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return listAdminDisputes(status || 'open', pageNum, limitNum);
  });

  /**
   * POST /admin/disputes/:id/resolve
   * Admin resolution action: refund buyer, release to seller, or ban a party.
   * Closes the dispute, updates trade status accordingly, and logs audit entries.
   */
  app.post('/admin/disputes/:id/resolve', {
    schema: {
      body: {
        type: 'object',
        required: ['resolution'],
        properties: {
          resolution: {
            type: 'string',
            enum: ['refund_buyer', 'release_seller', 'ban_party', 'ban_buyer', 'ban_seller', 'buyer_wins', 'seller_wins'],
          },
          note: { type: 'string' },
          ban_target: { type: 'string' },
          outcome: { type: 'string', enum: ['refund_buyer', 'release_seller'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { resolution, note, ban_target, outcome } = request.body as {
      resolution: string;
      note?: string;
      ban_target?: string;
      outcome?: 'refund_buyer' | 'release_seller';
    };

    const adminUserId = request.user?.id || 'admin';

    return resolveAdminDispute({
      disputeIdOrTradeId: id,
      adminUserId,
      resolution,
      note,
      banTarget: ban_target,
      outcome,
    });
  });

  /**
   * POST /admin/users/:id/suspend
   * Deactivate a user or merchant (blocks new trades via auth + abuse checks).
   */
  app.post('/admin/users/:id/suspend', async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = (request.body as { reason?: string } | undefined) ?? {};

    const user = await db.getOne('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado', `User ${id}`);

    await pauseUser(id, reason || 'admin_suspend', null);
    return { ok: true, user_id: id, status: 'suspended' };
  });

  /**
   * GET /admin/users/by-username/:username
   * Look up a user's id by username.
   */
  app.get('/admin/users/by-username/:username', async (request) => {
    const { username } = request.params as { username: string };
    const user = await db.getOne(
      'SELECT id, username, stellar_address FROM users WHERE username = $1',
      [username],
    );
    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado', `User ${username}`);
    return { user };
  });

  /**
   * DELETE /admin/users/:id/suspend
   * Reactivate a suspended user.
   */
  app.delete('/admin/users/:id/suspend', async (request) => {
    const { id } = request.params as { id: string };

    const user = await db.getOne('SELECT id FROM users WHERE id = $1', [id]);
    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'Usuario no encontrado', `User ${id}`);

    await unpauseUser(id, null);
    return { ok: true, user_id: id, status: 'active' };
  });

  /**
   * GET /admin/kyc/audit
   * Query the #314 tiered-KYC-gate decision trail.
   */
  app.get('/admin/kyc/audit', async (request) => {
    const { user_id, operation_type, gate_decision, from, to, limit } =
      (request.query as {
        user_id?: string;
        operation_type?: string;
        gate_decision?: string;
        from?: string;
        to?: string;
        limit?: string;
      } | undefined) ?? {};

    const events = await getKycAuditTrail({
      userId: user_id,
      operationType: operation_type as KycOperationType | undefined,
      gateDecision: gate_decision as GateDecision | undefined,
      fromDate: from,
      toDate: to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return { events };
  });

  /**
   * GET /admin/compliance/alerts
   * Query the compliance alerts.
   */
  app.get('/admin/compliance/alerts', async (request) => {
    const { user_id, reason, severity, limit } = (request.query as {
      user_id?: string;
      reason?: string;
      severity?: string;
      limit?: string;
    } | undefined) ?? {};

    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const queryLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : Math.min(parsedLimit, 500);

    const alerts = await db.getMany(
      `SELECT id, user_id, reason, severity, details, created_at, sla_deadline
       FROM compliance_alerts
       ORDER BY created_at DESC
       LIMIT ${queryLimit}`,
    );

    const filtered = alerts.filter((row) => {
      if (user_id && row.user_id !== user_id) return false;
      if (reason && row.reason !== reason) return false;
      if (severity && row.severity !== severity) return false;
      return true;
    });

    return { alerts: filtered };
  });

  /**
   * GET /admin/compliance/filings
   * Query the compliance filings.
   */
  app.get('/admin/compliance/filings', async (request) => {
    const { is_zero_report, limit } = (request.query as {
      is_zero_report?: string;
      limit?: string;
    } | undefined) ?? {};

    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const queryLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : Math.min(parsedLimit, 500);

    const filings = await db.getMany(
      `SELECT id, period_start, period_end, filing_type, report_data, is_zero_report, created_at
       FROM compliance_filings
       ORDER BY period_start DESC
       LIMIT ${queryLimit}`,
    );

    const filtered = filings.filter((row) => {
      if (is_zero_report !== undefined && String(row.is_zero_report) !== is_zero_report) return false;
      return true;
    });

    return { filings: filtered };
  });

  /**
   * POST /admin/compliance/filings/trigger
   * Manually trigger compliance filing generation for a specific month.
   */
  app.post('/admin/compliance/filings/trigger', async (request) => {
    const { year, month } = (request.body as { year?: number | string; month?: number | string } | undefined) ?? {};
    const numericYear = year !== undefined ? Number(year) : NaN;
    const numericMonth = month !== undefined ? Number(month) : NaN;

    if (isNaN(numericYear) || isNaN(numericMonth) || numericMonth < 1 || numericMonth > 12) {
      throw new Error('year and month (1-12) are required in body');
    }

    const filing = await generateMonthlyFiling(numericYear, numericMonth);
    return { success: true, filing };
  });
}
