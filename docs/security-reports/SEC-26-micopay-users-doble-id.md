# SEC-26: micopay_users persiste dos identidades (buyer + seller) con sus tokens

## Resultado
**CONFIRMADO** - La estructura de almacenamiento `micopay_users` soporta doble identidad (buyer + seller) con tokens simultáneos, aunque actualmente la implementación solo asigna el mismo usuario a ambos roles. En plataformas web/PWA, los tokens se almacenan en cleartext en localStorage. En nativo (Capacitor), se usa SecureStorage que debería estar encriptado, pero existe riesgo de fallback a localStorage.

## Evidencia

### 1. Estructura de almacenamiento doble identidad
**Archivo:** `micopay/frontend/src/pages/TradeDetail.tsx:27`
```typescript
async function getStoredToken(): Promise<string | null> {
  try {
    const stored = await readJSON<{ buyer?: { token: string }; seller?: { token: string } }>('micopay_users');
    return stored?.buyer?.token ?? stored?.seller?.token ?? null;
  } catch {
    return null;
  }
}
```

### 2. Escritura de estructura buyer/seller en Login
**Archivo:** `micopay/frontend/src/pages/Login.tsx:39`
```typescript
await writeJSON(USERS_STORAGE_KEY, { buyer: user, seller: null });
```

### 3. Implementación actual: mismo usuario para ambos roles
**Archivo:** `micopay/frontend/src/App.tsx:690-694`
```typescript
const stored = await readJSON<UserData>(USERS_STORAGE_KEY);
if (stored?.id) {
  setBuyerUser(stored);
  setSellerUser(stored);  // Mismo usuario asignado a ambos roles
  return;
}
```

### 4. Storage: cleartext en web, SecureStorage en nativo
**Archivo:** `micopay/frontend/src/services/secureStorage.ts:13-23`
```typescript
const webStore: KvStore = {
  async get(key) {
    return window.localStorage.getItem(key);  // Cleartext
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);  // Cleartext
  },
  async remove(key) {
    window.localStorage.removeItem(key);
  },
};
```

**Archivo:** `micopay/frontend/src/services/secureStorage.ts:27-43`
```typescript
async function getStore(): Promise<KvStore> {
  if (!Capacitor.isNativePlatform()) return webStore;  // Web usa localStorage
  if (!nativeStorePromise) {
    nativeStorePromise = import('@aparajita/capacitor-secure-storage').then(({ SecureStorage }) => ({
      async get(key) {
        const v = await SecureStorage.get(key);
        return typeof v === 'string' ? v : null;
      },
      async set(key, value) {
        await SecureStorage.set(key, value);  // Nativo usa SecureStorage
      },
      // ...
    }));
  }
  return nativeStorePromise;
}
```

### 5. Uso de localStorage para verificación de identidad
**Archivo:** `micopay/frontend/src/pages/TradeDetail.tsx:36-42`
```typescript
function isCurrentUserBuyer(tradeBuyerId: string): boolean {
  try {
    const raw = localStorage.getItem('micopay_users');  // Lectura directa de localStorage
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.buyer?.id === tradeBuyerId;
  } catch {
    return false;
  }
}
```

## Análisis de Riesgos

### Riesgo 1: Superficie de ataque ampliada
- **Web/PWA:** Dos tokens JWT válidos almacenados en cleartext en localStorage
- **Nativo:** Si SecureStorage falla (SEC-22) y hace fallback a localStorage, ambos tokens quedan expuestos
- Cualquier XSS o acceso físico al dispositivo podría comprometer ambas sesiones

### Riesgo 2: Trade contra sí mismo (P2P trust model)
- La arquitectura permite que un mismo dispositivo actúe como ambas partes de un trade
- Actualmente no se explota porque ambos roles tienen el mismo usuario
- Si en el futuro se implementa doble identidad real, un dispositivo podría:
  - Crear trades como buyer
  - Aceptar trades como seller
  - Firmar/operar ambas puntas desde un solo cliente
- Esto viola el modelo de confianza P2P que asume contrapartes distintas

### Riesgo 3: Material de llave expuesto
- El blob almacenado incluye tokens JWT que contienen:
  - User IDs
  - Timestamps
  - Firmas del backend
- No se encontró evidencia de material de llave privada derivado en el almacenamiento
- Las llaves privadas de Stellar se gestionan separadamente en `keystore.ts`

## Reproducible en testnet
**SÍ** - La estructura de almacenamiento está presente en el código actual. Para verificar:

1. Completar onboarding en el APK o web
2. Inspeccionar `localStorage.getItem('micopay_users')` en web o usar SecureStorage en nativo
3. Verificar estructura: `{ buyer: { id, username, token }, seller: null }` o `{ buyer: {...}, seller: {...} }`
4. Confirmar que en web los tokens están en cleartext

## Severidad Estimada
**MEDIA** - La doble sesión persistida amplía la superficie de ataque y habilita riesgo P2P, aunque actualmente no se explota activamente. El riesgo aumenta si:
- Se implementa doble identidad real
- SecureStorage hace fallback a localStorage (SEC-22)
- La app se ejecuta en web/PWA donde localStorage es cleartext

## Sugerencia de Fix

### Opción 1: Eliminar estructura doble identidad (recomendado)
1. Simplificar `micopay_users` a `{ id, username, token }` (single identity)
2. Eliminar propiedades `buyer` y `seller` del objeto
3. Actualizar `TradeDetail.tsx:27` para leer estructura simple
4. Actualizar `Login.tsx:39` para escribir estructura simple
5. Actualizar `App.tsx` para mantener solo un usuario activo
6. Eliminar `isCurrentUserBuyer` que lee directamente de localStorage

### Opción 2: Implementar doble identidad de forma segura
1. Forzar que solo un rol esté activo por dispositivo
2. Agregar validación en backend para prevenir trades auto-generados
3. Implementar switching explícito de roles (no simultáneo)
4. Asegurar que SecureStorage nunca haga fallback a localStorage
5. Agregar encriptación adicional en capa de aplicación para tokens

### Opción 3: Migrar a storage más seguro
1. Usar Capacitor Preferences con encriptación para web
2. Implementar token rotation automático
3. Agregar fingerprinting de dispositivo para detectar uso anómalo
4. Implementar rate limiting por dispositivo

## Entorno de Prueba
- **Plataforma:** Capacitor (Android/iOS) + Web/PWA
- **Storage:** localStorage (web) + @aparajita/capacitor-secure-storage (nativo)
- **Archivos afectados:**
  - `micopay/frontend/src/pages/TradeDetail.tsx:27`
  - `micopay/frontend/src/pages/Login.tsx:39`
  - `micopay/frontend/src/App.tsx:690-694`
  - `micopay/frontend/src/services/secureStorage.ts`
  - `micopay/frontend/src/services/api.ts:537` (401 handler)

## Fecha de Reporte
2026-06-29
