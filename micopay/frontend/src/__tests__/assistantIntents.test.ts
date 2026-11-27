/**
 * ASISTENTE-1 · El clasificador de intenciones no inventa.
 *
 * Lo que se fija aqui:
 *   1. Las frases de dinero y de consulta caen en la intencion correcta.
 *   2. "que paso con mi deposito" es estado, no una orden de depositar.
 *   3. El activo y el monto se extraen cuando la frase los trae.
 *   4. Lo que no se reconoce queda como `unknown`, no como una accion.
 */
import { describe, it, expect } from 'vitest';
import { detectIntent } from '../lib/assistant/intents';

describe('asistente: intenciones', () => {
  it('detecta la tasa y el activo', () => {
    expect(detectIntent('¿A cómo está el XLM?')).toMatchObject({ id: 'rate', asset: 'XLM' });
    expect(detectIntent('cuánto vale USDC')).toMatchObject({ id: 'rate', asset: 'USDC' });
    expect(detectIntent('what is the xlm rate')).toMatchObject({ id: 'rate', asset: 'XLM' });
  });

  it('detecta saldo, operaciones e historial', () => {
    expect(detectIntent('mi saldo').id).toBe('balance');
    expect(detectIntent('¿cuánto tengo?').id).toBe('balance');
    expect(detectIntent('mis operaciones').id).toBe('active_trades');
    expect(detectIntent('my operations').id).toBe('active_trades');
    expect(detectIntent('mi historial').id).toBe('history');
  });

  it('no confunde el estado de un deposito con la orden de depositar', () => {
    expect(detectIntent('¿qué pasó con mi depósito?').id).toBe('active_trades');
    expect(detectIntent('quiero depositar').id).toBe('deposit');
    expect(detectIntent('quiero retirar').id).toBe('cashout');
  });

  it('extrae monto y activo', () => {
    expect(detectIntent('quiero depositar 500 pesos')).toMatchObject({
      id: 'deposit',
      amountMxn: 500,
    });
    expect(detectIntent('busca agentes para 1,500 MXN')).toMatchObject({
      id: 'merchants',
      amountMxn: 1500,
    });
  });

  it('detecta los flujos y el soporte', () => {
    expect(detectIntent('enviar pago').id).toBe('send');
    expect(detectIntent('recibir pago').id).toBe('receive');
    expect(detectIntent('verificarme').id).toBe('kyc');
    expect(detectIntent('necesito soporte').id).toBe('support');
    expect(detectIntent('tengo un problema').id).toBe('support');
    expect(detectIntent('buscar agentes cerca').id).toBe('merchants');
  });

  it('las preguntas de seguridad no se tratan como envio', () => {
    expect(detectIntent('¿puedes firmar por mí?').id).toBe('security');
    expect(detectIntent('can you sign for me').id).toBe('security');
    expect(detectIntent('¿tienes mi llave?').id).toBe('security');
  });

  it('reconoce saludo, ayuda y cancelar', () => {
    expect(detectIntent('hola').id).toBe('greeting');
    expect(detectIntent('help').id).toBe('help');
    expect(detectIntent('cancelar').id).toBe('cancel');
  });

  it('lo desconocido no se convierte en una accion', () => {
    expect(detectIntent('xyzzy').id).toBe('unknown');
    expect(detectIntent('').id).toBe('unknown');
  });
});
