# SEC-03 — Estado de cash request accesible sin autenticación

| Campo | Valor |
| --- | --- |
| **ID** | SEC-03 |
| **Severidad** | 🟡 Media — fuga de información financiera sin credenciales |
| **Issue** | [#210](https://github.com/ericmt-98/micopay-protocol/issues/210) |
| **Componente** | `apps/api` — `GET /api/v1/cash/request/:id` |
| **Estado** | ✅ Remediado |
| **Reportado por** | Auditoría de seguridad (Wave-6 Drips) |

---

## 1. Resumen

El endpoint `GET /api/v1/cash/request/:id` se registraba **sin middleware de
autenticación ni verificación de pago x402**. Cualquier usuario no autenticado que
conociera (o adivinara) un `request_id` obtenía una respuesta `200 OK` con datos
sensibles del comercio y de la operación.

A diferencia del endpoint análogo `GET /api/v1/swaps/:id/status` —que sí exige un
micropago x402— el sondeo de estado de cash request se dejó marcado como *“FREE”*,
abriendo un canal de fuga de información.

## 2. Datos expuestos

La respuesta filtraba:

- `merchant_name` — nombre del comercio.
- `amount_mxn` — monto de la operación en pesos mexicanos.
- `amount_usdc` — monto equivalente en USDC.
- `htlc_tx_hash` — hash de la transacción HTLC en Soroban (correlacionable on-chain).
- `expires_at` — marca de expiración.

## 3. Factor de explotabilidad: enumeración de IDs

El identificador se genera como:

```ts
const requestId = `mcr-${randomUUID().slice(0, 8)}`; // p. ej. "mcr-1a2b3c4d"
```

Son **8 caracteres hexadecimales** (los primeros 8 de un UUIDv4), es decir un
espacio de ~`16^8 = 4.29 × 10^9` valores. Aunque no es trivial agotarlo por completo,
es **enumerable mediante fuerza bruta moderada**, especialmente porque el atacante
puede distinguir un acierto (`200`) de un fallo (`404`): el endpoint actuaba como un
**oráculo de existencia**.

## 4. Reproducción (comportamiento previo a la corrección)

1. Generar un cash request legítimo (`POST /api/v1/cash/request`) y registrar su `request_id`.
2. Desde una sesión **sin autenticar** y **sin cabecera `X-PAYMENT`**, invocar
   `GET /api/v1/cash/request/{id}` → se obtenía **`200 OK`** con el cuerpo descrito en §2.
3. Iterar sobre `mcr-{hex}` aleatorios; cada `200` es un acierto, cada `404` un fallo.

## 5. Hallazgos solicitados en el issue

| Pregunta | Hallazgo (antes de la corrección) |
| --- | --- |
| ¿Las peticiones no autenticadas devuelven HTTP 200? | **Sí.** El handler no tenía `preHandler` alguno; respondía `200` con datos sensibles o `404` si el ID no existía. |
| ¿Cuántas peticiones se pueden enumerar antes de ser bloqueado? | Solo aplicaba el **rate limit global** de `100 req/min` por IP (`apps/api/src/plugins/rate-limit.ts`). Es decir, hasta **~100 intentos por minuto y por IP** sin ninguna restricción adicional, y trivialmente paralelizable rotando IPs. |
| ¿El rate limiting global previene la enumeración? | **No.** `100 req/min` solo ralentiza el ataque; no lo impide. No existía límite por ruta ni control de acceso por propietario, por lo que la enumeración seguía siendo viable a gran escala. |

## 6. Remediación aplicada

Se alinea el endpoint con el patrón ya existente para sondeo de estado
(`GET /api/v1/swaps/:id/status`):

1. **Verificación de pago x402** (`requirePayment`, `0.0001 USDC`, servicio
   `cash_request_status`). Una petición sin `X-PAYMENT` válido recibe ahora
   **`402 Payment Required`** en lugar de filtrar datos. Esto elimina el acceso
   anónimo y encarece la enumeración (cada intento exige un pago verificable).
2. **Rate limit estricto por ruta** (`20 req/min` por IP) como defensa en
   profundidad contra fuerza bruta del `request_id`, por debajo del límite global
   de `100 req/min`.

```ts
fastify.get(
  "/api/v1/cash/request/:id",
  {
    preHandler: requirePayment({ amount: "0.0001", service: "cash_request_status" }),
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  },
  async (request, reply) => { /* ... */ }
);
```

Archivo modificado: [`apps/api/src/routes/cash.ts`](../../apps/api/src/routes/cash.ts).

### Comportamiento posterior a la corrección

- Petición sin pago → **`402 Payment Required`** con un *challenge* x402 (servicio
  `cash_request_status`). Ya **no** se devuelve `200` ni se distingue un ID válido de
  uno inválido sin pagar primero (se elimina el oráculo de enumeración gratuito).
- Más de `20 req/min` por IP → **`429 Too Many Requests`**.

## 7. Verificación

Test de regresión añadido en
[`apps/api/src/__tests__/cash.test.ts`](../../apps/api/src/__tests__/cash.test.ts):

```
GET /api/v1/cash/request/:id (SEC-03)
  ✓ should return 402 without payment (no unauthenticated access)
```

```bash
cd apps/api && npx vitest run src/__tests__/cash.test.ts
# Test Files  1 passed (1)
#      Tests  3 passed (3)
```

## 8. Recomendaciones de seguimiento (fuera de alcance de este fix)

- **Control de acceso por propietario:** vincular el sondeo al `payer_address` que
  creó el request (o a un token de capacidad emitido en la creación) para que un
  tercero que pague tampoco pueda leer requests ajenos.
- **IDs no enumerables:** ampliar el `request_id` a un secreto de mayor entropía
  (p. ej. 128 bits) para que ni siquiera con pago sea factible la enumeración.
- **Respuestas indistinguibles:** normalizar tiempos/cuerpos de `404` vs. `200` para
  evitar oráculos de existencia residuales.
