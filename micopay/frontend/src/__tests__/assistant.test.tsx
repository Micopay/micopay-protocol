/**
 * ASISTENTE-2 · El asistente guia, no firma.
 *
 * Lo que se fija aqui:
 *   1. El chat responde con datos reales de la API (tasa y saldo).
 *   2. Las acciones llevan a la pantalla que ya exige presencia; no ejecutan
 *      una firma desde el chat.
 *   3. La pregunta "¿puedes firmar por mi?" se responde con el limite, no con
 *      una accion.
 *   4. Sin reconocimiento de voz, el microfono queda desactivado y se avisa.
 *   5. La voz de salida se puede pedir por mensaje.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import i18n from '../i18n';
import Assistant from '../pages/Assistant';

const mocks = vi.hoisted(() => ({
  getXlmMxnRate: vi.fn(),
  getUsdcMxnRate: vi.fn(),
  getActiveTrades: vi.fn(),
  getTradeHistory: vi.fn(),
  getMerchantsAvailable: vi.fn(),
  speak: vi.fn(),
  startListening: vi.fn(),
  stopSpeaking: vi.fn(),
  voiceCapabilities: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getXlmMxnRate: mocks.getXlmMxnRate,
  getUsdcMxnRate: mocks.getUsdcMxnRate,
  getActiveTrades: mocks.getActiveTrades,
  getTradeHistory: mocks.getTradeHistory,
  getMerchantsAvailable: mocks.getMerchantsAvailable,
}));

vi.mock('../lib/voice', () => ({
  speak: mocks.speak,
  startListening: mocks.startListening,
  stopSpeaking: mocks.stopSpeaking,
  voiceCapabilities: mocks.voiceCapabilities,
}));

vi.mock('../hooks/useWalletBalance', () => ({
  useWalletBalance: () => ({
    xlmBalance: '10.00',
    stellarAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
    loading: false,
    error: null,
    refresh: vi.fn(),
    tokens: [{ code: 'XLM', balance: 10 }],
    usdMxnRate: 17.5,
  }),
}));

function renderAssistant() {
  return render(
    <MemoryRouter initialEntries={['/assistant']}>
      <Routes>
        <Route path="/assistant" element={<Assistant token="test-token" />} />
        <Route path="/deposit" element={<div>pantalla-deposito</div>} />
        <Route path="/history" element={<div>pantalla-historial</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function sendMessage(text: string) {
  const input = screen.getByLabelText('Escribe tu mensaje');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
}

beforeEach(async () => {
  await i18n.changeLanguage('es');
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();

  mocks.getXlmMxnRate.mockResolvedValue({ rate: 3.5, source: 'test', fetchedAt: '' });
  mocks.getUsdcMxnRate.mockResolvedValue({ rate: 17.5, source: 'test', fetchedAt: '' });
  mocks.getActiveTrades.mockResolvedValue([]);
  mocks.getTradeHistory.mockResolvedValue([]);
  mocks.getMerchantsAvailable.mockResolvedValue([]);
  mocks.speak.mockResolvedValue(undefined);
  mocks.stopSpeaking.mockResolvedValue(undefined);
  mocks.voiceCapabilities.mockResolvedValue({ recognition: false, synthesis: false });
});

describe('asistente: chat', () => {
  it('abre con saludo y sugerencias', async () => {
    renderAssistant();
    expect(await screen.findByText(/Soy el asistente de MicoPay/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mi saldo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar agentes' })).toBeInTheDocument();
  });

  it('responde la tasa con el activo pedido', async () => {
    renderAssistant();
    await sendMessage('¿A cómo está el XLM?');
    expect(await screen.findByText(/1 XLM está en 3\.50 MXN/)).toBeInTheDocument();
  });

  it('responde el saldo de la billetera', async () => {
    renderAssistant();
    await sendMessage('mi saldo');
    expect(await screen.findByText('Tienes 10 XLM.')).toBeInTheDocument();
  });

  it('una sugerencia de operaciones consulta y ofrece el historial', async () => {
    renderAssistant();
    fireEvent.click(screen.getByRole('button', { name: 'Mis operaciones' }));
    expect(await screen.findByText('No tienes operaciones activas ahora.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver historial/ })).toBeInTheDocument();
  });
});

describe('asistente: acciones y limites', () => {
  it('depositar lleva a la pantalla de deposito, no firma desde el chat', async () => {
    renderAssistant();
    await sendMessage('quiero depositar');

    const action = await screen.findByRole('button', { name: /Ir a depositar/ });
    fireEvent.click(action);

    expect(await screen.findByText('pantalla-deposito')).toBeInTheDocument();
  });

  it('responde que no puede firmar ni mover dinero', async () => {
    renderAssistant();
    await sendMessage('¿puedes firmar por mí?');
    expect(
      await screen.findByText(/No puedo firmar, liberar ni mover tu dinero/),
    ).toBeInTheDocument();
  });

  it('el codigo del asistente no importa funciones que mueven dinero', () => {
    const source = readFileSync('src/pages/Assistant.tsx', 'utf8');
    for (const forbidden of [
      'lockTrade',
      'completeTrade',
      'revealSecretKey',
      'signTransactionXdr',
      'sendPayment',
    ]) {
      expect(source, `Assistant.tsx no debe usar ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('asistente: voz', () => {
  it('desactiva el microfono y avisa cuando no hay reconocimiento', async () => {
    renderAssistant();

    const mic = await screen.findByRole('button', { name: 'Hablar' });
    await waitFor(() => expect(mic).toBeDisabled());
    expect(
      await screen.findByText(/La voz no está disponible en este dispositivo/),
    ).toBeInTheDocument();
  });

  it('permite escuchar una respuesta cuando hay sintesis', async () => {
    mocks.voiceCapabilities.mockResolvedValue({ recognition: false, synthesis: true });
    renderAssistant();

    await sendMessage('mi saldo');
    await screen.findByText('Tienes 10 XLM.');

    const listens = await screen.findAllByRole('button', { name: 'Escuchar' });
    fireEvent.click(listens[listens.length - 1]);

    expect(mocks.speak).toHaveBeenCalledWith(expect.stringContaining('Tienes'), 'es-MX');
  });
});
