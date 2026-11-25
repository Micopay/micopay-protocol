/**
 * #512 · Mensajes del servidor en el idioma activo.
 *
 * EL HUECO: el servidor manda su `message` en español y la app lo mostraba tal
 * cual, tambien con la app en ingles (p. ej. PHONE_ALREADY_REGISTERED al
 * registrarse en la web).
 *
 * Fija:
 *  - un codigo con clave en `apiErrors.*` se muestra en el idioma activo;
 *  - en español el texto es exactamente el del servidor (nada cambia);
 *  - un codigo sin clave, o sin codigo, muestra el mensaje del servidor;
 *  - cada texto de `es.apiErrors` existe tal cual en el backend, para que no
 *    se desincronicen;
 *  - los 409 que ya mostraban el mensaje del servidor pasan por aqui.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AxiosError, AxiosHeaders } from 'axios';
import i18n from '../i18n';
import { extractApiErrorPayload, localizeServerMessage } from '../utils/apiError';
import es from '../i18n/es.json';
import en from '../i18n/en.json';

const PHONE_ES = 'Ese teléfono ya tiene una cuenta de MicoPay. Entra con la billetera de esa cuenta o deja el teléfono vacío.';

function axios409(code: string | undefined, message: string) {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 409, statusText: 'Conflict', headers, config: { headers }, data: { code, message },
  });
}

afterEach(async () => { await i18n.changeLanguage('es'); });

describe('localizeServerMessage', () => {
  it('en español deja el texto del servidor tal cual', () => {
    expect(localizeServerMessage('PHONE_ALREADY_REGISTERED', PHONE_ES)).toBe(PHONE_ES);
  });

  it('en inglés muestra la traducción del código', async () => {
    await i18n.changeLanguage('en');
    expect(localizeServerMessage('PHONE_ALREADY_REGISTERED', PHONE_ES)).toBe(en.apiErrors.PHONE_ALREADY_REGISTERED);
  });

  it('un código sin clave, o sin código, conserva el mensaje del servidor', async () => {
    await i18n.changeLanguage('en');
    // RELEASE_QR_ACTIVE lleva los minutos en el texto: no tiene clave a proposito.
    expect(localizeServerMessage('RELEASE_QR_ACTIVE', 'espera 3 min')).toBe('espera 3 min');
    expect(localizeServerMessage(undefined, 'texto del servidor')).toBe('texto del servidor');
  });
});

describe('extractApiErrorPayload con un 409', () => {
  it('muestra el código traducido en inglés y el del servidor en español', async () => {
    expect(extractApiErrorPayload(axios409('USERNAME_TAKEN', es.apiErrors.USERNAME_TAKEN)).message)
      .toBe(es.apiErrors.USERNAME_TAKEN);
    await i18n.changeLanguage('en');
    expect(extractApiErrorPayload(axios409('USERNAME_TAKEN', es.apiErrors.USERNAME_TAKEN)).message)
      .toBe(en.apiErrors.USERNAME_TAKEN);
  });

  it('sin clave sigue mostrando el mensaje del servidor', async () => {
    await i18n.changeLanguage('en');
    expect(extractApiErrorPayload(axios409('TRADE_NOT_CANCELLABLE', 'No se puede cancelar.')).message)
      .toBe('No se puede cancelar.');
  });
});

describe('es.apiErrors coincide con el backend', () => {
  const backendDir = join(process.cwd(), '..', 'backend', 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== 'tests') walk(full); }
      else if (full.endsWith('.ts')) files.push(full);
    }
  };
  walk(backendDir);
  const backend = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  it.each(Object.entries(es.apiErrors))('%s: el texto en español es el del servidor', (code, text) => {
    expect(backend.includes(`"${code}"`) || backend.includes(`'${code}'`)).toBe(true);
    expect(backend).toContain(text);
  });

  it('en.json tiene las mismas claves', () => {
    expect(Object.keys(en.apiErrors).sort()).toEqual(Object.keys(es.apiErrors).sort());
  });
});
