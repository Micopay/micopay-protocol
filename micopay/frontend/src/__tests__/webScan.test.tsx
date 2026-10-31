import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import WebScanDialog from '../components/WebScanDialog';
import { pickScannedValue, requestWebScan, usKeyToChar } from '../lib/webScan';

const CODE = 'micopay://confirm?trade_id=7f3c1a2e-0000-4000-8000-000000000001';

/** Lo que un lector con teclas de EE. UU. produce en un Windows en espanol. */
function pressAsUsKeyboard(input: HTMLElement, value: string) {
  for (const char of value) {
    const entry = Object.entries({
      ':': ['Semicolon', true], '/': ['Slash', false], '?': ['Slash', true],
      '=': ['Equal', false], '_': ['Minus', true], '-': ['Minus', false],
    }).find(([c]) => c === char);
    const [code, shiftKey] = entry
      ? entry[1] as [string, boolean]
      : [/\d/.test(char) ? `Digit${char}` : `Key${char.toUpperCase()}`, false];
    fireEvent.keyDown(input, { code, shiftKey, key: 'x' });
  }
}

describe('escaneo en la web', () => {
  it('traduce la tecla fisica sin importar el idioma del teclado', () => {
    expect(usKeyToChar('Semicolon', true)).toBe(':');
    expect(usKeyToChar('Slash', false)).toBe('/');
    expect(usKeyToChar('KeyA', false)).toBe('a');
    expect(usKeyToChar('Digit7', false)).toBe('7');
    expect(usKeyToChar('Enter', false)).toBeNull();
  });

  it('prefiere lo escrito salvo que solo las teclas formen un codigo', () => {
    expect(pickScannedValue(CODE, 'basura')).toBe(CODE);
    expect(pickScannedValue('micopayÑ--confirm', CODE)).toBe(CODE);
    expect(pickScannedValue(' GABC ', '')).toBe('GABC');
  });

  it('recupera el codigo de un lector en un teclado en espanol', async () => {
    render(<WebScanDialog />);
    let result: Promise<string | null>;
    act(() => { result = requestWebScan(); });
    const input = screen.getByRole('textbox');
    pressAsUsKeyboard(input, CODE);
    fireEvent.change(input, { target: { value: 'micopayÑ--confirm' } });
    fireEvent.submit(input.closest('form')!);
    await expect(result!).resolves.toBe(CODE);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cerrar devuelve null', async () => {
    render(<WebScanDialog />);
    let result: Promise<string | null>;
    act(() => { result = requestWebScan(); });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await expect(result!).resolves.toBeNull();
  });
});
