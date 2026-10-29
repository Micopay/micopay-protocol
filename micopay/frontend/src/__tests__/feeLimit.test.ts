import { describe, expect, it } from 'vitest';
import {
  effectiveFeePercent,
  MAX_EFFECTIVE_FEE_PERCENT,
} from '../services/api';
import { PLATFORM_FEE_PERCENT } from '../constants/trade';

describe('fee limit fallback', () => {
  it('uses 6% when an older backend response does not include the policy', () => {
    expect(MAX_EFFECTIVE_FEE_PERCENT).toBe(6);
  });

  it('counts provider and platform percentages together', () => {
    expect(effectiveFeePercent(5.2, PLATFORM_FEE_PERCENT)).toBe(6);
  });
});
