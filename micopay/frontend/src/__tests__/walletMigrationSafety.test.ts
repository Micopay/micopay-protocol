import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('wallet migration safety', () => {
  it('never creates a wallet from the login screen when migration finds no key', () => {
    const login = read('src/pages/Login.tsx');

    expect(login).not.toContain('generateAndStoreKeypair');
    expect(login).toContain("throw new Error('WALLET_NOT_FOUND')");
  });

  it('only auto-generates a startup wallet in explicit demo mode', () => {
    const app = read('src/App.tsx');
    const missingKeyBranch = app.slice(
      app.indexOf('if (!await keypairExists())'),
      app.indexOf('const pubKey = await getPublicKey()'),
    );

    expect(missingKeyBranch).toContain("import.meta.env.VITE_DEMO_MODE === 'true'");
    expect(missingKeyBranch).toContain('await generateAndStoreKeypair()');
    expect(missingKeyBranch).toContain('await removeKey(USERS_STORAGE_KEY)');
    expect(missingKeyBranch).toContain('return;');
  });

  it('keeps wallet creation in the explicit registration flow', () => {
    const register = read('src/pages/Register.tsx');
    expect(register).toContain('await generateAndStoreKeypair()');
  });
});
