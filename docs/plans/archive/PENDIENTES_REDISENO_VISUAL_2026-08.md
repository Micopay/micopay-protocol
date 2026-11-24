# Qué falta del rediseño visual del APK

**Fecha:** 2026-08-06
**Rama:** `feat/rediseno-rotulo` (worktree `C:\Users\eric\Desktop\HACKATON-rediseno`)
**Último commit:** `e226392` — "F5 cierre: barrido de defectos encontrados en el APK"
**Plan de origen:** [`PLAN_REDISENO_VISUAL_APK_2026-08.md`](./PLAN_REDISENO_VISUAL_APK_2026-08.md)
**Dispositivo de prueba:** Redmi `2303ERA42L` (`ZH6HKBMRE6YLGEQS`), Android 15, DPR 2.75, viewport 392 CSS px

Este documento es el estado real tras revisar el APK en dispositivo, no una lista
de intenciones. Todo lo que se afirma aquí está medido: contra el CSS compilado,
contra estilos computados en el WebView, o corriendo la suite. Lo que no se pudo
verificar está marcado como tal.

---

## 0. Resumen

F0 a F5 están commiteadas y el sistema "Mercado / Rótulo" se sostiene en el
dispositivo. Lo que queda **no es cosmético ni mecánico**: es F0b, la retirada del
andamio de alias, que toca casi todo el frontend. Hoy la app se ve coherente en
buena parte gracias a ese andamio, no porque las pantallas estén migradas.

| | Cifra |
|---|---|
| Usos de alias Material 3 en `src` | **818** |
| Pantallas que **no** importan las primitivas | **22 de 29** |
| Clases de color sin regla en el CSS compilado | **0** |
| Referencias de red externas en el bundle | **0** |
| `rounded-[…]`, `backdrop-blur`, `bg-gradient`, `shadow-sm/md/lg/xl` | **0** |
| Tests | 2 archivos rojos (30 → 21 fallos) |

---

## 1. Lo que ya está cerrado y verificado en el dispositivo

No hace falta volver a revisarlo:

- **Tokens y tipografía.** Archivo empaquetada con eje `wdth`, cero peticiones a
  Google Fonts, `body` en `wdth 100`. Los **79** nombres de icono que aparecen en
  el código se dibujan como glifo (medido en el WebView comparando el ancho de
  cada ligadura: ninguno cae como palabra ni como glifo vacío).
- **Chrome.** `BottomNav` sin blur, con regla de 2 px y pestaña activa en cintillo
  de tinta. Franja de beta presente y no descartable, con los tres tokens de
  `AvisoBeta`.
- **Superficies de dinero.** El saldo de Home en `--verde-brillo` sobre tinta
  (D-5), `tabular-nums` vía `.num`.
- **Mapa.** `MapReal` construye los marcadores con `element.style` y
  `var(--color-…)`, que es lo que exigía R-4 para que no se pierdan en un build
  de producción.
- **Los defectos del barrido de `e226392`**, confirmados en pantalla: ícono de
  "Enviar" visible, 4 títulos en tinta, "CETES" sin truncar, fecha sin
  `capitalize`, encabezado de Home sin el tile de la paleta muerta, filtros de
  Bandeja con la primitiva `Pill` (borde 2 px real —computado 1.818 px por el
  redondeo a DPR 2.75—, 51 dp de alto, activo en `--tinta`).

---

## 2. F0b — retirar el andamio de alias (el pendiente grande)

`src/index.css` declara un bloque de **alias temporales** (Material 3 remapeado
sobre la paleta nueva) con esta nota:

> Son andamio, no sistema: F0b los va retirando conforme migra cada pantalla a
> los nombres de arriba, y este bloque debe quedar vacío al cerrar F0b.

Hoy el bloque está entero. Reparto de los 818 usos:

| Alias | Usos | Destino |
|---|---|---|
| `on-surface` | 366 | `tinta` |
| `primary` | 238 | `verde` |
| `on-surface-variant` | 180 | `gris` |
| `surface` | 121 | `papel` |
| `surface-container` | 91 | `fondo` |
| `error` | 73 | `rojo` |
| `surface-container-low` | 51 | `fondo` |
| `surface-container-lowest` | 18 | `papel` |
| `surface-container-high` | 16 | `linea-suave` |
| `outline` | 9 | `gris-2` (solo separadores, **nunca texto**) |
| `primary-container` | 8 | `verde-suave` |
| `on-primary` | 6 | `papel` |
| `outline-variant` | 4 | `linea` |
| `surface-container-highest` | 4 | `linea` |
| `secondary` | 3 | `gris` |
| `accent`, `background`, `secondary-container`, `surface-variant` | 1 c/u | ver `index.css` |

**Aviso sobre el remapeo mecánico.** El barrido de `e226392` encontró 6 clases
muertas (`bg-verde-container`, `bg-verde-fixed`, `border-tinta-high`,
`border-tinta-low` ×3, `text-warning`, `text-body`) que salieron exactamente de
una pasada de buscar y reemplazar sobre estos nombres. Producían tarjetas **sin
borde** en `QRReveal` y `DepositQR`, y no rompían el build ni el `tsc`.

> **Regla para F0b: cada tanda termina corriendo el verificador de clases muertas
> contra el CSS compilado.** Es el único control que atrapa este fallo. Ver §6.

---

## 3. Primitivas — adopción a medias

Solo **7 de 29** pantallas importan `components/ui`. Las 22 restantes recibieron
el color por el andamio, sin pasar por las primitivas:

```
BlendScreen (434 L)      CETESScreen (847 L)     ChatRoom (325 L)
DepositChat (258 L)      DepositMap (501 L)      DepositQR (151 L)
Explore (98 L)           ExploreMap (522 L)      KYCScreen (343 L)
Login (174 L)            MerchantSettings (374 L) Privacy (99 L)
Profile (486 L)          QRReveal (277 L)        ReceivePayment (85 L)
Register (206 L)         SendPayment (308 L)     SuccessScreen (279 L)
Terms (94 L)             TradeCancelled (93 L)   TradeConfirmation (160 L)
TradeDetail (981 L)
```

R-3 del plan sigue vigente: `TradeDetail` (981 L) y `CETESScreen` (847 L)
concentran el riesgo y conviene trocearlas **antes** de tocarles el color.

**Falta una primitiva: `Sheet`.** F1 la listaba y no se creó. Con ella queda
pendiente §4.8: `CancelTradeDialog`, `DeleteAccountModal` y
`MerchantAvailabilityToggle` siguen con el patrón de modal anterior. El acento
destructivo va en `--rojo`, **nunca en naranja** — el naranja ya significa
"cobrar".

---

## 4. Restos de idioma visual

Menores, pero son los que delatan que una pantalla no pasó por el sistema:

- **70 grises de Tailwind** (`text-gray-*`, `bg-gray-*`), concentrados en
  `DebugOverlay` (23, solo desarrollo), `MerchantInbox` (18), `App.tsx` (6),
  `TradeDetail` (2), y uno en `Register`, `Profile`, `OfflineQueueStatus` y
  `MerchantAvailabilityToggle`. Son grises **fríos** en una paleta cálida.
- **Emoji como icono de UI**, donde el sistema pide señalética:
  `ErrorBoundary.tsx:48` (⚠️ a `text-5xl`), `MerchantAvailabilityToggle.tsx:94`
  y `:100`.
- **Tres `shadow-<token>/opacidad` inertes**: `KYCScreen.tsx:290`, `:309` y
  `MerchantSettings.tsx:202`. Tailwind los interpreta como *color* de sombra; sin
  una utilidad de tamaño no pintan nada. No son una violación visible, son
  restos del sistema anterior que conviene borrar para que nadie los "arregle"
  añadiéndoles un `shadow-lg`.
- **`Explore.tsx:42`**: la tarjeta de CETES lleva `border border-primary/10`
  (1 px translúcido) mientras la de Blend usa el borde de 2 px del sistema. Las
  dos tarjetas de la misma pantalla no coinciden.
- **`QRReveal.tsx:~162`**: mensaje de chat **inventado y fijo en el código**
  ("Estamos en Av. Juárez 34, a un costado del banco"), presentado como si fuera
  real, en la pantalla del dinero en vuelo. No es visual: es contenido falso. La
  foto de stock que lo acompañaba ya se quitó en `e226392`; el texto sigue.
  Requiere decisión de quien maneja el copy (§7 del plan).

---

## 5. Tests

| Archivo | Estado | Origen |
|---|---|---|
| `Home.test.tsx` | **9 / 10** | Estaba en 0/10; arreglado en `e226392` |
| `TradeDetail.test.tsx` | **1 / 21** | Preexistente |
| `qrPayload`, `qrValidation`, `useTradePolling` | verdes | — |

**Ninguno de los dos fallos lo introdujo el rediseño.** Verificado corriendo la
suite en un worktree de `feat/map-real` @ `6be7b30`: falla exactamente igual. El
rediseño no tocó ni un archivo de test (`git diff --stat feat/map-real...HEAD --
src/__tests__/` está vacío).

### 5.1 `TradeDetail.test.tsx` — 20 rojos, sin diagnosticar

El componente no llega a montarse: el test renderiza y obtiene el mock de Home.
El copy que las aserciones buscan ("Pendiente", "Bloqueado", "Detalle de
operación") **sí existe y es idéntico** al de `feat/map-real`, y la ruta
`/trade/:id` está bien escrita en `App.tsx:1078`. La causa está en el arranque
del test, no en la pantalla. Queda por investigar.

### 5.2 El rojo que se dejó a propósito

`Home.test.tsx > shows tilde prefix when rate fetch fails` pide un prefijo `~` y
un fallback de ×20. **La app ya no tiene ninguna de las dos cosas:**
`Home.tsx:126` cae a `xlmRate = 2.5` y lo muestra **sin ninguna marca de que no
es la tasa viva**.

Con 10,000 XLM eso son ~25,000 MXN de saldo aparente calculado con una tasa
inventada, indistinguible de un saldo bueno. Ajustar la aserción al
comportamiento actual habría borrado la señal, así que el test se dejó rojo.

**Es decisión de producto, no del rediseño.** Tres salidas: (a) recuperar la
marca de aproximación; (b) no mostrar cifra en MXN sin tasa viva; (c) aceptarlo y
actualizar el test. El sistema ya tiene el vocabulario para (a): un `<Label>` con
el estado, que es justo lo que §8.2 del plan proponía para "algo está pasando".

---

## 6. Cómo verificar (y por qué importa el método)

Dos aprendizajes de esta revisión que conviene no perder:

**Las capturas engañan.** Dos "defectos" que parecían obvios en pantalla —fuente
condensada en Bandeja, píldora activa invisible— resultaron ser artefactos de
captura: al medir estilos computados salían correctos. Y al revés, el ícono
invisible de "Enviar" solo se confirmó midiendo (`color` y `background` ambos
`rgb(255,253,248)`). **Medir el DOM, no mirar el PNG.**

**MIUI bloquea `adb shell input`.** Devuelve `SecurityException: Injecting input
events requires the INJECT_EVENTS permission`. La vía que sí funciona es DevTools
remoto sobre el WebView, que además solo lee la app y no la pantalla del
teléfono:

```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.micopay.app.debug)
# luego CDP: Runtime.evaluate para medir, Input.dispatchMouseEvent para tocar,
# Page.captureScreenshot para la vista del WebView.
```

Notas prácticas: escribir `location.hash` **no** hace navegar (hay que tocar la
UI); `Page.captureScreenshot` se cuelga sobre pantallas con spinner; y en Git
Bash hace falta `MSYS_NO_PATHCONV=1` para que `adb` no reescriba `/sdcard/...`.

**Verificador de clases muertas.** Extrae toda clase de color de `src` y comprueba
que exista una regla en `dist/assets/*.css`. Es lo que encontró las 6 clases
muertas y lo que debe correr en cada tanda de F0b. Cuidado con dos trampas que
tuvo la primera versión: las variantes se compilan escapadas
(`focus:border-naranja` → `.focus\:border-naranja`), así que buscar solo `.clase`
da falsos negativos; y `stroke-width` de un SVG no es una clase de Tailwind. El
script quedó en el scratchpad de la sesión, **no en el repo**. Vale la pena
moverlo a `micopay/frontend/scripts/`, porque los criterios de aceptación de F0
y F3 piden justamente eso.

---

## 7. Decisiones abiertas que siguen abiertas

Del §5 del plan, sin cerrar:

- **D-2** — títulos en MAYÚSCULAS. Aplicado como recomendaba el plan: solo en
  `<Label>` y `<Button>`, no en `h1`. **El equipo del sitio debe saber que la app
  se desvía aquí.**
- **D-6** — el estilo de teselas del mapa no es del sistema. (a) para la beta,
  (b) estilo propio después. Sin cambios.
- **D-7** — la UI del escáner es nativa de ML Kit y no se puede tematizar.
  Aceptado; migrar a `startScan()` es cambio de comportamiento.
- **§8.2 del plan** — sigue **sin patrón para "algo está pasando ahora mismo"**.
  El sistema es de imprenta y solo admite `:active`; la app tiene polling, cola
  offline y timers de HTLC. Propuesta del plan (no decidida): un `<Label>` que
  cambia por pasos discretos en vez de animación continua. Se cruza con §5.2.

---

## 8. Orden sugerido

1. **Decidir dónde va F0b**: en esta rama o en una nueva. Toca ~800 sitios; una
   rama larga contra `main` en movimiento es dolorosa (es la lección de R-5).
2. Mover el verificador de clases muertas al repo y engancharlo a CI. Sin eso,
   F0b vuelve a producir clases muertas invisibles.
3. F0b por tandas, **una pantalla o grupo por commit**, empezando por las que
   ya tienen primitivas y siguiendo por las pequeñas (`ReceivePayment`, `Explore`,
   `TradeCancelled`, `Privacy`, `Terms`).
4. Trocear `TradeDetail` y `CETESScreen` antes de migrarlas (R-3).
5. Crear `Sheet` y cerrar §4.8.
6. Diagnosticar `TradeDetail.test.tsx`.
7. Resolver §5.2 con quien decida producto.
