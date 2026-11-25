import { describe, it, expect } from 'vitest';
import {
  isHex64,
  isUuid,
} from './qrValidation';

describe('qrValidation', () => {
  it('accepts 64-char hex strings', () => {
    expect(isHex64('a'.repeat(64))).toBe(true);
    expect(isHex64('DEADBEEF'.repeat(8))).toBe(true);
  });

  it('rejects non-hex or wrong-length strings', () => {
    expect(isHex64('ZZZ')).toBe(false);
    expect(isHex64('abc')).toBe(false);
    expect(isHex64('a'.repeat(63))).toBe(false);
    expect(isHex64('0x' + 'a'.repeat(64))).toBe(false);
  });

  it('validates UUID trade IDs', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUuid('abc-123')).toBe(false);
  });

});
