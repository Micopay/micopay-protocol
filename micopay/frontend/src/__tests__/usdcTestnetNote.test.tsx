/** WP6 · en testnet el selector dice qué USDC usa el escrow. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const ISSUER = 'GADK7SUS7NHIGERQBKF7R67A5DNIEFWG4YKNHLTQM5JN4KP2QISEXAMPL';

describe('AssetSelector · USDC de pruebas', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ESCROW_ASSETS', 'USDC,XLM');
    vi.stubEnv('VITE_ESCROW_ASSET_CODE', 'USDC');
    vi.stubEnv('VITE_USDC_ISSUER', ISSUER);
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('shows the escrow USDC issuer when USDC is selected on testnet', async () => {
    const { default: AssetSelector } = await import('../components/AssetSelector');
    render(
      <AssetSelector flow="cashout" amountMxn={500} value="stellar:USDC" onChange={() => {}} fetchRate={async () => ({ rate: 18 })} />,
    );
    expect(screen.getByTestId('usdc-testnet-note')).toHaveTextContent(ISSUER);
  });

  it('says nothing for XLM', async () => {
    const { default: AssetSelector } = await import('../components/AssetSelector');
    render(
      <AssetSelector flow="cashout" amountMxn={500} value="stellar:XLM" onChange={() => {}} fetchRate={async () => ({ rate: 3 })} />,
    );
    expect(screen.queryByTestId('usdc-testnet-note')).toBeNull();
  });
});
