import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import es from '../i18n/es.json';
import en from '../i18n/en.json';
import { ReceiptStatus } from './SuccessScreen';

const STATES = ['completed','locked','revealing','pending','cancelled','refunded','expired'] as const;

describe.each([
  ['es', es],
  ['en', en],
] as const)('ReceiptStatus (%s)', (lang, dict) => {
  beforeAll(async () => { await i18n.changeLanguage(lang); });

  it.each(STATES)('shows translated label for %s', (state) => {
    render(<ReceiptStatus status={state} />);
    expect(screen.getByText((dict as any).home.status[state])).toBeTruthy();
  });

  it('shows the fallback for an unknown status', () => {
    render(<ReceiptStatus status="banana" />);
    expect(screen.getByText((dict as any).home.status.unknown)).toBeTruthy();
    expect(screen.queryByText('banana')).toBeNull();
  });
});