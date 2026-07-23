import type { FastifyInstance } from 'fastify';
import { adminMiddleware } from '../middleware/auth.middleware.js';
import { listAdminDisputes, resolveAdminDispute } from '../services/admin.service.js';

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require admin privileges
  app.addHook('preHandler', adminMiddleware);

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

    return resolveAdminDispute({
      disputeIdOrTradeId: id,
      adminUserId: request.user.id,
      resolution,
      note,
      banTarget: ban_target,
      outcome,
    });
  });
}
