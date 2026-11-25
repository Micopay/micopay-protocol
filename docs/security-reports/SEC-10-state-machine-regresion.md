# SEC-10 — Reporte de Regresión: Autorización por Rol en Trade State Machine

**Fecha:** 2026-06-29  
**Severidad:** ⚪ Informativa (los guards se mantienen en todos los casos)  
**Issue:** [#217](https://github.com/ericmt-98/micopay-protocol/issues/217)

---

## Resumen

Se realizaron pruebas de regresión sobre los guards de rol en `micopay/backend/src/services/trade.service.ts`. El objetivo era confirmar que ninguna transición de estado puede ser ejecutada por un actor no autorizado, y que no existen rutas alternativas (endpoints de demo, seed, admin) que salten estos guards.

**Resultado: todos los guards se mantienen.** No se encontró ningún bypass.

---

## Guards verificados

| Función | Línea aprox. | Rol permitido | Método de verificación |
|---|---|---|---|
| `lockTrade` | ~117 | Solo seller | Test: buyer y tercero reciben 403 |
| `revealTrade` | ~165 | Solo seller | Test: buyer y tercero reciben 403 |
| `getTradeSecret` | ~183 | Solo seller | Test: buyer y tercero reciben 403 |
| `completeTrade` | ~215 | Solo buyer | Test: seller y tercero reciben 403 |
| `getTradeById` | ~239 | Seller o buyer | Test: tercero recibe 403 |

---

## Casos de prueba ejecutados

Todos los tests están en `micopay/backend/src/tests/tradeAuth.test.ts` y se ejecutan con:

```bash
npm run test:trade-auth
# Equivalente a: node --import tsx src/tests/tradeAuth.test.ts
```

### Resultados

```
SEC-10 — Role-based authorization regression tests

  ✓ lockTrade: buyer cannot lock (403 ForbiddenError)
  ✓ lockTrade: third party cannot lock (403 ForbiddenError)
  ✓ revealTrade: buyer cannot reveal (403 ForbiddenError)
  ✓ revealTrade: third party cannot reveal (403 ForbiddenError)
  ✓ getTradeSecret: buyer cannot read secret (403 AuthError)
  ✓ getTradeSecret: third party cannot read secret (403 AuthError)
  ✓ completeTrade: seller cannot complete (403 ForbiddenError)
  ✓ completeTrade: third party cannot complete (403 ForbiddenError)
  ✓ getTradeById: third party cannot view trade details (403 AuthError)

All SEC-10 role-authorization tests passed.
```

---

## Análisis de rutas alternativas

Se revisaron todos los endpoints registrados en el backend para identificar rutas que puedan modificar el estado de un trade sin pasar por los guards del servicio:

| Archivo de rutas | Evaluación |
|---|---|
| `src/routes/trades.ts` | Todas las rutas usan `authMiddleware` y delegan a `trade.service.ts` — guards aplicados |
| `src/routes/admin.ts` | No expone operaciones de estado de trade |
| `src/routes/trade-safety.ts` | Solo lectura / métricas — no modifica estado |
| `src/routes/auth.ts` | Solo autenticación |
| `src/seed.ts` | Solo se ejecuta cuando `SEED_DEMO_DATA=true` en desarrollo; no expuesto como endpoint HTTP |

**Conclusión:** No se encontró ninguna ruta alternativa que permita saltar los guards de rol.

---

## Vectores evaluados según el issue

1. **Buyer intenta `POST /trades/{id}/reveal`** → `ForbiddenError` (403) ✅
2. **Seller intenta `POST /trades/{id}/complete`** → `ForbiddenError` (403) ✅
3. **Tercero intenta `GET /trades/{id}/secret`** → `AuthError` (403) ✅
4. **Rutas de demo/seed sin guards** → No existen endpoints HTTP de seed; el archivo `seed.ts` solo se ejecuta via flag de configuración ✅

---

## Severidad final

⚪ **Informativa** — los guards se mantienen correctamente en todos los casos de prueba. No se requiere acción correctiva.
