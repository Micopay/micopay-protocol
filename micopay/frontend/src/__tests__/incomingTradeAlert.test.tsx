/**
 * WP8 · El agente en la PC se entera de una solicitud nueva.
 *
 * EL HUECO: en la web no hay avisos push y la bandeja solo se refrescaba con la
 * pestaña a la vista. Con el agente en otra pestaña, la solicitud pasaba
 * inadvertida hasta que volvía a mirar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import IncomingTradeAlert, { INCOMING_POLL_MS, alertTitle, pickNewTrades } from '../hooks/useIncomingTradeAlert';

const mockTrades = vi.fn();
vi.mock('../services/api', () => ({
  getMerchantTrades: (...a: unknown[]) => mockTrades(...a),
}));

const trade = (id: string) => ({ id, client_handle: 'c', flow: 'deposit', amount_mxn: 100, status: 'pending', created_at: '' });

let visible = true;
let focused = true;

beforeEach(() => {
  vi.useFakeTimers();
  mockTrades.mockReset();
  document.title = 'MicoPay';
  visible = false;
  focused = false;
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (visible ? 'visible' : 'hidden'));
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const nextPoll = async () => {
  await act(async () => {
    vi.advanceTimersByTime(INCOMING_POLL_MS);
  });
  await flush();
};

describe('WP8 · aviso de solicitud nueva', () => {
  it('las que ya estaban al abrir no avisan', async () => {
    mockTrades.mockResolvedValue([trade('a')]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    expect(document.title).toBe('MicoPay');
  });

  it('una nueva con la pestaña oculta: lo dice el título', async () => {
    mockTrades.mockResolvedValueOnce([trade('a')]).mockResolvedValue([trade('a'), trade('b')]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    expect(document.title).toBe('(1) Nueva solicitud · MicoPay');
  });

  it('consulta aunque la pestaña esté oculta', async () => {
    mockTrades.mockResolvedValue([]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    await nextPoll();
    expect(mockTrades).toHaveBeenCalledTimes(3);
    expect(mockTrades).toHaveBeenCalledWith('tok', 'pending');
  });

  it('al volver a la pestaña se limpia el título', async () => {
    mockTrades.mockResolvedValueOnce([]).mockResolvedValue([trade('b')]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    expect(document.title).toMatch(/^\(1\)/);
    visible = true;
    focused = true;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.title).toBe('MicoPay');
  });

  it('con el agente mirando la pestaña no cambia el título', async () => {
    visible = true;
    focused = true;
    mockTrades.mockResolvedValueOnce([]).mockResolvedValue([trade('b')]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    expect(document.title).toBe('MicoPay');
  });

  it('un error de red no rompe ni avisa', async () => {
    mockTrades.mockRejectedValueOnce(new Error('network')).mockResolvedValue([trade('a')]);
    render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    // La primera lectura buena es la base: tampoco avisa.
    expect(document.title).toBe('MicoPay');
  });

  it('al desmontar se deja el título como estaba', async () => {
    mockTrades.mockResolvedValueOnce([]).mockResolvedValue([trade('b')]);
    const view = render(<IncomingTradeAlert token="tok" />);
    await flush();
    await nextPoll();
    expect(document.title).toMatch(/^\(1\)/);
    view.unmount();
    expect(document.title).toBe('MicoPay');
  });
});

describe('WP8 · piezas', () => {
  it('pickNewTrades devuelve solo las no vistas', () => {
    expect(pickNewTrades(new Set(['a']), [trade('a'), trade('b')] as never).map((t) => t.id)).toEqual(['b']);
  });

  it('alertTitle sin pendientes deja el título', () => {
    expect(alertTitle('MicoPay', 0)).toBe('MicoPay');
    expect(alertTitle('MicoPay', 2)).toBe('(2) Nueva solicitud · MicoPay');
  });
});
