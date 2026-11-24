import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';
import { render, screen, fireEvent } from '@testing-library/react';
import { mapApiError } from '../utils/apiError';
import ErrorBanner from '../components/ErrorBanner';
import TradeConfirmationPage from '../pages/TradeConfirmation';

describe('Issue #433 - RECEIVER_NOT_READY and choose_agent flow', () => {
  it('mapApiError returns action: "choose_agent" for a 422 with code: "RECEIVER_NOT_READY" and preserves message', () => {
    const errorMsg = 'Este agente no tiene XLM suficiente para recibir el pago. Elige otro agente.';
    const mockAxiosError = {
      isAxiosError: true,
      name: 'AxiosError',
      message: 'Request failed with status code 422',
      response: {
        status: 422,
        data: {
          code: 'RECEIVER_NOT_READY',
          message: errorMsg,
        },
      },
    };

    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

    const mapped = mapApiError(mockAxiosError);
    expect(mapped.action).toBe('choose_agent');
    expect(mapped.message).toBe(errorMsg);
    expect(mapped.error).toBe('RECEIVER_NOT_READY');
    expect(mapped.status).toBe(422);

    vi.restoreAllMocks();
  });

  it('ErrorBanner renders "Elegir otro agente" button when action="choose_agent" and calls onDismiss with NO support link', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorBanner
        message="Este agente no tiene XLM suficiente. Elige otro agente."
        action="choose_agent"
        onDismiss={onDismiss}
      />
    );

    // Verify button exists and text is present
    const chooseBtn = screen.getByRole('button', { name: /Elegir otro agente/i });
    expect(chooseBtn).toBeInTheDocument();

    // Verify SupportLink is NOT rendered
    expect(screen.queryByText(/soporte/i)).not.toBeInTheDocument();

    // Clicking button triggers onDismiss
    fireEvent.click(chooseBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('TradeConfirmation in cash-out shows "Elegir otro agente", disables Confirm, and clicking it triggers onChooseAnotherAgent', () => {
    const onChooseAnotherAgent = vi.fn();
    const onConfirm = vi.fn();
    const onBack = vi.fn();

    const { rerender } = render(
      <TradeConfirmationPage
        merchantName="Agente Test"
        merchantId="merchant-123"
        receiveMxn={500}
        amountMxn={500}
        commissionPct={1.5}
        flow="cashout"
        nearbyCount={2}
        onBack={onBack}
        onConfirm={onConfirm}
        errorMessage="Este agente no tiene XLM suficiente para recibir el pago. Elige otro agente."
        errorAction="choose_agent"
        onChooseAnotherAgent={onChooseAnotherAgent}
      />
    );

    const chooseBtn = screen.getByRole('button', { name: /Elegir otro agente/i });
    expect(chooseBtn).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirmar/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(chooseBtn);
    expect(onChooseAnotherAgent).toHaveBeenCalledTimes(1);

    // In deposit flow, choose_agent should NOT take over (remains deposit flow behavior)
    rerender(
      <TradeConfirmationPage
        merchantName="Punto Test"
        merchantId="merchant-123"
        receiveMxn={500}
        amountMxn={500}
        commissionPct={1.5}
        flow="deposit"
        nearbyCount={2}
        onBack={onBack}
        onConfirm={onConfirm}
        errorMessage="Tu cuenta todavía no está activa."
        errorAction="choose_agent"
        onChooseAnotherAgent={onChooseAnotherAgent}
      />
    );

    expect(screen.queryByRole('button', { name: /Elegir otro agente/i })).not.toBeInTheDocument();
    const depositConfirmBtn = screen.getByRole('button', { name: /Confirmar/i });
    expect(depositConfirmBtn).not.toBeDisabled();
  });
});
