# Plan de implementación — cola interna de la auditoría del cash-out

**Fecha:** 2026-09-04 · **Base:** `ac22380` · **Fuente:**
[`AUDITORIA_CASHOUT_AGENTE_2026-08-26.md`](./AUDITORIA_CASHOUT_AGENTE_2026-08-26.md) y los 19
cuerpos en [`docs/issues/2026-08-26/`](./issues/2026-08-26/)

Este plan cubre **los 17 issues de la auditoría que nunca se asignaron** y que por decisión del
2026-09-04 se resuelven internamente. Queda fuera RED-1 (#371), asignado a un contribuidor
externo, y CASH-1 (#372), cerrado el 2026-09-04 por el PR #377.

---

## 1. Antes de tocar cualquier issue: revalidar

Los 19 cuerpos se verificaron contra `312e921`. `main` avanzó de forma sustancial el 2026-09-04:

| PR | qué movió |
|---|---|
| #377 | CASH-1: `flow` y `provider_id` en `trades`, `createTrade`, historial, 15 inserts |
| #344 | mapa real, captura de ubicación, KYC email, IDOR de ramp, prueba de posesión de llave |
| #378 | rediseño completo de las 11 pantallas, llave fuera del portapapeles |

**Los mapas archivo:línea de los 17 cuerpos están desactualizados.** No es un detalle
cosmético: el PR #374 se rechazó precisamente por implementar contra un árbol equivocado.

Antes de empezar cada issue, ejecutar esta revalidación y corregir el cuerpo si difiere:

```bash
# 1. ¿los rangos `owns` del cuerpo siguen existiendo y diciendo lo mismo?
sed -n '<inicio>,<fin>p' <archivo>

# 2. ¿el issue sigue describiendo un defecto real, o ya lo cerró #344/#377/#378?
git log --oneline 312e921..HEAD -- <archivo>
```

Tres cuerpos ya cambiaron de estado y hay que reescribirlos, no solo re-mapearlos:

- **RED-2** — la auditoría decía que la captura de ubicación estaba «fuera de main» en
  `feat/map-real` (`1cf99eb`) y que RED-2 debía portarla. **Ya está en `main`** vía #344 y #378.
  Ese trabajo desaparece del alcance de RED-2; queda solo la frontera de incorporación.
- **CASH-5B / CASH-3** — el rediseño reescribió el marcado de las pantallas que ambos tocan.
- **RED-3** — el redondeo de coordenadas ya está; lo pendiente es solo `address_text`.

---

## 2. Orden de ejecución

El orden respeta las dependencias declaradas en cada cuerpo y maximiza cuántos issues se
destraban por cada entrega.

### Fase A — cimientos (nada los bloquea hoy)

| # | issue | por qué va primero |
|---|---|---|
| 1 | **CASH-7** · una sola sesión | Independiente. Destraba CASH-3, CASH-5B, CASH-6, KYC-1 y RED-2 — más que cualquier otro |
| 2 | **CASH-5A** · estados canónicos | Independiente del modelo; solo orden de fuente con CASH-1, ya cerrado |
| 3 | **CASH-4** · completar cash-out desde el escaneo | **El caso estrella.** Destraba CASH-2 y SAFE-1 |
| 4 | **CASH-9** · atribución del iniciador | Debe ir antes que CASH-8, que se rebasa sobre su split |
| 5 | **CASH-10** · KYC de ambos participantes, atómico | Debe ir antes que CASH-8 y KYC-2 |
| 6 | **RED-3** · sacar el punto exacto de discovery | Independiente. Destraba RED-2 y alimenta TRUST-1 |

Restricción explícita de los cuerpos: **CASH-5B y CASH-7 no se tocan en paralelo**, y **CASH-8 no
se toca en paralelo con CASH-9 ni CASH-10**.

### Fase B — consumidores (se abren al cerrar la Fase A)

| # | issue | espera a |
|---|---|---|
| 7 | **CASH-6** · reembolso tras `expires_at` | CASH-7 |
| 8 | **CASH-5B** · acciones de `revealing` por flujo y actor | CASH-5A + CASH-7 |
| 9 | **CASH-2** · cancelación y recuperación flow-aware | CASH-4 |
| 10 | **KYC-1** · Didit usable en el APK | CASH-7 |
| 11 | **KYC-2** · volumen del anchor sobre órdenes | CASH-10 |
| 12 | **SAFE-1** · disputas honestas y no custodias | CASH-4 |

### Fase C — bloqueada por RED-1 (externo)

| # | issue | espera a |
|---|---|---|
| 13 | **CASH-3** · cash-outs en la bandeja del proveedor | RED-1 + CASH-5A + CASH-7 |
| 14 | **CASH-8** · política del proveedor vía `provider_id` | RED-1 + CASH-9 + CASH-10 |
| 15 | **RED-2** · incorporación a Red MicoPay en el APK | RED-1 + RED-3 + KYC-1 + CASH-7 |

### Fase D — confianza (al final, por diseño)

| # | issue | espera a |
|---|---|---|
| 16 | **TRUST-1** · una reputación por persona | CASH-3, CASH-4, CASH-8, CASH-9, KYC-1, RED-3 |
| 17 | **TRUST-2** · límites de exposición progresivos | TRUST-1, CASH-5A, CASH-8, CASH-9, CASH-10 |

---

## 3. El riesgo principal: RED-1

**RED-1 es el único issue asignado fuera y bloquea tres issues de forma directa** (CASH-3,
CASH-8, RED-2) y dos más de forma transitiva (TRUST-1, TRUST-2). Es un tercio de la cola
detenido detrás de un contribuidor externo.

Estado al 2026-09-04: PR #373, dos bloqueantes cerrados y uno abierto —
`testUnpauseNotEnrolledStaysFalse` no afirma nada sobre `merchant_available`, así que el
`CASE WHEN provider_status = 'active'` sigue sin quedar fijado.

Y hay una consecuencia de producto: **sin RED-1 el cash-out no cierra de punta a punta.** CASH-4
hace que el escaneo del proveedor libere el escrow, pero CASH-3 —que es lo que hace que la
operación aparezca en su bandeja— depende de RED-1.

Decisión a tomar: esperar a que sasasamaes cierre el último bloqueante, o retomar RED-1
internamente como se hizo con CASH-1. **Recomendación: fijar una fecha.** Si RED-1 no está
mergeado al cerrar la Fase A, se retoma internamente; para entonces la Fase A ya habrá tocado
`abuse.service.ts` y `merchant.service.ts`, que es donde RED-1 vive, y el costo de rebase crece.

---

## 4. Definición de terminado

El estándar es el que se aplicó a CASH-1 en el PR #377, no menos:

- **Los criterios de aceptación se prueban, no se afirman.** Si un criterio dice que la base de
  datos rechaza una fila, hay que insertarla a mano y mostrar la constraint disparando.
- **Postgres real cuando el criterio lo exige.** El shim en memoria de `src/db/schema.ts` no tiene
  esquema y no evalúa constraints ni `CASE`. Levantar Postgres en Docker:
  ```bash
  docker run -d --name mp-pg -e POSTGRES_PASSWORD=x -e POSTGRES_DB=micopay -p 55432:5432 postgres:16-alpine
  DATABASE_URL=postgres://postgres:x@localhost:55432/micopay npm run migrate
  ```
- **Los tests deben fallar si se revierte el arreglo.** Un test que pasa igual contra `main` no
  prueba nada. Es el defecto que se encontró en #373 y en el PR #41 de micopaybridge.
- **CI verde no es verificación.** El CI corre `tsc` en backend y build+vitest en frontend; no
  levanta Postgres ni corre la suite del backend. Los suites del backend se corren a mano.
- **Decir qué no se verificó.** Si algo no se pudo probar, se dice en el PR.
- **Migraciones con up y down**, en `micopay/sql/migrations/`, y `init.sql` describiendo el mismo
  esquema. Verificar comparando dos bases que lleguen por caminos distintos.

---

## 5. Lo que este plan no cubre

- **RED-1 (#371)** — asignado a sasasamaes.
- **#375** — «RED-1 follow-up: pantalla de ajustes para proveedores no inscritos». Publicado y sin
  asignar; entra con RED-2 en la Fase C.
- **`App.tsx:1027`** — la compuerta de respaldo previa a operar **sigue copiando la llave secreta
  al portapapeles**. El arreglo de #378 recableó `Profile` y `Register`, pero no este tercer
  flujo, que se agregó después. `ExportSecretKeyModal.tsx` también sigue copiando. No pertenece a
  la auditoría del cash-out, pero es deuda de seguridad viva y conviene cerrarla antes que la
  Fase B.
- **Escrow multi-activo** — plan aparte en
  [`MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md`](./MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md).
- **`fix/p0-1-p0-2-single-identity-real-counterparty`** — 16 commits sobre `apps/api` y
  `circuits`, la línea de ZK. Es otro producto; requiere su propia decisión.

---

## 6. Estado del repositorio al crear este plan

Ramas remotas tras la limpieza del 2026-09-04: **`main`** y
**`fix/p0-1-p0-2-single-identity-real-counterparty`**. Se eliminaron 18 ramas —14 completamente
mergeadas y 4 cuyo contenido ya estaba absorbido, verificado commit por commit antes de borrar.

Issues abiertos: **#371** (RED-1, asignado) y **#375** (follow-up, sin asignar).
