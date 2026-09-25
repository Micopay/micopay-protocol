# Propuesta de refactor · Iconos tipados

**Fecha:** 2026-09-05
**Estado:** PENDIENTE — no empezado. Aplazado a propósito por trabajo más urgente.
**Alcance:** `micopay/frontend`
**Decisión requerida:** de Eric, antes de empezar.

---

## Resumen en una línea

Un nombre de icono es hoy una cadena suelta que nada valida. Convertirlo en un
tipo elimina de raíz una clase de fallo que ya se ha roto tres veces.

---

## Por qué está escrito esto

El 2026-09-05 la barra de navegación del APK mostraba `HOME` y `EXPLORE` como
texto gigante donde deberían ir los iconos. Fue la tercera vez que se rompe lo
mismo:

| # | Qué pasó | Cómo se arregló |
|---|---|---|
| 1 | La fuente venía del CDN de Google. Sin señal, los 241 usos salían como palabras. | Se empaquetó un subconjunto local (`faff4b2` y anteriores). |
| 2 | Ese subconjunto se generó **una vez** y nadie lo regeneró. Doce iconos rotos, entre ellos `screenshot_monitor` desbordándose sobre la pantalla de respaldo de la llave secreta. | `896f036`: generador versionado + manifiesto + test. |
| 3 | El arreglo del (2) intentó reconocer las **formas sintácticas** en que el código escribe un icono. `BottomNav` los pasa como argumentos —`btn('home', 'home', …)`— y no encajaba en ninguna, así que se borraron de la fuente. | `994f6e7`: dejar de adivinar la sintaxis y cruzar con los 4 277 nombres reales de Material Symbols. |

Las tres tienen la misma causa de fondo, y ninguno de los tres arreglos la toca:
**el compilador no sabe qué es un nombre de icono.** Todo lo que existe hoy —el
generador, el manifiesto, el test que hace `grep` sobre el código fuente— es
andamiaje para compensar esa ausencia.

Consecuencia adicional, no hipotética: `currency_peso` no existe en Material
Symbols. Era un nombre inventado y vivió meses en `BlendScreen.tsx`
renderizándose como texto crudo sin que nadie lo notara.

---

## Situación medida (2026-09-05)

| Dato | Valor |
|---|---|
| Usos de `material-symbols-outlined` | 247 |
| Ficheros afectados | 45 |
| Iconos distintos empaquetados | 111 (110 KB) |
| Nombres válidos de Material Symbols | 4 277 |

Formas sintácticas en uso, todas simultáneas:

| Forma | Usos | Ejemplo |
|---|---|---|
| Texto JSX | 177 | `<span className="material-symbols-outlined">arrow_back</span>` |
| Campo de objeto | 42 | `{ icon: 'lock' }`, leído luego como `{copy.icon}` |
| Prop | 25 | `icon="storefront"` |
| Interpolado | 10 | `{copied ? 'check' : 'content_copy'}` |
| Argumento de función | — | `btn('home', 'home', t('nav.home'))` — el que se escapó |

---

## Propuesta

Un único componente:

```tsx
<Icon name="home" />
```

donde `name` es un tipo unión generado a partir de los 4 277 nombres reales, que
el script ya escribe hoy en `scripts/material-symbols-names.txt`.

### Qué cambia

- **El fallo pasa de visual y solo visible en el teléfono a error de
  compilación.** `currency_peso` no habría llegado a guardarse.
- **El extractor deja de adivinar.** Una sola forma de escribir un icono
  significa detección exacta por construcción. El test de `grep` pasa de ser la
  defensa principal a una red secundaria.
- **Autocompletado** de los 4 277 nombres en el editor.
- **Un solo sitio para el estilo.** Hoy hay 247 copias de la misma cadena de
  clases y del eje `FILL`; cambiar cómo se ve un icono es tocar 45 ficheros.
- **Cambiar de familia de iconos** algún día deja de ser abrir 45 ficheros.

### Qué NO cambia

- El subconjunto local sigue siendo necesario: la app tiene que funcionar sin
  señal, que fue el fallo (1).
- `scripts/build-icon-subset.py` sigue existiendo. Se simplifica su extractor,
  no se retira.
- Los ejes variables y las variantes `.fill` se conservan: `BottomNav` usa `FILL`
  para marcar la pestaña activa y aplanarlo rompería ese estado.

---

## Plan

1. Generar `IconName` como tipo unión desde `material-symbols-names.txt`, en el
   mismo script que ya produce esa lista.
2. Crear `src/components/Icon.tsx` con el estilo y el eje `FILL` dentro.
3. Codemod sobre los 247 usos:
   - 177 de texto JSX y 25 de prop: sustitución mecánica.
   - 42 de campo de objeto y 10 interpolados: **revisión a mano**, porque el
     nombre viaja por una variable.
4. Simplificar el extractor del generador a una sola forma.
5. Reducir `iconSubset.test.ts` a red secundaria.

**En un PR aparte, sin mezclar con nada más.** La suite actual (177 tests) es la
red durante el codemod.

---

## Coste y riesgos

**Coste:** mecánico en su mayor parte. Los 52 usos indirectos (objeto e
interpolado) son el trabajo real.

**Riesgo principal:** un codemod sobre 45 ficheros toca superficie visual que
los tests no cubren del todo. Mitigación: por lotes, con revisión en el
dispositivo entre cada uno. Las tres roturas anteriores solo se vieron mirando
el teléfono, no en CI.

**Trampa a evitar, y es tentadora:** tipar `name` con los 111 iconos
*empaquetados* en vez de con los 4 277 *válidos* haría imposible por construcción
usar un icono no empaquetado — pero crea un ciclo incómodo: no podrías escribir
un icono nuevo hasta haberlo empaquetado primero. Tipar con los válidos y dejar
que el generador derive el paquete del uso.

---

## El patrón más allá de los iconos

La misma forma —una cadena con significado que nada valida hasta que alguien la
ve rota en pantalla— se repite en las claves de traducción (`t('nav.home')`).

Se comprobaron el 2026-09-05: **426 claves en uso, ninguna rota.** Está sano hoy
y no hay urgencia. Pero si el refactor de iconos sale bien, aplicar la misma idea
a i18n es barato y cierra la clase entera.

---

## Prioridad

**Por debajo de**, al 2026-09-05:

- `App.tsx:1036` — la verja de «Respaldo Requerido» sigue copiando la llave
  secreta al portapapeles. El arreglo SEC-33 (#348) cubrió `Register.tsx` y
  `Profile.tsx` pero no esta tercera ruta. En Android el portapapeles es legible
  por otras apps.
- Las fases pendientes del plan de auditoría
  (`PLAN_IMPLEMENTACION_AUDITORIA_2026-09-04.md`).

Esto no está sangrando: el fallo (3) ya está arreglado y hay un test que lo
vigila. Es deuda con dueño y con fecha, no una urgencia.
