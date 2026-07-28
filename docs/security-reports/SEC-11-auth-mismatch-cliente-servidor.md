# SEC-11 — Mismatch cliente/servidor en el flujo de autenticación

**Issue:** [#218](https://github.com/ericmt-98/micopay-protocol/issues/218)
**Severidad:** ⚪ Informativa (bloquea la interpretación de SEC-01)
**Estado:** ✅ Resuelto
**PR:** fix/sec-11-auth-mismatch

---

## Hallazgo

El backend definía schemas estrictos (`additionalProperties: false`) para:

- `POST /auth/challenge` → requiere `stellar_address` (56 chars)
- `POST /auth/token` → requiere `stellar_address`, `challenge`, `signature`

Pero `getAuthToken()` en `micopay/frontend/src/services/api.ts` enviaba:

- `POST /auth/challenge` → `{ username }`
- `POST /auth/token` → `{ username, challenge, signature }`

Con el schema del backend, ambas peticiones deberían retornar **400** por:
1. Campo requerido `stellar_address` ausente.
2. Campo `username` no permitido (`additionalProperties: false`).

## Causa raíz

El cliente fue escrito usando `username` como identificador antes de que el backend adoptara el modelo de autenticación basado en Stellar (`stellar_address` + firma de challenge). El frontend ya contaba con `getPublicKey()` (en `src/lib/keystore.ts`) que retorna la Stellar address del keypair del dispositivo, pero `getAuthToken()` no la usaba.

## Impacto

- El flujo de auth end-to-end fallaba silenciosamente (o retornaba 400) en cualquier entorno que corriera el código del repositorio.
- Bloqueaba la verificación de SEC-01 (bypass de firma), ya que el challenge nunca se emitía correctamente.

## Fix aplicado

**`micopay/frontend/src/services/api.ts` — `getAuthToken()`**

```diff
-  const { challenge } = await fetch(`${BASE_URL}/auth/challenge`, {
-    body: JSON.stringify({ username }),
-  })
+  const stellar_address = (await getPublicKey()) ?? generateFallbackAddress(username);
+  const { challenge } = await fetch(`${BASE_URL}/auth/challenge`, {
+    body: JSON.stringify({ stellar_address }),
+  })

-  const { token } = await fetch(`${BASE_URL}/auth/token`, {
-    body: JSON.stringify({ username, challenge, signature }),
-  })
+  const { token } = await fetch(`${BASE_URL}/auth/token`, {
+    body: JSON.stringify({ stellar_address, challenge, signature }),
+  })
```

El `stellar_address` proviene de `getPublicKey()` (keypair del dispositivo almacenado en `secureStorage`). Si por algún motivo el keypair no está disponible, se usa `generateFallbackAddress(username)` como fallback, que ya existía en el mismo archivo.

## Verificación

1. Backend acepta `POST /auth/challenge` con `{ "stellar_address": "G..." }` → responde `200` con `challenge`.
2. Backend acepta `POST /auth/token` con `{ "stellar_address": "G...", "challenge": "...", "signature": "..." }` → responde `200` con JWT.
3. `npm run build` (tsc + vite) en `micopay/frontend` pasa sin errores.
4. `npx tsc --noEmit` en `micopay/backend` pasa sin errores.

## Recomendaciones adicionales

- **Producción:** habilitar `config.mockStellar = false` para que el backend verifique la firma Stellar real (actualmente salta la verificación en modo MVP).
- **Tests:** agregar un test de integración que cubra el flujo completo `challenge → token` usando un keypair real de Stellar testnet.
- **SEC-01:** con este fix, la verificación de bypass de firma (SEC-01) ya puede ejecutarse end-to-end.
