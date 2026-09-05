/**
 * Todo icono que la app use tiene que estar en la fuente empaquetada.
 *
 * Los Material Symbols se escriben como TEXTO y la fuente los convierte en
 * dibujo con una ligadura. Si el icono no esta en el subconjunto local, el
 * navegador pinta el nombre crudo: `screenshot_monitor` desbordando su recuadro
 * en mitad de la pantalla de respaldo de la llave secreta.
 *
 * Este fallo ya ha ocurrido dos veces por la misma razon de fondo — el
 * subconjunto se construyo a mano y se quedo atras:
 *
 *   1. La fuente venia del CDN de Google; sin señal, todos los usos salian como
 *      palabras. Se arreglo empaquetandola.
 *   2. El subconjunto se genero una vez y nadie lo regenero. El 2026-09-05
 *      habia doce iconos rotos, cinco de ellos añadidos ese mismo dia.
 *
 * De ahi este test: no comprueba como se ve nada, comprueba que la fuente
 * contiene lo que el codigo pide. Si falla, la solucion es una sola orden:
 *
 *     python scripts/build-icon-subset.py
 *
 * Se compara contra `ICONOS.txt`, que ese script deriva de la fuente que acaba
 * de escribir — no de una lista mantenida a mano, que es justo lo que fallo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nombres que aparecen donde iria un icono pero no lo son: son los valores de
 * condicion de los ternarios que ELIGEN el icono, como
 * `{escrowStatus === 'locked' ? 'lock' : 'hourglass_top'}`.
 */
const NOT_ICONS = new Set(['cashout', 'locked', 'icon']);

const SPAN = /material-symbols-outlined[^>]*>\s*\{?\s*([^<>{}]+?)\s*\}?\s*</g;
const ICON_PROP = /\bicon=(?:"([a-z0-9_]+)"|\{\s*['"]([a-z0-9_]+)['"]\s*\})/g;
const ICON_FIELD = /\bicon\s*:\s*['"]([a-z][a-z0-9_]{2,})['"]/g;
const LITERAL = /['"]([a-z][a-z0-9_]{2,})['"]/g;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Mismo criterio de extraccion que `scripts/build-icon-subset.py`. */
function iconsUsedInSource(): Map<string, string> {
  const used = new Map<string, string>();
  for (const file of sourceFiles(join(process.cwd(), 'src'))) {
    const src = readFileSync(file, 'utf8');
    const rel = file.replace(process.cwd(), '').replace(/\\/g, '/');

    for (const m of src.matchAll(SPAN)) {
      const body = m[1];
      if (/^[a-z0-9_]+$/.test(body)) {
        if (!used.has(body)) used.set(body, rel);
      } else {
        // Ternario dentro del span: se toman todos los literales.
        for (const lit of body.matchAll(LITERAL)) {
          if (!used.has(lit[1])) used.set(lit[1], rel);
        }
      }
    }
    for (const m of src.matchAll(ICON_PROP)) {
      const name = m[1] ?? m[2];
      if (!used.has(name)) used.set(name, rel);
    }
    // Varias pantallas pintan `{copy.icon}` / `{offer.icon}`: el nombre vive en
    // un objeto, no en el JSX.
    for (const m of src.matchAll(ICON_FIELD)) {
      if (!used.has(m[1])) used.set(m[1], rel);
    }
  }
  for (const skip of NOT_ICONS) used.delete(skip);
  return used;
}

function packagedIcons(): Set<string> {
  const manifest = readFileSync(join(process.cwd(), 'public/fonts/ICONOS.txt'), 'utf8');
  return new Set(
    manifest
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

describe('el subconjunto de iconos empaquetado', () => {
  it('contiene todos los iconos que el código usa', () => {
    const used = iconsUsedInSource();
    const packaged = packagedIcons();

    const missing = [...used.entries()]
      .filter(([name]) => !packaged.has(name))
      .map(([name, file]) => `${name}  (${file})`);

    expect(
      missing,
      'Estos iconos se renderizarán como TEXTO CRUDO sobre la pantalla.\n' +
        'Solución: python scripts/build-icon-subset.py\n\n' +
        missing.join('\n'),
    ).toEqual([]);
  });

  it('detecta iconos en las tres formas en que el código los escribe', () => {
    // Guarda del propio extractor: si un cambio lo rompe, dejaria de ver
    // iconos y el test de arriba pasaria en verde sin comprobar nada. Ya paso
    // una vez, con un `\b` que se convirtió en carácter de retroceso y anuló
    // el patrón entero.
    const used = iconsUsedInSource();
    expect(used.size).toBeGreaterThan(60);
    // Literal en el span, ternario en el span, y campo de objeto.
    expect(used.has('arrow_back')).toBe(true);
    expect(used.has('hourglass_top')).toBe(true);
    expect(used.has('qr_code')).toBe(true);
  });

  it('no empaqueta iconos que ya nadie usa', () => {
    // No es correccion, es higiene: el subconjunto viaja en el APK.
    const used = iconsUsedInSource();
    const unused = [...packagedIcons()].filter((n) => !used.has(n));
    expect(unused).toEqual([]);
  });
});
