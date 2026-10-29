# Plan · Comisiones con «efectivo en mano» (H5)

**Fecha:** 2026-09-24 · **Estado:** borrador v1, pendiente de auditoría de Codex
**Rama:** `feat/red-1-onboarding-interno`, encima de `42d859a` (H6)
**Origen:** hallazgo H5 de `docs/AUDITORIA_IMPLEMENTACION_SELECTOR_ACTIVO_2026-09-14.md`
**Bloquea:** el despliegue del selector de activo (WP-A a WP-F) y el APK que lo lleva.

---

## 1. El problema

El contrato de escrow solo conoce dos cifras: `amount` (lo que recibe el comprador
al liberar) y `platform_fee` (lo que va a la plataforma). La comisión del agente
**no existe para el contrato**.

Hoy el backend pone `amount = convertir(amount_mxn)` en los dos flujos
(`trade.service.ts:376`). Por eso la comisión del agente del 2026-09-05
(`tradeFees.ts`) solo existe en la base de datos:

| Flujo ($500, agente 1.5% = $8, plataforma 0.8% = $4) | Hoy en cadena | Lo que dice la app |
|---|---|---|
| **Retiro** (cliente bloquea, agente recibe XLM) | Cliente bloquea $504; agente recibe $500 en XLM | «Recibes $488 en efectivo» |
| **Depósito** (agente bloquea, cliente recibe XLM) | Agente bloquea $504; cliente recibe $500 en XLM | «Valor recibido $488» |

- **Retiro:** si el agente entrega $488, gana $12 en vez de $8. Si entrega $500, pierde $0.
  La app no le dice cuál de las dos cosas hacer.
- **Depósito:** el agente recibe $500 en billetes y suelta $504: **pierde $4** por operación.
  El recibo del cliente muestra «$488» y «166.67 XLM» (≈ $500) a la vez; esto es H5.

## 2. La regla (decisión de Eric del 2026-09-14)

> **El monto que escribe la persona es siempre el efectivo físico que cambia de mano.**

- **Retiro:** el cliente recibe exactamente ese monto en billetes; las comisiones van **encima**.
- **Depósito:** el cliente entrega exactamente ese monto; las comisiones se **descuentan**
  de lo que recibe en cripto.

El agente cobra su comisión completa en los dos flujos y la plataforma también. El
efectivo redondo evita dar cambio en la calle. **El contrato no se toca.**

## 3. Las cifras

Las comisiones se siguen calculando igual que ahora (`computeTradeFees`: `ceil` en
pesos enteros sobre `amount_mxn`). Lo que cambia es **qué cifra va al contrato**:

```
escrow_amount_mxn (lo que recibe el comprador del escrow)
  retiro:    amount_mxn + provider_fee_mxn
  deposito:  amount_mxn - provider_fee_mxn - platform_fee_mxn

amount_stroops        = convertir(escrow_amount_mxn)   a la tasa congelada
platform_fee_stroops  = convertir(platform_fee_mxn)    (sin cambio)
total bloqueado       = amount_stroops + platform_fee_stroops
```

Ejemplo con $500, agente al 1.5% y plataforma 0.8%, tasa 3.00 MXN/XLM:

| | Retiro | Depósito |
|---|---|---|
| Efectivo que cambia de mano | cliente **recibe** $500 | cliente **entrega** $500 |
| Quién bloquea | cliente: $512 ≈ 170.6666666 XLM | agente: $492 ≈ 164.0000000 XLM |
| `amount` → comprador | agente: $508 ≈ 169.3333333 XLM | cliente: $488 ≈ 162.6666667 XLM |
| `platform_fee` → plataforma | $4 ≈ 1.3333333 XLM | $4 ≈ 1.3333333 XLM |
| Neto del agente | +$8 (recibe 508, entrega 500) | +$8 (recibe 500, bloquea 492) |
| Lo que le cuesta al cliente | paga $512 por $500 | paga $500 por $488 |

La conversión de cada pierna es independiente (redondeo half-up de
`assetRate.service`), así que el total puede diferir en ±1 stroop de convertir la suma.
Se acepta: el contrato transfiere exactamente las dos piernas que recibe.

## 4. Paquetes de trabajo

### C-A · Backend: una sola función de liquidación

- `tradeFees.ts`: `computeTradeFees(amountMxn, providerRatePercent, flow)` devuelve,
  además de lo actual:
  - `escrowAmountMxn`: lo que recibe el comprador del escrow (fórmula de §3).
  - `sellerLocksMxn` = `escrowAmountMxn + platformFeeMxn`.
  - `clientPaysMxn` / `clientReceivesMxn`: retiro = `amount + comisiones` / `amount`
    (efectivo); depósito = `amount` (efectivo) / `amount − comisiones` (cripto).
  - `payoutMxn` pasa a significar **lo que recibe el cliente** (= `clientReceivesMxn`).
    En retiro deja de ser `amount − comisiones`.
- Se quita el tope que hacía «cuadrar» montos minúsculos. En depósito, si
  `escrowAmountMxn < 1` → 422 `AMOUNT_BELOW_FEES`. Con `min_trade_mxn = 100` no ocurre,
  pero el contrato rechaza `amount <= 0` y el backend debe fallar antes.
- `createTrade`: `amount_stroops = stroopsAtFrozenRate(escrowAmountMxn, rate)`. Hoy es la
  conversión de `amount_mxn`.
- Los locks (`trade.service.ts:681`, `:730`, `:745`) **no cambian**: ya leen
  `amount_stroops` de la fila. Una operación pendiente creada antes del despliegue se
  bloquea con las cifras con que se creó.

### C-B · Migración `2026092xxxxxxx_trade_fee_model`

```sql
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS fee_model          VARCHAR(24) NOT NULL DEFAULT 'amount_is_escrow',
  ADD COLUMN IF NOT EXISTS escrow_amount_mxn  INTEGER;
-- las nuevas se insertan con fee_model = 'cash_in_hand'
```

- Las operaciones existentes **no se reescriben**. Quedan marcadas `amount_is_escrow`
  porque así se liquidaron (misma política que `legacy_1to1_bug`).
- Con `.down.sql` y comentario de columna, como `20260905200000_trade_asset_rate`.
- El store en memoria parsea el INSERT de forma posicional: las columnas nuevas van al
  final y en el mismo orden que los marcadores.

### C-C · API

- `GET /trades/:id` y la respuesta de creación agregan `fee_model`, `escrow_amount_mxn`,
  `client_pays_mxn` y `client_receives_mxn`. Todas las calcula el servidor; la app no resta.
- `GET /merchants/available`: `flow` hoy es opcional y «reservado»
  (`routes/merchants.ts:32`). Ahora cambia el `payout_mxn`. **Propuesta:** sin `flow` se
  asume `deposit`. La app ya lo manda (`useMerchantsAvailable.ts:184`); hay que confirmar
  que ExploreMap manda `cashout`.

### C-D · Frontend

| Pantalla | Retiro | Depósito |
|---|---|---|
| Mapa / `MerchantOfferCard` | «Recibes $500 en efectivo · pagas $512» | «Entregas $500 · recibes $488» |
| `TradeConfirmation` | «Recibes en efectivo» = monto; «Pagas» = monto + comisiones + estimado XLM | «Entregas» = monto; «Recibes» = neto + estimado XLM |
| `SuccessScreen` | «Efectivo recibido $500» + «Pagaste 170.67 XLM» | «Efectivo entregado $500» + «Recibiste 162.67 XLM ($488)» |
| `MerchantInbox` (agente) | «Entregas $500 · recibes $508 en XLM» | «Recibes $500 · bloqueas $492 en XLM» |

- `MerchantOfferCard.tsx:106` calcula la comisión como `amount − payout`. Con la regla
  nueva sale $0 en retiro; hay que usar `provider_fee_mxn + platform_fee_mxn` del servidor.
- `TradeConfirmation.tsx:68-69` recalcula comisiones si faltan (`platformFeeMxnFromAmount`,
  `ceil`). Se quita ese respaldo: sin cifras del servidor no se muestra desglose.
- Revisar el saldo en retiro: el cliente necesita XLM por el **total** ($512) más la
  comisión de red, no por $500.
- Una operación `amount_is_escrow` se sigue mostrando con el desglose viejo, sin la línea
  «recibido» que causó H5.
- `TradeEscrowSummary` ya muestra `total_locked_stroops` del servidor y se corrige solo.

### C-E · Seeds y admin

- `index.ts:297` y `:499` calculan `Math.ceil(amount * 0.008)` a mano. Se cambia a
  `computeTradeFees(..., flow)` y se guarda `fee_model = 'cash_in_hand'`, para que el
  historial demo sea coherente.
- `admin.service.ts` solo lee `amount_stroops`, así que no cambia. Verificarlo con un test.

### C-F · Pruebas

- Unitarias de `computeTradeFees` por flujo con el ejemplo de §3 y estas propiedades, en
  una tabla de montos (100…10 000) y tarifas (0, 0.3, 1.5, 3):
  - bloqueado = recibe el comprador + plataforma;
  - neto del agente = `provider_fee_mxn` en los dos flujos;
  - efectivo = `amount_mxn` en los dos flujos.
- `createTrade` persiste `amount_stroops = convertir(escrow_amount_mxn)` por flujo.
- El recibo de depósito completo con las dos comisiones: es la prueba que pidió la
  auditoría y que hoy no existe.
- Una operación `amount_is_escrow` se sigue mostrando sin contradicción.
- **Testnet, obligatorio antes de desplegar:** un retiro y un depósito reales. En
  stellar.expert se comprueba que las tres transferencias (bloqueo, liberación al
  comprador y comisión a la plataforma) coincidan al stroop con `amount_stroops` y
  `platform_fee_stroops` de la fila.

## 5. Decisiones abiertas para Eric

1. **Límites y KYC:** ¿se miden sobre el efectivo (`amount_mxn`) o sobre lo que se mueve en
   cripto? En retiro difieren un 2.4% ($500 contra $512). *Recomiendo el efectivo:* es la
   cifra que ve el agente y la del límite diario de su caja.
2. **`flow` ausente en discovery:** ¿asumir `deposit` (compatible con APKs viejos) o devolver
   400? *Recomiendo asumir `deposit`* mientras exista un APK sin `flow`.
3. **APK viejo contra backend nuevo:** el APK del 2026-09-14 mostraría una comisión de $0 en
   el mapa de retiro. *Recomiendo* desplegar el backend y el APK nuevo el mismo día; en
   testnet no hay usuarios reales.

## 6. Orden

1. Auditoría de Codex sobre este plan → v1.1.
2. C-B → C-A → C-C → C-E, con sus pruebas, en commits separados.
3. C-D.
4. C-F en testnet (un retiro y un depósito) y revisión en el explorador.
5. Auditoría de implementación.
6. Push, despliegue del backend (`asset_code: "USDC"` → 422 y comprobación de `fee_model`),
   APK nuevo y prueba en el teléfono.

## Fuera de alcance

- Cambiar el contrato (por ejemplo, un tercer destinatario para el agente).
- Reescribir las operaciones existentes.
- USDC/MXNe (WP3).
- El listener de eventos de Soroban, que sigue apagado en producción.
