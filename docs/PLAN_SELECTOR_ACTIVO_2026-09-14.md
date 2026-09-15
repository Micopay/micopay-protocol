# Plan de implementación: selector de activo en el flujo de operación

**Versión:** v2 · 2026-09-14 · **Rama base:** `feat/red-1-onboarding-interno`
**Estado:** corregido tras la auditoría
[`AUDITORIA_SELECTOR_ACTIVO_2026-09-14.md`](./AUDITORIA_SELECTOR_ACTIVO_2026-09-14.md). No hay código escrito.
**Relacionado:** `docs/MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md` (WP2 hecho; WP3/WP4 pendientes).

## Cambios respecto a v1

| Hallazgo de la auditoría | Qué cambió en v2 | Verificado por Claude |
|---|---|---|
| El contrato bloquea `amount + platform_fee` | Nuevo D9: tres cifras distintas. WP-A expone comisión y total en stroops; WP-D y §5 comparan el **total** | `contracts/escrow/src/lib.rs:79-82` (lock), `:176` (release solo `amount`), `:235` (refund `total`) |
| Validación solo en ruta y un único "lock" | WP-A: guard al **inicio** de `createTrade` + en `prepareLockTrade` **y** `lockTrade` | `trade.service.ts:546`, `:585` |
| Éxito descarta el detalle del servidor | WP-D incluye cablear el detalle real a `SuccessScreen` | `App.tsx:572-577` pasa un objeto local con `0.01`/`0.008` |
| Faltan `pages/TradeConfirmation.tsx` y `TradeCancelled.tsx` | Añadidas a WP-D y WP-E | `TradeCancelled.tsx:32,54,59,78` |
| `TradeData` sin `amount_stroops`; el historial no hace `SELECT *` | WP-B amplía tipos; el historial queda explícitamente fuera | `trade.service.ts:500-503` |
| §4 de compatibilidad equivocado | Reescrito: Fastify **descarta** los campos extra, no los rechaza | `tests/tradeFlow.test.ts` "client-supplied provider_id is stripped" — **pasa** en local (2026-09-14) |
| Pruebas imprecisas | §3 detalla 400 vs 422, CASH-10 contra PostgreSQL, sin test de grep global | |
| ClaimQR es otro producto | Fuera de alcance | `ClaimQR.tsx` usa `VITE_PROTOCOL_API_URL` / `apps/api` |
| Seeds insertan trades 1:1 directamente | Nuevo WP-F | `backend/src/index.ts:289`, `:485` |

---

## 0. Objetivo

Que el cliente vea **con qué activo** se respalda su operación, y dejar el selector listo para
activos y redes futuros (USDC, MXNe, XRP, USDC en otras redes) **sin rediseñar pantallas** cuando
se activen.

Alcance de este ciclo: **XLM en Stellar es el único activo habilitado.** Los demás aparecen
deshabilitados ("Próximamente"). El backend rechaza cualquier activo no habilitado, tanto al crear
como al bloquear.

No es objetivo: nuevas instancias del escrow (WP3), trustlines, otras redes, filtrar agentes por
liquidez, ni mainnet.

---

## 1. Punto de partida (verificado contra el código)

| # | Hecho | Dónde |
|---|---|---|
| P1 | El escrow `CB4M5777…O3HZ` bloquea **XLM nativo**. Producción: imagen `micopay-backend:v12`, migración `20260905200000_trade_asset_rate` aplicada (verificado por Claude en ECS/CloudWatch el 2026-09-14; la auditoría no lo revalidó). | `contracts/TESTNET.md`, `/ecs/micopay-backend` |
| P2 | `trades` tiene `asset_code` (default `'XLM'`), `rate_mxn`, `rate_source`, `rate_locked_at`. | `sql/migrations/20260905200000_trade_asset_rate.up.sql` |
| P3 | `createTrade` convierte siempre con `DEFAULT_ASSET`. | `trade.service.ts:274` |
| P4 | `isSupportedAsset`/`SupportedAsset` incluyen XLM, USDC y MXNE: **el tipo no restringe a habilitados**. Solo se usa dentro del propio servicio y sus tests. | `assetRate.service.ts:59-73` |
| P5 | `POST /trades`: `counterparty_id`, `amount_mxn` (100-50000), `flow`, `additionalProperties: false`, que con la configuración AJV por defecto **elimina** campos extra. | `routes/trades.ts:38-50` |
| P6 | `GET /trades/:id` hace `SELECT *`; `TradeData` no declara `asset_code`, `rate_mxn` ni `amount_stroops`. **El historial selecciona columnas explícitas** sin esos campos. | `trade.service.ts:435`, `:500-503`; `api.ts:131` |
| P7 | `api.createTrade` no envía activo. | `api.ts:320` |
| P8 | Catálogo de wallet sin red ni habilitación, incluye CETES. Se mantiene separado. | `constants/assets.ts` |
| P9 | Monto capturado en `CashoutRequest.tsx:54` y `DepositRequest.tsx:53`, pasado a `activeAmount` del contexto. | `App.tsx:223-273` |
| P10 | Cliente de tasa existente `getXlmMxnRate` (`http` es privado). | `api.ts:558-559` |
| P11 | Textos falsos "USDC" en `components/TradeConfirmation.tsx:48-49`, `components/CancelTradeDialog.tsx:79,103,108` y `pages/TradeCancelled.tsx:32,54,59,78`. | |
| P12 | `ClaimQR.tsx` pertenece al flujo de cobro por enlace de `apps/api`. **Fuera de alcance.** | `ClaimQR.tsx:16-24,80` |
| P13 | `SuccessScreen` recibe un objeto local (`activeAmount`, comisión 1%/0.8% sin redondeo, fechas nuevas) aunque `App.tsx:515` ya obtuvo el detalle real. El backend usa 0.8% con redondeo al alza. | `App.tsx:515-577`, `services/tradeFees.ts:30,68` |
| P14 | En `deposit` el **agente** bloquea; en `cashout`, el **cliente**. | `deriveProviderId`, `trade.service.ts:183-196` |
| P15 | El contrato transfiere `amount + platform_fee` al bloquear y al reembolsar; al liberar, `amount` al comprador y la comisión aparte. La comisión en stroops se calcula en backend con `stroopsAtFrozenRate`. | `lib.rs:79-82,176-180,235`; `trade.service.ts:578,624` |
| P16 | Seeds demo insertan trades directamente con conversión 1:1 y sin metadatos de activo, bajo `SEED_DEMO_DATA`. `App.tsx:1158` construye trades demo locales. | `index.ts:289,485,587` |

---

## 2. Decisiones de diseño

**D1. El activo lo elige el cliente en la pantalla de monto.** Cash-out: el activo que entrega.
Depósito: el activo que recibe; el agente sigue siendo quien bloquea. Elegirlo antes del agente
permite filtrar liquidez en el futuro (no en este ciclo).

**D2. Pregunta por flujo.** Cash-out: **"¿Con qué pagas?"** · Depósito: **"¿Qué quieres recibir?"**

**D3. El peso es el número principal.** Equivalente debajo: `≈ 153.22 XLM · 1 XLM = $3.26`.
Texto: **"Estimado. La tasa se fija al crear la operación."** Tras crearla, todo se pinta con los
datos congelados del servidor.

**D4. Clave de catálogo = red + código** (`stellar:XLM`). La API sigue enviando `asset_code`; no se
añade columna `network` mientras solo exista Stellar. **Límite documentado:** red + código no
identifica un token on-chain (los activos emitidos necesitan issuer o contrato); eso se resuelve en
WP3, cuando se habilite el primer activo emitido.

**D5. Opciones deshabilitadas visibles e inertes.** Radios nativos con `disabled` (no basta
`aria-disabled`), etiqueta "Próximamente". Lista: `XLM · Stellar` (habilitado), `USDC · Stellar`,
`MXNe · Stellar`, `XRP · XRPL`, `USDC · Solana`.

**D6. CETES fuera del selector.**

**D7. Una fuente de verdad por capa.** Backend: `ENABLED_ESCROW_ASSETS = ['XLM']`, distinto de
`isSupportedAsset`. Frontend: `ESCROW_ASSET_OPTIONS`.

**D8. Con un solo activo habilitado, el selector no añade pasos ni bloquea "Continuar".**

**D9. Tres cifras distintas, nunca intercambiables** (P15):

| Cifra | Qué es | Fuente |
|---|---|---|
| Monto de la operación | `amount_stroops`: lo que recibe el comprador al liberar | fila `trades` |
| Comisión de plataforma | `platform_fee_stroops` | backend, `stroopsAtFrozenRate` |
| **Total retenido** | `amount + platform_fee`: lo que sale de la cuenta de quien bloquea y lo que vuelve si hay reembolso | backend, suma en BigInt |

La UI nunca calcula estas cifras con flotantes: las recibe del servidor como cadenas decimales
enteras (stroops) y solo las formatea. "Bloqueado" se afirma **solo** si hay evidencia de bloqueo
(`lock_tx_hash` o estado posterior a lock) y la operación no está completada ni reembolsada.

---

## 3. Work packages

### WP-A · Backend: activo en creación, bloqueo y respuesta · ~1 día

**Archivos:** `services/assetRate.service.ts`, `routes/trades.ts`, `services/trade.service.ts`.

1. `assetRate.service.ts`: `ENABLED_ESCROW_ASSETS` y
   `assertEnabledEscrowAsset(raw: unknown): SupportedAsset`, que normaliza (trim + mayúsculas) y
   lanza `AssetNotEnabledError` si no está habilitado.
2. **`createTrade`: el guard es la primera instrucción**, antes de KYC, límites, generación del
   secreto HTLC (`:266`), conversión, transacción CASH-10 y avisos. `CreateTradeInput.assetCode`
   opcional (`undefined` → `DEFAULT_ASSET`), para no romper llamadores directos
   (`tests/cashHandoff.test.ts:380`).
3. `POST /trades`: schema añade `asset_code: { type: 'string', minLength: 1, maxLength: 12 }`.
   Contrato de errores:
   - **400** `INVALID_ASSET_CODE`: tipo incorrecto (`null`, número, booleano, objeto, arreglo),
     cadena vacía o en blanco, longitud > 12.
   - **422** `ASSET_NOT_ENABLED` (política): código con forma válida pero sin escrow (`USDC`, `FOO`).
   - Ausente → XLM.

   **Precisión v2.1 (tipos):** el AJV por defecto de Fastify corre con `coerceTypes`, que convierte
   `123` en `"123"` y `null` en `""` antes del schema. Así el schema solo no garantiza el 400. Un
   hook `preValidation` de la ruta valida el **tipo original** con `normalizeEscrowAssetCode` antes
   de esa conversión, sin tocar AJV globalmente. Comprobado con reinyección: sin el hook, `123`
   devuelve 422.
4. **`prepareLockTrade` y `lockTrade`**: al inicio, antes de construir o enviar cualquier
   transacción y antes del atajo mock, `assertLockableEscrowAsset(trade)`.

   **Precisión v2.1 (traducción explícita):** la política común, `assertEnabledEscrowAsset`, lanza
   `AssetNotEnabledError` (422). En el bloqueo, `assertLockableEscrowAsset` la **traduce** a
   `ConflictError` 409 `ASSET_ESCROW_MISMATCH`, porque la operación ya existe y el problema es un
   registro incoherente con el contrato, no una petición mal formada. **Sin default:** `asset_code`
   nulo o vacío es 409, no XLM. Tampoco se normaliza: un `'xlm'` guardado es incoherente, porque la
   creación siempre persiste el código normalizado. El default XLM existe solo en
   `resolveRequestedEscrowAsset`, para peticiones.
5. Respuesta de `GET /trades/:id` (y la de creación): añadir `platform_fee_stroops` y
   `total_locked_stroops` calculados en backend con la tasa congelada, serializados como **cadena**.
   `amount_stroops` también como cadena (hoy es BIGINT; verificar cómo lo serializa `pg`).

**Tests** (`tests/tradeAsset.test.ts`, script `test:trade-asset`):
- en **ambos flujos**: sin activo → XLM; `'xlm'` → XLM; `'USDC'` → 422; `'FOO'` → 422;
  `null`, `''`, `123`, 13 caracteres → 400;
- llamada **directa** a `createTrade` con `assetCode:'USDC'` lanza sin haber llamado a la
  generación del secreto ni al INSERT (espía/instrumentación);
- `prepareLockTrade` y `lockTrade` con una fila `asset_code='USDC'` → 409, y el espía de
  `stellar.service` registra **cero** llamadas;
- `total_locked_stroops === amount_stroops + platform_fee_stroops` exacto en BigInt;
- **CASH-10 sin volumen reservado ante 422: contra PostgreSQL 16 real** (el store en memoria omite
  la rama transaccional, `trade.service.ts:333-381`, así que allí no prueba nada);
- reinyección del defecto: quitar el guard de `createTrade` hace fallar el test directo; quitarlo de
  lock hace fallar el de cero llamadas.

### WP-B · Frontend: catálogo y tipos · ~0.25 día

**Archivos:** nuevo `constants/escrowAssets.ts`, `services/api.ts`.

1. `EscrowAssetOption { key, code, network, networkLabel, enabled, decimals }` y
   `ESCROW_ASSET_OPTIONS` (D5); `DEFAULT_ESCROW_ASSET_KEY = 'stellar:XLM'`. `decimals` es **solo de
   presentación**, no la precisión del token.
2. Tasa: función `getEscrowAssetRate(code)` en `api.ts` que para XLM reutiliza `getXlmMxnRate`, y
   valida que la tasa sea finita y > 0.
3. Tipos: `TradeData` y `TradeDetailResponse` declaran `asset_code?`, `rate_mxn?`,
   `amount_stroops?`, `platform_fee_stroops?`, `total_locked_stroops?` (cadenas). Revisar
   adaptadores que construyen `TradeData`/`TradeHistoryItem` a mano. **El historial no se amplía en
   este ciclo** (P6).
4. `createTrade(..., assetCode?)` envía `asset_code`.

**Tests:** invariantes del catálogo (un default, habilitado, claves únicas); tasa inválida
(`0`, `NaN`, negativa) rechazada.

### WP-C · Frontend: `AssetSelector` en las pantallas de monto · ~1 día

**Archivos:** nuevo `components/AssetSelector.tsx`, `pages/CashoutRequest.tsx`,
`pages/DepositRequest.tsx`, `App.tsx`, `i18n/{es,en}.json`.

1. `AssetSelector` (`flow`, `amountMxn`, `value`, `onChange`): `fieldset` + radios nativos;
   deshabilitados con `disabled`. Estilo Mercado/Rótulo, sin color por token.
2. Tasa: se pide **al montar y al cambiar de activo**, no por tecla; el equivalente se recalcula
   localmente al cambiar el monto. Ignorar respuestas obsoletas (id de petición o `AbortController`).
   Estados: cargando; error → ocultar equivalente y mostrar "No pudimos obtener la tasa; se fija al
   crear la operación", **sin bloquear Continuar**; monto vacío o < 100 → sin equivalente.
3. Insertarlo debajo de `AmountField` con el título de D2.
4. Contexto: `activeAssetKey`/`setActiveAssetKey`, default XLM, reinicio en `resetTradeFlow`; la
   llamada a `createTrade` (`App.tsx:~1127`) pasa el código.
5. i18n es/en: `asset.payWith`, `asset.receiveIn`, `asset.comingSoon`, `asset.estimate`,
   `asset.rateLocksOnCreate`, `asset.rateUnavailable`.

**Tests:** XLM preseleccionado; clic y teclado sobre deshabilitadas no cambian el valor; títulos por
flujo; tasa 3.263255 y $500 → "≈ 153.22 XLM"; error de tasa no bloquea Continuar; respuesta
obsoleta no sobrescribe la actual; `createTrade` recibe `'XLM'`.

### WP-D · Activo y cifras reales en el resto del flujo · ~1 día

**Archivos:** `components/TradeConfirmation.tsx`, **`pages/TradeConfirmation.tsx`** (confirmación
final, `App.tsx:354`), `components/MerchantOfferCard.tsx`, `pages/TradeDetail.tsx`,
`pages/QRReveal.tsx`, `pages/DepositChat.tsx`/`ChatRoom.tsx`, `pages/SuccessScreen.tsx`, `App.tsx`.

1. **Antes de crear** (monto, tarjeta de agente, ambas confirmaciones): activo elegido y equivalente
   **estimado**, rotulado como estimado.
2. **Después de crear** (detalle, QR, chat, éxito, cancelación): solo datos del servidor.
   - Cash-out, quien bloquea es el cliente: "Garantía: {total_locked} XLM (incluye comisión de
     {platform_fee} XLM)".
   - Depósito, el cliente recibe: "Recibirás {amount} XLM"; el total retenido es del agente y no se
     muestra al cliente como suyo.
   - "Bloqueado/en garantía" solo con evidencia de bloqueo y estado no terminal (D9).
3. **Éxito:** `SuccessScreen` recibe el detalle obtenido en `App.tsx:515`; el objeto local queda
   solo como respaldo mientras carga, **sin** comisiones calculadas (mostrar pesos del acuerdo y
   ocultar la comisión hasta tener el dato real). Esto elimina los porcentajes fijos de P13.
4. `QRReveal` recibe el monto de la operación, no `activeAmount` (`App.tsx:475`).
5. Operación sin metadatos (respuesta antigua, demo local de `App.tsx:1158`): solo pesos; no inventar
   activo.

**Tests:** cash-out y depósito pintan la cifra correcta de D9 para su rol; estados `pending` (sin
"bloqueado"), `locked` (con), `completed` (sin "en garantía"); éxito usa el detalle del servidor y no
muestra comisión mientras carga; confirmación final muestra el activo; respuesta sin `asset_code` no
pinta activo.

**Notas de implementación WP-D (2026-09-14):**
- **Desviación:** `MerchantOfferCard` **no** muestra el activo. Hacerlo obligaba a pasar el
  activo y la tasa por los dos mapas, y el activo ya aparece justo antes (pantalla de monto) y
  justo después (confirmación final, con estimado). Queda como candidato si la auditoría lo pide.
- `components/TradeConfirmation.tsx` no se importa en ningún sitio (código muerto). Se trata en
  WP-E: corregir su texto o eliminarlo.
- Operaciones `cancelled`/`expired` con `lock_tx_hash` y sin liberar muestran "En garantía" a
  quien bloqueó, porque los fondos siguen en el contrato. Es el mismo criterio que `ExpiredView`.
  Quien recibe no ve nada en esos casos ni en `refunded`.
- Éxito, además de usar el detalle del servidor: el neto sale de `payout_mxn` (antes
  `monto - comisión de plataforma`, que ignoraba la del agente); la comisión es agente +
  plataforma; el agente es el **proveedor** (antes `seller_username`, que en cash-out es la propia
  persona); sin nombre real no se inventa ("Farmacia Guadalupe"/"Tienda Don Pepe") y se oculta la
  calificación; las etiquetas "MXN enviados"/"MXNE recibidos" pasan a "Valor enviado"/"Valor
  recibido".
- El cálculo del estimado se extrajo a `hooks/useEscrowAssetEstimate.ts`, compartido por el
  selector y la confirmación.

### WP-E · Corregir textos falsos · ~0.25 día

1. Sustituir "USDC" por el activo real de la operación, o por "tu garantía" si aún no existe, vía
   i18n, en: `components/TradeConfirmation.tsx:48-49`, `components/CancelTradeDialog.tsx:79,103,108`,
   `pages/TradeCancelled.tsx:32,54,59,78`.
2. **No** hacer reemplazo global: USDC es legítimo en wallet, CETES, Blend, términos y ClaimQR.
3. Tests sobre **texto renderizado** de esas tres pantallas (con una operación XLM mockeada, no
   aparece "USDC"). Nada de grep sobre archivos: hay comentarios técnicos legítimos en QRReveal,
   TradeDetail y MerchantOfferCard.

**Notas de implementación WP-E (2026-09-14):**
- **Cambio de alcance, decidido por Eric:** `TradeCancelled.tsx`, `CancelTradeDialog.tsx` y
  `components/TradeConfirmation.tsx` resultaron ser **código muerto**: nadie los importa. La
  cancelación real vive en `TradeDetail`, que no nombra USDC. En vez de corregir textos que no se
  muestran, **se eliminaron**; siguen en el historial de git.
- Sí se mostraba "Tus MXNE ya están en tu billetera" (`success.depositSubtitle`) al terminar un
  depósito: pasa a "Tus fondos ya están en tu billetera".
- Test: `escrowAssetCopy.test.ts` revisa las secciones i18n del flujo y los literales de sus 15
  pantallas **sin comentarios**, para evitar los falsos positivos que señaló la auditoría.

### WP-F · Seeds demo coherentes · ~0.25 día

1. `index.ts:289` y `:485`: calcular `amount_stroops` con `convertMxnToAsset` o, si no hay tasa
   disponible al arrancar, marcar las filas con `rate_source = 'demo_seed_synthetic'` y la tasa
   usada, explícitas en el INSERT. No deben parecer operaciones reales convertidas.
2. Confirmar que `SEED_DEMO_DATA` está desactivado en producción (task definition) antes del
   despliegue.

---

## 4. Orden, compatibilidad y despliegue

`WP-A → WP-B → WP-C → WP-D → WP-E → WP-F`, un commit por WP.

**Compatibilidad (corregida):** Fastify con la configuración AJV por defecto **elimina** las
propiedades no declaradas en lugar de rechazarlas (`tests/tradeFlow.test.ts`, "client-supplied
provider_id is stripped", en verde local el 2026-09-14).
- **APK nuevo + backend viejo:** `asset_code` se descarta y la operación se crea en XLM. No se rompe,
  pero **no hay rechazo 422**; mientras solo XLM esté habilitado el resultado es el mismo.
- **APK viejo + backend nuevo:** sin `asset_code` → XLM. Compatible.
- **Orden recomendado: backend primero, luego APK**, para que el contrato 422 exista cuando llegue
  el cliente nuevo. Antes de publicar el APK, verificar la imagen desplegada y ejecutar contra ella
  `POST /trades` con `asset_code:'USDC'` → 422.
- No cambiar la configuración global de AJV como parte de este trabajo.

---

## 5. Definición de hecho

- [ ] Tests de WP-A en verde, incluida la prueba CASH-10 contra PostgreSQL y las dos reinyecciones.
- [ ] `tsc --noEmit` en backend **y frontend** sin errores; `vitest run` completo en verde.
- [ ] Cash-out en testnet: la transferencia de lock en el explorer es igual a
      `total_locked_stroops` de la operación, y el reembolso por vencimiento devuelve ese mismo total.
- [ ] Depósito en testnet con un agente que **bloquea de verdad** (agente demo con llave custodiada
      de testnet, aprobado el 2026-09-05, o segundo dispositivo). Documentar cuál se usó. Recorrer
      pantallas sin bloqueo real no cuenta.
- [ ] Contra el backend desplegado: `asset_code:'USDC'` → 422.
- [ ] Ninguna de las pantallas de WP-E muestra "USDC" para una operación XLM.
- [ ] APK release compilado y probado en dispositivo.

---

## 6. Riesgos y decisiones reversibles

| Riesgo | Mitigación |
|---|---|
| El usuario toma el estimado por precio garantizado. | "Estimado. La tasa se fija al crear la operación"; tras crearla, datos congelados. |
| Confundir monto con total retenido (P15). | D9 y tests por rol; cifras solo del servidor. |
| "Próximamente" genera expectativa. | Decisión de producto de Eric (2026-09-14). Reversible filtrando `enabled=false`. |
| Red + código no identifica tokens emitidos. | D4; resolver con issuer/contrato en WP3. |
| Sin columna `network`. | Migración `trades.network` default `'stellar'` antes de habilitar otra red. |
| El agente de depósito no tiene XLM suficiente. | Fuera de alcance; candidato a filtro de discovery. |
| INSERTs directos (seeds) saltan el guard del servicio. | WP-F y verificación de `SEED_DEMO_DATA` en producción. |

---

## 7. Fuera de alcance

- WP3 (instancias del escrow por activo), trustlines, XRPL, Solana, puentes.
- Filtrar agentes por activo o liquidez.
- Ampliar el historial con activo y cifras.
- `ClaimQR.tsx` y `apps/api`.
- Configuración global de AJV.
