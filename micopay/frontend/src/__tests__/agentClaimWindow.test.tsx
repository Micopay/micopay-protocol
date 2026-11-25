/**
 * #514 · Aviso al agente de un depósito vencido dentro del margen.
 *
 * EL HUECO: el barrido y el botón "Recuperar fondos" esperan un margen para que
 * el cliente reporte el pago, pero el agente veía la operación bloqueada sin
 * saber por qué no le salía el botón ni cuándo saldría.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCashClaimWindow } from '../pages/TradeDetail';
import type { RefundEligibility } from '../services/api';

vi.mock('../services/payment', () => ({ ensureTrustline: vi.fn() }));

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const NOTICE = /podrás recuperar tus fondos en/i;

const eligibility = (overrides: Partial<RefundEligibility>): RefundEligibility => ({
  eligible: false,
  reason: 'cash_claim_window',
  expires_at: minutesFromNow(-5),
  refund_available_at: minutesFromNow(10),
  seconds_remaining: 600,
  ...overrides,
} as RefundEligibility);

describe('AgentCashClaimWindow (#514)', () => {
  it('agente dentro del margen: dice cuándo podrá recuperar los fondos', () => {
    render(<AgentCashClaimWindow eligibility={eligibility({})} isProvider />);
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
    expect(screen.getByRole('status')).toHaveTextContent(/en (9m 5\d|10m 0)s/);
  });

  it('el cliente no ve el aviso del agente', () => {
    render(<AgentCashClaimWindow eligibility={eligibility({})} isProvider={false} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('con otra razón (todavía no vence) no se muestra', () => {
    render(<AgentCashClaimWindow eligibility={eligibility({ reason: 'not_expired_yet' })} isProvider />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ya pasó el margen: no se muestra', () => {
    render(<AgentCashClaimWindow eligibility={eligibility({ refund_available_at: minutesFromNow(-1) })} isProvider />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sin elegibilidad no se muestra', () => {
    render(<AgentCashClaimWindow eligibility={null} isProvider />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
