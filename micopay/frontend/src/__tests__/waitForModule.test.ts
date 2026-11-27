import { describe, expect, it } from 'vitest';
import { waitForModule } from '../lib/signer/waitForModule';

describe('waitForModule (WalletConnect tarda en arrancar)', () => {
  it('espera a que el modulo quede disponible', async () => {
    let calls = 0;
    const module = { isAvailable: async () => ++calls >= 3 };
    await expect(waitForModule(module, 1000, 5)).resolves.toBe(true);
    expect(calls).toBe(3);
  });

  it('se rinde al vencer el plazo', async () => {
    const module = { isAvailable: async () => false };
    await expect(waitForModule(module, 30, 5)).resolves.toBe(false);
  });

  it('un error al consultar cuenta como no disponible', async () => {
    const module = { isAvailable: async () => { throw new Error('boom'); } };
    await expect(waitForModule(module, 20, 5)).resolves.toBe(false);
  });

  it('sin modulo no espera', async () => {
    await expect(waitForModule(null)).resolves.toBe(false);
  });
});
