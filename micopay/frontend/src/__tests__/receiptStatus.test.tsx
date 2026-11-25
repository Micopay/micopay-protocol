/** UX-1 · El recibo debe mostrar estados traducidos, incluso ante un estado desconocido. */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TRADE_STATES, type TradeState } from '../components/TradeStateBadge';
import i18n from '../i18n';
import SuccessScreen, { type SuccessReceipt } from '../pages/SuccessScreen';

const labels: Record<'es' | 'en', Record<TradeState, string>> = {
  es: {
    pending: 'Pendiente',
    locked: 'Bloqueado',
    revealing: 'Revelando',
    completed: 'Completado',
    cancelled: 'Cancelado',
    expired: 'Expirado',
    refunded: 'Reembolsado',
  },
  en: {
    pending: 'Pending',
    locked: 'Locked',
    revealing: 'Revealing',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired',
    refunded: 'Refunded',
  },
};

const receipt: SuccessReceipt = {
  id: 'trade-1',
  status: 'completed',
  amount_mxn: 500,
  lock_tx_hash: null,
  release_tx_hash: null,
  created_at: null,
  completed_at: null,
  platform_fee_mxn: null,
  provider_fee_mxn: null,
  payout_mxn: null,
  client_pays_mxn: null,
};

afterEach(() => {
  cleanup();
});

describe.each(['es', 'en'] as const)('estado del recibo en %s', (language) => {
  it.each(TRADE_STATES)('traduce %s', async (status) => {
    await i18n.changeLanguage(language);
    render(<SuccessScreen type="cashout" trade={{ ...receipt, status }} agentName={null} onHome={() => {}} />);

    const statusValue = screen.getByText(i18n.t('success.status')).nextElementSibling;
    expect(statusValue).toHaveTextContent(labels[language][status]);
    expect(statusValue).not.toHaveClass('capitalize');
  });

  it.each(['future_state', '__proto__', ''])('muestra la etiqueta de respaldo para %j', async (value) => {
    await i18n.changeLanguage(language);
    const status = value as TradeState;
    render(<SuccessScreen type="cashout" trade={{ ...receipt, status }} agentName={null} onHome={() => {}} />);

    const statusValue = screen.getByText(i18n.t('success.status')).nextElementSibling;
    expect(statusValue?.textContent).toBe(language === 'es' ? 'Estado desconocido' : 'Unknown status');
  });
});
