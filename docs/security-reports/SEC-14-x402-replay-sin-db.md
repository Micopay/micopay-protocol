# SEC-14: Anti-replay de x402 nunca usa la base de datos (`useDatabase` siempre `false`)

**Issue:** [#245](https://github.com/ericmt-98/micopay-protocol/issues/245)  
**Severidad:** Media  
**Estado:** CONFIRMADO  
**Archivo afectado:** `apps/api/src/middleware/x402.ts` (líneas 18, 120–129, 153–157)

---

## Resultado

**CONFIRMADO.** La protección anti-replay de x402 **nunca** persiste hashes de transacción en PostgreSQL. El flag `useDatabase` se inicializa en `false` y no existe ninguna ruta de código en el repositorio que lo reasigne a `true`. Por tanto, `verifyPayment()` siempre ejecuta el camino en memoria (`usedTxHashes: Set<string>`), aunque la base de datos esté configurada (`DATABASE_URL` en `docker-compose.yml`) y `initX402Tables()` haya creado la tabla `x402_payments` con éxito.

### Respuestas a las preguntas obligatorias

| Pregunta | Respuesta |
|---|---|
| ¿El hash usado sobrevive a un reinicio del proceso? | **No.** El `Set` es estado en memoria del proceso Node.js; se pierde al reiniciar. El mismo XDR puede volver a aceptarse tras un restart. |
| ¿`useDatabase` se activa en alguna ruta de código? | **No.** Búsqueda en todo el repositorio: una sola asignación (`let useDatabase = false;`), cero reasignaciones. |
| ¿El mismo pago pasa en dos instancias distintas? | **Sí (esperado).** Cada réplica mantiene su propio `Set` aislado; un XDR válido puede consumirse una vez por instancia detrás de un balanceador. |

---

## Evidencia

### 1. `useDatabase` declarado en `false` y nunca actualizado

```18:18:apps/api/src/middleware/x402.ts
let useDatabase = false;
```

Búsqueda estática en el repositorio completo (`grep -r useDatabase`):

```
apps/api/src/middleware/x402.ts:18:let useDatabase = false;
apps/api/src/middleware/x402.ts:120:    if (useDatabase) {
apps/api/src/middleware/x402.ts:153:    if (useDatabase) {
docs/SECURITY_AUDIT_WAVE6.md  (documentación de auditoría)
```

No hay `useDatabase = true`, ni lectura desde variable de entorno, ni asignación condicional tras inicializar la DB.

### 2. `ensureX402Initialized()` crea tablas pero no activa el camino DB

```7:16:apps/api/src/middleware/x402.ts
async function ensureX402Initialized() {
  if (x402Initialized) return;
  try {
    await initX402Tables();
    await cleanupExpiredPayments();
    x402Initialized = true;
  } catch (error) {
    console.warn('x402 DB init failed (will use in-memory fallback):', error);
  }
}
```

Incluso cuando `initX402Tables()` y `cleanupExpiredPayments()` terminan sin error, **no** se ejecuta `useDatabase = true`. La inicialización de tablas y la selección del backend anti-replay están desacopladas.

### 3. Anti-replay siempre usa el `Set` en memoria

```94:94:apps/api/src/middleware/x402.ts
const usedTxHashes = new Set<string>();
```

```120:129:apps/api/src/middleware/x402.ts
    if (useDatabase) {
      const alreadyUsed = await isPaymentUsed(txHash);
      if (alreadyUsed) {
        throw new Error(`Payment already used: ${txHash.slice(0, 16)}...`);
      }
    } else {
      if (usedTxHashes.has(txHash)) {
        throw new Error(`Payment already used: ${txHash.slice(0, 16)}...`);
      }
    }
```

```153:157:apps/api/src/middleware/x402.ts
    if (useDatabase) {
      await markPaymentUsed(txHash, payer, minAmountUsdc, service);
    } else {
      usedTxHashes.add(txHash);
    }
```

Dado `useDatabase === false` de forma permanente, las ramas `isPaymentUsed` / `markPaymentUsed` son **código muerto** en tiempo de ejecución.

### 4. Infraestructura DB existe pero queda sin uso para replay

`apps/api/src/db/x402.ts` define correctamente:

- `initX402Tables()` — crea `x402_payments` con `tx_hash` como PK e índices.
- `isPaymentUsed(txHash)` — consulta `used` y `expires_at`.
- `markPaymentUsed(...)` — `INSERT ... ON CONFLICT DO UPDATE SET used = TRUE`.

`docker-compose.yml` configura `DATABASE_URL=postgresql://micopay:micopay_secret@postgres:5432/micopay_db` para el servicio `api`, por lo que en despliegue estándar la DB está disponible; el anti-replay simplemente no la utiliza.

### 5. Documentación del propio repositorio reconoce el fallback en memoria

`README.md` (línea ~525):

> x402: USDC issuer verified, tx hash replay protection **(in-memory Set)**

Esto confirma que el comportamiento actual es intencional o al menos conocido, pero no cumple la expectativa de persistencia cross-restart / cross-instance que sugiere la existencia de `x402_payments`.

### 6. Tests existentes no cubren replay ni persistencia DB

`apps/api/src/__tests__/x402.test.ts` solo verifica:

- Respuesta 402 sin header `X-PAYMENT`.
- Aceptación de pagos `mock:GTEST123:0.001`.

No hay tests que validen replay en el mismo proceso, supervivencia tras restart, ni uso de PostgreSQL.

### 7. Interacción con SEC-13 (pago sin settlement on-chain)

Relacionado con [#244](https://github.com/ericmt-98/micopay-protocol/issues/244) / SEC-13: `verifyPayment()` valida el XDR localmente (operación de pago USDC al `PLATFORM_ADDRESS`) **sin** enviar la transacción a la red ni confirmarla en Horizon/RPC. Un atacante puede fabricar o reutilizar un XDR bien formado. Combinado con SEC-14:

- **Mismo proceso:** el replay se bloquea en la 2ª presentación (el `Set` funciona intra-proceso).
- **Tras restart o en multi-instancia:** el mismo XDR vuelve a ser aceptado indefinidamente.

Esto amplifica el impacto de SEC-13 más allá de la ventana de vida del proceso.

---

## Reproducción

### Análisis estático (ejecutado en este entorno)

```bash
# Confirmar que useDatabase nunca se reasigna
grep -rn 'useDatabase' apps/api/src/
# Resultado: solo declaración en :18 y condicionales en :120, :153

# Confirmar que initX402Tables no activa useDatabase
grep -rn 'useDatabase\s*=' apps/api/
# Resultado: una sola coincidencia (declaración inicial)
```

### Reproducción end-to-end (mismo proceso — replay bloqueado)

1. Levantar API con Postgres (`docker compose up -d postgres api`).
2. Obtener un XDR válido (pago USDC firmado hacia `PLATFORM_ADDRESS`, o un XDR de prueba según SEC-13).
3. `GET` a un endpoint con `requirePayment` (p. ej. `/api/v1/swaps/search`) con header `X-PAYMENT: <xdr>` → **200**.
4. Repetir la misma petición con el mismo XDR → **402** con mensaje `Payment already used`.

### Reproducción end-to-end (tras reinicio — replay aceptado)

5. Reiniciar el contenedor/proceso API (`docker compose restart api` o `kill` + `npm run dev`).
6. Reenviar el **mismo** XDR del paso 3 → **200** de nuevo (el hash ya no está en `usedTxHashes`).

Verificación opcional en DB:

```sql
SELECT COUNT(*) FROM x402_payments WHERE tx_hash = '<hash_hex>';
-- Esperado con el bug: 0 filas (markPaymentUsed nunca se invoca)
```

### Reproducción multi-instancia

7. Escalar a dos réplicas API detrás de un balanceador (o dos procesos locales en puertos distintos).
8. Enviar el mismo XDR a réplica A → **200**.
9. Enviar el mismo XDR a réplica B → **200** (cada réplica tiene su propio `Set`).

---

## Reproducible en testnet

**Sí.** Los endpoints x402 operan en testnet por defecto (`STELLAR_NETWORK=TESTNET` en `docker-compose.yml`). La vulnerabilidad es independiente de la red Stellar: afecta a la capa de persistencia del anti-replay en el servidor. Con SEC-13, un XDR fabricado localmente basta para la reproducción sin gastar USDC on-chain.

---

## Entorno de verificación

| Campo | Valor |
|---|---|
| **OS** | macOS (darwin 25.5.0) |
| **Repositorio** | GEEKYFOCUS/micopay-protocol (fork de ericmt-98/micopay-protocol) |
| **Branch** | `docs/sec-14-x402-replay-report` |
| **Commit base** | `e30ad27` |
| **Método** | Análisis estático de código + revisión de `docker-compose.yml`, tests y documentación |
| **Limitación** | No se levantó un stack Docker completo en este entorno; la conclusión se basa en trazado determinístico del código (rama `useDatabase` inalcanzable) y en pasos de reproducción documentados |

---

## Impacto

| Escenario | Comportamiento actual | Comportamiento esperado |
|---|---|---|
| 2ª petición, mismo proceso | Bloqueada (`Set`) | Bloqueada (DB o `Set`) |
| Mismo XDR tras restart | **Aceptada** | Bloqueada (persistido en DB) |
| Mismo XDR en otra instancia | **Aceptada** | Bloqueada (DB compartida) |
| DB configurada y tablas creadas | Sin efecto en replay | `x402_payments` usada |

**Severidad: Media** — ventana de replay por reinicio de proceso y en despliegues horizontales; impacto amplificado si SEC-13 permite XDRs sin settlement real.

---

## Sugerencia de fix

**No implementar en este PR** (solo reporte de auditoría). Propuesta para el equipo:

### Fix mínimo

Tras una inicialización exitosa de la DB, activar el camino PostgreSQL:

```typescript
async function ensureX402Initialized() {
  if (x402Initialized) return;
  try {
    await initX402Tables();
    await cleanupExpiredPayments();
    useDatabase = true;  // ← activar persistencia
    x402Initialized = true;
  } catch (error) {
    console.warn('x402 DB init failed (will use in-memory fallback):', error);
    useDatabase = false;
  }
}
```

### Mejoras recomendadas

1. **Variable de entorno explícita** — p. ej. `X402_REPLAY_STORE=postgres|memory` para forzar el modo en desarrollo sin DB.
2. **Fail-closed en producción** — si `NODE_ENV=production` y la DB no está disponible, rechazar pagos en lugar de degradar silenciosamente a memoria (patrón similar a la guarda de `X402_MOCK_MODE` en `index.ts`).
3. **Tests de regresión** — cubrir: (a) replay bloqueado en 2ª petición, (b) `markPaymentUsed` escribe en DB, (c) fallback a `Set` solo cuando DB falla.
4. **Alerta operacional** — log/métrica cuando el anti-replay corre en modo memoria con `DATABASE_URL` configurado.

---

## Archivos analizados

- `apps/api/src/middleware/x402.ts`
- `apps/api/src/db/x402.ts`
- `apps/api/src/__tests__/x402.test.ts`
- `docker-compose.yml`
- `docs/SECURITY_AUDIT_WAVE6.md`
- `README.md`
