import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  generate: vi.fn(),
  importSeed: vi.fn(),
  signChallenge: vi.fn(),
  signTransaction: vi.fn(),
  revealSeed: vi.fn(),
  deleteKey: vi.fn(),
  readJSON: vi.fn(),
  writeJSON: vi.fn(),
  removeKey: vi.fn(),
  requireUserPresence: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
}));

vi.mock('../lib/nativeKeyVault', () => ({
  StellarKeyVault: {
    status: mocks.status,
    generate: mocks.generate,
    importSeed: mocks.importSeed,
    signChallenge: mocks.signChallenge,
    signTransaction: mocks.signTransaction,
    revealSeed: mocks.revealSeed,
    deleteKey: mocks.deleteKey,
  },
}));

vi.mock('../services/secureStorage', () => ({
  readJSON: mocks.readJSON,
  writeJSON: mocks.writeJSON,
  removeKey: mocks.removeKey,
}));

vi.mock('../lib/userPresence', () => ({
  requireUserPresence: mocks.requireUserPresence,
}));

async function freshKeystore() {
  vi.resetModules();
  return import('../lib/keystore');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Android native key vault migration', () => {
  it('uses the existing native account without reading the legacy seed', async () => {
    mocks.status.mockResolvedValue({ exists: true, publicKey: 'G_NATIVE', securityLevel: 'tee' });
    mocks.readJSON.mockResolvedValue(null);
    const { getPublicKey } = await freshKeystore();

    await expect(getPublicKey()).resolves.toBe('G_NATIVE');
    expect(mocks.readJSON).toHaveBeenCalledWith('stellar_keypair');
    expect(mocks.importSeed).not.toHaveBeenCalled();
  });

  it('recovers the legacy account when an earlier attempt created the wrong native vault', async () => {
    mocks.status.mockResolvedValue({ exists: true, publicKey: 'G_WRONG', securityLevel: 'tee' });
    mocks.readJSON.mockResolvedValue({ publicKey: 'G_LEGACY', secretKey: 'S_LEGACY' });
    mocks.importSeed.mockResolvedValue({ publicKey: 'G_LEGACY', securityLevel: 'strongbox' });
    const { getPublicKey } = await freshKeystore();

    await expect(getPublicKey()).resolves.toBe('G_LEGACY');
    expect(mocks.importSeed).toHaveBeenCalledWith({
      secretKey: 'S_LEGACY',
      expectedPublicKey: 'G_LEGACY',
      replace: true,
      reason: 'migration',
    });
    expect(mocks.removeKey).toHaveBeenCalledWith('stellar_keypair');
  });

  it('removes a duplicate legacy record after confirming the native account matches', async () => {
    mocks.status.mockResolvedValue({ exists: true, publicKey: 'G_SAME', securityLevel: 'tee' });
    mocks.readJSON.mockResolvedValue({ publicKey: 'G_SAME', secretKey: 'S_LEGACY' });
    const { getPublicKey } = await freshKeystore();

    await expect(getPublicKey()).resolves.toBe('G_SAME');
    expect(mocks.importSeed).not.toHaveBeenCalled();
    expect(mocks.removeKey).toHaveBeenCalledWith('stellar_keypair');
  });

  it('deletes the legacy record only after native code confirms the same account', async () => {
    mocks.status.mockResolvedValue({ exists: false, securityLevel: 'not_created' });
    mocks.readJSON.mockResolvedValue({ publicKey: 'G_LEGACY', secretKey: 'S_LEGACY' });
    mocks.importSeed.mockResolvedValue({ publicKey: 'G_LEGACY', securityLevel: 'strongbox' });
    const { getPublicKey } = await freshKeystore();

    await expect(getPublicKey()).resolves.toBe('G_LEGACY');
    expect(mocks.importSeed).toHaveBeenCalledWith({
      secretKey: 'S_LEGACY',
      expectedPublicKey: 'G_LEGACY',
      replace: false,
      reason: 'migration',
    });
    expect(mocks.removeKey).toHaveBeenCalledWith('stellar_keypair');
    expect(mocks.importSeed.mock.invocationCallOrder[0]).toBeLessThan(mocks.removeKey.mock.invocationCallOrder[0]);
  });

  it('preserves the legacy record when native migration returns a different account', async () => {
    mocks.status.mockResolvedValue({ exists: false, securityLevel: 'not_created' });
    mocks.readJSON.mockResolvedValue({ publicKey: 'G_EXPECTED', secretKey: 'S_LEGACY' });
    mocks.importSeed.mockResolvedValue({ publicKey: 'G_DIFFERENT', securityLevel: 'tee' });
    const { getPublicKey } = await freshKeystore();

    await expect(getPublicKey()).rejects.toThrow(/cuenta diferente/i);
    expect(mocks.removeKey).not.toHaveBeenCalled();
  });

  it('deduplicates simultaneous migrations so the seed is imported once', async () => {
    mocks.status.mockResolvedValue({ exists: false, securityLevel: 'not_created' });
    mocks.readJSON.mockResolvedValue({ publicKey: 'G_LEGACY', secretKey: 'S_LEGACY' });
    mocks.importSeed.mockResolvedValue({ publicKey: 'G_LEGACY', securityLevel: 'tee' });
    const { getPublicKey } = await freshKeystore();

    await expect(Promise.all([getPublicKey(), getPublicKey()])).resolves.toEqual(['G_LEGACY', 'G_LEGACY']);
    expect(mocks.importSeed).toHaveBeenCalledTimes(1);
    expect(mocks.removeKey).toHaveBeenCalledTimes(1);
  });

  it('delegates transaction signing to native code without the JavaScript presence gate', async () => {
    mocks.status.mockResolvedValue({ exists: true, publicKey: 'G_NATIVE', securityLevel: 'tee' });
    mocks.readJSON.mockResolvedValue(null);
    mocks.signTransaction.mockResolvedValue({ signedXdr: 'SIGNED_XDR' });
    const { signTransactionXdr } = await freshKeystore();

    await expect(signTransactionXdr('UNSIGNED_XDR', 'Test SDF Network ; September 2015', 'lock'))
      .resolves.toBe('SIGNED_XDR');
    expect(mocks.signTransaction).toHaveBeenCalledWith({
      xdr: 'UNSIGNED_XDR',
      networkPassphrase: 'Test SDF Network ; September 2015',
      reason: 'lock',
    });
    expect(mocks.requireUserPresence).not.toHaveBeenCalled();
    expect(mocks.readJSON).toHaveBeenCalledWith('stellar_keypair');
  });

  it('refuses the internal seed export route on Android', async () => {
    const { exportSecretKey } = await freshKeystore();
    await expect(exportSecretKey()).rejects.toThrow(/no se puede exportar/i);
  });
});
