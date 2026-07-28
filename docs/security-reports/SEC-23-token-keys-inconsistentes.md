# SEC-23: Claves de token inconsistentes entre módulos

## Resultado
El token de sesión se guarda correctamente en `micopay_users` vía `secureStorage`, pero otros módulos intentan leerlo de `localStorage` bajo claves diferentes (`auth_token`, `token`) que nunca se escriben.

## Evidencia
- `micopay/frontend/src/services/secureStorage.ts`: Usa `micopay_users`
- `src/hooks/useChatMessages.ts:85,127,224`: `localStorage.getItem('auth_token')`
- `src/utils/reportError.ts:17`: `localStorage.getItem('token')`
- `src/pages/TradeDetail.tsx:27,36`: Posible uso de token inconsistente

## Reproducible en testnet
Sí — chat y reportError envían Authorization vacío.

## Sugerencia de fix
Unificar todo a `secureStorage.get('micopay_users')` y eliminar lecturas directas de `localStorage` para tokens.

## Estado
En progreso
