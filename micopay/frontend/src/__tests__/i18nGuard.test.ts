/**
 * #510 · Guardia contra textos sin traducir.
 *
 * EL HUECO: la lista de #510 salió de una búsqueda a mano y dejó fuera textos
 * con acentos en props (`body="…"`), etiquetas `aria-label="Volver"` y claves
 * que existían en `es.json` pero no en `en.json`. Cada uno se veía en español
 * con la app en inglés y nadie se enteraba hasta abrir la pantalla.
 *
 * LO QUE ESTO ES, Y LO QUE NO: revisa el código fuente, no la pantalla.
 *   1. `es.json` y `en.json` tienen las mismas claves y las mismas variables.
 *   2. Fuera de los comentarios, ningún `.ts`/`.tsx` de `src` tiene texto con
 *      acentos o `¿¡ñ`. Un texto en español casi siempre los lleva.
 *   3. Ningún `aria-label` es un texto fijo: el lector de pantalla también
 *      habla en el idioma activo.
 * No detecta un texto en español sin acentos ("Volver" en un `<p>`), ni
 * revisa la calidad de la traducción.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import es from '../i18n/es.json';
import en from '../i18n/en.json';

/**
 * Pendientes a propósito, con su motivo. Quitar de aquí al traducirlos.
 * - App.tsx, Login.tsx, Register.tsx: casillas de #510 que esperan a que se
 *   fusionen #449 y #489, que tocan esos archivos.
 * - lib/keystore.ts, lib/userPresence.ts: también los tocan #449 y #489.
 * - DebugOverlay.tsx: interno, fuera de #510.
 * - LanguageToggle.tsx: dice "Cambiar a español" a propósito.
 */
const PENDING = new Set([
  'App.tsx',
  'pages/Login.tsx',
  'pages/Register.tsx',
  'lib/keystore.ts',
  'lib/userPresence.ts',
  'components/DebugOverlay.tsx',
  'components/LanguageToggle.tsx',
]);

/** Líneas que llevan acentos como dato, no como texto para la persona. */
const DATA_LINE = /_RE\s*=\s*\//; // p. ej. RFC_RE = /^[A-ZÑ&]{3,4}…/

const SPANISH_CHARS = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;
const FIXED_ARIA = /aria-label="[^"]*[A-Za-z][^"]*"/;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'i18n') sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|d)\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Quita los comentarios conservando los saltos de línea, para que el número de
 * línea del error sea el del archivo. Respeta las cadenas: un `//` dentro de
 * 'https://…' no es comentario.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

/** `{ a: { b: 'x {{n}}' } }` → `[['a.b', 'x {{n}}']]` */
function flatten(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [[`${prefix}${k}`, String(v)] as [string, string]],
  );
}

const vars = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('i18n: es.json y en.json', () => {
  const esEntries = new Map(flatten(es as Record<string, unknown>));
  const enEntries = new Map(flatten(en as Record<string, unknown>));

  it('tienen las mismas claves', () => {
    const onlyEs = [...esEntries.keys()].filter((k) => !enEntries.has(k));
    const onlyEn = [...enEntries.keys()].filter((k) => !esEntries.has(k));
    expect({ onlyEs, onlyEn }).toEqual({ onlyEs: [], onlyEn: [] });
  });

  it('cada traducción usa las mismas variables {{…}}', () => {
    const mismatched = [...esEntries]
      .filter(([k, v]) => enEntries.has(k) && vars(v).join() !== vars(enEntries.get(k)!).join())
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });
});

describe('i18n: textos fijos en el código', () => {
  const root = join(process.cwd(), 'src');
  const files = sourceFiles(root).map((full) => ({
    full,
    rel: full.slice(root.length + 1).replace(/\\/g, '/'),
  }));

  function offenders(test: (line: string) => boolean): string[] {
    const found: string[] = [];
    for (const { full, rel } of files) {
      if (PENDING.has(rel)) continue;
      stripComments(readFileSync(full, 'utf8'))
        .split('\n')
        .forEach((line, idx) => {
          if (DATA_LINE.test(line) || /console\.|logger\./.test(line)) return;
          if (test(line)) found.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
    return found;
  }

  it('no hay texto con acentos fuera de es.json', () => {
    expect(offenders((line) => SPANISH_CHARS.test(line))).toEqual([]);
  });

  it('ningún aria-label es un texto fijo', () => {
    expect(offenders((line) => FIXED_ARIA.test(line))).toEqual([]);
  });

  it('la lista de pendientes no tiene archivos que ya no existen', () => {
    const existing = new Set(files.map((f) => f.rel));
    expect([...PENDING].filter((rel) => !existing.has(rel))).toEqual([]);
  });
});
