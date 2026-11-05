/**
 * WP7 · #12: comprar CETES y Blend "reiniciaban" el sitio. Las llamadas iban
 * sin token, el backend respondia 401 y el interceptor global cerraba la sesion.
 */
import { describe, it, expect, vi } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: {} });
vi.mock('axios', () => ({
  default: {
    create: () => ({ post, get: vi.fn(), patch: vi.fn(), interceptors: { response: { use: vi.fn() }, request: { use: vi.fn() } } }),
    isAxiosError: () => false,
  },
}));

describe('DeFi calls carry the session token', () => {
  it('buyCETES, sellCETES, blendSupply and blendBorrow send Authorization', async () => {
    const api = await import('../services/api');
    await api.buyCETES('10', 'XLM', 'tok');
    await api.sellCETES('10', 'XLM', 'tok');
    await api.blendSupply('10', 'XLM', true, 'tok');
    await api.blendBorrow('10', 'USDC', 'tok');
    expect(post).toHaveBeenCalledTimes(4);
    for (const call of post.mock.calls) {
      expect(call[2]?.headers?.Authorization).toBe('Bearer tok');
    }
  });
});
