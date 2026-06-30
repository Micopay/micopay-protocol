# SEC-19: /api/v1/demo/run sin auth dispara tx on-chain reales; /auth/demo-login acuña sesiones 24h

## Resultado
**CONFIRMADO** - Ambas vulnerabilidades existen, con diferente impacto según el entorno.

### Vulnerabilidad 1: POST /api/v1/demo/run sin autenticación
- **Severidad**: Media-Alta
- **Estado**: CONFIRMADO
- El endpoint `/api/v1/demo/run` (línea 85 en `apps/api/src/routes/demo.ts`) no tiene ningún middleware de autenticación ni validación de JWT
- Cualquier persona puede invocarlo repetidamente sin credenciales
- Cada invocación firma y envía 6 transacciones USDC reales a Stellar testnet (total ~0.1215 USDC)
- Solo está protegido por el rate-limit global (100 req/min), lo que permite hasta ~12.15 USDC/min de drenaje
- No tiene guarda de producción para `DEMO_AGENT_SECRET_KEY` - si esta variable está configurada en producción, el endpoint funcionaría

### Vulnerabilidad 2: POST /auth/demo-login emite JWT sin credenciales
- **Severidad**: Baja (mitigada por guarda de producción)
- **Estado**: PARCIALMENTE MITIGADO
- El endpoint `/auth/demo-login` (línea 49 en `apps/api/src/routes/demo.ts`) emite un JWT de 24h sin verificar credenciales cuando `config.demoMode=true`
- **MITIGACIÓN**: `config.demoMode` está forzado a `false` cuando `NODE_ENV=production` (línea 39 en `apps/api/src/config.ts`)
- Si `NODE_ENV=production` y `DEMO_MODE=true`, se loguea un warning pero `demoMode` permanece `false`
- Esta vulnerabilidad solo existe en desarrollo/test, no en producción

## Evidencia

### 1. Endpoint /api/v1/demo/run sin autenticación
**Archivo**: `apps/api/src/routes/demo.ts:85-274`

```typescript
fastify.post("/api/v1/demo/run", async (_request, reply) => {
  const secret = process.env.DEMO_AGENT_SECRET_KEY;
  if (!secret) {
    return reply.status(503).send({
      error: "Demo agent not configured. Run scripts/setup-demo-agent.mjs first.",
    });
  }
  // ... continúa firmando y enviando 6 transacciones reales
```

- No hay llamada a `authMiddleware` ni verificación de JWT
- Solo verifica que `DEMO_AGENT_SECRET_KEY` exista (configuración del servidor, no autenticación del cliente)
- Las 6 transacciones enviadas:
  - `tx0`: 0.005 USDC (bazaar_broadcast)
  - `txA`: 0.005 USDC (bazaar_accept)
  - `tx1`: 0.001 USDC (cash_agents)
  - `tx2`: 0.0005 USDC (reputation)
  - `tx3`: 0.010 USDC (cash_request)
  - `tx4`: 0.100 USDC (fund_micopay)
  - **Total**: 0.1215 USDC por llamada

### 2. Rate-limiting insuficiente
**Archivo**: `apps/api/src/plugins/rate-limit.ts:4-7`

```typescript
await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
```

- Rate-limit global de 100 req/min aplicado a TODOS los endpoints
- Un atacante podría invocar `/api/v1/demo/run` 100 veces por minuto
- Potencial de drenaje: 100 × 0.1215 USDC = **12.15 USDC/minuto**
- No hay rate-limit específico para este endpoint costoso

### 3. Endpoint /auth/demo-login sin credenciales
**Archivo**: `apps/api/src/routes/demo.ts:49-71`

```typescript
fastify.post("/auth/demo-login", async (_request, reply) => {
  if (!config.demoMode) {
    return reply.status(404).send();
  }

  if (!fastify.jwt) {
    return reply.status(503).send({ error: "JWT plugin not registered" });
  }

  const token = fastify.jwt.sign(
    { id: DEMO_USER.id, stellar_address: DEMO_USER.stellar_address },
    { expiresIn: "24h" },
  );
  // ...
```

- Emite JWT sin verificar usuario/contraseña
- Solo verifica que `config.demoMode` sea `true`

### 4. Guarda de producción para demoMode
**Archivo**: `apps/api/src/config.ts:35-45`

```typescript
export function deriveDemoMode(
  demoModeEnv: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  return demoModeEnv === "true" && nodeEnv !== "production";
}

// Emit production-safety warning at module load time if applicable
if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "true") {
  console.warn("[WARN] DEMO_MODE=true is ignored in production");
}
```

- **MITIGACIÓN VÁLIDA**: `demoMode` se fuerza a `false` en producción
- Esta guarda protege contra la vulnerabilidad de `/auth/demo-login` en producción

### 5. AUSENCIA de guarda de producción para DEMO_AGENT_SECRET_KEY
- No existe validación que prevenga `DEMO_AGENT_SECRET_KEY` en producción
- Si esta variable está configurada en un entorno de producción, `/api/v1/demo/run` funcionaría
- Las transacciones se enviarían a testnet (hardcoded en línea 15), pero el riesgo de configuración accidental existe

## Reproducible en testnet
**SÍ** - Las vulnerabilidades son reproducibles en el entorno actual:

1. **POST /api/v1/demo/run sin auth**:
   - Si `DEMO_AGENT_SECRET_KEY` está configurado, cualquier request POST a este endpoint ejecutará 6 transacciones reales
   - Las transacciones son visibles en stellar.expert desde la cuenta del demo agent
   - El rate-limit global permite múltiples invocaciones antes de bloquear

2. **POST /auth/demo-login**:
   - Si `DEMO_MODE=true` y `NODE_ENV!=production`, el endpoint emite un JWT válido de 24h
   - El JWT puede usarse en endpoints protegidos con `authMiddleware`
   - En producción (`NODE_ENV=production`), el endpoint retorna 404 independientemente de `DEMO_MODE`

## Entorno de prueba
- **OS**: Windows
- **Repositorio**: ericmt-98/micopay-protocol
- **Branch**: main (asumido)
- **Archivos analizados**:
  - `apps/api/src/routes/demo.ts` (líneas 49-71, 85-274)
  - `apps/api/src/config.ts` (líneas 35-45)
  - `apps/api/src/plugins/rate-limit.ts` (líneas 4-7)
  - `apps/api/src/index.ts` (líneas 42, 50)
  - `apps/api/src/middleware/auth.middleware.ts`

## Sugerencia de fix

### Fix 1: Proteger /api/v1/demo/run con autenticación
```typescript
// Agregar middleware de auth al endpoint
import { authMiddleware } from "../middleware/auth.middleware.js";

fastify.post("/api/v1/demo/run", { preHandler: authMiddleware }, async (_request, reply) => {
  // ... código existente
});
```

### Fix 2: Agregar rate-limit específico para /api/v1/demo/run
```typescript
// En apps/api/src/plugins/rate-limit.ts o directamente en el endpoint
fastify.post("/api/v1/demo/run", {
  config: { rateLimit: { max: 5, timeWindow: "1 hour" } }
}, async (_request, reply) => {
  // ... código existente
});
```

### Fix 3: Agregar guarda de producción para DEMO_AGENT_SECRET_KEY
```typescript
// En apps/api/src/config.ts o apps/api/src/index.ts
if (process.env.NODE_ENV === "production" && process.env.DEMO_AGENT_SECRET_KEY) {
  throw new Error("DEMO_AGENT_SECRET_KEY must not be set in production");
}
```

### Fix 4: Opcional - Requerir demoMode para /api/v1/demo/run
```typescript
fastify.post("/api/v1/demo/run", async (_request, reply) => {
  if (!config.demoMode) {
    return reply.status(404).send();
  }
  // ... resto del código existente
});
```

## Severidad estimada
**Media-Alta**

- **Impacto**: Drenaje de fondos del demo agent, DoS potencial, amplificación de carga interna
- **Explotabilidad**: Fácil - requiere solo requests HTTP sin autenticación
- **Alcance**: Afecta fondos on-chain (testnet) y recursos del servidor
- **Mitigación parcial**: El endpoint `/auth/demo-login` está protegido en producción por la guarda de `demoMode`, pero `/api/v1/demo/run` no tiene guarda equivalente para `DEMO_AGENT_SECRET_KEY`
