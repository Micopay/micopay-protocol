/** WP3 · ofrecer retomar no impide crear otra operación con el mismo agente. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TradeConfirmationPage from '../pages/TradeConfirmation';

function renderPage(errorCode?: string) {
  const onConfirm = vi.fn().mockResolvedValue(true);
  const onCreateNewInstead = vi.fn();
  render(
    <TradeConfirmationPage
      merchantName="JotsonJornet"
      merchantId="agent-1"
      receiveMxn={500}
      amountMxn={500}
      commissionPct={1}
      flow="cashout"
      nearbyCount={1}
      onBack={() => {}}
      onConfirm={onConfirm}
      errorMessage="Ya tienes una operación activa de $500 MXN con este agente. Confirma de nuevo para retomarla, o crea otra."
      errorAction="retry"
      errorCode={errorCode}
      onCreateNewInstead={onCreateNewInstead}
    />,
  );
  return { onConfirm, onCreateNewInstead };
}

describe('Crear otra operación', () => {
  it('con una operación activa ofrece crear otra y la crea', async () => {
    const { onConfirm, onCreateNewInstead } = renderPage('ACTIVE_TRADE_OFFER');
    fireEvent.click(screen.getByRole('button', { name: 'Crear otra operación' }));
    expect(onCreateNewInstead).toHaveBeenCalled();
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
  });

  it('con otros errores no aparece', () => {
    renderPage(undefined);
    expect(screen.queryByRole('button', { name: 'Crear otra operación' })).toBeNull();
  });
});
