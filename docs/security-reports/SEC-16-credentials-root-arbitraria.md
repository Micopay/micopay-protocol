# Reporte de Auditoría: [SEC-16] /api/v1/credentials/buy ancla on-chain una Merkle root arbitraria del cliente

## Resultado
**Vulnerabilidad Confirmada.** El endpoint de compra de credenciales confía ciegamente en el valor `merkle_root` enviado por el cliente. Al no existir validación criptográfica en el backend sobre el origen o la veracidad de este árbol, el servidor escribe la raíz maliciosa directamente en la blockchain mediante `setReputationRoot`.

## Evidencia
El bloque vulnerable se encuentra en `apps/api/src/routes/credentials.ts:54-66`:
```typescript
if (body.commitment && body.merkle_root) {
  const current = await fetchReputationRoot();
  if (current !== body.merkle_root) {
    tx = await setReputationRoot(body.merkle_root);
  }
  // ...
}
```
Como se observa, cualquier payload con un `merkle_root` distinto al actual sobrescribirá el ancla on-chain. Una vez sobrescrito, el atacante puede presentar en el endpoint `/api/v1/inference` una prueba Zero-Knowledge (ZK) válida pero generada contra su propio árbol falsificado. Al validar contra la raíz manipulada on-chain, la verificación pasará exitosamente.

## Reproducible en testnet
**Sí**.

## Sugerencia de fix
El servidor nunca debe aceptar un `merkle_root` arbitrario del cliente en el Modo A para escritura on-chain. 
1. El cálculo del árbol Merkle debe ocurrir en un ambiente de confianza (el backend).
2. El endpoint debe recibir las credenciales en crudo, verificarlas, y entonces el backend computa la nueva raíz a anclar.
3. Solo la identidad autorizada del backend debería tener permisos on-chain para llamar a la función `setReputationRoot`.
