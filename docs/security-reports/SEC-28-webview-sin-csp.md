# SEC-28: WebView de Capacitor sin Content-Security-Policy + carga de recursos remotos

## Resultado
**CONFIRMADO** - El WebView de Capacitor no tiene Content-Security-Policy configurada (ni meta tag ni cabecera HTTP) y carga recursos remotos de Google Fonts. Aunque el renderizado de contenido de usuario es seguro por defecto (React escapa automáticamente), falta defensa en profundidad frente a inyección de scripts en el WebView.

## Evidencia

### 1. Ausencia de CSP en index.html
**Archivo:** `micopay/frontend/index.html:1-19`
```html
<!DOCTYPE html>
<html lang="es" class="light">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#00694C" />
    <title>MicoPay</title>
    <!-- NO meta http-equiv="Content-Security-Policy" -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
  </head>
  <body class="bg-background text-on-surface font-body min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 2. Carga de recursos remotos (Google Fonts)
**Archivo:** `micopay/frontend/index.html:9-12`
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
```

### 3. Sin configuración CSP en Capacitor
**Archivo:** `micopay/frontend/capacitor.config.ts:1-14`
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.micopay.app',
  appName: 'Micopay',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  // NO configuración de CSP
};

export default config;
```

### 4. Sin CSP en Vite config
**Archivo:** `micopay/frontend/vite.config.ts:1-13`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
  },
  // NO headers CSP configurados
})
```

### 5. MainActivity sin configuración WebView personalizada
**Archivo:** `micopay/frontend/android/app/src/main/java/com/micopay/app/MainActivity.java:1-6`
```java
package com.micopay.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
// SIN configuración personalizada de WebView o CSP
```

### 6. Renderizado seguro de contenido de usuario (ChatRoom)
**Archivo:** `micopay/frontend/src/pages/ChatRoom.tsx:227`
```typescript
<p className="text-sm leading-relaxed">{msg.body}</p>
// React escapa automáticamente, no hay dangerouslySetInnerHTML
```

### 7. Verificación: No dangerouslySetInnerHTML en codebase
**Resultado:** Búsqueda de `dangerouslySetInnerHTML` en `micopay/frontend/src` retornó 0 resultados.

## Análisis de Riesgos

### Riesgo 1: Falta de defensa en profundidad
- **Estado actual:** React escapa contenido de usuario por defecto (bueno)
- **Problema:** Si en el futuro se introduce:
  - Un sink HTML (dangerouslySetInnerHTML)
  - Una dependencia comprometida
  - Un recurso remoto manipulado (MITM en fonts)
- **Impacto:** Cualquier script inyectado correría con acceso al bridge nativo

### Riesgo 2: Acceso al bridge nativo desde scripts inyectados
**Plugins Capacitor instalados (package.json):**
- `@capacitor-mlkit/barcode-scanning` - acceso a cámara
- `@capacitor/geolocation` - acceso a ubicación GPS
- `@capacitor/push-notifications` - notificaciones
- `@aparajita/capacitor-secure-storage` - almacenamiento seguro
- `@capacitor/app` - control de app

**Si un script malicioso se inyecta:**
- Podría acceder a la cámara sin permiso explícito del usuario
- Podría leer ubicación GPS
- Podría acceder a tokens almacenados en SecureStorage
- Podría enviar notificaciones falsas
- Podría controlar el ciclo de vida de la app

### Riesgo 3: Recursos remotos sin integridad
- Google Fonts cargados sin subresource integrity (SRI)
- Sin hash SHA-256 para verificar integridad de archivos CSS/font
- Vulnerable a MITM si el certificado de Google es comprometido
- Dependencia externa crítica para UI (tipografía)

### Riesgo 4: Orígenes no controlados
- Sin `default-src 'self'`
- Sin `connect-src` acotado al API
- Sin `font-src` específico
- Sin `script-src 'self'`
- Sin `style-src 'self'`
- Cualquier origen podría cargar recursos si se introduce vulnerabilidad

## Capacidades Nativas Alcanzables por Script Inyectado

Basado en plugins Capacitor instalados:

1. **Cámara** (`@capacitor-mlkit/barcode-scanning`)
   - Escanear QR codes maliciosos
   - Capturar fotos sin consentimiento

2. **Geolocalización** (`@capacitor/geolocation`)
   - Rastrear ubicación del usuario en tiempo real
   - Historial de movimientos

3. **SecureStorage** (`@aparajita/capacitor-secure-storage`)
   - Leer tokens de autenticación
   - Acceder a llaves privadas si están almacenadas
   - Exfiltrar datos sensibles

4. **Push Notifications** (`@capacitor/push-notifications`)
   - Enviar notificaciones falsas (phishing)
   - Spam de notificaciones

5. **App Control** (`@capacitor/app`)
   - Minimizar/maximizar app
   - Controlar estado de la app

## Reproducible en testnet
**SÍ** - Para verificar:

1. Abrir el APK o web app
2. Inspeccionar `index.html` - confirmar ausencia de meta CSP
3. Abrir DevTools en WebView (si es posible) - confirmar ausencia de header CSP
4. Verificar Network tab - confirmar cargas de fonts.googleapis.com y fonts.gstatic.com
5. Verificar que no hay headers CSP en respuestas HTTP

## Severidad Estimada
**MEDIA** - No es un XSS activo (React escapa por defecto), pero falta defensa en profundidad crítica en un entorno WebView con acceso a bridge nativo. El riesgo aumenta si:
- Se agrega dangerouslySetInnerHTML en el futuro
- Se introduce una dependencia vulnerable
- Se compromete un recurso remoto (fonts)
- Un atacante encuentra otra vector de inyección

## Sugerencia de Fix

### Opción 1: Implementar CSP estricta (recomendado)

**1. Agregar meta CSP en index.html:**
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
  font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
  connect-src 'self' https://api.micopay.io https://*.stellar.expert;
  img-src 'self' data: https:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

**2. Self-host de fuentes (opcional pero recomendado):**
- Descargar Plus Jakarta Sans y Manrope
- Descargar Material Symbols Outlined
- Servir desde `/public/fonts/`
- Actualizar CSP a `font-src 'self'`

**3. Agregar Subresource Integrity (SRI):**
```html
<link 
  href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" 
  rel="stylesheet"
  integrity="sha384-[HASH]"
  crossorigin="anonymous">
```

**4. Configurar CSP en Capacitor (opcional):**
```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  // ...
  server: {
    androidScheme: 'https',
    cleartext: false,
    // Capacitor no soporta headers CSP directamente, usar meta tag
  },
};
```

**5. Configurar headers CSP en Vite para desarrollo:**
```typescript
// vite.config.ts
export default defineConfig({
  // ...
  server: {
    port: 5181,
    strictPort: true,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self' http://localhost:3000 https://api.micopay.io; img-src 'self' data: https:; frame-src 'none'; object-src 'none';"
    }
  },
})
```

### Opción 2: Self-host completo de recursos
1. Descargar todas las fuentes a `/public/fonts/`
2. Eliminar dependencias de fonts.googleapis.com
3. CSP: `font-src 'self'` únicamente
4. Reducir superficie de ataque a orígenes controlados

### Opción 3: Configuración WebView personalizada (Android)
1. Extender MainActivity para configurar WebView
2. Agregar CSP programático en Android
3. Configurar WebViewClient para inyectar headers CSP
4. Más complejo pero más robusto

## CSP Mínima Viable (Transición)

Para implementación inmediata sin self-host de fuentes:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;
  font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
  connect-src 'self' https://api.micopay.io https://*.stellar.expert;
  img-src 'self' data: https:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

**Notas:**
- `unsafe-inline` y `unsafe-eval` necesarios para React/Vite en desarrollo
- En producción, considerar CSP nonce o hash para scripts
- `connect-src` debe incluir el API endpoint real
- Monitorear CSP violations en console

## Entorno de Prueba
- **Plataforma:** Capacitor (Android/iOS) + Web/PWA
- **WebView:** Capacitor WebView (Android WebView / iOS WKWebView)
- **Archivos afectados:**
  - `micopay/frontend/index.html`
  - `micopay/frontend/capacitor.config.ts`
  - `micopay/frontend/vite.config.ts`
  - `micopay/frontend/android/app/src/main/java/com/micopay/app/MainActivity.java`
- **Plugins Capacitor con acceso nativo:**
  - @capacitor-mlkit/barcode-scanning
  - @capacitor/geolocation
  - @capacitor/push-notifications
  - @aparajita/capacitor-secure-storage
  - @capacitor/app

## Fecha de Reporte
2026-06-29
