/**
 * Escaneo en la web: `useQRScanner` pide un codigo aqui y WebScanDialog lo
 * resuelve con un lector externo, la camara o pegando el texto.
 */

type Listener = (open: boolean) => void;

let pending: ((value: string | null) => void) | null = null;
let listener: Listener | null = null;

export function onWebScanRequest(next: Listener | null): void {
  listener = next;
}

/** Devuelve el codigo, o null si la persona cerro el dialogo. */
export function requestWebScan(): Promise<string | null> {
  pending?.(null);
  return new Promise((resolve) => {
    pending = resolve;
    listener?.(true);
  });
}

export function finishWebScan(value: string | null): void {
  pending?.(value);
  pending = null;
  listener?.(false);
}

/**
 * Un lector externo se presenta como teclado y casi siempre envia las teclas de
 * un teclado de EE. UU. Con Windows en espanol, `micopay://` llega escrito como
 * `micopayÑ--`. `event.code` dice la tecla fisica, asi que se reconstruye lo que
 * el lector quiso enviar sin importar la distribucion del teclado.
 */
const US_KEYS: Record<string, [string, string]> = {
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Backquote: ['`', '~'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Space: [' ', ' '],
};
const DIGIT_SHIFT = ')!@#$%^&*(';

export function usKeyToChar(code: string, shift: boolean): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return shift ? letter[1] : letter[1].toLowerCase();
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return shift ? DIGIT_SHIFT[Number(digit[1])] : digit[1];
  const key = US_KEYS[code];
  return key ? key[shift ? 1 : 0] : null;
}

/** El texto reconstruido solo gana si es un codigo de MicoPay y el escrito no. */
export function pickScannedValue(typed: string, fromKeys: string): string {
  const value = typed.trim();
  if (value.startsWith('micopay://')) return value;
  return fromKeys.trim().startsWith('micopay://') ? fromKeys.trim() : value;
}
