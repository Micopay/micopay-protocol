# Plan de Implementación Mobile — Micopay P2P (Android + iOS)

> **Objetivo inmediato:** APK Android instalable y funcional.
> **Objetivo futuro:** Build iOS desde el **mismo codebase** (TestFlight → App Store).
> **Stack elegido:** Capacitor 8 (cross-platform desde día uno; rama estable a mayo 2026, ej. 8.3.4 del 12 mayo 2026).
> **Última actualización:** mayo 2026

> **⚠️ Estado real del repo (verificado con `npm run build`):**
> - `QRReveal.tsx` tiene marcadores de conflicto activos (líneas 4, 6, 8)
> - `CashoutRequest.tsx` JSX roto en línea 53 (sin parent element)
> - `DepositRequest.tsx` JSX roto en línea 24 (sin parent element)
>
> **El mayor riesgo no es Capacitor. Es que la app web todavía no compila.**
> No se puede empaquetar lo que no buildea. La Fase 0 es el bloqueador real.

---

## Estimaciones realistas

| Hito | Tiempo |
|------|--------|
| Build verde + envs + staging definido (Fase 0.A) | **0.5 día** |
| Migración a HashRouter en 22 pantallas + Context para estado compartido (Fase 0.B) | +1-2 días |
| APK debug básico que arranca y navega (Fase 1) | +0.5 día |
| APK MVP usable con QR + GPS + secure storage (Fases 2-4) | +2-3 días |
| UI/UX mobile polish alineado a la visión de producto (Fase 4.5) | +0.5-1 día |
| APK release firmado + QA en device físico (Fase 5) | +0.5-1 día |
| **Total Android MVP usable, no solo "instalable":** | **~6-8 días** |
| iOS desde el mismo codebase (Fase 6, requiere macOS) | +1-2 días |

---

## 1. Auditoría — Estado real del repo

### Bloqueadores activos (build falla)

```
src/pages/CashoutRequest.tsx(53,9): error TS2657: JSX expressions must have one parent element
src/pages/CashoutRequest.tsx(165,9): error TS17002: Expected closing tag for 'div'
src/pages/DepositRequest.tsx(24,9): error TS2657: JSX expressions must have one parent element
src/pages/DepositRequest.tsx(44,14): error TS17008: JSX element 'main' has no closing tag
src/pages/QRReveal.tsx(4,1): error TS1185: Merge conflict marker encountered
src/pages/QRReveal.tsx(6,1): error TS1185: Merge conflict marker encountered
src/pages/QRReveal.tsx(8,1): error TS1185: Merge conflict marker encountered
```

### Stack actual

- React 19.0.0 + TypeScript 5.9.3
- Vite 6.2.0
- Tailwind CSS 4.2.2 + Material Symbols (CDN)
- Axios 1.13.6, qrcode.react 4.2.0
- **`react-router-dom` ya en `package.json`** pero no usado consistentemente
- Vitest 4.1.5 (cobertura ~10%)

### Lo que sí funciona (cuando compila)

- 22 páginas con flujos: cashout, deposit, merchant, history, DeFi, legal, profile
- Integración con backend Fastify (`services/api.ts`, 371 líneas)
- Auth con JWT en `localStorage.micopay_users` (**síncrono** — relevante para Fase 3)

### Gaps cross-platform

| Aspecto | Estado | Comentario |
|---------|--------|------------|
| Setup móvil nativo | Inexistente | Bloqueador |
| Navegación | State-based (`currentPage`) | Decidir antes de Capacitor |
| Token storage | `localStorage` síncrono | Migración a SecureStorage async no es trivial |
| Back button | Sin handler | Depende de historial real |
| Safe areas / notch | Sin padding | Crítico para iOS |
| Permisos plataforma | No declarados | Diferentes entre Android e iOS |
| Backend HTTPS | Solo HTTP local | Bloqueador para iOS (ATS) y prod Android |
| 13 `console.log` + 3 `any` | Pendientes | Limpieza pre-release |

---

## 2. Decisión técnica: Capacitor 8

### Estrategia: un solo codebase → Android + iOS

```bash
npx cap add android   # genera proyecto Android nativo
npx cap add ios       # genera proyecto iOS nativo
```

100% del código React/TS/Tailwind compartido. Cambian solo:
- Permisos (AndroidManifest.xml ↔ Info.plist)
- Iconos y splash (formatos distintos)
- Algunos plugins requieren config extra por plataforma
- iOS requiere obligatoriamente macOS + Xcode

### Capacitor vs Flutter vs React Native

| Criterio | **Capacitor** ✓ | Flutter | React Native |
|----------|-----------------|---------|--------------|
| Aprovecha código actual | 100% | 0% (rewrite en Dart) | ~30% (lógica sí, UI no) |
| Curva aprendizaje equipo | Mínima | Alta | Media |
| Tiempo a primer APK | Horas | Semanas | Días/semanas |
| Performance UI | Buena (WebView) | Excelente (nativo) | Excelente (nativo) |
| Bundle size | ~10-15 MB | ~25-40 MB | ~20-30 MB |
| Ideal para | CRUD + flows + formularios | Animaciones complejas | UI muy nativa |

**Por qué NO Flutter:** Reescribir 22 páginas en Dart = 4-6 semanas vs ~1 semana con Capacitor. Sin beneficio claro para una app de pagos P2P.

**Cuándo reconsiderar:** Si la app crece a >100 pantallas con animaciones complejas o necesidades 60fps+.

---

## 3. Configuración por ambiente (crítico, decidir antes)

| Ambiente | Frontend serve | Backend URL | Cleartext OK | Notas |
|----------|---------------|-------------|--------------|-------|
| **Dev local web** | `vite dev` (localhost:5181) | `http://localhost:3000` | Sí | Estado actual |
| **Dev local device Android** | APK debug | `http://<lan-ip>:3000` | Sí (con flag) | Requiere `usesCleartextTraffic` + IP de LAN, no localhost |
| **Dev local device iOS** | iOS debug build | `https://<staging>` | No | ATS bloquea HTTP, requiere staging HTTPS |
| **Staging** | APK/iOS debug | `https://staging.micopay.app` | No | HTTPS obligatorio |
| **Producción** | APK/iOS release | `https://api.micopay.app` | No | HTTPS obligatorio |

**Implicaciones:**
- El `services/api.ts` necesita leer `VITE_API_URL` con un default que **no sea localhost** para builds de device
- Sin endpoint HTTPS staging no se puede testear iOS contra backend real
- **Decidir hosting de staging es pre-requisito de Fase 6 (iOS)**

---

## 4. Alineación UX/UI mobile

La meta mobile **no es solo generar un APK**. La app debe sentirse como una experiencia fintech confiable, calmada y humana. Cada pantalla debe reducir incertidumbre sobre dinero, estado del trade, merchant, recuperación y siguiente acción.

### Documentos fuente

Este plan mobile debe ejecutarse junto con:

- `docs/UX_MANIFESTO.md` — principios de confianza, claridad, recuperación y manejo de ansiedad financiera
- `docs/PRODUCT_SCOPE.md` — foco en cash-in / cash-out confiable, no super-app financiera
- `docs/RETAIL_ROADMAP.md` — secuencia: trust foundation → core retail flow → merchant operations → store readiness
- `docs/archive/stitch/emerald_horizon/DESIGN.md` — referencia visual "Editorial Fintech / The Human Ledger"

### Principios UX que aplican al APK

- **Trust before speed:** no optimizar clicks si eso reduce confianza.
- **El usuario siempre sabe dónde está su dinero:** cada trade muestra estado, monto, merchant, timeout y próximo paso.
- **Complejidad fuera de la cabeza del usuario:** HTLC, Soroban, anchors y path payments no deben dominar el journey principal.
- **Fricción significativa en acciones importantes:** confirmar compromisos financieros, no bloquear exploración segura.
- **Recuperación visible:** cancelación, timeout, ayuda, fallback manual y estado de fondos siempre disponibles.
- **Moderno = claro, calmado y creíble:** evitar visuales de demo, hype cripto o UI genérica de fintech.

### Criterio de aceptación UX

Ninguna fase mobile se considera lista si la app funciona técnicamente pero aumenta ansiedad, ambigüedad o sensación de demo en momentos financieros críticos.

---

## 5. Plan operativo — Checklist por fase

> Cada fase se considera **completa** solo si todos sus items pasan. No avanzar a la siguiente con items abiertos.

---

### Fase 0.A — Build verde + decisiones (0.5 día) — **BLOQUEADOR**

**Salida esperada:** `npm run build` exitoso, decisiones de navegación y endpoints documentadas.

#### Bloqueadores de build (orden de resolución)

- [ ] Resolver conflicto en `src/pages/QRReveal.tsx` (líneas 4, 6, 8 tienen markers `<<<<<<<`, `=======`, `>>>>>>>`)
- [ ] Arreglar JSX roto en `src/pages/CashoutRequest.tsx` línea 53 (envolver en fragment o div)
- [ ] Arreglar JSX roto en `src/pages/DepositRequest.tsx` línea 24 (envolver en fragment o div)
- [ ] Verificar: `cd micopay/frontend && npm run build` sale con código 0

#### Decisiones de arquitectura (no implementar todavía, solo decidir)

- [ ] **Navegación:** confirmar migración a `HashRouter`. `react-router-dom` ya está en `package.json`. Sin historial real, el back button hardware no funciona bien.
- [ ] **Endpoint API:** definir variables de entorno
  - `VITE_API_URL` para dev local
  - `VITE_API_URL_LAN` para device dev (con IP)
  - `VITE_API_URL_STAGING`, `VITE_API_URL_PROD`
  - Documentar en `.env.example`
- [ ] **Endpoint HTTPS staging:** decidir hosting (Render, Railway, Vercel, Fly.io). Bloqueador para iOS y prod Android.
- [ ] **QR scan pantalla owner:** decidir qué pantalla escanea QR (NO es `QRReveal.tsx`, que solo *genera*).
  - Candidatos: `MerchantInbox` (merchant escanea QR del cliente al cobrar), nueva `ClaimRedeem` o `ScanToPay`
  - Mantener `QRReveal.tsx` solo para generar/mostrar QR

#### Limpieza mínima

- [ ] Remover 13 `console.log` de `App.tsx`, `MerchantInbox`, `QRReveal`, `Profile`
- [ ] Tipar los 3 `any` en `BlendScreen`, `CETESScreen`, `useTradePolling`
- [ ] Confirmar no hay warnings críticos de TypeScript

> **iOS impact:** Sin acción específica. Mismo build limpio sirve para ambas plataformas.

---

### Fase 0.B — Migración a HashRouter (1-2 días)

**Salida esperada:** App navega con `react-router-dom`, URL refleja la pantalla actual, base lista para back button real.

> **Nota:** Esta migración toca las 22 pantallas y el `App.tsx`. Es trabajo concreto, no solo configuración. Subestimarlo es lo que originalmente puso 0.5 día como total.

#### Pasos

- [ ] Crear `src/routes.tsx` con `createHashRouter` y las 22 rutas mapeadas (`/`, `/cashout`, `/deposit`, `/map`, `/chat`, `/qr-reveal`, `/success`, `/history`, `/inbox`, `/explore`, `/cetes`, `/blend`, `/profile`, `/privacy`, `/terms`, etc.)
- [ ] En `main.tsx`: reemplazar `<App />` con `<RouterProvider router={router} />`
- [ ] `App.tsx`: convertir las 22 ramas de `currentPage === "..."` en componentes `<Route>` o layout con `<Outlet />`
- [ ] Reemplazar todos los `setCurrentPage("...")` por `navigate("/...")` en cada página
- [ ] Manejar props que se pasaban entre páginas (ej. `activeTrade`, `lockTxHash`) vía Context o estado en localStorage temporal
- [ ] Probar manualmente cada flujo completo: cashout end-to-end, deposit end-to-end, merchant inbox, profile, history
- [ ] Verificar URL cambia correctamente y refresh mantiene la pantalla (esto es el beneficio principal de Hash)

---

### Fase 1 — Capacitor base + primer APK (0.5 día)

**Salida esperada:** APK debug instalable que arranca, muestra Home, navega entre páginas.

#### Setup Capacitor

- [ ] `npm i @capacitor/core @capacitor/cli @capacitor/android`
- [ ] `npx cap init "Micopay" "com.micopay.app" --web-dir=dist`
- [ ] Crear `capacitor.config.ts`:
  ```ts
  import type { CapacitorConfig } from '@capacitor/cli';
  const config: CapacitorConfig = {
    appId: 'com.micopay.app',
    appName: 'Micopay',
    webDir: 'dist',
    server: { androidScheme: 'https' }
  };
  export default config;
  ```
- [ ] Ajustar `vite.config.ts`: `base: './'`
- [ ] Verificar `viewport-fit=cover` en `index.html`

#### Generación del proyecto Android

- [ ] `npm run build`
- [ ] `npx cap add android`
- [ ] `npx cap sync android`
- [ ] `npx cap open android` (abre Android Studio)
- [ ] Run en device físico o emulador (USB debugging habilitado)
- [ ] **Verificación:** APK arranca, muestra Home, se puede navegar a otras pantallas con los botones (back hardware no testeado todavía)

> **iOS:** Cuando se tenga macOS, ejecutar:
> ```bash
> npm i @capacitor/ios && npx cap add ios && npx cap sync ios && npx cap open ios
> ```
> El `capacitor.config.ts` ya está configurado. No requiere código adicional aquí.
> En Capacitor 8 el proyecto iOS se genera usando **Swift Package Manager** por default (no CocoaPods).

---

### Fase 2 — Navegación + features nativas (1-1.5 días)

**Salida esperada:** APK con back button funcionando, QR scanner real, GPS real, safe areas correctas.

#### Plugins

- [ ] `npm i @capacitor/app @capacitor/geolocation @capacitor-mlkit/barcode-scanning`
- [ ] `npx cap sync`

#### Back button (depende de historial real)

- [ ] Registrar listener en `src/main.tsx`:
  ```ts
  import { App } from '@capacitor/app';
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
  ```
- [ ] **Verificación crítica:** que `window.history.back()` represente correctamente las pantallas internas. Si la navegación es `HashRouter` (de Fase 0), funciona. Si quedó como `currentPage` state, NO funciona — habría que mantener manualmente un stack de páginas.
- [ ] Probar en device: back desde cada pantalla principal regresa a la anterior, desde Home cierra la app

#### QR Scanner real

> **Atención al elegir plugin** — hay varias familias con APIs distintas:
> - `@capacitor-mlkit/barcode-scanning` ← **elegido** (ML Kit, mantenido por Robin Genz)
> - `@capacitor/barcode-scanner` (oficial Ionic, más reciente)
> - `@capacitor-community/barcode-scanner` (legacy, deprecado)
>
> Antes de codificar, **verificar versión actual del plugin contra Capacitor 8** en su README (las APIs cambiaron entre majors).

Snippet de referencia con `@capacitor-mlkit/barcode-scanning` (verificar contra la doc actual al implementar):

```ts
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

async function scanQR() {
  // Verificar/solicitar permiso
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted') {
    throw new Error('Permiso de cámara denegado');
  }

  // Verificar disponibilidad ML Kit (Android puede requerir descarga inicial)
  const { available } = await BarcodeScanner.isSupported();
  if (!available) {
    throw new Error('Scanner no disponible en este device');
  }

  // Escanear
  const { barcodes } = await BarcodeScanner.scan({
    formats: [BarcodeFormat.QrCode],
  });
  return barcodes[0]?.rawValue ?? null;
}
```

- [ ] Implementar scan en la pantalla owner decidida en Fase 0.A (probablemente `MerchantInbox` o nueva `ScanToPay`/`ClaimRedeem`)
- [ ] **NO** en `QRReveal.tsx` — esa pantalla genera/muestra QR, no escanea
- [ ] Mantener `qrcode.react` en `QRReveal.tsx` para generar
- [ ] Manejar permiso CAMERA en runtime con `requestPermissions()`
- [ ] Fallback si usuario rechaza permiso (mensaje claro + opción de entrada manual)
- [ ] Probar flujo completo: scan QR → trade flow → success

#### Geolocalización real

- [ ] Reemplazar offers hardcoded en `ExploreMap.tsx` y `DepositMap.tsx` con `Geolocation.getCurrentPosition()`
- [ ] Manejar permiso location en runtime
- [ ] Fallback si usuario rechaza permiso (mostrar mensaje claro, no crash)

#### Safe areas (notch, status bar)

- [ ] Agregar utilities Tailwind: `pt-[env(safe-area-inset-top)]` en headers fijos
- [ ] Aplicar a: `Home`, `Profile`, `Privacy`, `Terms`, `MerchantInbox`, todos los headers fijos
- [ ] Probar en device con notch (Pixel 6+, cualquier flagship reciente)

> **iOS diferencias:**
> - Back button hardware no existe en iOS — el listener simplemente no se dispara, no falla
> - Permisos en `ios/App/App/Info.plist`:
>   ```xml
>   <key>NSCameraUsageDescription</key>
>   <string>Para escanear códigos QR de comercios y trades</string>
>   <key>NSLocationWhenInUseUsageDescription</key>
>   <string>Para mostrar comercios cercanos en el mapa</string>
>   ```
> - Safe areas más críticas (Dynamic Island, notch) — el `env(safe-area-inset-*)` funciona automático

---

### Fase 3 — Secure storage + ambiente (1 día)

**Salida esperada:** Tokens en SecureStorage (no en localStorage), API apunta a endpoint correcto por ambiente.

#### Migración localStorage → SecureStorage (no es solo "API igual")

**El problema:** `localStorage` es síncrono, `SecureStorage` es async. Esto fuerza reestructurar:

- Hidratación de auth en `App.tsx`: el `useEffect` con `localStorage.getItem` síncrono se convierte en async, lo cual significa que la primera renderización **no tiene tokens disponibles**
- Hay que introducir un estado `authReady: boolean` que evita renderizar páginas protegidas hasta que la hidratación termine
- Todos los `localStorage.setItem/getItem` que estaban inline en handlers deben ser `await`ed

#### Pasos

- [ ] `npm i @aparajita/capacitor-secure-storage` — **pinear versión compatible con Capacitor 8** (revisar `peerDependencies` del paquete antes de instalar; las majors recientes cambiaron API). En `package.json` usar versión exacta, no `^`, para evitar drift.
- [ ] `npx cap sync`
- [ ] Crear `src/services/secureStorage.ts` con wrapper async:
  ```ts
  import { SecureStorage } from '@aparajita/capacitor-secure-storage';
  export const storage = {
    async get(key: string): Promise<string | null> { return await SecureStorage.get(key); },
    async set(key: string, value: string): Promise<void> { await SecureStorage.set(key, value); },
    async remove(key: string): Promise<void> { await SecureStorage.remove(key); }
  };
  ```
- [ ] **Reestructurar `App.tsx`:**
  - [ ] Agregar `const [authReady, setAuthReady] = useState(false)`
  - [ ] Convertir el `initUsers` para usar `await storage.get('micopay_users')`
  - [ ] Setear `setAuthReady(true)` al final
  - [ ] Render condicional: si `!authReady`, mostrar splash/loader
- [ ] Reemplazar todos los `localStorage.*` en:
  - [ ] `App.tsx` (handleAccountDeleted, initUsers)
  - [ ] `services/api.ts` (si usa localStorage para tokens)
  - [ ] Cualquier otro lugar — `grep -rn "localStorage" micopay/frontend/src/`
- [ ] Verificar: cerrar y abrir app, los tokens persisten cifrados

#### Configuración API por ambiente

- [ ] Modificar `services/api.ts` para leer `import.meta.env.VITE_API_URL`
- [ ] Crear archivos:
  - [ ] `.env.development` (localhost)
  - [ ] `.env.staging` (HTTPS staging)
  - [ ] `.env.production` (HTTPS prod)
- [ ] Scripts npm: `build:staging`, `build:production`
- [ ] **Para device en LAN dev:** explicar en README cómo obtener IP local y armar `.env.local` con `VITE_API_URL=http://192.168.x.x:3000`

#### CORS y cleartext

- [ ] Backend `micopay/backend/src/index.ts`: CORS acepta `capacitor://localhost`, `https://localhost` (Android), `ionic://localhost` (iOS)
- [ ] `android/app/src/main/AndroidManifest.xml`: `android:usesCleartextTraffic="true"` (solo dev, retirar para release)
- [ ] **iOS:** Sin equivalente. Backend debe ser HTTPS para iOS, sin excepción.

> **iOS diferencias:**
> - `@aparajita/capacitor-secure-storage` usa **Keychain** automáticamente en iOS
> - ATS bloquea HTTP en producción sin escape razonable
> - Dev local iOS con HTTP requiere excepción explícita en `Info.plist`:
>   ```xml
>   <key>NSAppTransportSecurity</key>
>   <dict>
>     <key>NSAllowsLocalNetworking</key>
>     <true/>
>   </dict>
>   ```

---

### Fase 4 — Branding + permisos finales (0.5 día)

**Salida esperada:** APK con identidad visual completa, permisos solicitados solo cuando se usan.

#### Permisos Android (solo los que se usan)

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-feature android:name="android.hardware.camera" android:required="false"/>
```

**Sacado del MVP:** `POST_NOTIFICATIONS` — no hay push notifications todavía. No pedir permisos que la app no usa (Play Store flag, mala UX).

#### Iconos y splash

- [ ] `npm i -D @capacitor/assets`
- [ ] Colocar `logo.png` (1024x1024) en `frontend/assets/`
- [ ] `npx capacitor-assets generate --android`
- [ ] Verificar icon adaptativo y splash en device

#### Metadata

- [ ] `android/app/build.gradle`:
  ```gradle
  versionCode 1
  versionName "0.1.0"
  ```
- [ ] SDK versions en `android/variables.gradle`:
  - `compileSdkVersion = 35` (Android 15)
  - `targetSdkVersion = 35` (mínimo Play Store 2026)
  - `minSdkVersion = 23` (Android 6.0+, ~99% devices)

> **iOS branding:**
> - `@capacitor/assets` genera iOS + Android desde el mismo logo source
> - Bundle ID `com.micopay.app` igual en ambos
> - Permisos iOS en `Info.plist` con strings descriptivos

---

### Fase 4.5 — UI/UX Mobile Polish (0.5-1 día)

**Salida esperada:** La app no solo funciona en mobile: se siente confiable, clara y lista para beta privada.

Esta fase aplica `docs/UX_MANIFESTO.md` y la dirección visual "Editorial Fintech" antes de firmar builds. Es un gate de calidad: si una pantalla crítica aumenta ansiedad o parece demo, no pasa.

#### Pantallas críticas

- [ ] **Home:** responde en segundos qué saldo/valor tiene el usuario, qué puede hacer ahora y cuál es su actividad reciente.
- [ ] **Cashout / Deposit request:** monto, límites, fees/spread y acción principal son claros antes de comprometer.
- [ ] **Merchant selection / map:** cada merchant muestra identidad, distancia, límites, horario y señales de confianza; evitar cards indistinguibles.
- [ ] **Trade detail:** siempre visible estado actual, monto, merchant, timeout, siguiente acción y ayuda.
- [ ] **QR / claim:** una instrucción a la vez, sin distracciones, con expiración y qué hacer después del intercambio.
- [ ] **History / receipts:** estados legibles y comprobantes que cierran el ciclo mental del usuario.
- [ ] **Errors / support:** cada error dice qué pasó, si los fondos están seguros y qué acción sigue.

#### Mobile interaction polish

- [ ] Safe areas reales en headers, footers, bottom nav, modales y pantallas full-screen.
- [ ] Targets táctiles mínimo 44px, sin botones demasiado juntos en acciones financieras.
- [ ] Inputs con `inputMode`, `type`, autocomplete y validación adecuados para teclado móvil.
- [ ] Loading, skeleton, empty, pending, success, cancelled, timeout y refund states revisados en device.
- [ ] Permisos de cámara/GPS tienen copy humano antes del prompt nativo y fallback manual si se rechazan.
- [ ] Back hardware Android, gestos iOS y botones UI no dejan al usuario atrapado en modales o estados críticos.
- [ ] Animaciones sutiles: feedback táctil, transición de pantalla, confirmaciones; nada que oculte estado financiero.

#### Visual system

- [ ] Aplicar estética premium pero confiable: jerarquía clara, tipografía fuerte, color con significado, motion controlado.
- [ ] No usar badges decorativos que parezcan señales de confianza sin soporte real.
- [ ] Evitar hype cripto, copy técnico o lenguaje ambiguo en pantallas principales.
- [ ] Material Symbols vía CDN evaluado: si el APK debe sentirse offline/premium, bundle local o alternativa instalada.
- [ ] Screenshots de QA en Android para Home, trade detail, QR/claim, error/support y success.

#### Criterio de salida

- [ ] Checklist de `docs/UX_MANIFESTO.md` respondido para pantallas críticas.
- [ ] Revisión manual en device físico: ninguna pantalla crítica se ve cortada, saturada, superpuesta o como demo web.
- [ ] Un usuario nuevo puede describir: dónde está su dinero, quién es el merchant, qué pasa si algo falla y cuál es el siguiente paso.

---

### Fase 5 — Release firmado + QA en device (0.5-1 día)

**Salida esperada:** APK firmado distribuible, validado en al menos 2 devices físicos.

#### Generar keystore

- [ ] `keytool -genkey -v -keystore micopay-release.keystore -alias micopay -keyalg RSA -keysize 2048 -validity 10000`
- [ ] **Backup keystore en 2 lugares seguros** (perderlo = no poder actualizar la app)
- [ ] Agregar `*.keystore` a `.gitignore`

#### Configurar signing

`android/app/build.gradle`:
```gradle
signingConfigs {
  release {
    storeFile file("../../micopay-release.keystore")
    storePassword System.getenv("MICOPAY_KEYSTORE_PASSWORD")
    keyAlias "micopay"
    keyPassword System.getenv("MICOPAY_KEY_PASSWORD")
  }
}
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
  }
}
```

- [ ] `./gradlew assembleRelease`
- [ ] APK firmado en `android/app/build/outputs/apk/release/app-release.apk` (uso: sideload, internal testing, distribución directa)

#### Para Play Store: AAB (Android App Bundle)

Play Store **requiere AAB**, no APK, para nuevas publicaciones desde 2021. El APK arriba sirve para sideload/testing; para subir a Play Store generar adicionalmente:

- [ ] `./gradlew bundleRelease`
- [ ] AAB firmado en `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Probar con `bundletool` localmente antes de subir: genera APKs específicos por device desde el AAB
- [ ] Subir AAB en Play Console

#### QA en device físico (no negociable)

Probar en mínimo **2 devices diferentes** (Android 8+ y Android 13+ recomendado):

- [ ] Instalar APK debug, navegar todos los flujos principales (cashout, deposit, history, profile)
- [ ] Scan QR real (no mock)
- [ ] Geolocalización pide permiso y funciona
- [ ] Back hardware funciona en todas las pantallas
- [ ] Cerrar app, reabrir → sesión persiste (SecureStorage funciona)
- [ ] Trade completo end-to-end contra backend staging HTTPS
- [ ] Sin crashes en 10 minutos de uso continuo

---

### Fase 6 — Adaptación iOS (1-2 días, requiere macOS)

**Salida esperada:** Build iOS funcional en device físico, listo para TestFlight.

#### Pre-requisitos no-negociables

- [ ] macOS físico o cloud (MacInCloud ~$30 USD/mes si no hay Mac)
- [ ] Xcode 15+ (16 recomendado en 2026)
- [ ] Cuenta Apple Developer ($99 USD/año)
- [ ] **Backend HTTPS staging funcional** (requerido por ATS)

#### Pre-requisitos opcionales

- [ ] **CocoaPods** (`sudo gem install cocoapods`) — **NO obligatorio en Capacitor 8**.
  - Capacitor 8 usa **Swift Package Manager (SPM)** por default en proyectos iOS nuevos.
  - Solo se necesita CocoaPods si algún plugin específico de terceros aún lo requiere (cada vez menos comunes). Si se usa solo plugins oficiales `@capacitor/*`, SPM es suficiente.

#### Setup

- [ ] `npm i @capacitor/ios`
- [ ] `npx cap add ios && npx cap sync ios && npx cap open ios`
- [ ] Abrir `ios/App/App.xcworkspace` (NO `.xcodeproj`), o el archivo generado por Capacitor 8/SPM — con Swift Package Manager conviene verificar exactamente qué genera el setup
- [ ] Signing & Capabilities: seleccionar Team, Bundle ID `com.micopay.app`

#### Info.plist

```xml
<key>NSCameraUsageDescription</key>
<string>Para escanear códigos QR de comercios y trades</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Para mostrar comercios cercanos en el mapa</string>
<key>NSFaceIDUsageDescription</key>
<string>Para autorizar transacciones de forma segura</string>
```

#### Validación

- [ ] Build corre en device iOS físico
- [ ] Mismos flujos QA que Fase 5 pero en iOS
- [ ] Plugins (QR, geo, secure storage) funcionan en iOS
- [ ] Safe areas correctas en notch + Dynamic Island

#### Distribución TestFlight

- [ ] Product > Archive en Xcode
- [ ] Distribute App → App Store Connect → Upload
- [ ] Build aparece en App Store Connect en ~10-30 min
- [ ] Agregar testers internos (hasta 100, sin review)
- [ ] Testers externos (hasta 10k) requieren review breve de Apple

---

## 6. Pitfalls conocidos

### Cross-platform

- **`BrowserRouter` rompe en WebView** — usar `HashRouter` (decidido en Fase 0)
- **`localStorage` síncrono vs SecureStorage async** — requiere reestructurar hidratación de auth (Fase 3)
- **Material Symbols vía CDN** — depende de internet en runtime; considerar bundle local para offline
- **`window.location` con paths absolutos** — usar paths relativos siempre

### Solo Android

- **`usesCleartextTraffic`** — solo para dev local con backend HTTP; **retirar para release**
- **Keystore perdido = catástrofe** — backup en 2 lugares mínimo, NUNCA al repo
- **Back button en modales** — agregar handler explícito por modal, no asumir que el global lo maneja

### Solo iOS

- **ATS bloquea HTTP** — backend producción debe ser HTTPS obligatoriamente
- **Build solo desde macOS** — no hay manera oficial desde Windows/Linux
- **Bundle ID inmutable después de publicar** sin migrar la app entera
- **App Store review es subjetivo** — Apple puede rechazar por design/copy/permisos no justificados
- **CocoaPods desactualizado rompe build** — `pod repo update` antes de `npx cap sync ios` (solo aplica si el proyecto usa CocoaPods en vez de SPM; Capacitor 8 default es SPM)
- **TestFlight expira a 90 días** — re-subir builds para mantener testing activo

### Plugin gotchas

- **`@capacitor-mlkit/barcode-scanning`** requiere Google Play Services en Android; standalone en iOS
- **Push notifications** — FCM (Android) vs APNs (iOS), son setups distintos
- **Biometría** — FaceID/TouchID (iOS) vs fingerprint/face (Android), testear ambos

---

## 7. Checklist final pre-distribución

### Android (APK/AAB)

- [ ] `npm run build` exitoso, cero errores TS
- [ ] APK debug instala y arranca en Android 8+
- [ ] Cámara escanea QR real
- [ ] GPS obtiene ubicación y mapa la usa
- [ ] Back button hardware funciona en todas las pantallas
- [ ] Tokens JWT en SecureStorage (no localStorage)
- [ ] CORS backend acepta `capacitor://localhost`
- [ ] Safe areas respetadas en notch
- [ ] Home, trade detail, QR/claim, errors/support y success pasan checklist UX mobile
- [ ] Permisos de cámara/GPS tienen explicación humana y fallback manual
- [ ] Targets táctiles, teclado móvil, loading/success/error states revisados en device
- [ ] La UI no parece demo web: jerarquía, spacing, estados y copy son consistentes con `UX_MANIFESTO.md`
- [ ] App icon + splash visibles
- [ ] APK release firmado con keystore propio (backup en 2 lugares)
- [ ] Privacy + Terms accesibles desde la app
- [ ] Permisos en AndroidManifest declarados y solicitados en runtime
- [ ] Sin `POST_NOTIFICATIONS` ni otros permisos no usados
- [ ] QA en mínimo 2 devices físicos diferentes

### iOS (TestFlight + App Store)

- [ ] Build corre en device físico desde Xcode sin warnings críticos
- [ ] Permisos `Info.plist` con descripciones claras en español
- [ ] Tokens en Keychain (vía `@aparajita/capacitor-secure-storage`)
- [ ] Backend en HTTPS (ATS no permite HTTP en producción)
- [ ] CORS backend acepta `capacitor://localhost` y `ionic://localhost`
- [ ] Safe areas respetadas en notch + Dynamic Island
- [ ] Pantallas críticas pasan el mismo checklist UX mobile que Android
- [ ] Gestos/botones de navegación iOS no dejan al usuario atrapado en estados críticos
- [ ] App icon 1024x1024 sin transparencia + Launch Storyboard
- [ ] Build subido a App Store Connect → TestFlight
- [ ] Demo account preparada para review
- [ ] Privacy + Terms con URL pública (no solo dentro del app)
- [ ] Screenshots 6.7" y 5.5" listos para Store

---

## 8. Próximos pasos post-MVP

Fuera de alcance del MVP inicial:

- **Push notifications** — FCM (Android) + APNs (iOS) vía `@capacitor/push-notifications`. Recién aquí agregar `POST_NOTIFICATIONS`.
- **Deep links** — Android App Links (Digital Asset Links) + iOS Universal Links
- **Biometría** — `@capacitor-community/biometric-auth`
- **Telemetría / crash reporting** — Sentry o Firebase Crashlytics
- **Tests E2E en device real** — Maestro o Appium
- **Localización** — i18next para multi-idioma
- **Dark mode** — Tailwind ya tiene clases `dark:`, falta detección de modo del sistema

---

## Apéndice — Archivos clave a modificar

### Compartidos (Android + iOS)

| Archivo | Cambio | Fase |
|---------|--------|------|
| `micopay/frontend/src/pages/QRReveal.tsx` | Resolver conflicto + mantener generación QR (NO integrar scanner aquí) | 0.A |
| `micopay/frontend/src/pages/<scan-owner>.tsx` | Integrar BarcodeScanner en pantalla owner (MerchantInbox o nueva ScanToPay/ClaimRedeem) | 2 |
| `micopay/frontend/src/pages/CashoutRequest.tsx` | Arreglar JSX roto línea 53 | 0 |
| `micopay/frontend/src/pages/DepositRequest.tsx` | Arreglar JSX roto línea 24 | 0 |
| `micopay/frontend/src/App.tsx` | Migrar a HashRouter, authReady async hydration | 0, 3 |
| `micopay/frontend/src/routes.tsx` | Nuevo, mapping de rutas | 0 |
| `micopay/frontend/src/services/secureStorage.ts` | Nuevo, wrapper async | 3 |
| `micopay/frontend/src/services/api.ts` | Tokens vía SecureStorage, VITE_API_URL por env | 3 |
| `micopay/frontend/package.json` | Deps Capacitor + plugins | 1, 2, 3 |
| `micopay/frontend/capacitor.config.ts` | Nuevo, config Capacitor | 1 |
| `micopay/frontend/vite.config.ts` | `base: './'` | 1 |
| `micopay/frontend/index.html` | `viewport-fit=cover` | 1 |
| `micopay/frontend/.env.development` | Nuevo | 3 |
| `micopay/frontend/.env.staging` | Nuevo | 3 |
| `micopay/frontend/.env.production` | Nuevo | 3 |
| `micopay/backend/src/index.ts` | CORS Capacitor + iOS | 3 |

### Solo Android

| Archivo | Cambio | Fase |
|---------|--------|------|
| `android/app/src/main/AndroidManifest.xml` | Permisos (CAMERA, FINE_LOCATION, INTERNET) | 4 |
| `android/app/build.gradle` | signingConfigs.release, versionCode/Name | 5 |
| `android/variables.gradle` | compileSdk 35, targetSdk 35, minSdk 23 | 4 |

### Solo iOS (Fase 6)

| Archivo | Cambio |
|---------|--------|
| `ios/App/App/Info.plist` | NSCameraUsageDescription, NSLocationWhenInUseUsageDescription, NSAppTransportSecurity |
| `ios/App/App.xcworkspace` | Signing & Capabilities en Xcode (Team, Bundle ID) |
| `ios/App/Podfile` (opcional) | Solo si algún plugin requiere CocoaPods; Capacitor 8 default usa SPM. Si aplica: `platform :ios, '14.0'` |
| Apple Developer Console | App ID, Provisioning Profile, Push certificates si aplica |
