# Auditoría del plan de selector de activo

**Dictamen:** viable con correcciones antes de implementar. Auditoría local del código; no certifica el despliegue actual, CloudWatch, la base remota ni el estado actual del contrato. No se modificó código de producto ni el plan original.

## Hallazgos por prioridad

### P1 — La cantidad total bloqueada incluye comisión

WP-D y la definición de terminado equiparan `amount_stroops` con todo lo bloqueado. El contrato transfiere `amount + platform_fee` al bloquear y reembolsa esa suma; al completar transfiere solo `amount` al comprador y la comisión a su destinatario (`micopay/contracts/escrow/src/lib.rs:79`, `:175`, `:233`). El backend calcula la comisión en unidades del activo mediante `stroopsAtFrozenRate` en `trade.service.ts:577` y `:624`.

**Corregir:** distinguir monto de la operación, comisión y total retenido. Para afirmar “total bloqueado” y cotejar la transferencia del explorer, usar la suma exacta calculada en backend. Exponer la comisión en unidades mínimas y el total si la UI los necesita, sin recalcularlos con flotantes. En depósito, el monto que recibe el comprador y el total que bloquea el agente son cifras distintas.

### P1 — Validación defensiva incompleta

WP-A pide una aserción “en lock”, pero existen `prepareLockTrade` y `lockTrade` (`micopay/backend/src/services/trade.service.ts:546`, `:585`). Ambas deben rechazar activos incompatibles antes de construir o enviar transacciones, también en modo mock. Validar solo en el endpoint deja las llamadas directas al servicio sin protección.

**Corregir:** normalizar y comprobar el activo al principio de `createTrade`, antes de KYC, generación del secreto (`:266`), conversión, transacción y avisos. Aplicar la misma política en la ruta HTTP y probar llamadas directas. `SupportedAsset` incluye USDC/MXNE: el tipo por sí solo no restringe a activos habilitados. Probar explícitamente ambos endpoints de lock y ausencia de llamadas a Stellar para registros inconsistentes.

### P1 — Éxito descarta los datos que ya obtuvo del servidor

`micopay/frontend/src/App.tsx:515` obtiene el detalle y `:554` prepara un objeto `trade`, pero `:572` pasa a `SuccessScreen` otro objeto construido con estado local, porcentajes fijos y fechas nuevas. Por eso el problema de éxito no se limita a los porcentajes.

**Corregir WP-D:** conectar los datos reales de la operación a la pantalla y conservar activo, unidades mínimas y tasa en todos los adaptadores. La fórmula de comisiones puede registrarse como bug independiente, pero el transporte de datos reales es dependencia de este plan. El backend usa 0.8% con redondeo hacia arriba (`services/tradeFees.ts:30`, `:68`); cashout usa 1% en ese objeto y depósito omite el redondeo.

### P2 — Faltan pantallas y campos en WP-B/D/E

- La confirmación final usa `pages/TradeConfirmation.tsx`, conectada desde `App.tsx:354`; es distinta de `components/TradeConfirmation.tsx`. Incluir ambas donde corresponda. D1 justifica elegir antes del agente, pero no toda confirmación ocurre después de elegirlo.
- `pages/TradeCancelled.tsx:32`, `:54`, `:59`, `:78` todavía afirma USDC. Agregarla a WP-E y sus pruebas.
- `TradeData` (`services/api.ts:131`) tampoco declara `amount_stroops`. Añadirlo como cadena decimal, además de activo y tasa. Revisar `TradeDetailResponse`, `TradeHistoryItem` y adaptadores. El historial backend selecciona columnas explícitas y no incluye activo/tasa/unidades (`trade.service.ts:510`): no asumir que todas las respuestas hacen `SELECT *`.
- No decir “bloqueados” solo por tener un activo y cantidad: una operación `pending` puede no haber bloqueado nada; una completada ya liberó fondos. Probar estados y evidencia de bloqueo, además del código del activo.

### P2 — La regla de compatibilidad de §4 está equivocada

`routes/trades.ts:49` sí tiene `additionalProperties: false`. Sin embargo, la configuración local elimina campos adicionales, en lugar de rechazarlos. `tests/tradeFlow.test.ts:165` ya lo documenta y prueba con `provider_id`; el comentario de la ruta que promete rechazo está desactualizado.

**Verificación ejecutada:** reproducción aislada con la instalación local de Fastify y el mismo esquema. Enviar `asset_code: 'USDC'` produjo una respuesta aceptada cuyo cuerpo ya no contenía `asset_code`. La reproducción no invocó el servicio ni creó operaciones.

**Corregir §4:** la compatibilidad depende también de la configuración del validador. Con el código local viejo, el campo se ignora y la operación sigue siendo XLM. Mantener backend → APK para asegurar el contrato nuevo de rechazo 422 y verificar la versión realmente desplegada; no atribuir un fallo al simple `additionalProperties: false`. No modificar globalmente AJV como parte de este cambio.

### P2 — Las pruebas propuestas necesitan precisar alcance

- Probar sin activo, XLM, minúsculas, activo deshabilitado y desconocido en ambos flujos; añadir null, cadena vacía y tipos incorrectos. Definir qué errores son 400 por esquema y cuáles 422 por política. La promesa “todo lo distinto de XLM da 422” no coincide literalmente con validación de tipo/longitud en esquema.
- La prueba de “sin volumen reservado” necesita PostgreSQL o instrumentación explícita de que no se invocó la reserva. El store en memoria omite la rama transaccional (`trade.service.ts:333-381`), por lo que consultar allí un ledger vacío no prueba CASH-10.
- Agregar pruebas de los dos locks, datos reales en éxito, confirmación final, cancelación, respuesta antigua sin metadatos y operaciones pending/completed.
- El test textual que prohíbe `USDC` en archivos enteros dará falsos positivos por comentarios existentes en QRReveal, TradeDetail y MerchantOfferCard. Comprobar texto renderizado o claves de traducción concretas, con una lista explícita de pantallas del producto.
- Agregar comprobación de tipos del frontend. Vitest por sí solo no sustituye esa validación.
- Para depósito de extremo a extremo hace falta un agente que efectivamente bloquee. Un teléfono basta solo si se documenta cómo participa la contraparte; recorrer pantallas no prueba el bloqueo real.

## Respuestas a las ocho preguntas

1. **Sí**, el selector en monto es coherente para ambos flujos: el cliente elige el activo que entrega en cashout o recibe en depósito. El agente sigue siendo quien bloquea en depósito. No confundir esto con filtrar liquidez, que queda pendiente.
2. **Sí.** `micopay/backend/src/index.ts:289` y `:485` insertan trades directamente en seeds, bajo `SEED_DEMO_DATA` (`:587`). Usan conversión 1:1 y omiten metadatos explícitos. Hay fixtures SQL y una llamada directa a `createTrade` en `tests/cashHandoff.test.ts:380`, que deberá adaptarse al nuevo input. `App.tsx:1158` construye trades de demostración locales. También existe otro backend en `apps/api`; no ampliar este cambio a ese producto automáticamente. No apareció otro llamador productivo del servicio de micopay en la búsqueda. Los seeds deben quedar identificados como sintéticos o usar datos coherentes; el guard en el servicio no cubre INSERT directos.
3. **Puede y debe ocurrir antes**, pero el plan debe fijar su ubicación al inicio del servicio, además de la validación HTTP. Actualmente el secreto se genera antes de convertir y la reserva se hace después del INSERT dentro de una transacción; los avisos ocurren después del commit. El limitador HTTP puede registrar intentos; “sin efectos” debe referirse a efectos de negocio.
4. **Sí tiene `additionalProperties: false`; no implica rechazo en esta configuración.** Ver reproducción y hallazgo de compatibilidad.
5. **ClaimQR corresponde a otro flujo de cobro por enlace**, aunque también mencione HTLC: usa `VITE_PROTOCOL_API_URL`, `amount_usdc` y `/api/v1/cash/request/:id` (`pages/ClaimQR.tsx:16-24`, `:80`). Ese contrato de respuesta pertenece a `apps/api/src/routes/cash.ts`. Dejarlo fuera de esta corrección; no renombrar su USDC a XLM por analogía. Esta separación no certifica que el otro producto funcione correctamente.
6. **Aceptable posponer la columna de red** mientras el backend solo permita XLM/Stellar. Documentar que la identidad de activos emitidos también requerirá issuer/contrato: código + red es una clave de catálogo, no una identidad on-chain suficiente para cualquier token.
7. **No encontré una conversión post-creación de unidades del activo en las pantallas principales revisadas**; actualmente casi todo se presenta en pesos. Sí hay datos monetarios locales post-creación en éxito (`App.tsx:576-577`) y se pasa `activeAmount` a QR (`:475`). Al agregar unidades, usar siempre los datos de la operación y no la tasa viva. No inventar metadatos para trades demo o respuestas antiguas.
8. **Sí: TradeCancelled** contiene los cuatro textos adicionales indicados arriba. También hay USDC en comentarios técnicos, términos, wallet, CETES, Blend y ClaimQR; no hacer un reemplazo global.

## Revalidación de P1–P14

| Punto | Resultado |
|---|---|
| P1 | TESTNET.md documenta contrato y SAC nativo. Imagen v12, migración remota y estado actual en cadena no verificados en esta auditoría. |
| P2 | Confirmado en el archivo de migración; incluye defaults XLM y tasa 1 para legado. |
| P3 | Confirmado: conversión con DEFAULT_ASSET en trade.service.ts:274. |
| P4 | Confirmado: XLM/USDC/MXNE en assetRate.service.ts:59-73. Usos de isSupportedAsset limitados al propio servicio y sus tests en la búsqueda. |
| P5 | Confirmado, con matiz de eliminación de propiedades extra. |
| P6 | Confirmado para detalle; faltan también unidades mínimas en el tipo. No generalizar al historial. |
| P7 | Confirmado en services/api.ts:320. |
| P8 | Confirmado: catálogo wallet incluye CETES, sin red ni habilitación. Mantener separado. |
| P9 | Confirmado: monto local en ambas pantallas, transferido al contexto al continuar. |
| P10 | Cliente confirmado en api.ts:558-559; valor de producción citado no revalidado. |
| P11 | Confirmado; lista incompleta por TradeCancelled. |
| P12 | Confirmado el texto, pero pertenece a otro flujo/API. |
| P13 | Confirmado; además se descarta el objeto obtenido del servidor. |
| P14 | Confirmado en ruta y deriveProviderId. |

## Mejoras menores de implementación

- Reutilizar `getXlmMxnRate`; `http` es privado en api.ts. Consultar la tasa al cambiar de activo y recalcular el equivalente localmente al cambiar el monto, sin una petición por cada tecla. Validar tasa finita y positiva y manejar respuestas obsoletas.
- Radios nativos deshabilitados simplifican teclado y accesibilidad. `aria-disabled` por sí solo no impide activación por teclado.
- Precisar “La tasa se fija al crear la operación”; hay más de una pantalla de confirmación y en depósito el agente bloquea posteriormente.
- Conservar el redondeo de unidades en backend; no usar el número de decimales de presentación como precisión del token.

## Evidencia y límites de ejecución

Se leyeron el plan, rutas, servicio, migración, contrato, tipos, pantallas y tests relacionados. Se ejecutó con éxito la reproducción aislada de eliminación de campos en Fastify. Se intentó ejecutar `tradeFlow.test.ts`, pero `tsx/esbuild` falló al iniciar un proceso con `spawn EPERM`; la suite no llegó a ejecutarse. No se reportan tests de integración en verde. No se consultaron credenciales, servicios remotos ni se hicieron commits o despliegues.
