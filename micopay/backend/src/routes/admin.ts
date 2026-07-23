import type { FastifyInstance } from 'fastify';
import { adminMiddleware } from '../middleware/auth.middleware.js';
import { listAdminDisputes } from '../services/admin.service.js';

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
}
