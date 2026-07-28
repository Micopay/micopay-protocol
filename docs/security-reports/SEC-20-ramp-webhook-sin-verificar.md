# SEC-20: Webhook de ramp acepta callbacks de liquidación sin autenticación ni firma

- **Repositorio:** ericmt-98/micopay-protocol
- **Archivo:** `apps/api/src/routes/ramp.ts:163-170`
- **Severidad:** Media (stub) — Alta al conectar el proveedor sin verificación de webhook

---

## Resultado

**El webhook acepta cualquier payload sin verificar firma/origen.** El endpoint `POST /defi/ramp/webhook` no implementa ninguna validación criptográfica ni de origen. Al conectarse el proveedor real (Etherfuse), un atacante podría falsificar confirmaciones de depósito y disparar la acreditación/entrega de fondos sin que el dinero fiat haya llegado.

Adicionalmente, el endpoint `/defi/bank-account` recibe y devuelve la CLABE bancaria (18 dígitos) sin protección en logs ni almacenamiento cifrado en su implementación actual (stub).

---

## Evidencia

### 1. Endpoint público sin verificación

```typescript
// apps/api/src/routes/ramp.ts:163-170
fastify.post<{ Body: unknown }>(
  "/defi/ramp/webhook",
  async (_request, reply) => {
    // Stub: accept and acknowledge without verification
    return reply.status(200).send({ received: true });
  }
);
```

- No hay middleware de autenticación (`preHandler`)
- No se valida firma HMAC
- No hay allowlist de IPs
- No hay rate-limiting
- El `_request` ni siquiera se usa

### 2. Sin protección de replay

No se valida un timestamp ni nonce. Un atacante podría re-enviar un webhook legítimo interceptado para acreditar múltiples veces el mismo depósito.

### 3. CLABE en `/defi/bank-account` sin protección de PII

```typescript
// apps/api/src/routes/ramp.ts:16-30
fastify.post<{ Body: { clabe: string } }>(
  "/defi/bank-account",
  { preHandler: [authMiddleware] },
  async (request, reply) => {
    const { clabe } = request.body ?? {};
    if (!clabe || clabe.length !== 18 || !/^\d{18}$/.test(clabe)) {
      return reply.status(400).send({ error: "CLABE debe tener 18 digitos numericos" });
    }
    return reply.send({
      bankAccountId: `stub-bank-${Date.now()}`,
      clabe,
      note: "stub — Etherfuse API not connected yet",
    });
  }
);
```

- La CLABE se devuelve en claro en la respuesta
- No hay sanitización de logs (si se agregara un logger, la CLABE quedaría expuesta)
- No hay cifrado en reposo (stub con store en memoria, pero sin protección)

### 4. Transición de estado explotable

Cuando el webhook se implemente con el proveedor real, la transición de estado esperada es:

```
pending → funded → completed
```

Un webhook falsificado podría simular `funded` o `completed` y causar:

- **Onramp (MXN → CETES):** Acreditación de CETES al usuario sin que el SPEI haya llegado
- **Offramp (CETES → MXN):** Liberación de CETES del escrow sin que la transferencia SPEI se haya emitido

---

## Reproducible en testnet

**Sí.** El endpoint está desplegado y accesible sin autenticación:

```bash
curl -X POST http://localhost:3000/defi/ramp/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"settlement.completed","orderId":"stub-o-123","amount":"1000.00"}'
```

Respuesta: `200 {"received":true}` — sin verificar firma ni origen.

---

## Fix aplicado

Se implementaron las siguientes correcciones en la rama `fix/sec-20-ramp-webhook-hmac`:

### 1. Módulo de verificación HMAC (`apps/api/src/lib/webhook-auth.ts`)

- Verificación de firma HMAC-SHA256 con `timingSafeEqual`
- Validación de timestamp (±5 min) para prevención de replay attacks
- Headers esperados: `x-webhook-signature`, `x-webhook-timestamp`

### 2. Integración en el webhook (`apps/api/src/routes/ramp.ts`)

```typescript
fastify.post<{ Body: unknown }>(
  "/defi/ramp/webhook",
  async (request, reply) => {
    const signature = request.headers["x-webhook-signature"] as string | undefined;
    const timestamp = request.headers["x-webhook-timestamp"] as string | undefined;

    const { valid, error } = verifyWebhookSignature(request.body, signature, timestamp);
    if (!valid) {
      return reply.status(401).send({ error: `webhook signature verification failed: ${error}` });
    }

    return reply.status(200).send({ received: true });
  }
);
```

### 3. Configuración (`config.ts` / `.env.example`)

- Nueva variable `WEBHOOK_SECRET` para el secreto compartido HMAC
- Documentación de generación: `openssl rand -hex 32`

### Recomendaciones adicionales (no implementadas en este PR)

| Recomendación | Prioridad |
|---|---|
| Agregar rate-limiting al webhook (`fastify-rate-limit`) | Media |
| No persistir CLABE en claro en base de datos; cifrar con `secretEncryptionKey` | Alta |
| Sanitizar CLABE de logs (nunca loguear el valor completo) | Alta |
| Agregar allowlist de IPs de Etherfuse en producción | Media |
| Implementar idempotency key para evitar doble procesamiento | Alta |

---

## Línea de tiempo

- **2026-04-28:** Se crea el stub del webhook sin verificación
- **2026-06-29:** Se identifica y reporta el hallazgo (SEC-20)
- **2026-06-29:** Se implementa verificación HMAC y se genera este reporte
