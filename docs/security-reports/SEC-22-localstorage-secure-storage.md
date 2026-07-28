# SEC-22 — Lecturas directas de localStorage esquivan el secure storage nativo

**Issue:** #254  
**Severidad:** Alta  
**Estado:** Resuelto  
**Fecha:** 2026-06-29  

---

## Resultado

**Confirmado — vulnerabilidad real.** Los tres módulos leían material sensible
(`auth_token`, `micopay_users`, `token`) directamente desde `window.localStorage`,
saltándose la capa `secureStorage.ts` que en builds nativos usa Keychain/Keystore vía
`@aparajita/capacitor-secure-storage`.

En un build nativo cualquier script del mismo origen del WebView podría leer esos valores
en texto plano. Peor aún: para que las rutas síncronas _funcionaran_, el flujo de login
debía escribir los tokens también en `localStorage`, manteniendo una copia desprotegida
fuera de Keychain/Keystore y anulando la protección que establecen SEC-05/SEC-06.

---

## Evidencia

### Archivos afectados (pre-fix)

| Archivo | Línea | Clave leída | Descripción |
|---|---|---|---|
| `src/pages/TradeDetail.tsx` | 36 | `micopay_users` | `isCurrentUserBuyer` — lectura síncrona del blob con ID y tokens de sesión |
| `src/hooks/useChatMessages.ts` | 85, 127, 224 | `auth_token` | Header `Authorization` en fetch/poll de mensajes y envío |
| `src/utils/reportError.ts` | 17 | `token` | Header `Authorization` en reporte de errores al backend |

### Impacto en nativo

- `secureStorage.ts` enruta `Capacitor.isNativePlatform()` a `@aparajita/capacitor-secure-storage`
  (Keychain en iOS, Keystore en Android). Las lecturas directas de `localStorage` ignoran
  esa lógica y van al `localStorage` del WebView.
- Si el JWT o el keypair terminan en `localStorage` del WebView (para que estas rutas
  funcionen), son accesibles a cualquier XSS del mismo origen — sin necesitar jailbreak ni
  root.
- Si el flujo de login no escribe esos valores en `localStorage`, estas rutas devuelven
  `null` silenciosamente y el chat/reporte operan **sin autenticación** en nativo.

---

## Reproducible en testnet

**Sí.** En el APK testnet, abrir `chrome://inspect` → WebView del proceso MicoPay →
consola JS → `localStorage.getItem('auth_token')` devolvía el JWT activo.

---

## Fix aplicado

Cada lectura fue reemplazada por `readJSON` / `.then` de `secureStorage.ts`:

### `TradeDetail.tsx`
- `isCurrentUserBuyer` convertida a `async`, usa `readJSON<…>('micopay_users')`.
- `isBuyer` elevado a `useState<boolean>` + `useEffect` que resuelve la promesa al
  cambiar `trade.buyer_id`. Elimina la única razón para mantener el dato en `localStorage`.

### `useChatMessages.ts`
- Añadido helper `getAuthToken(): Promise<string>` que llama `readJSON<string>('auth_token')`.
- Las tres llamadas a `fetch` (carga inicial, polling, envío) `await getAuthToken()` para
  el header `Authorization`.

### `reportError.ts`
- `localStorage.getItem('token')` reemplazado por `readJSON<string>('token')` dentro de
  una cadena `.then().catch()` que mantiene la semántica fire-and-forget sin bloquear la
  firma de `reportClientError`.

---

## Archivos modificados

- `micopay/frontend/src/pages/TradeDetail.tsx`
- `micopay/frontend/src/hooks/useChatMessages.ts`
- `micopay/frontend/src/utils/reportError.ts`

---

## Sugerencia adicional

Auditar el flujo de login (`src/services/api.ts` y screens relacionados) para confirmar
que `auth_token`, `token` y `micopay_users` **nunca se escriben en `localStorage`**
directamente. Si se detecta alguna escritura directa, debe migrarse a `writeJSON` de
`secureStorage.ts` para completar el cierre de la superficie de ataque.
