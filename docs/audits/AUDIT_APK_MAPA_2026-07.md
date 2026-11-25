# Auditoría del APK — funciones, flujos, brechas y mapa real

**Fecha:** 2026-07-25 · **Base:** main post-merge #320/#321 + fixes AWS (`1db550a`, `02232b4`)
**Contexto:** backend ya vive en `https://api.micopay.app` (AWS ECS/RDS, BD limpia sin seed).

---

## 1. Inventario de flujos del APK

| Flujo | Pantallas | Estado real |
|---|---|---|
| Onboarding / identidad | `Register`, `Login` | ✅ Real. Genera keypair Stellar en el dispositivo (`keystore.ts`), auth por challenge-firma (estilo SEP-10), sin contraseñas |
| Descubrimiento de agentes (cash-out) | `Explore`, `ExploreMap` | ⚠️ Datos reales, **mapa visual simulado** (ver §3) |
| Depósito | `DepositRequest`, `DepositMap`, `DepositChat`, `DepositQR` | ⚠️ Igual: pipeline real, mapa simulado |
| Trade / escrow HTLC | `TradeDetail`, `TradeConfirmation`, `QRReveal`, `ClaimQR` | ✅ Real. El secreto HTLC se pide al backend con token de seller y el XDR se firma localmente (la llave nunca sale del dispositivo) |
| Pagos directos | `PayHub`, `SendPayment`, `ReceivePayment` | Real (vía backend) |
| Chat por trade | `ChatRoom` | Real (polling) |
| KYC | `KYCScreen` | Integración Didit recién mergeada (#315); gate apagado (`KYC_GATE_ENABLED=false`) |
| DeFi (CETES/Blend) | `CETESScreen`, `BlendScreen` | Gated por `VITE_ENABLE_DEFI_TRADING` (solo builds testnet); no mueve fondos reales (hallazgo B2 del audit móvil) |
| Comercio | `MerchantInbox`, `MerchantSettings`, `MerchantAvailabilityToggle` | ⚠️ Falta captura de ubicación (ver §3.3 — es la brecha estructural del mapa) |
| Offline | `useOfflineQueue`, `offlineQueueManager` | Cola de mutaciones offline presente |

**Seguridad — lo que está bien hecho:**
- Llave privada en `@aparajita/capacitor-secure-storage` (Android Keystore); firma de challenge y de XDR 100% local.
- Auth sin contraseñas: challenge de un solo uso + verificación de firma ed25519 en el backend.
- `trustProxy: 1`, CORS explícito, Helmet/CSP/HSTS, TLS `verify-full` a la BD (todo verificado en el deploy de AWS).
- Modo demo del QR (`DEMO_QR_PAYLOAD`) correctamente gated por `VITE_DEMO_MODE` y lanza si se usa fuera de él.

---

## 2. Brechas encontradas (no-mapa)

| # | Brecha | Severidad | Detalle / fix |
|---|---|---|---|
| G1 | `/merchants/available` es público, sin rate limit | **Alta (privacidad)** | ✅ **Resuelto (WP3, rama `feat/map-real`).** Rate limiter por IP añadido al endpoint + coordenadas devueltas redondeadas a ~3 decimales (≈110 m) |
| G2 | `online: true` hardcodeado en `ExploreMap.merchantToOffer` | Media | ✅ **Resuelto (WP4, rama `feat/map-real`).** El campo `online` fue eliminado por completo del tipo `Offer`/`OfferConfirmData` y de sus usos; la disponibilidad se deriva únicamente de `merchant_available` en el backend |
| G3 | Cartel "Agentes reales cercanos" + "CDMX · ZONA CENTRO" hardcodeados en `MapSim` | Media (confianza) | ✅ **Resuelto (WP1, rama `feat/map-real`).** `MapReal` (MapLibre GL) reemplazó a `MapSim` en `ExploreMap`/`DepositMap`; esos carteles hardcodeados ya no existen en la UI viva. `MapSim.tsx` en sí fue borrado en WP5 |
| G4 | Store de challenges y rate limiter en memoria sin limpieza | Media | Ya documentado como SEC-16 (issues GrantFox). Crecimiento sin límite bajo ataque |
| G5 | Suite `TradeDetail` con 21 tests rojos; tests de backend no corren en CI | Media | Ya documentado como TEST-01. El job de CI los marca `continue-on-error` |
| G6 | `seed.ts` (script viejo) inconsistente con `seedDemoMerchants()` de `index.ts` | Baja | ✅ **Resuelto (WP5, rama `feat/map-real`).** `micopay/backend/src/seed.ts` fue borrado (no lo referenciaba nada); el seed real sigue siendo `seedDemoMerchants()` en `index.ts`, sin tocar |
| G7 | **BD de producción AWS está vacía** → mapa siempre en estado "sin agentes" | **Operativa inmediata** | No se seedeó a propósito. Para demos: `SEED_DEMO_DATA=true` + `SEED_ORIGIN_LAT/LNG` en el task def. Para real: resolver §3.3 |
| G8 | Distancia = Haversine línea recta; `walkMinutes = km/5*60` | Baja | Aceptable para MVP; anotar que no es ruta caminable real |

---

## 3. El mapa: qué es simulado exactamente y qué no

> ✅ **Resuelto (WP1 + WP2, rama `feat/map-real`).** §3.2 (render PNG simulado) quedó resuelto por WP1 (`MapReal.tsx` con MapLibre GL reemplaza a `MapSim`, `map_bg.png` borrado en WP5). §3.3 (falta de pipeline de captura de ubicación de comercios) quedó resuelto por WP2 (picker de ubicación en `MerchantSettings` contra `PATCH /merchants/me/location`). El diagnóstico original abajo se conserva íntegro para contexto histórico.

### 3.1 Lo que YA es real (no rehacer)
- **GPS del usuario:** `useGeolocation` + `useMerchantsAvailable` usan el plugin Capacitor con flujo de permisos correcto (rationale primero, OS dialog después, re-check al volver de Settings).
- **Query geoespacial:** `GET /merchants/available?lat&lng&radius_km&amount_mxn` calcula Haversine **en SQL**, filtra por radio/monto/disponibilidad y ordena por distancia. Devuelve lat/lng reales, distancia, payout, reputación (tier/completion).
- **Reputación:** trades completados/terminales reales de la BD.

### 3.2 Lo que es simulado (el problema visual)
`MapSim.tsx` es un **PNG estático de CDMX** (`/map_bg.png`) con:
- Pins proyectados por *bounding box normalizado* — la posición relativa entre pins es correcta, pero no corresponde a calles reales ni a escala.
- El punto del usuario **siempre al centro**, sin relación con su GPS real.
- Sin pan/zoom/tiles. Etiquetas hardcodeadas (G3).

### 3.3 La brecha estructural (la causa raíz, más importante que el visual)
El backend **ya tiene** `PATCH /merchants/me/location` (lat/lng/address, validado, autenticado)… **pero el frontend nunca lo llama**. No existe ninguna pantalla donde un comercio fije su ubicación. Consecuencia: **los únicos comercios que pueden aparecer en el mapa son los 4 del seed demo** (`farmacia_guadalupe`, etc., posicionados alrededor de `SEED_ORIGIN_LAT/LNG`, default 19.689,-99.179). Un comercio real registrado desde el APK jamás aparecerá en el mapa, con o sin mapa bonito.

> El "mapa simulado" es entonces dos problemas independientes: (a) el render visual fake, y (b) que no hay pipeline de captura de ubicación de comercios reales. Arreglar solo (a) daría un mapa real… lleno de hongos demo.

---

## 4. Plan para mapa real por ubicación

### Fase A — Render real (1–2 días)
Reemplazar `MapSim` por **MapLibre GL JS** (recomendado) o Leaflet:

- **MapLibre GL** (`maplibre-gl`, ~250 KB gz — el bundle actual es 1.7 MB, cabe): open source, vector tiles, WebGL, sin API key propia. Funciona dentro del WebView de Capacitor sin plugin nativo.
- **Tiles:** para MVP, estilo raster/vector de **MapTiler Free** (100k tiles/mes) o **Stadia Maps Free**; los tiles crudos de openstreetmap.org tienen política de uso que prohíbe producción con tráfico real. Cobertura OSM en CDMX es buena.
- **Google Maps SDK**: mejor data en México pero exige API key con billing, restricción por SHA-1 del APK, y la key viaja embebida — descartado para esta etapa.

Cambios concretos:
1. `npm i maplibre-gl` y nuevo componente `MapReal.tsx` con la misma interfaz de props que `MapSim` (`merchants`, `selectedMerchantId`, `onSelectMerchant`) — swap 1:1 en `ExploreMap`/`DepositMap`.
2. Centro inicial = coords reales del usuario (ya disponibles: `useMerchantsAvailable` las obtiene; hoy las descarta tras el fetch — exponerlas en el estado del hook).
3. `map.fitBounds()` sobre usuario + pins. Markers custom conservando los hongos (`mushroom_*.png` como `Marker element`).
4. Eliminar G3 (labels hardcodeadas); "· agentes cerca" derivado de `merchants.length`.

### Fase B — Ubicación de comercios reales (el unlock, 1–2 días)
1. `api.ts`: agregar `updateMerchantLocation(lat, lng, address_text?)` → `PATCH /merchants/me/location`.
2. `MerchantSettings.tsx`: sección "Mi ubicación" con botón **"Usar mi ubicación actual"** (reusa `useGeolocation`) + mapa Fase A en modo picker (arrastrar pin para ajustar) + campo dirección opcional.
3. Gate suave: al activar `MerchantAvailabilityToggle` sin ubicación fijada, prompt "para aparecer en el mapa, fija tu ubicación".
4. Opcional siguiente paso: geocodificación inversa (Nominatim/MapTiler) para autollenar `address_text`.

### Fase C — Endurecimiento (post-lanzamiento)
- G1: rate limit a `/merchants/available` + redondeo de coordenadas públicas (~110 m) — la ubicación exacta solo tras trade aceptado.
- Si el número de comercios crece (>~10k): índice geoespacial (PostGIS `earthdistance` o columna geohash) en lugar de Haversine full-scan.
- Decidir proveedor de tiles definitivo con presupuesto (MapTiler ~$25/mes el primer tier pagado) o self-host de tiles vectoriales de México (OpenMapTiles).

### Para la demo de HOY (0 días)
La BD de AWS está vacía (G7): si quieres ver el mapa funcionando en el APK que instalamos, hay que setear `SEED_DEMO_DATA=true` y `SEED_ORIGIN_LAT`/`SEED_ORIGIN_LNG` con tus coordenadas actuales en el task def y forzar redeploy — los 4 agentes demo aparecerán alrededor de ti.

---

## 5. Priorización sugerida

1. **G7** (seed demo en AWS) — desbloquea probar el APK hoy. 15 min.
2. **Fase A** (MapLibre) — impacto visual/credibilidad inmediato. 1–2 días.
3. **Fase B** (ubicación de comercios) — sin esto el mapa nunca será real con usuarios reales. 1–2 días.
4. **G1** (privacidad de ubicaciones) — antes de tener comercios reales en producción.
5. G2/G3 se resuelven de paso en Fase A; G4/G5 ya están en el backlog de GrantFox (SEC-16, TEST-01).
