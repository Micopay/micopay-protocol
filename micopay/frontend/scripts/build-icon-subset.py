#!/usr/bin/env python3
"""Regenera el subconjunto local de Material Symbols y su manifiesto.

Por que existe este script
--------------------------
Los iconos de Material Symbols se escriben como TEXTO y la fuente los convierte
en dibujo mediante una ligadura. Si la fuente no carga, o si el icono no esta
en el subconjunto, el navegador pinta el nombre crudo: `screenshot_monitor`
desbordando su recuadro en mitad de la pantalla de respaldo de la llave.

Ese fallo ya ocurrio dos veces:

  1. La fuente venia del CDN de Google y la app sin señal mostraba los 241 usos
     como palabras. Se arreglo empaquetando un subconjunto local.
  2. El subconjunto se genero UNA vez y nadie lo volvio a tocar. Los iconos
     añadidos despues no estaban dentro, y volvian a salir como texto. Doce
     iconos rotos el 2026-09-05, cinco de ellos recien añadidos.

La causa comun es la misma: el subconjunto se construyo a mano y se quedo atras.
Este script lo deriva del codigo, y `iconSubset.test.ts` falla si alguien añade
un icono sin volver a ejecutarlo.

Uso
---
    pip install fonttools brotli
    python scripts/build-icon-subset.py

Descarga la fuente variable completa (~10 MB) y escribe:
    public/fonts/material-symbols-subset.woff2
    public/fonts/ICONOS.txt   (manifiesto que lee el test)

Detalles que costaron encontrar
-------------------------------
* El nombre del icono es la SECUENCIA de caracteres de la ligadura, no el nombre
  del glifo resultante. Material Symbols tiene alias — `location_on`, `email`,
  `people` — cuya ligadura apunta a un glifo con otro nombre. Podar por nombre
  de glifo los descarta en silencio.
* La fuente mapea 'A' y 'a' al MISMO glifo. Construir el mapa glifo→caracter sin
  preferir la minuscula devuelve los nombres en mayusculas y no casa ninguno.
* Recortar por `text=` no sirve: el cierre de ligaduras arrastra los 4277 iconos
  de la fuente y el resultado pesa 3 MB. Hay que podar la tabla GSUB primero.
* Se conservan las variantes `.fill` y los ejes variables: BottomNav usa el eje
  FILL para marcar la pestaña activa, asi que aplanarlo romperia ese estado.
"""

import os
import re
import sys
import urllib.request

FONT_URL = (
    "https://raw.githubusercontent.com/google/material-design-icons/master/"
    "variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf"
)
OUT_FONT = "public/fonts/material-symbols-subset.woff2"
OUT_MANIFEST = "public/fonts/ICONOS.txt"

# Nombres que aparecen donde un icono, pero no lo son: valores de condicion en
# los ternarios que ELIGEN el icono. Se listan aqui para que el test no los
# reporte como rotos eternamente.
NOT_ICONS = {"cashout", "locked", "icon"}

SPAN = re.compile(r"material-symbols-outlined[^>]*>\s*\{?\s*([^<>{}]+?)\s*\}?\s*<")
ICON_PROP = re.compile(r"\bicon=(?:\"([a-z0-9_]+)\"|\{\s*['\"]([a-z0-9_]+)['\"]\s*\})")
# Varias pantallas pintan `{copy.icon}` / `{offer.icon}` / `{status.icon}`: el
# nombre vive en un objeto, no en el JSX. Sin esto se empaquetaban de menos y
# el icono salia como texto justo en los estados de error, donde mas duele.
ICON_FIELD = re.compile(r"\bicon\s*:\s*['\"]([a-z][a-z0-9_]{2,})['\"]")
LITERAL = re.compile(r"['\"]([a-z][a-z0-9_]{2,})['\"]")


def icons_used_in_source(root="src"):
    """Todos los nombres de icono que aparecen en el codigo de la app."""
    found = set()
    for dirpath, _, files in os.walk(root):
        if "__tests__" in dirpath:
            continue
        for name in files:
            if not name.endswith((".tsx", ".ts")):
                continue
            src = open(os.path.join(dirpath, name), encoding="utf-8", errors="ignore").read()
            for m in SPAN.finditer(src):
                body = m.group(1)
                if re.fullmatch(r"[a-z0-9_]+", body):
                    found.add(body)
                else:
                    # Ternario: `{cond ? 'lock' : 'hourglass_top'}`
                    found.update(x.group(1) for x in LITERAL.finditer(body))
            for m in ICON_PROP.finditer(src):
                found.add(m.group(1) or m.group(2))
            for m in ICON_FIELD.finditer(src):
                found.add(m.group(1))
    return found - NOT_ICONS


def glyph_to_char(font):
    """Mapa glifo→caracter, prefiriendo minusculas (ver encabezado)."""
    mapping = {}
    for cp, glyph in font.getBestCmap().items():
        ch = chr(cp)
        if glyph not in mapping or (ch.islower() and not mapping[glyph].islower()):
            mapping[glyph] = ch
    return mapping


def ligature_subtables(lookup):
    for st in lookup.SubTable:
        yield st.ExtSubTable if st.__class__.__name__ == "ExtensionSubst" else st


def main():
    from fontTools import subset
    from fontTools.ttLib import TTFont

    wanted = icons_used_in_source()
    print(f"iconos usados en el codigo: {len(wanted)}")

    cache = os.path.join(os.environ.get("TEMP", "/tmp"), "material-symbols-full.ttf")
    if not os.path.exists(cache):
        print("descargando la fuente completa…")
        urllib.request.urlretrieve(FONT_URL, cache)
    font = TTFont(cache)

    g2c = glyph_to_char(font)
    found, keep = set(), set()
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for st in ligature_subtables(lookup):
            if st.__class__.__name__ != "LigatureSubst":
                continue
            for first, ligs in list(st.ligatures.items()):
                survivors = []
                for lig in ligs:
                    name = "".join(g2c.get(g, "?") for g in [first] + list(lig.Component))
                    if name in wanted:
                        survivors.append(lig)
                        found.add(name)
                        keep.add(lig.LigGlyph)
                if survivors:
                    st.ligatures[first] = survivors
                else:
                    del st.ligatures[first]

    absent = sorted(wanted - found)
    if absent:
        print("\n  ✗ No existen en Material Symbols (nombre mal escrito o inventado):")
        for a in absent:
            print("     ", a)
        print("\n  Corrigelos en el codigo; no se pueden empaquetar.\n")
        return 1

    order = set(font.getGlyphOrder())
    fills = {f"{g}.fill" for g in keep if f"{g}.fill" in order}

    opts = subset.Options()
    opts.layout_features = ["liga", "calt", "ccmp", "rlig"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(options=opts)
    sub.populate(text="".join(sorted(set("".join(found)))), glyphs=sorted(keep | fills))
    sub.subset(font)
    font.flavor = "woff2"
    font.save(OUT_FONT)

    with open(OUT_MANIFEST, "w", encoding="utf-8") as fh:
        fh.write(
            "# Generado por scripts/build-icon-subset.py — NO editar a mano.\n"
            "# Los iconos que contiene material-symbols-subset.woff2.\n"
            "# iconSubset.test.ts falla si el codigo usa uno que no este aqui.\n"
        )
        fh.write("\n".join(sorted(found)) + "\n")

    print(f"iconos empaquetados: {len(found)}  ({os.path.getsize(OUT_FONT)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
