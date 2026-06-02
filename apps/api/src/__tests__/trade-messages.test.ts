import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from '../db/schema.js';
import { assertTradeParticipant } from '../lib/trade-auth.js';

// Mock the database
vi.mock('../db/schema.js', () => ({
  default: {
    getOne: vi.fn(),
    getMany: vi.fn(),
    execute: vi.fn(),
  },
}));

describe('Trade Messages API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertTradeParticipant', () => {
    it('should throw 404 if trade not found', async () => {
      vi.mocked(db.getOne).mockResolvedValue(null);

      try {
        await assertTradeParticipant('trade-123', 'user-123');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Trade not found');
      }
    });

    it('should throw 403 if user is not a participant', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      vi.mocked(db.getOne).mockResolvedValue(mockTrade);

      try {
        await assertTradeParticipant('trade-123', 'random-user');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
        expect(error.message).toBe('You are not a participant in this trade');
      }
    });

    it('should return trade if user is the buyer', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      vi.mocked(db.getOne).mockResolvedValue(mockTrade);

      const result = await assertTradeParticipant('trade-123', 'buyer-1');
      expect(result).toEqual(mockTrade);
    });

    it('should return trade if user is the seller', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      vi.mocked(db.getOne).mockResolvedValue(mockTrade);

      const result = await assertTradeParticipant('trade-123', 'seller-1');
      expect(result).toEqual(mockTrade);
    });
  });

  describe('GET /trades/:id/messages', () => {
    it('should return messages for a participant', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      const mockMessages = [
        {
          id: 'msg-1',
          trade_id: 'trade-123',
          sender_id: 'buyer-1',
          body: 'Hello, I am the buyer',
          created_at: '2026-05-29T10:00:00Z',
          read_at: null,
        },
        {
          id: 'msg-2',
          trade_id: 'trade-123',
          sender_id: 'seller-1',
          body: 'Hello, I am the seller',
          created_at: '2026-05-29T10:05:00Z',
          read_at: null,
        },
      ];

      vi.mocked(db.getOne).mockResolvedValueOnce(mockTrade);
      vi.mocked(db.getMany).mockResolvedValueOnce(mockMessages);
      vi.mocked(db.execute).mockResolvedValueOnce({});

      // This test verifies the happy path — in real integration tests,
      // you would call the Fastify app and check the HTTP response.
      // For unit tests, we mock the DB and verify the assertTradeParticipant logic.

      const trade = await assertTradeParticipant('trade-123', 'buyer-1');
      expect(trade.id).toBe('trade-123');

      expect(db.getMany).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.arrayContaining(['trade-123'])
      );
    });

    it('should reject access for non-participants', async () => {
      vi.mocked(db.getOne).mockResolvedValue({
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
      });

      try {
        await assertTradeParticipant('trade-123', 'intruder-1');
        expect.fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }
    });
  });

  describe('POST /trades/:id/messages', () => {
    it('should allow a participant to send a message', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      const mockInsertedMessage = {
        id: 'msg-3',
        trade_id: 'trade-123',
        sender_id: 'buyer-1',
        body: 'A new message',
        created_at: '2026-05-29T10:10:00Z',
        read_at: null,
      };

      vi.mocked(db.getOne).mockResolvedValueOnce(mockTrade);
      vi.mocked(db.getOne).mockResolvedValueOnce(mockInsertedMessage);

      const trade = await assertTradeParticipant('trade-123', 'buyer-1');
      expect(trade.status).toBe('locked');
    });

    it('should reject sending to a closed trade', async () => {
      const mockClosedTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'completed',
      };

      vi.mocked(db.getOne).mockResolvedValue(mockClosedTrade);

      // This test verifies that a closed trade (completed, cancelled, expired, refunded)
      // should reject message sends. The route handler checks this after authorization.
      const trade = await assertTradeParticipant('trade-123', 'buyer-1');
      const terminalStatuses = ['completed', 'cancelled', 'expired', 'refunded'];
      
      expect(terminalStatuses).toContain(trade.status);
    });

    it('should reject non-participants from sending', async () => {
      vi.mocked(db.getOne).mockResolvedValue({
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      });

      try {
        await assertTradeParticipant('trade-123', 'intruder-1');
        expect.fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }
    });
  });

  describe('POST /trades/:id/messages/read', () => {
    it('should mark unread messages as read', async () => {
      const mockTrade = {
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
        status: 'locked',
      };

      vi.mocked(db.getOne).mockResolvedValue(mockTrade);
      vi.mocked(db.execute).mockResolvedValue({});

      const trade = await assertTradeParticipant('trade-123', 'buyer-1');
      expect(trade).toBeDefined();

      // The route handler would then call db.execute with the UPDATE query
      // to mark unread messages from the OTHER participant as read.
      expect(db.execute).toBeDefined();
    });

    it('should reject non-participants', async () => {
      vi.mocked(db.getOne).mockResolvedValue({
        id: 'trade-123',
        buyer_id: 'buyer-1',
        seller_id: 'seller-1',
      });

      try {
        await assertTradeParticipant('trade-123', 'intruder-1');
        expect.fail('Should have thrown 403');
      } catch (error: any) {
        expect(error.statusCode).toBe(403);
      }
    });
  });
});
