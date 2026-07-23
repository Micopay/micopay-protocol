import db from '../db/schema.js';
import { getTradeAuditTrail as getTradeAuditTrailRows } from '../db/audit-log.model.js';

export interface AdminDisputeItem {
  id: string;
  trade_id: string;
  reported_by: string;
  reason: string;
  evidence_urls: string[];
  status: 'open' | 'resolved';
  resolution: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  trade: {
    id: string;
    amount_mxn: number;
    amount_stroops: string;
    platform_fee_mxn: number;
    status: string;
    secret_hash: string;
    lock_tx_hash: string | null;
    release_tx_hash: string | null;
    created_at: string;
    expires_at: string;
  } | null;
  parties: {
    buyer: { id: string; username: string; stellar_address: string; is_banned: boolean } | null;
    seller: { id: string; username: string; stellar_address: string; is_banned: boolean } | null;
    reporter: { id: string; username: string; stellar_address: string } | null;
  };
  evidence_and_messages: {
    evidence_urls: string[];
    audit_trail: any[];
  };
}

function parseEvidenceUrls(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

export async function listAdminDisputes(
  status = 'open',
  page = 1,
  limit = 20,
): Promise<{ disputes: AdminDisputeItem[]; total: number; page: number; limit: number }> {
  let query = 'SELECT * FROM disputes';
  const params: any[] = [];

  if (status !== 'all') {
    query += ' WHERE status = $1';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC';

  const rawDisputes = await db.getMany(query, params);
  const total = rawDisputes.length;

  const offset = (page - 1) * limit;
  const pagedDisputes = rawDisputes.slice(offset, offset + limit);

  const formattedDisputes: AdminDisputeItem[] = await Promise.all(
    pagedDisputes.map(async (d) => {
      const trade = await db.getOne(
        `SELECT id, amount_mxn, amount_stroops, platform_fee_mxn, status, secret_hash,
                lock_tx_hash, release_tx_hash, created_at, expires_at, seller_id, buyer_id
         FROM trades WHERE id = $1`,
        [d.trade_id],
      );

      let buyer = null;
      let seller = null;
      let reporter = null;

      if (trade) {
        buyer = await db.getOne(
          'SELECT id, username, stellar_address, COALESCE(is_banned, false) as is_banned FROM users WHERE id = $1',
          [trade.buyer_id],
        );
        seller = await db.getOne(
          'SELECT id, username, stellar_address, COALESCE(is_banned, false) as is_banned FROM users WHERE id = $1',
          [trade.seller_id],
        );
      }

      if (d.reported_by) {
        reporter = await db.getOne(
          'SELECT id, username, stellar_address FROM users WHERE id = $1',
          [d.reported_by],
        );
      }

      const auditTrail = await getTradeAuditTrailRows(d.trade_id);
      const evidenceUrls = parseEvidenceUrls(d.evidence_urls);

      return {
        id: d.id,
        trade_id: d.trade_id,
        reported_by: d.reported_by,
        reason: d.reason,
        evidence_urls: evidenceUrls,
        status: d.status,
        resolution: d.resolution ?? null,
        resolution_note: d.resolution_note ?? null,
        resolved_by: d.resolved_by ?? null,
        resolved_at: d.resolved_at ?? null,
        created_at: d.created_at,
        trade: trade ? {
          id: trade.id,
          amount_mxn: Number(trade.amount_mxn),
          amount_stroops: String(trade.amount_stroops),
          platform_fee_mxn: Number(trade.platform_fee_mxn),
          status: trade.status,
          secret_hash: trade.secret_hash,
          lock_tx_hash: trade.lock_tx_hash ?? null,
          release_tx_hash: trade.release_tx_hash ?? null,
          created_at: trade.created_at,
          expires_at: trade.expires_at,
        } : null,
        parties: {
          buyer: buyer ? {
            id: buyer.id,
            username: buyer.username || 'buyer',
            stellar_address: buyer.stellar_address || '',
            is_banned: Boolean(buyer.is_banned),
          } : null,
          seller: seller ? {
            id: seller.id,
            username: seller.username || 'seller',
            stellar_address: seller.stellar_address || '',
            is_banned: Boolean(seller.is_banned),
          } : null,
          reporter: reporter ? {
            id: reporter.id,
            username: reporter.username || 'user',
            stellar_address: reporter.stellar_address || '',
          } : null,
        },
        evidence_and_messages: {
          evidence_urls: evidenceUrls,
          audit_trail: auditTrail,
        },
      };
    }),
  );

  return {
    disputes: formattedDisputes,
    total,
    page,
    limit,
  };
}
