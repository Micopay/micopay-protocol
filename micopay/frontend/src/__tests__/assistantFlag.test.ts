/**
 * El asistente (#532) no sale a usuarios hasta revisarlo.
 *
 * Lo que se fija aqui:
 *   1. Sin VITE_ENABLE_ASSISTANT la bandera esta apagada.
 *   2. Ningun build del repo (.env*) la prende.
 *   3. Con la bandera apagada no hay boton flotante ni ruta /assistant.
 *
 * App.tsx no se puede montar en vitest (ver KYCRoute.test), asi que el punto 3
 * se revisa sobre el codigo, igual que assistant.test revisa Assistant.tsx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { ASSISTANT_ENABLED } from '../constants/features';

describe('Bandera del asistente', () => {
  it('esta apagada si no se pide', () => {
    expect(ASSISTANT_ENABLED).toBe(false);
  });

  it('ningun build la prende', () => {
    const envFiles = readdirSync('.').filter((name) => name.startsWith('.env'));
    expect(envFiles.length).toBeGreaterThan(0);
    for (const name of envFiles) {
      const content = readFileSync(name, 'utf8');
      expect(content, name).not.toMatch(/^\s*VITE_ENABLE_ASSISTANT\s*=\s*true/m);
    }
  });

  it('sin la bandera no hay boton ni ruta', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toMatch(/if \(!ASSISTANT_ENABLED \|\| !sessionUser\) return null;/);
    expect(app).toMatch(/\{ASSISTANT_ENABLED && <Route path="\/assistant"/);
    // La ruta solo aparece una vez: no hay otra entrada sin bandera.
    expect(app.match(/path="\/assistant"/g)).toHaveLength(1);
  });
});
