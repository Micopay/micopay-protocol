/** WP7 · #20: con billetera externa el Perfil muestra la cuenta conectada. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Profile from '../pages/Profile';

const { ADDRESS } = vi.hoisted(() => ({ ADDRESS: 'GCXVBZUJXP5KIPMPMCPPVOTIRFIJ4HDQH5WZ6C7AENCLAWUJKXQR3NZ2' }));

vi.mock('../lib/signer/mode', () => ({ IS_EXTERNAL_SIGNER: true, NO_KEY_MESSAGE: 'x' }));
vi.mock('../lib/keystore', () => ({ revealSecretKey: vi.fn(), importKeypair: vi.fn() }));
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    deleteAccount: vi.fn(),
    getAuthToken: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', username: 'raul', stellar_address: ADDRESS }),
  };
});

describe('#20 · Perfil con billetera externa', () => {
  it('shows the connected account instead of "no key"', async () => {
    render(
      <Profile token="tok" username="raul" devicePublicKey={null} onBack={() => {}} onDeleted={() => {}} onLogout={() => {}} />,
    );
    expect((await screen.findAllByText(ADDRESS)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sin clave generada|No key generated/i)).toBeNull();
  });
});
