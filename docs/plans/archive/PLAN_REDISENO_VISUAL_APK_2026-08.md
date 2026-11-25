# Plan de implementación — migrar el APK al sistema visual "Mercado / Rótulo"

**Fecha:** 2026-08-04
**Fuente de verdad:** `Micopay/micopay-landig` @ `ef5cbe4` ("Nueva dirección visual: mercado / rótulo"), leído desde `C:\Users\eric\Desktop\micopay-landig` (working tree limpio, verificado).
**Objetivo de este documento:** describir la migración. **No se implementa nada aquí.**
**Alcance:** solo capa de presentación de `micopay/frontend`. No se toca lógica de negocio, contratos, integraciones ni copy.

---

## 0. Resumen ejecutivo

La app y el sitio hoy no comparten un solo token. El sitio migró a papel cálido + tinta + canto vivo + sombra sólida; la app sigue en Material 3 azulado con radios de 20–32 px, `backdrop-blur`, gradientes y glows — exactamente el lenguaje que el commit `ef5cbe4` eliminó a propósito.

Tres hallazgos condicionan el plan:

1. **La capa de tokens de la app está rota, no solo desalineada.** El proyecto usa Tailwind v4 (`@import "tailwindcss"` + `@theme` en `src/index.css`), pero conserva un `tailwind.config.ts` estilo v3 que **v4 no lee** (no hay directiva `@config` en ningún lado — verificado). Consecuencia: 73 usos de clases `*-error`, más `bg-background`, `bg-accent`, `text-on-primary`, `text-secondary` **no generan CSS**. Confirmado compilando: en `dist/assets/index-CUcNQ-Kp.css` no existe ninguna regla `.bg-error` ni `.text-error`. La migración de tokens no es cosmética: arregla un defecto real.
2. **La regla de color del sistema (verde = digital, naranja = efectivo y acción) es aplicable casi tal cual al producto**, porque el producto *es* esa conversión. Es la parte del sistema con mayor retorno y menor riesgo.
3. **La firma del sistema (borde 2 px + sombra sólida 4 px) sobrevive en Android sin problema.** El ajuste de traducción que queda es táctil: las píldoras del sitio miden ~43 dp de alto, por debajo del mínimo de 48 dp. Se resuelve sin tocar la firma.

> **Actualización 2026-08-04 — el sitio cambió mientras se escribía este plan.** Dos commits posteriores a `ef5cbe4` corrigen defectos de contraste que esta auditoría destapó: `410b6d9` (`--gris-2` deja de usarse para texto) y `c6b395f` (**el naranja pasa a ser direccional**). Las secciones §2.1, §3-F1, §3-F3, D-3, D-5 y §8 están alineadas con `c6b395f`. **Los hexes a heredar son los de `c6b395f`, no los de `ef5cbe4`.**

Fases propuestas: **F0** arreglo de la capa de tokens · **F1** primitivas · **F2** chrome (nav, headers, estados vacíos/error) · **F3** superficies de dinero (Home, Historial, CETES) · **F4** mapa y descubrimiento · **F5** flujo crítico (QR, operación, KYC).

---

## 1. Auditoría del estado actual

### 1.1 Stack (verificado, no supuesto)

| Pieza | Qué es | Evidencia |
|---|---|---|
| App shell | **Capacitor 8** → WebView Android, `appId: com.micopay.app` | `micopay/frontend/capacitor.config.ts` |
| UI | **React 19 + TypeScript**, `react-router-dom` 6 con **HashRouter** | `src/App.tsx:1073-1103`, `src/main.tsx` |
| Build | **Vite 6**, modos `development / testnet / mainnet / production` | `package.json` scripts |
| Estilos | **Tailwind CSS v4** vía `@tailwindcss/postcss` | `postcss.config.js`, `src/index.css:1` |
| Iconos | **Material Symbols Outlined** (fuente Google, CDN) — 241 usos | `index.html`, `src/index.css:26-35` |
| Tipografía | **Plus Jakarta Sans** (headline) + **Manrope** (body), Google Fonts **CDN** | `index.html:11` |
| Mapa | **MapLibre GL v5**, estilo `tiles.openfreemap.org/styles/liberty` | `src/components/MapReal.tsx:27,133` |
| Escáner QR | **`@capacitor-mlkit/barcode-scanning`** — UI nativa a pantalla completa | `src/hooks/useQRScanner.ts` |
| QR mostrado | `qrcode.react` (`QRCodeSVG`) | `src/pages/ClaimQR.tsx:154` |

### 1.2 Dónde viven los estilos — hay **tres capas** que no se hablan

**Capa A — `src/index.css` (`@theme`), la única viva.** Define 13 tokens de color y 2 de tipografía:
`--color-primary #00694C`, `--color-primary-container #C8E6C9`, `--color-on-primary-container #002114`, `--color-surface #FFFFFF`, `--color-on-surface #1A1C1E`, `--color-on-surface-variant #44474E`, `--color-outline #74777F`, `--color-outline-variant #C4C6CF`, `--color-surface-container-lowest/low/(container)/high/highest`, `--font-headline`, `--font-body`.

**Capa B — `tailwind.config.ts`, muerta.** 58 colores Material 3 (`error`, `background`, `accent`, `secondary`, `tertiary`, `inverse-*`, `surface-dark`, …), `fontFamily` y `borderRadius`. **Tailwind v4 no la carga.** Es la fuente de los 73 usos de `*-error` que no pintan nada. Ver §1.5.

**Capa C — valores sueltos en los `.tsx`.** 300+ literales hex y ~56 clases `rounded-[…]`:

| Hex | Usos | Rol de facto |
|---|---|---|
| `#67808C` | 56 | gris secundario |
| `#0B1E26` | 44 | tinta azulada |
| `#1D9E75` | 39 | verde de éxito |
| `#00694C` | 38 | primario (duplica el token) |
| `#D7E3EA` | 33 | línea / borde |
| `#F4FAFF` | 16 | fondo frío |
| `#C62828` | 15 | error |
| `#5DCAA5` | 6 | acento con glow |

Y una **cuarta capa parcial**: `src/pages/ClaimQR.tsx` (207 líneas) está escrita **entera con `style={{}}` inline**, sin Tailwind. No está en el router de `App.tsx`: se monta desde `src/main.tsx:36-40` cuando la URL es `/claim/:requestId`. Es la página que el comerciante abre desde un enlace externo — es decir, **la superficie del producto que más se parece a una landing** y la que más desentona hoy.

### 1.3 Idiomas visuales que el nuevo sistema prohíbe, y cuántos hay

Conteo sobre `src/**/*.tsx`:

| Idioma prohibido | Usos | Ejemplo |
|---|---|---|
| `rounded-[…]` (radios grandes arbitrarios) | 56 | `rounded-[24px]`, `rounded-t-[32px]` |
| `rounded-2xl` / `rounded-xl` / `rounded-full` | 130 / 102 / 139 | tarjetas y tiles de ícono |
| `backdrop-blur*` | 30 | `BottomNav.tsx:29`, `KYCScreen.tsx:227` |
| `shadow-sm/md/lg/xl` (difuminadas) | 115 | `Home.tsx:255` `shadow-xl shadow-primary/20` |
| `shadow-[…]` arbitrarias | 17 | `shadow-[0_0_8px_#5DCAA5]` — glow puro |
| `bg-gradient-*` | 11 | `KYCScreen.tsx:245` |
| `animate-pulse` | 8 | punto "en vivo" del balance |
| Tile de ícono redondeado sobre encabezado | ~30 | `w-9 h-9 rounded-full` en `TradeStateBadge.tsx:153` |
| Tarjeta anidada en tarjeta | frecuente | `Home.tsx` lista de activos dentro de card |

`BottomNav.tsx:29` concentra cinco prohibiciones en una línea: `rounded-t-[32px]`, `backdrop-blur-xl`, `bg-[#F4FAFF]/80`, `shadow-[0_-8px_32px_rgba(11,30,38,0.04)]` y píldoras `rounded-full`.

### 1.4 Inventario de pantallas y componentes

**33 pantallas** (`src/pages/`, rutas en `App.tsx:1073-1103`):

| Grupo | Pantallas | Ruta |
|---|---|---|
| Acceso | `Login`, `Register` | `/login`, `/register` |
| Núcleo | `Home` (548 L), `History`, `Profile` | `/`, `/history`, `/profile` |
| Pago | `PayHub`, `SendPayment`, `ReceivePayment` | `/pay`, `/pay/send`, `/pay/receive` |
| Retiro (USDC→efectivo) | `Explore`, `ExploreMap` (522 L), `TradeConfirmation`, `ChatRoom`, `QRReveal`, `SuccessScreen`, `TradeDetail` (977 L), `TradeCancelled`, `CashoutRequest` | `/explore`, `/map`, `/confirm`, `/chat`, `/qr-reveal`, `/success`, `/trade/:id`, `/cashout` |
| Depósito (efectivo→USDC) | `DepositRequest`, `DepositMap` (501 L), `DepositChat`, `DepositQR` | `/deposit`, `/map-deposit`, `/chat-deposit`, `/qr-deposit` |
| Comercio | `MerchantInbox` (515 L), `MerchantSettings` | `/inbox`, `/merchant-settings` |
| Inversión / rampa | `CETESScreen` (850 L), `BlendScreen` | `/cetes`, `/blend` |
| Identidad | `KYCScreen` | `/kyc`, `/kyc-approved` |
| Legal | `Privacy`, `Terms` | `/privacy`, `/terms` |
| Fuera del router | `ClaimQR` | `/claim/:id` (montada en `main.tsx`) |

**16 componentes** (`src/components/`): `BottomNav`, `Logo`, `MapReal` (280 L), `TradeStateBadge` (176 L), `ErrorBanner`, `ErrorBoundary`, `ConnectionBanner`, `MerchantUnavailableBanner`, `MerchantAvailabilityToggle`, `OfflineQueueStatus`, `PermissionGate`, `CancelTradeDialog`, `DeleteAccountModal`, `TradeConfirmation`, `SupportLink`, `DebugOverlay`.

**No existe una capa de primitivas.** No hay `Button`, `Card`, `Pill`, `Input`, `Label`, `Sheet`. Cada pantalla repite el string de clases. Eso es lo que hace que hoy el cambio visual sea caro — y es lo primero que hay que arreglar (F1).

**Assets propios:** `public/mushroom_green.png`, `mushroom_gold.png`, `mushroom_red.png` — usados como marcadores de proveedor por tier en `MapReal.tsx`. El sitio dibuja el hongo como SVG plano (`Conversor.jsx:62-67`, sombrero `#D9420B`, tallo `#F5F1E8`, trazo `#16130F` 2 px). **Los PNG de la app son de la paleta anterior**; ver §4.

### 1.5 Defecto encontrado durante la auditoría (no es cosmético)

`tailwind.config.ts` existe pero Tailwind v4 solo lo lee con una directiva `@config` explícita, que no está presente en `src/index.css` ni en ningún otro archivo (verificado con grep sobre `src/` e `index.html`).

Compilé `vite build --mode testnet` y revisé el CSS resultante:

```
.bg-error            → 0 reglas
.text-error          → 0 reglas
.bg-background       → 0 reglas
.bg-accent           → 0 reglas
.text-on-primary     → 0 reglas
.text-secondary      → 0 reglas
.bg-primary          → sí (viene de @theme)
.text-outline-variant→ sí (viene de @theme)
```

Usos afectados en `src/**/*.tsx`: **73** de `*-error`, 8 de `*-on-primary`, 7 de `*-secondary`, 2 de `*-accent`, 1 de `*-background`, 1 de `*-surface-variant`, 1 de `*-primary-fixed`.

Impacto visible: los banners de error de `KYCScreen.tsx:48-52` y `Home.tsx:219-231`, y el badge de notificaciones de `Home.tsx:191`, **se renderizan sin color de error**. `TradeStateBadge.tsx:46-49` (`pending_cash`) usa `bg-secondary-container/30 border-secondary/20 text-secondary`, todos muertos: ese estado no tiene tono. El `<body>` de `index.html` trae `bg-background`, que tampoco resuelve.

**Recomendación:** F0 lo corrige por construcción, porque el nuevo `@theme` define todos los tokens que hoy faltan. **Borrar `tailwind.config.ts`** en lugar de migrarlo — mantenerlo garantiza que alguien vuelva a escribir clases muertas.

### 1.6 Dependencias de red en un APK

`index.html` carga Plus Jakarta Sans, Manrope y Material Symbols desde `fonts.googleapis.com`. En un APK offline-first (hay `offlineQueue`, `OfflineQueueStatus`, `ConnectionBanner` — la app asume conectividad intermitente), **la tipografía y los 241 iconos dependen de la red**. Sin conexión la app cae a `system-ui` y los iconos se ven como texto crudo ("home", "qr_code_scanner"). La migración a Archivo es la ocasión para **empaquetar las fuentes localmente**. Ver F0-4.

---

## 2. Mapeo token a token

### 2.1 Color

| Token web (`ef5cbe4`) | Valor | Equivalente hoy en la app | Estado |
|---|---|---|---|
| `--verde` | `#0f4a33` | `--color-primary #00694C` + `#00694C` suelto (38) | **Reemplazo.** Más oscuro y más sucio. |
| `--verde-claro` | `#1a7a54` | `#1D9E75` suelto (39) | **Reemplazo.** El de la app es más saturado. |
| `--verde-brillo` (**sobre oscuro**) | `#4fb98a` | `#5DCAA5` / `accent` (config muerta) | **Reemplazo.** Es el verde del lado oscuro (**7.62:1 sobre `--tinta`**). Está definido pero **sin usar** en el sitio; la app sí lo necesita (§3-F3). Ojo: hoy el `#5DCAA5` va siempre con glow (`shadow-[0_0_8px_#5DCAA5]`) — el glow se va. |
| `--verde-suave` | `#e4ede6` | `--color-primary-container #C8E6C9`, `#E1F5EE`, `#E6F9F1`, `#E8F5EE`, `#e6f9f1`, `#F0FBF7` | **Consolida 6 valores en 1.** |
| `--verde-borde` | `#bfd3c4` | — | **Nuevo.** Hoy los bordes verdes se hacen con `border-primary/20`. |
| `--naranja` (**sobre claro**) | `#c53c0a` | — | **Nuevo. Es el cambio de mayor impacto.** Valor de `c6b395f`. **Heredar este hex, no `#d9420b`.** |
| `--naranja-claro` (**sobre oscuro**) | `#f2631f` | — | **Nuevo.** |
| `--naranja-suave` | `#fbe8dd` | `#F6E8DE` (1 uso, casual) | **Nuevo de facto.** |
| `--naranja-borde` | `#f0c3ab` | — | **Nuevo.** |
| `--tinta` | `#16130f` | `--color-on-surface #1A1C1E`, `#0B1E26` (44), `#1A2830`, `#1a1a2e` | **Reemplazo.** La app usa tinta **azulada**; la nueva es cálida. |
| `--tinta-2` | `#241f19` | `#1A2830` (3) | **Reemplazo.** |
| `--tinta-3` | `#3d352b` | — | **Nuevo.** |
| `--fondo` | `#f5f1e8` | `#F4FAFF` (16) + `--color-surface #FFFFFF` | **Reemplazo.** Azul frío → papel cálido. Cambia el 100% de las pantallas. |
| `--papel` | `#fffdf8` | `#FFFFFF`, `bg-white` (113) | **Reemplazo.** Blanco puro → blanco roto. |
| `--gris` | `#57514a` | `--color-on-surface-variant #44474E` | Reemplazo. |
| `--gris-2` | `#857d71` | `#67808C` (56), `--color-outline #74777F` | **Consolida.** |
| `--gris-3` | `#a89f92` | `#888`, `#999`, `#aaa`, `#bbb` (en `ClaimQR`) | Consolida. |
| `--linea` | `#ddd5c4` | `#D7E3EA` (33), `--color-outline-variant #C4C6CF` | **Reemplazo.** |
| `--linea-suave` | `#ebe4d6` | `#D4E4EC`, `#EFF6FA`, `#EEF1F4` | Consolida. |

#### La regla direccional del color (heredada de `c6b395f` — no es opcional)

Ni el naranja ni el verde son un color: son un **par direccional**. Cada miembro reprueba contraste en el fondo del otro, así que **no son intercambiables**.

| | Sobre claro (`--papel` / `--fondo`) | Sobre oscuro (`--tinta` / `--tinta-2`) |
|---|---|---|
| Efectivo / acción | `--naranja` `#c53c0a` — **5.13** papel · **4.63** fondo | `--naranja-claro` `#f2631f` — **5.80** |
| Digital / saldo | `--verde` `#0f4a33` — **10.1** papel | `--verde-brillo` `#4fb98a` — **7.62** |

Los cuatro pasan AA de texto normal. Usar el miembro equivocado reprueba: `#c53c0a` sobre tinta cae a **3.55** (solo sirve como gráfico) y `#f2631f` sobre papel cae a **2.4**.

**Consecuencia para la app:** cualquier primitiva que exista en variante clara y oscura (`<MoneyBlock>`, `<Badge>`, `<Label>`, banners de estado) necesita **las dos versiones desde el día uno**. Escribir el token una sola vez y confiar en la opacidad es el error que este par previene.

**Sin equivalente en el sistema web — la app los necesita y hay que decidirlos (§5, D-1):**

| Necesidad de la app | Hoy | El sitio tiene | Propuesta |
|---|---|---|---|
| **Error / destructivo** | `#C62828` (15), `error` muerto (73) | solo `#c0392b` en `.ct-err` y `#fdecec` en `.ct-alerta` (`Contact.jsx:306,315`) | Elevar `#c0392b` → `--rojo`, y `#fdecec` → `--rojo-suave`. Es lo único que el sitio ya usa como error. |
| **Éxito / confirmado** | `#1D9E75` (39), `#16a34a` | no existe estado de éxito | Usar `--verde-claro`. **No inventar un verde nuevo.** |
| **Advertencia / beta** | `#FFF6DB`, `#f59e0b` | `AvisoBeta.astro`: `#fff8e6` fondo, `#f0d99b` borde, `#8a6417` texto | **Adoptar los tres tal cual.** Ya existen y son del mismo mundo cálido. |
| **Modo oscuro** | `darkMode: "class"` + ~20 clases `dark:` | **no existe** | Ver D-4. Recomendación: no hacerlo. |
| **Color por activo** (`assets.ts`) | MXNe `#00694C`, USDC `#2775CA`, CETES `#B8860B`, XLM `#7B61FF` | no existe | Ver §4.3. |

### 2.2 Geometría, profundidad, tipografía

| Token web | Valor | App hoy | Estado |
|---|---|---|---|
| `--r-sm / md / lg` | 2 / 3 / 4 px | `DEFAULT 4px`, `lg 8px`, `xl 12px` (config muerta) + 56 `rounded-[…]` hasta 32 px | **Reemplazo total.** El salto de 24 px → 2 px es *el* cambio de silueta. |
| `--r-full` | 999 px | `rounded-full` (139) | **Se conserva el token, se restringe el uso**: en el sistema nuevo `999px` es para puntos/badges circulares, no para botones ni contenedores. |
| `--borde` | `2px solid --tinta` | `border` 1 px, casi siempre `/10`–`/30` de opacidad | **Nuevo.** Bordes opacos y gruesos. |
| `--sombra` | `4px 4px 0 --tinta` | `shadow-sm/md/lg/xl` difuminadas (115) + 17 arbitrarias | **Reemplazo.** |
| `--sombra-sm` | `2px 2px 0 --tinta` | — | Nuevo. |
| `--font-display` / `--font-body` | `Archivo` (ambas) | Plus Jakarta Sans / Manrope | **Reemplazo.** Una familia en vez de dos. |
| `wdth 100 / 105 / 112 / 118` | eje variable | — | **Nuevo. No tiene equivalente.** Requiere la variable font, no la estática. |
| `text-transform: uppercase` en `h1/h2` | — | títulos en caja normal | **Nuevo**, y marcado como *pendiente de decisión del equipo* en el mensaje de `ef5cbe4`. Ver D-2. |
| `font-variant-numeric: tabular-nums` | `.num`, `[translate="no"]` | no se usa | **Nuevo.** Importante: los saldos hoy "bailan" al actualizarse. |

### 2.3 Primitivas

| Primitiva web | Definición | Existe en la app | Estado |
|---|---|---|---|
| `.btn` + `--primary` / `--ghost` | `mp-styles.css:99-113` | no — clases repetidas | **Crear** `<Button>`. |
| `:active` → `translate(3px,3px)` + `shadow 1px` | "se hunde sobre su propia sombra" | `active:scale-90` | **Reemplazo.** Traduce bien a táctil. |
| `.pill` + `data-on` | `mp-styles.css:120-128` | filtros ad-hoc en `Explore`, `CETESScreen` | **Crear** `<Pill>`. Requiere ajuste de altura (§3, F1). |
| `.card` | `mp-styles.css:130-133` | 130 `rounded-2xl` sueltos | **Crear** `<Card>`. |
| Tarjeta letrero (cabecera / cuerpo / pie) | `Proveedores.jsx:95-124` | no existe | **Crear** `<SignCard>`. Patrón central. |
| `.label` (cintillo impreso) | `mp-styles.css:79-86` | `text-[11px] uppercase tracking-[0.15em]` suelto | **Crear** `<Label>`. |
| Panel de monto (`.cv-input-row`) | `Conversor.jsx:150-159` | inputs ad-hoc | **Crear** `<AmountField>`. |
| Bloque de resultado tinta+naranja | `Conversor.jsx:161-168`, `Calculadora.jsx:109-115` | `Home.tsx:255` balance card | **Crear** `<MoneyBlock>`. |
| Input + foco naranja + error | `Contact.jsx:300-306` | ad-hoc | **Crear** `<TextField>`. |
| `.section--dark` / `--rule` | `mp-styles.css:115-118` | no aplica en móvil | **No portar** (concepto de página larga). |

---

## 3. Plan por fases

Criterio de orden: **primero lo que cambia todo con un solo commit y no puede romper una operación; al final lo que toca dinero en vuelo.**

Regla transversal: cada fase deja la app compilando y navegable. Nada de una rama larga.

### F0 — Capa de tokens (fundación)

*Impacto visual: total. Riesgo: bajo. Toca: 3 archivos.*

1. Reescribir el bloque `@theme` de `src/index.css` con los 19 tokens de color de §2.1 + los 3 de error/advertencia adoptados de `Contact.jsx` y `AvisoBeta.astro`, con los mismos nombres que el sitio (`--color-verde`, `--color-naranja`, `--color-tinta`, `--color-papel`, …). **Nombres en español, iguales a los del CSS del sitio**, para que un cambio en el sitio se pueda rastrear en la app sin traducir mentalmente.
2. Añadir radios (`--radius-sm 2px`, `-md 3px`, `-lg 4px`, `-full 999px`) y sombras (`--shadow-sm: 2px 2px 0 var(--color-tinta)`, `--shadow-DEFAULT: 4px 4px 0`) como tokens de `@theme`, para que `rounded-sm` / `shadow` generen la firma sin escribirla a mano.
3. **Borrar `tailwind.config.ts`** y arreglar los 73+ usos de clases muertas mapeándolos a tokens vivos (§1.5). Este paso, por sí solo, hace visibles los banners de error que hoy no pintan.
4. **Empaquetar tipografía e iconos** (§1.6): descargar `Archivo` **variable** (ejes `wght` y `wdth`, licencia OFL, Omnibus-Type) a `public/fonts/`, declarar `@font-face` con `font-display: swap`, y quitar los `<link>` a Google Fonts de `index.html`. Los Material Symbols: subsetear a los ~60 iconos usados o pasar a SVG local. **Sin esto, la app offline pierde tipografía e iconos, que es peor que hoy** (hoy al menos cae a Manrope, que sí se parece a lo que el diseño espera; con Archivo la caída a `system-ui` rompe la jerarquía por ancho).
5. `index.html`: `theme-color` `#00694C` → `#16130f`; `<body>` quitar `bg-background` (muerto) y poner `bg-fondo text-tinta`.
6. `main.tsx:27-28`: `StatusBar.setBackgroundColor` `#FFFFFF` → `#f5f1e8` (`--fondo`), `Style.Light` se mantiene (iconos oscuros sobre papel claro).

**Nota de plataforma:** `setOverlaysWebView({ overlay: false })` está bien puesto y el comentario explica por qué (en Android `env(safe-area-inset-top)` es 0). **No tocarlo.** La franja de status bar en `--fondo` continúa el papel hacia arriba, que es justo lo que el sistema quiere.

### F1 — Primitivas compartidas

*Impacto: alto. Riesgo: bajo (componentes nuevos, adopción incremental). Nuevo dir: `src/components/ui/`.*

Crear `Button`, `Pill`, `Card`, `SignCard`, `Label`, `TextField`, `AmountField`, `MoneyBlock`, `Badge`, `Sheet`.

**Traducciones obligatorias del web a táctil** (esto es el corazón de "no portar el CSS tal cual"):

| Web | Medida en el sitio | En la app | Por qué |
|---|---|---|---|
| `.btn` `padding: 15px 24px`, 15 px | ~58 dp de alto | se conserva | Ya cumple 48 dp. |
| `.pill` `padding: 9px 16px`, 13 px | **~43 dp** | subir a `padding: 13px 18px`, 14 px → **≥48 dp** | Debajo del mínimo táctil de Android. |
| `.nav-btn` `padding: 10px 18px`, 14 px | **~46 dp** | no aplica (no hay nav de sitio) | — |
| `.btn:hover` | cambia de fondo | **eliminar**; solo `:active` | No hay puntero. `Proveedores.jsx:126` ya guarda el hover tras `@media (hover:hover)` — respetar ese criterio. |
| `.btn:active` `translate(3px,3px)` + sombra 1 px | — | **conservar tal cual** | Es la mejor parte del sistema en táctil: el botón se sella bajo el dedo. Sustituye a `active:scale-90`. |
| `.card` `padding: 24px` | — | **16–20 px** | En 5–6" con 24 px de padding + 24 px de margen de pantalla queda poco ancho para una cifra de 34 px. |
| `box-shadow: 8px 8px 0` (Conversor, Calculadora, Contact) | — | **máximo 4 px** | 8 px en 360 dp de ancho se come el margen. |
| Botón principal `--naranja` con texto `--papel`, 15 px/700 | **5.13:1** con `#c53c0a` | **conservar 15 px/700 tal cual** | **Resuelto aguas arriba** por `c6b395f`. Con `#d9420b` daba 4.36 y reprobaba; el arreglo fue el color, no el tamaño. Ver D-3. |
| `--gris-2 #857d71` como texto | **4.00** papel · **3.60** fondo | **no usar para texto**; solo separadores y gráficos (umbral 3:1). Texto secundario en `--gris #57514a` (**7.74:1**) | **Resuelto aguas arriba** por `410b6d9` (12 usos de texto migrados). La app hereda la regla, no solo el token. |

**Contrastes verificados (WCAG 2.1, calculados con herramienta tras `c6b395f`):**
`--naranja-claro` sobre `--tinta` = **5.80:1** ✅ (la cifra de dinero invertida — la pieza más importante del sistema);
`--naranja` `#c53c0a` sobre `--papel` = **5.13:1** ✅ / sobre `--fondo` = **4.63:1** ✅;
`--verde-brillo` sobre `--tinta` = **7.62:1** ✅;
`--verde` sobre `--papel` = **10.1:1** ✅;
`--gris` sobre `--papel` = **7.74:1** ✅;
`--gris-3` sobre `--tinta` = **7.19:1** ✅.

Conclusión práctica: **con el par direccional, el naranja y el verde son seguros como texto en ambos fondos.** La restricción ya no es de tamaño ni de rol, es de dirección: elegir el miembro correcto del par según el fondo. Eso es más fácil de cumplir y más fácil de auditar.

### F2 — Chrome: navegación, headers, banners, estados vacíos

*Impacto: alto (aparece en todas las pantallas). Riesgo: bajo. No toca flujo de dinero.*

- `BottomNav.tsx`: quitar `rounded-t-[32px]`, `backdrop-blur-xl` y la sombra difuminada. Sustituir por `bg-papel` + `border-top: 2px solid var(--tinta)`. Ítem activo: **cintillo `--tinta` con texto `--papel`** (la lógica de `.pill[data-on="true"]`, `mp-styles.css:128`), no la píldora verde translúcida. **Conservar:** `pb-[max(2rem,env(safe-area-inset-bottom))]`, `aria-current="page"`, `aria-label`, el `focus:ring`, y el eje `FILL` del icono para el estado activo — todo eso es convención de plataforma correcta.
- Headers `sticky`: quitar `backdrop-blur-md` + `/80` (12 pantallas). `bg-fondo` opaco + regla inferior de 2 px.
- `Logo.tsx`: adoptar los trazos del sitio (`Nav.astro:6-10`) — círculo `#16130F`, círculo `#D9420B`, unión `#16130F` 2.5 px; "Mico" en tinta, "Pay" en `--naranja`, `wdth 112`, mayúsculas. **Hoy la app y el sitio tienen logos distintos** (la app usa `#1A2830`/`#1D9E75`/`#00694C`). Esto es una desalineación de marca, no solo de estilo.
- `ErrorBanner`, `ConnectionBanner`, `MerchantUnavailableBanner`, `OfflineQueueStatus`: pasan al patrón de `.ct-alerta` (`Contact.jsx:315`) — borde 2 px de tinta, fondo `--rojo-suave`, sin radio grande.
- **Franja de beta/testnet:** ver §4.7. Se implementa aquí porque es chrome global.
- Estados vacíos: ver §4.6.

### F3 — Superficies de dinero

*Impacto: máximo (es donde vive la regla de color). Riesgo: medio — se muestran saldos, no se mueven.*

- `Home.tsx:255-309` **balance card** → `<MoneyBlock>`: fondo `--tinta`, label en `--gris-3` 10 px/700/`.12em`, cifra en `--naranja-claro` `wdth 108`, `tabular-nums`. Quitar `rounded-[24px]`, `shadow-xl shadow-primary/20`, el `animate-pulse` y el `shadow-[0_0_8px_#5DCAA5]`.
  **Corrección respecto a la primera versión de este plan.** Yo proponía la cifra de `Home` en naranja "porque son pesos". **Es incorrecto.** El brief dice *"los saldos y elementos cripto van en verde"*, y el sitio lo confirma sin excepción: sus tres cifras naranjas son `.cv-resumen-valor` ("Recibes aprox."), `.pv-recibes-valor` ("Recibes con 250 USDC") y `.cl-resultado-valor` ("Ganancia estimada"). **Las tres son dinero que vas a recibir. Ninguna es un saldo.**

  Por tanto: **el saldo de `Home` va en `--verde-brillo` sobre `--tinta` (7.62:1)**, no en naranja. El naranja queda para el monto de una operación — lo que vas a recibir en efectivo — y para el momento de cobrar.

  Esto le da a `<MoneyBlock>` dos variantes, que es justo la mecánica del producto: en la pantalla de una operación se ve **la cifra verde (tu saldo digital) convertirse en la cifra naranja (el efectivo que recibes)**. El color narra la conversión sin una sola etiqueta, que es exactamente lo que `ef5cbe4` buscaba.
- Lista de activos `Home.tsx:316-359`: quitar tarjeta-dentro-de-tarjeta y los tiles `w-10 h-10 rounded-full`. Filas separadas por `1px solid --linea` dentro de un solo `<Card>`, código de activo como cintillo cuadrado 2 px (patrón `.cv-moneda`, `Conversor.jsx:154`).
- `History.tsx`, `CETESScreen.tsx` (850 L), `BlendScreen.tsx`, `Profile.tsx`: `<Card>`, `<Label>`, `<MoneyBlock>`, `tabular-nums` en todas las cifras.
- `CETESScreen` y `BlendScreen` tienen sliders → patrón `.cl-rango` (`Calculadora.jsx:92-103`): pista de 8 px con borde 2 px, pulgar cuadrado naranja con borde de tinta. **Traducción táctil: el pulgar sube de 20 px a 28 px**; 20 px es un objetivo de puntero, no de dedo.

### F4 — Mapa y descubrimiento

*Impacto: alto. Riesgo: medio (`MapReal` construye DOM imperativo, fuera de React).*

- `ExploreMap`, `DepositMap`, `Explore`: fichas de proveedor → `<SignCard>` (cabecera `--verde-suave` con borde inferior de tinta / cuerpo / pie `--fondo`), calcado de `Proveedores.jsx:95-124`. Es la traducción más directa que hay entre sitio y app: **la ficha de proveedor del sitio y la de la app muestran los mismos datos** (nombre, distancia, tarifa, reputación, cuánto recibes).
- Filtros → `<Pill>` con `data-on`.
- Marcadores (`MapReal.tsx:29-122`): ver §4.2.
- Estilo del mapa: ver §4.2 y D-6.

### F5 — Flujo crítico (al final, a propósito)

*Impacto: alto. Riesgo: **el mayor**. Aquí hay dinero en vuelo, timers y HTLC.*

Orden interno, del menos al más delicado:

1. `KYCScreen` — quitar `bg-gradient-to-br` (`:245`) y `backdrop-blur-md` (`:227`). **No tocar** la máquina de estados de Didit/Etherfuse ni el consentimiento expreso. El aviso de privacidad de la app (`privacy-app.astro` §4) dice que los documentos los recibe el proveedor externo y que MicoPay solo guarda nivel, fecha y emisor: **cualquier texto o icono que insinúe que la app "guarda tu INE" contradice el aviso publicado.** Revisar que el rediseño no lo introduzca.
2. `TradeStateBadge` (176 L) — los 7 estados. Recolorear con la paleta nueva **y arreglar `pending_cash`**, que hoy no tiene tono porque `secondary` está muerto. Ver §4.4.
3. `TradeConfirmation`, `TradeDetail` (977 L), `TradeCancelled`, `SuccessScreen`, `ChatRoom`, `DepositChat`.
4. `QRReveal`, `DepositQR` — ver §4.1.
5. `ClaimQR` (207 L) — reescritura completa a Tailwind + primitivas. Es la superficie que ve el comerciante desde un enlace; es la que más se parece al sitio y la que más lejos está de él.
6. Escáner (`useQRScanner`) — ver §4.1. **La UI de cámara es nativa de ML Kit y no se puede tematizar.**

---

## 4. Inventario de huecos — superficies que la app tiene y el sitio no

Todo lo de esta sección es **extensión del sistema, no algo tomado del sitio.** El sitio es una landing: no tiene cámara, ni mapa vivo, ni saldos, ni operaciones con estado, ni permisos de sistema operativo. Cada propuesta marca de qué primitiva del sitio deriva, para que la extensión sea rastreable.

### 4.1 Escáner de QR y QR mostrado

**Restricción técnica dura:** `useQRScanner.ts` llama a `BarcodeScanner.scan()` de `@capacitor-mlkit/barcode-scanning`, que abre una **actividad nativa a pantalla completa**. Esa pantalla **no es HTML y no se puede estilar** con nuestros tokens. Si el equipo quiere una mira de escaneo con la firma del sistema, hay que migrar a `startScan()` (modo transparente, la WebView dibuja el overlay) — **es un cambio de comportamiento, no de estilo, y por lo tanto queda fuera del alcance de este plan.** Lo dejo anotado como D-7.

Lo que sí es nuestro:
- **Pre-escaneo** (`PermissionGate`): tarjeta letrero explicando por qué se pide la cámara. `privacy-app.astro` §2 dice literalmente que la cámara es *"únicamente para escanear el código QR durante una operación"* — el texto de la pantalla debe seguir diciendo eso.
- **Permiso denegado permanentemente**: `<Card>` con `<Button variant="ghost">` a ajustes. El sistema no tiene patrón de esto → extensión, derivada de `.card` + `.btn--ghost`.
- **QR mostrado** (`QRReveal`, `DepositQR`, `ClaimQR`): **extensión.** Propuesta: el QR va sobre `--papel` puro (nunca sobre `--fondo`: el papel cálido baja el contraste del módulo y algunos lectores fallan), `fgColor` = `--tinta` `#16130f` en vez de `#1a1a2e`, marco de 2 px de tinta, `quiet zone` de 16 px, y **sin radio en las esquinas del QR** (hoy `ClaimQR.tsx:160` le pone `borderRadius: 12`, que además recorta módulos). Debajo, un `<MoneyBlock>` con el monto en pesos: es literalmente "el momento de cobrar", el caso más puro de naranja.
- **Brillo:** al mostrar un QR conviene subir el brillo de pantalla. Es convención de plataforma, no estética; queda anotado como mejora fuera de alcance visual.

### 4.2 Mapa

- El estilo de teselas es de terceros (`tiles.openfreemap.org/styles/liberty`) y **no coincide con el papel cálido**. Tres salidas: (a) dejarlo y compensar con marcadores y fichas —barato, mapa fuera del sistema; (b) `VITE_MAP_STYLE_URL` ya existe (`MapReal.tsx:133`), así que se puede apuntar a un estilo propio con `--fondo` de base y agua en `--verde-suave` —caro, requiere hospedar el estilo; (c) filtro CSS sobre el canvas —rechazado, degrada legibilidad de calles. **Recomendación: (a) ahora, (b) después de la beta.** Ver D-6.
- **Marcadores** (`MapReal.tsx:29-122`): extensión derivada del `.cv-chip` (`Conversor.jsx:126-135`) — fondo `--papel`, borde 2 px de tinta, sombra sólida 2 px, sin radio. El pin del usuario deriva de `.cv-pin-nucleo`: círculo naranja con borde de tinta (**este es el único sitio donde `--r-full` sigue siendo correcto**).
- **Hongos:** `public/mushroom_{green,gold,red}.png` son de la paleta anterior. El sitio ya tiene el hongo dibujado como SVG plano de 4 trazos (`Conversor.jsx:62-67`) con sombrero `#D9420B`, tallo `#F5F1E8` y trazo `#16130F` 2 px, y el comentario dice que las proporciones están calibradas para leerse a ~60 px. **Propuesta: sustituir los tres PNG por ese SVG, variando solo el color del sombrero por tier** (`--tinta` Maestro / `--naranja` Avanzado / `--papel` Inicial, siguiendo `.pv-badge-tier`, `Proveedores.jsx:110-112`). Gana nitidez a cualquier densidad y elimina 3 assets rasterizados.

### 4.3 Billetera y activos

**Extensión.** Los colores por activo de `assets.ts` (USDC `#2775CA`, XLM `#7B61FF`, CETES `#B8860B`) son colores de marca de terceros y **chocan de frente con la paleta cálida** — el morado de XLM es lo más frío que hay en la app.

Propuesta: **quitar el color de marca del token y codificar por rol**, siguiendo `.cv-moneda` (`Conversor.jsx:154`): cintillo rectangular con el código del activo, fondo `--verde` para activos digitales, texto `--papel`. La diferenciación entre activos pasa al **código de texto** (MXNe / USDC / CETES / XLM), no al color. Razón: en este sistema el color significa *digital vs. efectivo*; si además significa *cuál token*, el mensaje se rompe. Es la decisión más discutible de la sección y la señalo como tal.

### 4.4 Estados de operación

**Extensión.** El sitio solo tiene el flujo estático de `Seguridad.astro` (Tú → Escrow → Proveedor). La app tiene 7 estados con copy ya escrito (`TradeStateBadge.tsx:27-115`) que **no se toca**.

Propuesta de tono, aprovechando que el sistema tiene exactamente el vocabulario necesario:

| Estado | Tono propuesto | Derivado de |
|---|---|---|
| `locked` | `--verde-suave` / borde tinta / icono `--verde` | `.pv-card-top` |
| `pending_cash` | `--naranja-suave` / borde tinta / icono `--naranja` | **arregla el estado sin tono de §1.5.** Es el momento en que aparece el efectivo → naranja, igual que `paso--dark` en `ComoFunciona.astro:41` |
| `revealed` | fondo `--tinta` / cifra `--naranja-claro` | `.cv-resumen` |
| `completed` | `--verde-suave` / icono `--verde-claro` | — |
| `cancelled` | `--fondo` / borde `--linea` / icono `--gris` | neutro |
| `expired` | `--fondo` / borde `--linea` / icono `--gris` | neutro |
| `refunded` | `--verde-suave` / icono `--verde` | el dinero volvió = digital |

Además: quitar el tile `w-9 h-9 rounded-full` (`TradeStateBadge.tsx:153`) — el icono va suelto sobre el fondo, que es exactamente lo que `ef5cbe4` eliminó ("desaparece el tile de ícono redondeado sobre cada encabezado", y `Proveedores.jsx:104` lo comenta).

### 4.5 Notificaciones

**Extensión.** Hoy: badge numérico `rounded-full` en `Home.tsx:191` con `bg-error` **muerto** — el badge se ve sin fondo.
Propuesta: cuadro de 18×18 dp, radio 2 px, fondo `--naranja`, texto `--papel` 10 px/800, borde 1.5 px de tinta (patrón `.pv-badge-tier`, `Proveedores.jsx:106-109`). Naranja porque una notificación pendiente en esta app casi siempre es "alguien quiere cobrarte / entregarte efectivo" — es acción.
Notificaciones del sistema Android (barra de estado): **fuera del alcance visual**; solo se puede definir el color de acento del icono, que debería ser `--naranja` `#c53c0a`.

### 4.6 Estados vacíos

**Extensión.** No existen en el sitio y hoy en la app son inconsistentes.
Propuesta: un solo patrón — `<Label>` (cintillo de tinta) + título en display `wdth 105` + una línea en `--gris` + un `<Button variant="ghost">`. **Sin ilustración, sin icono gigante gris.** Un letrero vacío sigue siendo un letrero: dice qué falta y qué hacer. Es coherente con "señalética, no folclor".

### 4.7 Beta en testnet — cómo se comunica

**Es un hueco real y el sitio ya lo resolvió; la app no.**

Estado actual: la app menciona la red como dato técnico —`"Stellar Testnet"`, `"Stellar · Testnet"`, `"Testnet · Simulado"`, `"Soroban HTLC"` (`i18n/es.json:15,60,331,340`)— pero **no hay ninguna franja que diga que no se mueve dinero real.** El sitio sí: `AvisoBeta.astro` va debajo del nav, antes del hero, y el comentario del archivo explica el porqué — *el copy del hero está en presente, así que el aviso tiene que verse antes de leer esa promesa.*

**El mismo razonamiento aplica con más fuerza en la app**, donde `Home` muestra una cifra grande que parece un saldo real.

Propuesta (visual; el texto exacto lo decide quien maneja copy, ver §7):
- Franja persistente bajo el header en `Home`, `PayHub`, `CETESScreen`, `BlendScreen` y en toda pantalla con `<MoneyBlock>`, con los tokens que **ya existen** en `AvisoBeta.astro`: fondo `#fff8e6`, borde inferior `#f0d99b`, texto `#8a6417` — se promueven a `--aviso`, `--aviso-borde`, `--aviso-texto`.
- **No es descartable.** Es la única pieza del chrome que no se puede cerrar.
- En `<MoneyBlock>`, cintillo `<Label>` adyacente a la cifra con el estado de red.
- El registro de lenguaje debe ser el del sitio: describir lo que pasa, no nombrar la tecnología. "Red de prueba: no se mueve dinero real" describe; "Stellar Testnet" nombra. Los dos pueden convivir (el técnico en pequeño, el descriptivo en grande) — pero **hoy solo existe el técnico.**

Esto **no contradice** `privacy-app.astro`, que no habla de red ni de saldos.

### 4.8 Modales, hojas y diálogos

**Extensión.** `CancelTradeDialog`, `DeleteAccountModal`, `MerchantAvailabilityToggle` usan modales con radios grandes y overlay difuminado. Propuesta: hoja anclada al borde inferior, borde superior 2 px de tinta, sin radio, overlay `--tinta` al 55% **sin blur**. El acento destructivo va en `--rojo` (`#c0392b`, §2.1), **nunca en naranja** — el naranja ya significa "cobrar" y usarlo para "borrar mi cuenta" rompe la única regla que carga el producto.

---

## 5. Riesgos y decisiones abiertas

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D-1** | El sistema no tiene color de error, éxito ni advertencia. | (a) inventarlos; (b) elevar los que ya usa el sitio de forma incidental | **(b).** `--rojo #c0392b` y `--rojo-suave #fdecec` de `Contact.jsx:306,315`; éxito = `--verde-claro`; advertencia = los tres de `AvisoBeta.astro`. Cero colores inventados. |
| **D-2** | Títulos en MAYÚSCULAS — el commit `ef5cbe4` lo deja explícitamente *"pendiente de decisión del equipo"*. | (a) mayúsculas en toda la app; (b) solo en `<Label>` y `<Button>`; (c) nada | **(b).** En una landing las mayúsculas leen como rótulo; en 360 dp, un `h1` en mayúsculas roba dos líneas y baja la velocidad de lectura, y buena parte del público de la app no es lector fluido. Los cintillos y botones sí, porque son cortos. **Requiere que el equipo del sitio sepa que la app se desvía aquí**, o que la decisión se tome una sola vez para ambos. |
| **D-3** | ~~El botón principal naranja no pasa AA.~~ | — | **CERRADA por `c6b395f`.** El naranja es direccional (§2.1) y el botón pasa a **5.13:1** con 15 px/700. La app hereda `#c53c0a` y la regla. *Registro del error, para que no se repita: la primera versión de este plan proponía subir el texto a 17 px "como texto grande" — mal, el umbral es 24 px normal o 18.66 px negrita — y afirmaba 32:1 para tinta sobre naranja, cuando son 4.17:1. Ambos números salían de un cálculo a mano con la rama equivocada de la fórmula de luminancia. **Los contrastes se calculan con herramienta, no a mano.*** |
| **D-4** | `darkMode: "class"` y ~20 clases `dark:` en la app; el sitio **no tiene modo oscuro**. | (a) construir uno; (b) quitarlo y forzar claro | **(b).** Un sistema de papel impreso invertido a oscuro deja de ser papel impreso; y hoy el modo oscuro está a medias (`html class="light"` fijo en `index.html`, unas pocas clases `dark:` sueltas), así que quitarlo elimina código muerto. Si más adelante se quiere, se diseña — no se deriva. |
| **D-5** | ¿MXNe (peso digital) y CETES van en naranja o en verde? | — | **CERRADA por `c6b395f`.** Si el naranja es direccional, deja de ser un color de activo y pasa a marcar un **momento**: el dinero que recibes. Los saldos —MXNe, USDC, CETES, XLM— van todos en verde, sin importar su denominación, y se distinguen entre sí por el **código** del activo (§4.3), no por color. La pregunta "¿de qué color es CETES?" queda mal planteada: **ningún activo tiene color.** |
| **D-6** | El estilo de teselas del mapa no es del sistema. | (a) dejarlo; (b) estilo propio vía `VITE_MAP_STYLE_URL`; (c) filtro CSS | **(a) para la beta, (b) después.** El mapa es la pantalla de mayor riesgo de rendimiento y ya se estabilizó hace poco (v5 + OpenFreeMap). No mezclar un cambio de estilo de teselas con el rediseño. |
| **D-7** | La UI del escáner es nativa (ML Kit) y no se puede tematizar. | (a) aceptar; (b) migrar a `startScan()` con overlay propio | **(a) en este plan.** (b) es cambio de comportamiento (ciclo de vida de cámara, permisos, back button) y no cabe en un rediseño visual. Anotarlo como trabajo aparte. |
| **D-8** | La firma cuesta ancho: borde 2 px + sombra 4 px = 6 px por lado. | (a) sombra a 3 px en móvil; (b) mantener 4 px y bajar el margen de pantalla a 16 px; (c) sombra solo en superficies principales | **(c) + (b).** Sombra sólida en `<Card>`, `<SignCard>`, `<Button primary>` y `<MoneyBlock>`; **sin sombra** en filas de lista, chips y campos — que en el sitio tampoco la llevan. Así la firma se lee sin saturar 360 dp. **No se reduce el borde de 2 px en ningún caso.** |
| **R-1** | El eje `wdth` de Archivo requiere la fuente **variable**. Si se empaqueta la estática, toda la jerarquía por ancho desaparece silenciosamente. | — | Verificar en F0 que el `.woff2` expone `wdth`, y añadir un test visual. Es un fallo que no rompe el build. |
| **R-2** | Los 73 usos de clases muertas se arreglan en F0, lo que hace **aparecer** elementos que hoy no se ven. Puede leerse como regresión. | — | Documentarlo en el PR de F0 con capturas antes/después. No es regresión: es lo que siempre debió verse. |
| **R-3** | `TradeDetail.tsx` (977 L) y `CETESScreen.tsx` (850 L) concentran el riesgo. | — | Trocearlas en F1 al extraer primitivas, **antes** de tocarles el color en F3/F5. |
| **R-4** | `MapReal.tsx` construye marcadores con DOM imperativo fuera de React; las clases de Tailwind aplicadas ahí no se detectan por escaneo de contenido. | — | En marcadores, usar `element.style` con `var(--color-…)` en vez de clases, o añadir un safelist. Riesgo real de que los marcadores queden sin estilo en producción y bien en dev. |
| **R-5** | Hay una rama activa (`feat/map-real`) con 12 archivos modificados sin commitear. | — | Cerrar esa rama antes de abrir F0. Un cambio global de tokens contra un árbol sucio es un merge doloroso. |

---

## 6. Criterios de aceptación por fase

Verificables, no opinables.

### F0 — Tokens
- `grep -rE "(bg|text|border|ring|divide)-(error|background|accent|on-primary|secondary|tertiary)\b" src --include=*.tsx` devuelve **0**.
- `tailwind.config.ts` no existe.
- El CSS compilado contiene reglas para **todas** las clases de color usadas en `src` (script de verificación: extraer clases → comprobar presencia en `dist/assets/*.css`). Hoy fallan 7 familias.
- Ninguna petición a `fonts.googleapis.com` ni `fonts.gstatic.com` en el bundle ni en `index.html`.
- Con el WebView en modo avión, la app renderiza en Archivo y **todos** los iconos como glifo (no como palabra).
- El `.woff2` de Archivo expone el eje `wdth` (`fvar`) — comprobado con `fc-query` o equivalente.
- `theme-color`, `StatusBar.setBackgroundColor` y `--fondo` coinciden en `#f5f1e8`.

### F1 — Primitivas
- Existen y están exportadas: `Button`, `Pill`, `Card`, `SignCard`, `Label`, `TextField`, `AmountField`, `MoneyBlock`, `Badge`, `Sheet`.
- **Todo** elemento interactivo mide ≥48×48 dp de área táctil (auditar con inspector de Chrome sobre el WebView, viewport 360×640).
- `Button:active` desplaza 3 dp y reduce la sombra a 1 dp. `active:scale-90` no aparece en `src`.
- Ningún par texto/fondo de las primitivas baja de 4.5:1 (texto normal) o 3:1 (≥18.66 px/700). Reporte de contraste adjunto al PR.
- `grep -c "rounded-\[" src` = **0**. `rounded-full` solo en `Badge` y en el pin de usuario del mapa.
- `grep -rE "backdrop-blur|bg-gradient|shadow-(sm|md|lg|xl)" src` = **0**.
- Toda sombra en `src` es de la forma `Npx Npx 0` con `N ≤ 4`.

### F2 — Chrome
- `BottomNav` sin blur, sin radio superior, con regla de 2 px; ítem activo = cintillo de tinta. `aria-current`, `aria-label`, `focus:ring` y el `padding-bottom` de safe area intactos.
- El botón físico de retroceso de Android sigue funcionando en las 33 pantallas (`main.tsx:13-19` sin cambios).
- El logo de la app y el de `Nav.astro` usan los mismos tres colores.
- La franja de beta aparece en toda pantalla con `<MoneyBlock>` y no es descartable.
- Todos los banners comparten un solo componente.

### F3 — Dinero
- Toda cifra monetaria usa `tabular-nums` y no cambia de ancho al actualizarse (grabar `loadBalance` y comparar cuadros).
- La cifra principal de `Home` (**saldo**) usa `--verde-brillo` sobre `--tinta` (**7.62:1**). Ninguna cifra naranja aparece fuera de un monto de operación o de cobro.
- Auditoría del par direccional: no existe en `src` ningún `--naranja` sobre fondo oscuro ni `--naranja-claro` sobre fondo claro (script de verificación en el PR).
- Cero tarjetas anidadas: ningún elemento con borde de 2 px contiene otro con borde de 2 px.
- Pulgares de slider ≥28 dp.
- El saldo se lee a 40 cm de distancia con brillo al 40% (prueba con 3 personas, una mayor de 55 años).

### F4 — Mapa
- Las fichas de proveedor de `ExploreMap` y `DepositMap` son el mismo `<SignCard>`, y su estructura cabecera/cuerpo/pie coincide con `Proveedores.jsx`.
- Los marcadores conservan estilo en un **build de producción** (no solo en dev) — este es el criterio que atrapa R-4.
- Los tres tiers se distinguen sin depender del color (forma o texto), verificado en escala de grises.
- Sin regresión de rendimiento: tiempo hasta el primer render del mapa dentro del ±10% del actual.

### F5 — Flujo crítico
- Los 7 estados de `TradeStateBadge` tienen tono distinguible; `pending_cash` en naranja; ninguno depende de una clase muerta.
- **El copy de los 7 estados es byte a byte idéntico al de `TradeStateBadge.tsx:27-115` actual.**
- El QR se lee con 3 lectores distintos a 30 cm, con brillo al 30%, sobre fondo `--papel`.
- El QR no tiene radio en las esquinas y conserva quiet zone ≥16 px.
- `ClaimQR` no contiene ni un `style={{}}` de color; hereda los tokens.
- Una operación completa de retiro (crear → aceptar → chat → QR → completar) pasa en un dispositivo real contra testnet, sin cambios en tiempos ni estados.
- `KYCScreen`: ningún texto ni icono nuevo sugiere que MicoPay almacena identificación, selfie o CURP (contrastado contra `privacy-app.astro` §4).
- Suite existente en verde: `Home.test.tsx`, `TradeDetail.test.tsx`, `qrPayload.test.ts`, `qrValidation.test.ts`, `useTradePolling.test.ts`.

---

## 7. Fuera de alcance

**Copy.** No se toca ni una palabra. Detecté tres cosas que alguien con autoridad sobre el texto debería revisar — **las anoto, no las cambio**:

1. **La app no dice, en lenguaje llano, que no se mueve dinero real.** Solo dice `"Stellar Testnet"`, `"Testnet · Simulado"`, `"Soroban HTLC"` (`i18n/es.json:15,60,331,340`). El sitio sí lo dice (`AvisoBeta.astro`). Para alguien no bancarizado, "Testnet" no significa nada; "no se mueve dinero real" sí. F2 crea el contenedor; **el texto no lo escribo yo.**
2. `QRReveal.tsx:215` muestra `"Soroban HTLC"` como etiqueta visible. Es el nombre de la tecnología, no una descripción de lo que pasa. El registro del sitio para lo mismo es *"El proveedor cobra hasta que tú tienes el efectivo"* (`Seguridad.astro:12`).
3. `ClaimQR.tsx:168` muestra `"{n} USDC bloqueados · Soroban HTLC"` a un comerciante que probablemente abrió el enlace desde WhatsApp y nunca ha usado la app.

**También fuera de alcance:** lógica de negocio, contratos, integraciones (Didit, Etherfuse, Blend, Stellar), migración del escáner a `startScan()` (D-7), estilo propio de teselas (D-6), modo oscuro (D-4), brillo automático al mostrar QR, y cualquier cambio en el repo del sitio.

---

## 8. Dos cosas del sistema que no cuadran con el código de la app

Las señalo en vez de rellenarlas:

1. ~~**"La cifra en pesos va en naranja" no cierra con la lista de activos.**~~ **RESUELTO por `c6b395f`.** El hueco era real —la app tiene cuatro activos y el sitio dos, y CETES no encajaba en ninguna categoría— pero la salida no era añadir un color, sino quitarle al color el trabajo de identificar activos. Con el naranja direccional, el color marca **dirección de la conversión** (digital → efectivo), no **qué token**. CETES no necesita respuesta porque ningún activo tiene color. Ver D-5.

2. **El sitio no tiene ningún patrón para "algo está pasando ahora mismo".** Es estático por naturaleza. La app tiene polling (`useTradePolling`), cola offline, timers de expiración de HTLC y estados que cambian solos. El único recurso de movimiento que el sistema admite es `:active` — y `@media (prefers-reduced-motion)` apaga todas las transiciones (`mp-styles.css:142-144`). Hoy la app usa `animate-pulse`, que es un glow suave y está prohibido. **Necesito un patrón de "en curso" y el sistema no me da uno.** Opción menos invasiva: un cintillo `<Label>` que cambia de texto y de fondo por pasos discretos (tinta → naranja) en vez de animación continua — imprenta, no luz. Queda propuesto, no decidido.
