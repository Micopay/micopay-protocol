# Plan de implementación — Mapa real + brechas del APK

**Fecha:** 2026-07-25 · **Origen:** `docs/AUDIT_APK_MAPA_2026-07.md` (leerlo primero: contiene el diagnóstico completo)
**Ejecutor previsto:** sesión de agente (Sonnet) sin contexto previo. Este doc es autocontenido.
**Estado del repo esperado:** rama `main` con los merges #320/#321 y los fixes AWS (`1db550a`, `02232b4`).

## Contexto mínimo (no asumir nada más)

- El APK es React + Vite + Capacitor en `micopay/frontend`; backend Fastify en `micopay/backend`.
- El backend de producción vive en `https://api.micopay.app` (AWS ECS). **Este plan NO toca infraestructura AWS** — solo código del repo. Cualquier cambio de env vars de producción se anota en §7 como "handoff a humano".
- El pipeline de datos geoespaciales ya es real: GPS del usuario (`useGeolocation.ts`, `useMerchantsAvailable.ts`) → `GET /merchants/available` (Haversine en SQL, `merchant.service.ts:160`) → lista ordenada por distancia.
- Lo simulado es el **render** (`MapSim.tsx` = PNG estático) y falta el **flujo de captura de ubicación del comercio** (endpoint `PATCH /merchants/me/location` existe en `micopay/backend/src/routes/merchants.ts:113` pero el frontend jamás lo llama).

## Reglas de trabajo

- Una rama por paquete de trabajo: `feat/map-real-wp1`, `feat/map-real-wp2`, etc. Commits convencionales (`feat(map): …`, `fix(privacy): …`).
- Después de cada WP: `npm run build` en `micopay/frontend` (y en `micopay/backend` si se tocó) debe pasar. El CI ya bloquea builds rotos.
- No modificar: `Dockerfile`, `.github/workflows/ci.yml`, nada bajo `micopay/sql/migrations/` existente (solo se permite **añadir** migraciones nuevas).
- Textos de UI: siempre vía i18n (`src/i18n/es.json` + `en.json`), nunca hardcodeados. El español es el idioma primario.
- Estilo visual: conservar el design system existente (clases `surface-*`, `primary`, `font-headline`, bordes `rounded-[24px]/[32px]`) y los pins de hongo (`public/mushroom_*.png`).

---

## WP1 — Componente de mapa real (MapLibre GL)

**Objetivo:** reemplazar el PNG simulado por un mapa real con tiles, pan/zoom, centrado en el GPS real del usuario. Interfaz de props compatible con `MapSim` para swap 1:1.

**Dependencia nueva:** `npm i maplibre-gl` en `micopay/frontend` (≈250 KB gz; el bundle actual es 1.7 MB — aceptable, no intentar code-splitting en este WP).

**Tiles:** usar el estilo demo de MapLibre (`https://demotiles.maplibre.org/style.json`) SOLO como fallback de desarrollo. El estilo de producción se lee de `VITE_MAP_STYLE_URL` (env). En `.env.testnet` y `.env.mainnet` añadir la variable con un estilo de MapTiler free tier — **la key de MapTiler la provee el humano** (handoff §7); mientras no exista, el componente usa el fallback demo y muestra un aviso pequeño "mapa de desarrollo".

**Archivos:**

1. **Crear `src/components/MapReal.tsx`** con esta interfaz (superset de la de `MapSim`):
   ```ts
   interface MapRealProps {
     type?: 'cashout' | 'deposit';
     merchants?: AvailableMerchant[];
     selectedMerchantId?: string | null;
     onSelectMerchant?: (merchantId: string) => void;
     /** Posición real del usuario; si null, fit-bounds solo sobre merchants */
     userPosition?: { lat: number; lng: number } | null;
   }
   ```
   Implementación:
   - `maplibregl.Map` en un `div` contenedor con la misma altura/borde que MapSim (`h-64 rounded-[32px] overflow-hidden`).
   - Markers de comercios: `maplibregl.Marker({ element })` con un `<img>` de hongo (verde para `deposit`, rotación roja/verde/dorada para `cashout`, igual que hoy) + label con `username`. Click → `onSelectMerchant`. Selected → escala 1.25 + ring (clases existentes).
   - Marker del usuario: punto azul/primary con pulso (reusar el estilo del pulso actual como elemento HTML custom).
   - `map.fitBounds()` sobre usuario + merchants con `padding: 48, maxZoom: 16`. Si solo hay usuario, `setCenter` + zoom 14.
   - Cleanup correcto en unmount (`map.remove()`).
   - **No** incluir: el label "CDMX · ZONA CENTRO" ni "Agentes reales cercanos" (brecha G3 del audit). En su lugar, un chip discreto con `{merchants.length} agentes cerca` derivado de datos (i18n: `map.agentsNearby`).
   - Importar el CSS: `import 'maplibre-gl/dist/maplibre-gl.css'` (una sola vez, en el componente).

2. **Modificar `src/hooks/useMerchantsAvailable.ts`:** hoy obtiene `lat/lng` y los descarta tras el fetch. Exponerlos: al estado `success` añadir `userPosition: { lat, lng }`. Actualizar el tipo `MerchantsState`. (Cambio aditivo; no romper consumidores existentes.)

3. **Swap en consumidores:**
   - `src/pages/ExploreMap.tsx:203` — `<MapSim …>` → `<MapReal … userPosition={state.status === 'success' ? state.userPosition : null}>`.
   - `src/pages/DepositMap.tsx:460` — igual (`type="deposit"`, sin selección, como hoy).
   - **No borrar `MapSim.tsx` todavía** (lo referencian tests/snapshots potenciales); marcarlo `@deprecated` en JSDoc. Borrado real en WP5.

4. **i18n:** añadir `map.agentsNearby` y `map.devMapNotice` a `es.json`/`en.json`.

**Criterios de aceptación WP1:**
- `npm run build:testnet` pasa.
- En emulador/dispositivo: el mapa muestra tiles reales, el centro corresponde al GPS real, los pins están en sus coordenadas reales, tap en pin selecciona la oferta (scroll a card, igual que hoy).
- Sin conexión a tiles, el componente no crashea (MapLibre degrada solo; verificar que la pantalla sigue usable).
- `grep -rn "ZONA CENTRO\|Agentes reales" src/` → 0 resultados fuera de `MapSim.tsx` deprecado.

---

## WP2 — Captura de ubicación del comercio (el unlock real)

**Objetivo:** que un comercio real pueda fijar su ubicación desde el APK. Sin esto, ningún comercio real aparece jamás en el mapa (causa raíz §3.3 del audit).

**Archivos:**

1. **`src/services/api.ts`** — añadir (seguir el patrón de `patchMerchantAvailability`, línea 119):
   ```ts
   export interface MerchantLocation {
     latitude: number; longitude: number; address_text: string | null; updated_at: string;
   }
   export async function updateMerchantLocation(
     input: { latitude: number; longitude: number; address_text?: string },
     token: string,
   ): Promise<MerchantLocation>   // PATCH /merchants/me/location
   ```
   Nota: el backend ya valida rangos (schema en `routes/merchants.ts:113-146`); no duplicar validación más allá de lo básico.

2. **`src/services/api.ts`** — extender el tipo `MerchantConfig` (ya existe, lo usa `getMerchantConfig`) con `latitude/longitude/address_text` si aún no los expone — el backend YA los devuelve en `GET /merchants/me/config` (ver `merchant.service.ts:104`), solo falta tiparlos.

3. **`src/pages/MerchantSettings.tsx`** — nueva sección "Mi ubicación" debajo de la sección de configuración existente (patrón visual: misma `<section className="bg-white rounded-[24px] …">` de la línea 115):
   - Estado: sin ubicación → texto "Aún no has fijado tu ubicación. Los clientes no pueden encontrarte en el mapa." + CTA primario **"Usar mi ubicación actual"**.
   - CTA usa `useGeolocation` (hook existente, con su flujo de permisos) → al obtener coords, mostrar `MapReal` en modo picker: un solo marker **arrastrable** (`Marker({ draggable: true })` — añadir prop opcional `pickerMode` a `MapReal` en este WP) centrado en las coords, con texto "arrastra el pin para ajustar".
   - Campo opcional `address_text` (input de texto, `maxLength 200`).
   - Guardar → `updateMerchantLocation(...)` → mensaje de éxito (patrón `message/messageType` ya presente en el archivo).
   - Con ubicación ya fijada → mostrar el mini-mapa con el pin actual + dirección + botón "Cambiar ubicación".
4. **Gate suave en `src/components/MerchantAvailabilityToggle.tsx`:** si el comercio activa disponibilidad y su config no tiene `latitude` (leer del `getMerchantConfig` que ya carga MerchantSettings, o fetch ligero), mostrar aviso no-bloqueante (banner warning): "Sin ubicación fijada no apareces en el mapa" con link a ajustes. **No bloquear** la activación (decisión: fricción mínima).
5. **i18n:** claves nuevas bajo `merchantSettings.location.*`.

**Criterios de aceptación WP2:**
- Flujo completo en dispositivo: registrar usuario → MerchantSettings → fijar ubicación (permiso GPS → pin → ajustar → guardar) → activar disponibilidad → desde OTRO usuario/dispositivo (o web) buscar en `ExploreMap` con un monto dentro del rango → el comercio aparece en el mapa real.
- `PATCH` con token inválido → error manejado con banner, no crash.
- Backend no requiere cambios en este WP (el endpoint ya existe y está validado).

---

## WP3 — Privacidad y abuso del endpoint público (G1)

**Objetivo:** `/merchants/available` es público, sin rate limit, y devuelve lat/lng exactos — permite scrapear el censo de ubicaciones de comercios. Cerrar antes de tener comercios reales.

**Archivos (todos backend):**

1. **`src/routes/merchants.ts`** — rate limit al endpoint público:
   ```ts
   import { createRateLimiter } from '../middleware/rateLimit.middleware.js';
   const discoveryRateLimit = createRateLimiter({ windowMs: 60_000, max: 30 }); // por IP
   app.get('/merchants/available', { preHandler: [discoveryRateLimit], schema: {…} }, …)
   ```
   (30 req/min por IP es holgado para uso legítimo — la app hace 1 request por búsqueda.)

2. **`src/services/merchant.service.ts`** — redondeo de coordenadas públicas en `getAvailableMerchants`: devolver `latitude/longitude` redondeados a **3 decimales** (~110 m) usando `Math.round(x * 1000) / 1000`. La `distance_km` se sigue calculando con las coordenadas exactas (el redondeo es solo de salida). Añadir comentario de una línea explicando el porqué (privacidad).
   - **Decisión consciente:** la ubicación exacta del comercio se revela solo dentro de un trade aceptado (flujo de chat/dirección existente); si algún flujo actual depende del lat/lng exacto de discovery, ajustarlo para usar `address_text` o posponer y documentar.

3. **Tests:** en `src/tests/`, test nuevo `merchant.discovery.test.ts` (patrón de los `test:*` existentes en `package.json`, estilo standalone con `ALLOW_IN_MEMORY_DB=true`): verifica (a) redondeo a 3 decimales en la salida, (b) el rate limiter dispara 429 tras exceder `max`. Añadir script `test:discovery` a `package.json`.

**Criterios de aceptación WP3:** build backend pasa; test nuevo verde; `curl` repetido >30/min devuelve 429 con `Retry-After`.

---

## WP4 — Señales falsas en la UI de ofertas (G2)

**Objetivo:** eliminar el `online: true` hardcodeado.

1. **`src/pages/ExploreMap.tsx:62`** — `merchantToOffer` pone `online: true` fijo. El backend ya filtra por `merchant_available = true` en la query, así que todo merchant devuelto está disponible **por definición**: eliminar el campo `online` del tipo `Offer` y de `OfferConfirmData`, y quitar sus usos (`(offer as any).online ?? true` en las líneas ~307 y ~386 — ese cast ya es un code smell). Si `TradeConfirmation` u otra pantalla consume `online`, quitar el badge correspondiente o derivarlo de `merchant_available` real si el dato viaja.
2. Buscar otros consumidores: `grep -rn "\.online" src/` y limpiar.

**Criterios:** build + `grep -rn "online: true" src/` → 0 resultados; ninguna pantalla muestra "en línea" como dato inventado.

---

## WP5 — Limpieza (G3 remanente, G6)

1. Borrar `src/components/MapSim.tsx` y assets exclusivos (`public/map_bg.png` — verificar que nada más lo referencia con `grep -rn "map_bg" src/ index.html`). Los `mushroom_*.png` se quedan (los usa `MapReal`).
2. Borrar `micopay/backend/src/seed.ts` (seed viejo inconsistente; el real es `seedDemoMerchants()` en `index.ts:290`). Verificar que ningún script de `package.json` lo referencia.
3. Actualizar `docs/AUDIT_APK_MAPA_2026-07.md`: marcar G1–G3, G6 y §3 como resueltos con referencia a los commits.

---

## 6. Orden de ejecución y dependencias

```
WP1 (MapReal) ──> WP2 (ubicación comercio, usa MapReal picker) ──> WP5 (borrar MapSim)
WP3 (privacidad backend)  — independiente, puede ir en paralelo
WP4 (online hardcode)     — independiente, trivial, puede ir primero si se quiere un win rápido
```

No mezclar WPs en una misma rama/PR. WP1+WP2 son el corazón; WP3 es obligatorio **antes** de promover comercios reales en producción.

## 7. Handoffs a humano (no ejecutables por el agente)

| Qué | Quién/cómo |
|---|---|
| Cuenta MapTiler free + key para `VITE_MAP_STYLE_URL` | Eric — cloud.maptiler.com, plan free (100k tiles/mes); pegar el style URL en `.env.testnet`/`.env.mainnet` |
| Seed demo en AWS para demos (`SEED_DEMO_DATA=true` + `SEED_ORIGIN_LAT/LNG` en task def + redeploy) | Sesión con acceso AWS (`--profile micopay-admin`) — opcional, solo para demos; ver G7 del audit |
| Recompilar APK tras WP1/WP2 (`npm run build:testnet && npx cap sync android && gradlew assembleDebug` con `JAVA_HOME` = JBR de Android Studio) | Cualquier sesión en la máquina de Eric — receta verificada 2026-07-25 |
| Decidir política de revelado de ubicación exacta post-trade (WP3, decisión de producto) | Eric/Jose |

## 8. Fuera de alcance (explícito)

- PostGIS/geohash (solo si >10k comercios; hoy no).
- Geocodificación inversa para autollenar dirección (nice-to-have posterior).
- Rutas caminables reales (G8 — el estimado lineal se queda).
- Cualquier cambio de infra AWS, Dockerfile o CI.
- SEC-16 y TEST-01 (memory leaks, tests en CI) — ya tienen issues de GrantFox propios; no duplicar aquí.
