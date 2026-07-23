import db from '../db/schema.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../utils/errors.js';
import { insertTradeAuditEvent } from '../db/audit-log.model.js';
import { logAuditEvent } from './audit.service.js';

export interface RecordTradeDisputeInput {
  tradeId: string;
  reportedBy: string;
  reason: string;
  evidenceUrls?: string[];
}

export interface DisputeRecord {
  id: string;
  trade_id: string;
  reported_by: string;
  reason: string;
  evidence_urls: string[] | string;
  status: 'open' | 'resolved';
  resolution?: string | null;
  resolution_note?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export async function recordTradeDispute(input: RecordTradeDisputeInput): Promise<DisputeRecord> {
  const { tradeId, reportedBy, reason, evidenceUrls = [] } = input;

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('INVALID_REASON', 'Se requiere una razón para la disputa', 'Dispute reason is required');
  }

  const trade = await db.getOne<{ id: string; seller_id: string; buyer_id: string; status: string }>(
    'SELECT id, seller_id, buyer_id, status FROM trades WHERE id = $1',
    [tradeId],
  );

  if (!trade) {
    throw new NotFoundError('TRADE_NOT_FOUND', 'El intercambio no existe', 'Trade not found');
  }

  if (trade.seller_id !== reportedBy && trade.buyer_id !== reportedBy) {
    throw new ForbiddenError('Solo los participantes del intercambio pueden abrir una disputa');
  }

  if (['completed', 'cancelled', 'refunded'].includes(trade.status)) {
    throw new ConflictError(`No se puede disputar un intercambio en estado ${trade.status}`);
  }

  // Check if an open dispute already exists
  const existingDispute = await db.getOne<DisputeRecord>(
    "SELECT * FROM disputes WHERE trade_id = $1 AND status = 'open'",
    [tradeId],
  );

  if (existingDispute) {
    return existingDispute;
  }

  const evidenceJson = JSON.stringify(evidenceUrls);

  const dispute = await db.getOne<DisputeRecord>(
    `INSERT INTO disputes (trade_id, reported_by, reason, evidence_urls, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING *`,
    [tradeId, reportedBy, reason, evidenceJson],
  );

  if (!dispute) {
    throw new Error('Failed to create dispute record');
  }

  // Update trade status to 'disputed'
  await db.execute(
    "UPDATE trades SET status = 'disputed' WHERE id = $1",
    [tradeId],
  );

  // Log state transition
  await insertTradeAuditEvent({
    tradeId,
    fromState: trade.status,
    toState: 'disputed',
    actor: reportedBy,
    metadata: {
      dispute_id: dispute.id,
      reason,
      evidence_urls: evidenceUrls,
    },
  });

  // Log audit event
  await logAuditEvent({
    action: 'TRADE_DISPUTED',
    actorUserId: reportedBy,
    entityType: 'trade',
    entityId: tradeId,
    details: {
      dispute_id: dispute.id,
      reason,
      evidence_urls: evidenceUrls,
    },
  });

  return dispute;
}

export async function getDisputeById(disputeId: string): Promise<DisputeRecord | null> {
  return db.getOne<DisputeRecord>('SELECT * FROM disputes WHERE id = $1', [disputeId]);
}

export async function getDisputeByTradeId(tradeId: string): Promise<DisputeRecord | null> {
  return db.getOne<DisputeRecord>('SELECT * FROM disputes WHERE trade_id = $1 ORDER BY created_at DESC LIMIT 1', [tradeId]);
}
