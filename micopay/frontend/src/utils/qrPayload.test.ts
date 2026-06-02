import { describe, it, expect } from 'vitest';
import { parseQRPayload } from './qrPayload';

describe('parseQRPayload', () => {
  // ── Release format ─────────────────────────────────────────────────────
  describe('micopay://release', () => {
    it('parses a valid release QR', () => {
      const raw = 'micopay://release?trade_id=abc-123&secret=deadbeef';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.type).toBe('release');
        if (result.payload.type === 'release') {
          expect(result.payload.tradeId).toBe('abc-123');
          expect(result.payload.secret).toBe('deadbeef');
        }
      }
    });

    it('returns error when trade_id is missing', () => {
      const raw = 'micopay://release?secret=deadbeef';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('ID de trade');
      }
    });

    it('returns error when secret is missing', () => {
      const raw = 'micopay://release?trade_id=abc-123';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('secreto HTLC');
      }
    });
  });

  // ── Claim format ───────────────────────────────────────────────────────
  describe('micopay://claim', () => {
    it('parses a valid claim QR', () => {
      const raw = 'micopay://claim?request_id=req-456&amount_mxn=500&htlc=0xhash';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.type).toBe('claim');
        if (result.payload.type === 'claim') {
          expect(result.payload.requestId).toBe('req-456');
          expect(result.payload.amountMxn).toBe(500);
          expect(result.payload.htlc).toBe('0xhash');
        }
      }
    });

    it('returns error when request_id is missing', () => {
      const raw = 'micopay://claim?amount_mxn=500';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('ID de solicitud');
      }
    });
  });

  // ── MICOPAY: legacy format ─────────────────────────────────────────────
  describe('MICOPAY: legacy format', () => {
    it('parses MICOPAY:DEMO:value', () => {
      const raw = 'MICOPAY:DEMO:mock_secret_for_ui_preview';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.type).toBe('demo');
        if (result.payload.type === 'demo') {
          expect(result.payload.subtype).toBe('DEMO');
          expect(result.payload.value).toBe('mock_secret_for_ui_preview');
        }
      }
    });

    it('returns error for incomplete MICOPAY format', () => {
      const raw = 'MICOPAY:DEMO';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('incompleto');
      }
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns error for null input', () => {
      const result = parseQRPayload(null);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('vacío');
      }
    });

    it('returns error for empty string', () => {
      const result = parseQRPayload('');
      expect(result.ok).toBe(false);
    });

    it('returns error for whitespace-only string', () => {
      const result = parseQRPayload('   ');
      expect(result.ok).toBe(false);
    });

    it('returns error for unknown format', () => {
      const result = parseQRPayload('https://example.com/whatever');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('no reconocido');
      }
    });

    it('returns error for unrecognized micopay action', () => {
      const raw = 'micopay://unknown?foo=bar';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('no reconocida');
      }
    });

    it('trims whitespace before parsing', () => {
      const raw = '  micopay://release?trade_id=abc&secret=def  ';
      const result = parseQRPayload(raw);
      expect(result.ok).toBe(true);
    });
  });
});
