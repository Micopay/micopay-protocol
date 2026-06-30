# SEC-15: /users/register emite JWT para dirección Stellar no verificada (bypass de firma)

## Resultado
El endpoint /users/register crea el usuario y devuelve un JWT válido sin requerir prueba de posesión de la llave privada (no challenge ni firma).

## Evidencia
- Archivo: apps/api/src/routes/users.ts:12-63
- Respuesta 201 con token JWT inmediato para cualquier stellar_address.
- No llama a auth challenge flow.

## Reproducible en testnet
Sí.

## Sugerencia de fix
Requerir challenge + firma antes de emitir JWT (unificar con /auth flow). O marcar como "unverified" hasta verificación.

## Estado
Reporte completado
