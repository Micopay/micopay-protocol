/** WP7 · #21: el recibo copiado trae hashes completos, enlace, red, fecha y monto en cripto. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuccessScreen from '../pages/SuccessScreen';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual, useTranslation: () => ({ t: (k: string) => k }) };
});

const LOCK = 'a'.repeat(64);
const RELEASE = 'b'.repeat(64);

describe('#21 · Copiar recibo', () => {
  it('copies a complete receipt', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <SuccessScreen
        type="cashout"
        agentName="agente"
        onHome={() => {}}
        trade={{
          id: 'trade-1', status: 'completed', amount_mxn: 500, seller_id: 's', buyer_id: 'b',
          asset_code: 'XLM', amount_stroops: '1532267000', platform_fee_stroops: '0', total_locked_stroops: '0',
          lock_tx_hash: LOCK, release_tx_hash: RELEASE, created_at: '2026-11-01T10:00:00Z', completed_at: '2026-11-01T10:30:00Z',
          platform_fee_mxn: 4, provider_fee_mxn: 5, payout_mxn: 500, client_pays_mxn: 509,
        } as any}
      />,
    );
    fireEvent.click(screen.getByText('Copiar recibo'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain(LOCK);
    expect(text).toContain(RELEASE);
    expect(text).toContain(`https://stellar.expert/explorer/testnet/tx/${RELEASE}`);
    expect(text).toContain('Red: Stellar TESTNET');
    expect(text).toContain('Fecha:');
    expect(text).toContain('Cripto: 153.2267 XLM');
  });
});
