# Auditoría · El flujo de cash-out no cierra

**Fecha:** 2026-08-26
**Base verificada:** commit **`312e921053efe32f555d67bc1807a4e36cddc29a`**
(equivalía a `main` al momento de auditar; después de mergear #366, #367, #368, #369)
**Revisión:** v12, tras cerrar el preflight de datos de producción
**Estado:** revisión en curso; **nada publicado**. Hay 19 borradores locales en
[`docs/issues/2026-08-26/`](./issues/2026-08-26/README.md). Tras cerrar el preflight de datos el
2026-08-27, **`RED-1` y `CASH-1` quedan listos para revisión del maintainer**; el resto sigue
sujeto a las decisiones de producto y campaña de §10.
**Método:** lectura estática contra el SHA fijo. No se ejecutó la app. Ver §6 y §7.

---

## 0. Cómo verificar este documento

Todas las referencias son contra el **SHA fijo**, no contra `main` ni contra el árbol de
trabajo. `origin/main` es móvil y no sirve como ancla:

```bash
S=312e921053efe32f555d67bc1807a4e36cddc29a
git fetch origin main            # para tener el objeto localmente
git grep -n "<patrón>" $S -- <ruta>
git show $S:<ruta> | sed -n '<rango>p'
```

Comprobaciones base:

```bash
git grep -n "merchant-confirm" $S -- micopay/backend/src   # SÍ existe (routes/trades.ts:251)
git grep -n "WHERE t.seller_id = \$1" $S -- micopay/backend/src
git show $S:micopay/sql/init.sql | sed -n '43,75p'
```

Cada hallazgo dice cómo resultar falso. Si una comprobación da distinto, el hallazgo cae.

> **Correcciones de método acumuladas**
>
> - **v1 → v2.** Se leyó el árbol local (`fix/auditoria-apk-2026-08`, 02cebb3), **67 commits
>   detrás**, declarando que era `main`. H2 falso, líneas desfasadas.
> - **v2 → v3.** Se declaró un SHA fijo pero las instrucciones mandaban a `origin/main`, móvil.
> - **v3 → v4.** Dos afirmaciones sobre control de riesgo escritas sin leer las 2 líneas
>   anteriores al bloque citado (§3-H9-A·8), y una taxonomía que se contradecía a sí misma.
> - **v4 → v5.** Se describió un control de abuso por su cobertura ("invisible") en vez de por
>   su efecto real (falsa agregación), y se colgó CASH-10 de una dependencia que no tiene.
> - **v5 → v6.** Se revisaron el onboarding histórico #23, la identidad única #160 y la entrega
>   Didit #315. También se comprobó que el mutex de volumen KYC es local al proceso y que el
>   anchor contabiliza cotizaciones onramp, no órdenes; el offramp no contabiliza monto mensual.
> - **v6 → v7.** Se comprobó el contrato de ubicación pública (H14), la vinculación del webhook
>   Didit y la caché local (H12), y que la liberación real exige firma local del buyer: CASH-4 no
>   puede convertir al backend en custodio.
> - **v7 → v8.** Se revisaron reputación, límites progresivos y disputas después de fijar el
>   modelo de riesgo del efectivo. Aparecieron dos deudas independientes: el backend de disputas
>   no puede cumplir las resoluciones que anuncia (H15), y las tres nociones actuales de
>   reputación no producen una confianza única usable por ambas partes ni limitan la exposición
>   inicial (H16).
> - **v8 → v9.** Una verificación mecánica independiente confirmó H11-H16 y encontró deuda de
>   borde: discovery no filtra suspensión/baneo/pausa; no se había conectado el mutex local con
>   la topología ECS por verificar; §6 contradecía H15; había dos imprecisiones de alcance; y los
>   borradores habían perdido el mapa archivo:línea que evita propiedad solapada.
> - **v9 → v10.** La revisión posterior corrigió su propio reporte de solapes: había mezclado
>   rangos `This issue owns` con exclusiones `Do not edit`. Se confirmó que CASH-8/CASH-9 es el
>   cruce estructural de `assertCanCreateTrade`, deliberado y serializado. Se empezó a extender
>   el mapa a los 19 cuerpos.
> - **v10 → v11.** El cruce mecánico de los 145 rangos encontró dos solapes de fuente que el
>   grafo todavía no secuenciaba: CASH-1/CASH-10 y CASH-10/CASH-8. Quedaron ordenados como
>   CASH-1 → CASH-10 → CASH-8. También se sustituyeron referencias abreviadas ambiguas por rutas
>   completas en los borradores.
>
> Los cinco errores de método fueron detectados por Codex o el maintainer, ninguno por el autor.
> Ver §7.

---

## 1. Resumen

**Una operación de cash-out no se puede completar, y el cliente no tiene forma de recuperar su
dinero desde la app.**

El cliente bloquea fondos, la operación pasa a `revealing`, y ahí se queda:

- **No se completa.** El escáner del agente y su ruta existen, pero autoriza al rol equivocado,
  y aunque autorizara **no libera fondos**: solo quema el token y devuelve un resumen (H2).
- **El agente ni siquiera ve la operación** — la bandeja filtra por `seller_id` y en cash-out el
  agente es `buyer_id` (H1). Tampoco puede abrir el chat (H3).
- **No se cancela** con la configuración por defecto (H6).
- **No se reembolsa desde la app** (H7).

### Causas independientes, no una sola

| Causa | Explica |
|---|---|
| **H9-A · `seller_id === el comercio`** | H1, H2, H6, y 10 sitios backend |
| **H9-B · `buyer_id === el iniciador/cliente`** | 6 sitios backend, incluida la puerta KYC |
| **Vocabularios de estado divergentes y vistas sin actor** | H4, H5, H7 |
| **Deuda de UI/sesión** | H3, H8 |
| **Contabilidad KYC no transaccional** | H10, H13 |
| **Registro, pertenencia a Red MicoPay y disponibilidad mezclados** | H11 |
| **Didit existe como tubería pero no como recorrido usable en el APK** | H12 |
| **Discovery público conserva una dirección escrita potencialmente exacta** | H14 |
| **Disputas separadas de la realidad del escrow** | H15 |
| **Reputación fragmentada y sin límites progresivos** | H16 |

Corregir ambas suposiciones de H9 no basta: todavía quedan H2b/H2c, H3-H5, H7-H8 y H10-H16.

### Qué ya existe y qué falta

| Superficie | Ya existe en `312e921` | Falta o está roto |
|---|---|---|
| **Cash-out USDC → MXN efectivo** | selección de proveedor, creación de trade, lock/reveal, chat, claim token y ruta de escaneo | bandeja, autorización del agente, release real, estados, cancelación y reembolso no cierran juntos (H1-H7) |
| **Red MicoPay** | discovery/mapa, configuración de tasa/límites, ubicación backend, disponibilidad, inbox y reputación | incorporación/eligibilidad explícita; hoy toda cuenta nace “disponible” (H11) |
| **Ubicación del proveedor** | endpoint backend, rate limit y coordenadas públicas redondeadas | `address_text` sigue saliendo literalmente en discovery (H14); la UI de captura está en `1cf99eb` fuera de main y debe integrarse, no duplicarse |
| **KYC general (Didit)** | start/status/webhook, campos `kyc_level`, auditoría y pantalla parametrizable | no hay ruta/CTA Didit en el APK, no hubo prueba sandbox real y el gate está apagado por defecto (H12) |
| **KYC Etherfuse** | onboarding hosted separado para CETES/SPEI | no sustituye Didit; el volumen se cuenta en el punto equivocado (H13) |
| **Identidad/roles** | una cuenta y una wallet por dispositivo; roles escrow reales por trade | el frontend conserva `buyerUser`/`sellerUser` duplicados y confunde sesión con pertenencia a la red (H8/H11) |
| **Confianza y límites** | reputación pública de proveedor, reputación propia, límites configurables, controles de dispositivo/IP y auto-pausa | la reputación usa agregaciones incompatibles, no existe historial visible del cliente y el límite inicial de 50 000 MXN no depende de confianza (H16) |
| **Chat, soporte y disputas** | chat y tablas/rutas de disputa, rate limit, evidencia y panel administrativo | no hay CTA de disputa en el APK; abrirla falla contra el estado SQL y la resolución administrativa no coincide con el contrato (H15) |

Por tanto, **no hay que rediseñar mapa, cash-out ni Red MicoPay**. Hay que terminar sus uniones:
modelo explícito de flujo/proveedor, incorporación a la red, KYC general usable y consumidores
flow-aware.

Cada persona conserva **una identidad y una reputación** aunque cambie de función entre
operaciones. Internamente, los eventos sí deben registrar quién inició, proveyó, canceló o
incumplió para no castigar a la contraparte; esas etiquetas no crean historiales, perfiles ni
modos distintos en la experiencia de usuario.

KYC responde “sabemos quién es esta persona” y fija un techo regulatorio. La reputación única
responde “cómo se ha comportado en intercambios anteriores” y debe fijar un techo progresivo de
exposición. Son controles complementarios, no sustitutos.

El escrow multi-activo ya tiene un plan separado en
[`MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md`](./MULTI_ASSET_ESCROW_ONBOARDING_PLAN_2026-07.md).
No se convierte en issue desde esta auditoría: primero se cierra el caso estrella **USDC → MXN
efectivo**.

### Sobre el depósito

Cierra, pero no porque el flujo del agente funcione: cierra porque el **cliente** pulsa
`completeTrade` directamente desde `DepositQR`. El QR que esa pantalla genera es
`micopay://confirm` (`DepositQR.tsx:97`) y el parser del escáner **solo entiende
`micopay://release`** (`qrPayload.ts:76`, `MerchantInbox.tsx:264`). El camino del agente está
roto en los dos flujos; en depósito hay una alternativa que lo tapa.

---

## 2. Los dos flujos y quién es quién

`micopay/backend/src/routes/trades.ts:48-49`:

```ts
const sellerId = role === 'seller' ? callerId : counterparty_id;
const buyerId  = role === 'seller' ? counterparty_id : callerId;
```

`micopay/frontend/src/App.tsx:975,979`:

```ts
const handleOfferSelected        = (offerId) => runTradeFlow(offerId, 'seller'); // cash-out
const handleDepositOfferSelected = (offerId) => runTradeFlow(offerId, 'buyer');  // depósito
```

| | Depósito (`/chat-deposit`) | Cash-out (`/chat`) |
|---|---|---|
| El cliente entrega | efectivo | cripto |
| El cliente recibe | cripto | efectivo |
| Quién bloquea (escrow **seller**) | el agente | **el cliente** |
| Quién libera (escrow **buyer**) | el cliente | **el agente** |
| **Quién llama a `POST /trades`** | el cliente (= buyer) | el cliente (= **seller**) |

La última fila es la clave de H9-B: **el iniciador siempre es el cliente, pero solo en depósito
coincide con `buyer_id`.**

> **Nota central.** La tabla `trades` (`micopay/sql/init.sql:43-75`) **no tiene columna de flujo
> ni de comercio**. Solo `seller_id` y `buyer_id`. **No se puede saber, mirando una fila, si es
> cash-out o depósito.**

El issue #365 decía *"The agent is the seller"* — falso para cash-out. Ver §8.

---

## 3. Hallazgos

### H1 · Las operaciones de cash-out nunca aparecen en la bandeja del agente

**Confianza: alta.** `trade.service.ts:1174-1197`, consulta en `:1190`:

```sql
FROM trades t
JOIN users u ON t.buyer_id = u.id
WHERE t.seller_id = $1
  AND t.status = ANY($2)
```

Expuesta en `GET /merchants/me/trades` (`routes/trades.ts:273`). En cash-out el agente es
`buyer_id`. **Queda filtrado.**

---

### H2 · El escaneo del agente no puede completar un cash-out — por tres razones

**Confianza: alta.** Confirmado por Codex.

**a) Autoriza al rol equivocado.** `trade.service.ts:1245-1251`:

```ts
// 2. Scanning user must be the seller (merchant) for this trade
if (trade.seller_id !== merchantId) { throw new ForbiddenError('NOT_PARTICIPANT', ...); }
```

En cash-out el agente es `buyer_id`. **Escanear devuelve 403** con un mensaje falso.

**b) Aunque autorizara, no inicia la liberación.** El docstring lo dice
(`routes/trades.ts:248-249`): *"Devuelve el resumen — **no mueve fondos**"*. Quema el
`claim_token` (`:1282`) y devuelve un objeto de display (`:1288-1299`). **Nunca inicia el flujo
existente `prepare → firma local del buyer → completeTrade`**; devuelve
`trade.release_tx_hash ?? null`, que es `null`. El arreglo debe conservar el modelo no custodial:
el dispositivo del agente firma el XDR; el backend no posee su llave.

**c) Muestra el nombre equivocado.** `buyer_handle` sale de `trade.buyer_id` (`:1284-1287`). En
cash-out **ese es el propio agente**.

**El orden sí es correcto:** la autorización lanza en `:1245`, el consumo del token está en
`:1282`. **Un 403 no quema el QR del cliente.** Falta la prueba que lo fije: *no autorizado →
403 → participante autorizado reutiliza el mismo token con éxito*.

**Incumple #70**, criterio 4: *"App shows success only after a real backend response with
`release_tx_hash`"*.

---

### H3 · `MerchantInbox` no tiene camino al chat

**Confianza: alta.** `MerchantInbox.tsx:227-230`: dos props, `token` y `onBack`. Sin navegación
salvo "volver". **Causa independiente de H9.**

---

### H4 · Tres vocabularios de estado incompatibles

**Confianza: alta.**

| Origen | Estados |
|---|---|
| **Base de datos** (`init.sql:60-64`) | `pending`, `locked`, `revealing`, `completed`, `cancelled`, `expired`, `refunded` |
| **`TradeDetail`** (`switch (trade.status)`, `:856`) | espera `revealed`, que la base nunca emite |
| **`TradeStateBadge`** (`TRADE_STATES`, `:1-9`) | `locked`, **`pending_cash`**, **`revealed`**, `completed`, `cancelled`, `expired`, `refunded` |

`TradeStateBadge` inventa `pending_cash` y `revealed`, y **omite `pending` y `revealing`**.

**Consecuencia 1 — `RevealedView` es inalcanzable.** `TradeDetail.tsx:856` hace
`switch (trade.status)` crudo. `RevealedView` (`:250`) es la única pantalla fuera de `DepositQR`
que llama a `completeTrade`, y vive en `case 'revealed'` (`:872`). El backend escribe
`revealing` (`trade.service.ts:500`).

**Consecuencia 2 — `QRReveal` convierte silenciosamente.** `QRReveal.tsx:114-116`:

```ts
const fallbackState: TradeState = secretLoaded ? 'revealed' : 'locked';
const backendState = normalizeTradeState(activeTrade?.status, fallbackState);
```

`normalizeTradeState` (`TradeStateBadge.tsx:121-124`) devuelve el fallback si el valor no está
en su vocabulario. Como `revealing` **no** está, **todo `revealing` se vuelve `revealed`** para
display. No es un borde: es el camino normal.

**No basta con renombrar.** Los **dos** participantes reciben `revealing`. La pantalla debe
decidir **por actor y por flujo**:

- cliente / escrow-seller en cash-out → mostrar QR y esperar;
- agente / escrow-buyer en cash-out → validar entrega y completar.

**Incumple #19.**

---

### H5 · `RevealingView` — el estado que sí ocurre — tiene dos botones muertos

**Confianza: alta.** `TradeDetail.tsx:226-249`. "Ver mi QR de intercambio" (`:239`) y
"Abrir chat" (`:243`), **ninguno con `onClick`**. **Incumple #18.**

---

### H6 · La cancelación consulta la disponibilidad del participante equivocado

**Confianza: alta.** `trade.service.ts:954-958` (`revealing`) y `:935-941` (`locked`) usan
`getSellerMerchantRow(trade.seller_id)` + `isMerchantUnavailableForTrade` (`:38-53`), que
devuelve `sellerRow?.merchant_available === false`.

En cash-out `trade.seller_id` es **el cliente**.

**Con el valor por defecto** todos los usuarios tienen `merchant_available = true`
(`routes/users.ts:83-87`; columna `NOT NULL DEFAULT true` en `init.sql:19`), así que la
condición no se cumple y el cliente no puede cancelar. No es "nunca" — §4 muestra cómo
desbloquearse accidentalmente.

En `locked` el mensaje dice *"Only the buyer may cancel a locked trade before reveal"*: en
cash-out **el que cancela libremente es el agente**, y el cliente queda bloqueado.

**Incumple #20 y #31.**

---

### H7 · El reembolso existe pero ninguna pantalla lo ofrece en este estado

**Confianza: alta.** `refundTrade` exige participante, `lock_tx_hash` y vencimiento
(`trade.service.ts:1073`; 120 min por defecto). `TradeDetail.tsx:959` condiciona el diálogo a
`status === 'expired'` o `cancelled` con lock sin release. `expired` nunca se persiste. El
código lo dice (`:956`): *"'expired' is currently unreachable"*.

**Incumple #71.**

---

### H8 · `buyerUser` y `sellerUser` son siempre el mismo objeto

**Confianza: alta.** `App.tsx:857-858`, `:864-865`, `:871-872`, `:888-889`, `:902-903`,
`:908-909`. **Causa independiente de H9.**

---

### H9 · **Estructural** · Dos suposiciones de rol distintas, en 16 sitios

**Confianza: alta. Reestructurado en v4 tras revisión de Codex.**

> **Corrección de la v3.** La v3 agrupó los 13 sitios bajo "todos apuntan al cliente" — frase
> que **se contradecía con sus propios sitios 8, 10 y 11**, que apuntan al agente. Son **dos**
> errores estructurales opuestos, y mezclarlos hace imposible asignarlos a un dueño.

#### H9-A · `seller_id === el comercio` — 10 sitios, apuntan al **cliente**

| # | Qué | Dónde | Efecto en cash-out |
|---|---|---|---|
| 1 | Límite diario del comercio | `trade.service.ts:145` | Se le aplica al cliente |
| 2 | Bandera `merchant_unavailable` | `trade.service.ts:287-288` | Se calcula sobre el cliente |
| 3 | Notificación push al comercio | `trade.service.ts:260` | **Le llega al cliente**, con el nombre del agente como `buyerUsername` |
| 4 | Reputación interna | `trade.service.ts:737` | Se le acredita al cliente |
| 5 | Cancelación (`locked`, `revealing`) | `trade.service.ts:935-941`, `:954-958` | H6 |
| 6 | Bandeja del comercio | `trade.service.ts:1190` | H1 |
| 7 | Autorización del escaneo | `trade.service.ts:1245` | H2a |
| 8 | **Disponibilidad comercial** | `abuse.service.ts:248-261` | Se consulta `availability` / `merchant_available` **del cliente**, no del agente |
| 9 | Auto-pausa por cancelaciones/disputas | `abuse.service.ts:350-383`, `:465-476` | Pausa **al cliente** |
| 10 | Reputación pública | `merchant.service.ts:190-191` | Los cash-outs del agente **nunca cuentan** para su reputación mostrada |

> **Corrección importante sobre el sitio 8.** La v3 afirmaba que *"un agente suspendido sigue
> recibiendo cash-outs"*. **Es falso.** `assertCanCreateTrade` ejecuta antes
> (`abuse.service.ts:234-235`):
>
> ```ts
> await assertUserCanAct(buyerId);
> await assertUserCanAct(sellerId);
> ```
>
> y `assertUserCanAct` (`:106-131`) lanza si `is_suspended || is_banned`, sobre **ambos**. El
> agente suspendido **sí queda bloqueado**.
>
> El defecto real es más estrecho: `assertUserCanAct` selecciona `availability` pero **no la
> usa**; la disponibilidad comercial solo se evalúa en el bloque `:248-261`, sobre `sellerId`.
> **No es un hueco de suspensión; es un defecto de disponibilidad.**

#### H9-B · `buyer_id === el iniciador/cliente` — 6 sitios, apuntan al **agente**

Válido en depósito (el cliente llama y es buyer). **Falso en cash-out**, donde el cliente llama
y es *seller* (§2).

| # | Qué | Dónde | Efecto en cash-out |
|---|---|---|---|
| 11 | Huella de dispositivo | `abuse.service.ts:236` `touchUserDevice(buyerId, ctx)` | El dispositivo del solicitante se atribuye **al agente** |
| 12 | Límite diario por usuario | `abuse.service.ts:265` `countBuyerDailyTrades(buyerId)` | Solo cuenta al agente; **el cliente no tiene límite por usuario** |
| 13 | Detección de multicuenta por dispositivo/IP | `abuse.service.ts:199-220` (`WHERE buyer_id = $1`, `JOIN user_devices d ON d.user_id = t.buyer_id`) | **Falsa agregación**, ver nota abajo |
| 14 | Actor del evento de cuentas relacionadas | `abuse.service.ts:153` `actorUserId: buyerId` | Se audita al agente |
| 15 | Actor de la creación del trade | `trade.service.ts:248` `actor: buyerId` | Se audita al agente, no al solicitante real |
| 16 | **Puerta KYC y volumen mensual** | `trade.service.ts:193` `assertKycTierSufficient({ userId: buyerId, … })` | **Solo valida y contabiliza al agente. El cliente/seller, que es quien mueve los fondos, queda sin validar y sin contar en su tope mensual** |

> **Corrección importante sobre el sitio 16 (KYC).** La v3 lo listó como una política del
> comercio y sugería enrutarlo por `merchant_id`. **Encuadre equivocado.** KYC aplica a todos los
> participantes, no al comercio. El defecto es de **cobertura**: la puerta transaccional corre
> una sola vez y siempre sobre `buyer_id`, así que en cash-out el cliente ni se valida ni suma a
> su tope mensual acumulado.
>
> **No debe arreglarse leyendo `merchant_id`.** Es un incumplimiento de **#314** (puerta de nivel
> KYC) y **#316** (topes de volumen mensual), ambos cerrados y etiquetados `Maybe Rewarded` /
> `GrantFox OSS`.

> **Precisión sobre el sitio 13.** La v4 decía que el cliente queda *"invisible al control"*.
> **Inexacto.** El efecto es peor descrito así, y más raro:
>
> - `touchUserDevice(buyerId, ctx)` (sitio 11) graba el dispositivo **del solicitante** bajo el
>   `user_id` **del agente**. En cash-out, cada cliente que opera con un agente le agrega su
>   dispositivo a `user_devices` de ese agente.
> - El contador (`:193-208`) resuelve `device_id_hash` → conjunto de `user_id`, y cuenta trades
>   donde cada uno es `buyer_id`. Como el agente es `buyer_id` en todos sus cash-outs, el hash
>   del dispositivo de un cliente devuelve **el volumen de cash-outs del agente**.
>
> Efecto preciso: **falsa agregación** —todos los clientes de un agente quedan agrupados bajo
> ese agente— **y ausencia de seguimiento del mismo cliente entre agentes distintos**, porque el
> dispositivo del cliente nunca se graba bajo su propio `user_id` ni aparece como `buyer_id`.

Los sitios 12, 13 y 16 son los de mayor consecuencia: dos controles de abuso y una puerta de
cumplimiento que, en cash-out, **no se aplican correctamente a la persona que mueve el dinero**.

---

### H10 · El volumen KYC se contabiliza antes de que el trade exista

**Confianza: alta. Nuevo en v5; ampliado en v9 con la premisa de despliegue.**

`assertKycTierSufficient` **no es solo una validación: escribe.** Su propia documentación
(`kyc-gate.service.ts`, sobre `recordMonthlyVolumeAndCheckCap`) dice *"Atomic
check-and-increment"* y aclara que, en modo audit-only, *"the amount is still recorded"*.

En `createTrade` el orden es:

| Línea | Qué |
|---|---|
| `:189` | `assertCanCreateTrade(…)` — abuso y límites comerciales |
| `:193` | `assertKycTierSufficient({ userId: buyerId, … })` — **aquí se escribe el volumen** |
| `:195`, `:203` | lecturas de `seller` y `buyer` (pueden lanzar `NotFound`) |
| `:226` | `INSERT INTO trades` |

**Ya hoy, con un solo participante,** cualquier fallo entre `:193` y `:226` deja volumen
consumido por una operación que nunca existió.

**CASH-10 multiplica el problema.** Al validar a los dos participantes aparece esta secuencia:

```
se contabiliza volumen a A  →  B falla KYC  →  no se crea el trade
                            →  el volumen de A queda consumido
```

**Criterio obligatorio para CASH-10:** ningún participante debe acumular volumen si la operación
no llega a crearse. Validación sin escritura seguida de confirmación atómica, o transacción con
rollback seguro. Sin ese criterio, arreglar la cobertura empeora la contabilidad.

Además, `keyedMutex.ts:6-12` documenta que la exclusión mutua solo funciona **dentro de una
instancia Node**. Dos réplicas que comparten Postgres pueden leer el mismo total y escribir por
encima del tope. El criterio correcto es atomicidad e idempotencia **en base de datos**, ligada a
la operación, no únicamente un mutex en memoria.

El propio comentario justifica el mutex con *"this backend runs as a single instance today"*.
Esa premisa no se verificó contra el servicio ECS vivo. Un ALB no demuestra por sí solo que haya
más de una tarea, pero cualquier escalado o solapamiento durante despliegue rompe la premisa. El
preflight de CASH-10 debe registrar `desiredCount`, `runningCount` y la configuración de
despliegue real; aun confirmando una sola tarea hoy, #316 no debe depender de esa topología para
ser correcto.

---

### H11 · No existe una frontera real de incorporación a Red MicoPay

**Confianza: alta. Nuevo en v6; ampliado en v7 y v9.**

- El registro normal crea al usuario con `merchant_available = true`
  (`routes/users.ts:83-87`) y `init.sql:19` usa el mismo valor por defecto.
- No existe un estado de pertenencia a la red. Leer `/merchants/me/config` crea la configuración
  automáticamente (`merchant.service.ts:99-125`).
- Discovery filtra únicamente `merchant_available`, ubicación y límites; no filtra incorporación,
  KYC general, `availability`, `is_suspended` ni `is_banned`
  (`merchant.service.ts:194-199`). Un proveedor suspendido/baneado que conserve
  `merchant_available = true` sigue en el mapa y solo falla después de que el cliente lo elige e
  intenta crear el trade.
- `PATCH /users/me/availability` acepta `online|offline|paused`, pero solo actualiza el booleano
  `merchant_available` (`routes/users.ts:268-275`); no persiste la columna `availability` que
  luego consulta `abuse.service.ts`. Los dos estados pueden contradecirse.
- La auto-pausa llama `pauseUser`, que escribe `is_suspended = true` y
  `availability = 'paused'`, pero no cambia `merchant_available`
  (`abuse.service.ts:499-521`). Discovery no lee ninguno de los dos campos actualizados, así que
  el proveedor auto-pausado continúa visible y seleccionable. La pausa bloquea al crear el trade,
  pero no evita la mala selección ni el error tardío.
- `App.tsx` asigna la misma sesión a `buyerUser` y `sellerUser`; `BottomNav` interpreta
  `!!sellerUser` como “es comercio”, por lo que toda cuenta autenticada ve superficie de agente.
- Home y MerchantSettings leen `verification_status`, campo que no existe en
  `CurrentUserProfile`; la identidad KYC real vive en `kyc_level`, `kyc_provider` y
  `kyc_level_verified_at`.

El issue cerrado #23 sí construyó un onboarding, pero en `apps/api`/`apps/web`, superficies fuera
del APK retail; `MerchantOnboarding.tsx` tampoco está montado en ninguna ruta de `apps/web` en el
SHA auditado. No cubre la incorporación a la red que usa `micopay/backend` +
`micopay/frontend`.

La captura de ubicación **sí existe fuera de main** en `feat/map-real` (`1cf99eb`) y fue integrada
en `feat/rediseno-rotulo` (`882d30f`). RED-2 debe reutilizar o portar ese trabajo, no volver a
construirlo. La exposición pública de coordenadas exactas fue reducida en main por `905cf77`
(redondeo aproximado a 110 m + rate limit), pero la respuesta todavía expone `address_text`
literalmente; H14 separa esa deuda de privacidad del onboarding.

**Decisión de producto:** cualquier persona puede solicitar pertenecer a Red MicoPay. No se
requiere ser una empresa y no se crea un modo permanente. Incorporación, KYC general y
disponibilidad comercial son estados distintos. RED-1 y RED-2 poseen este alcance.

---

### H12 · Didit tiene plomería, pero no un recorrido general con verdad de servidor

**Confianza: alta. Nuevo en v6; precisión de rutas corregida en v9.**

#315 añadió backend, webhook, status y el prop `provider` a `KYCScreen`. `App.tsx:1107-1108`
registra dos rutas relacionadas (`/kyc` y `/kyc-approved`), pero ninguna abre un recorrido Didit:
`KYCRoute` no pasa provider, así que usa Etherfuse por defecto, y al aprobar navega a `/cetes`
(`App.tsx:561-570`). No hay ruta ni CTA P2P que abra Didit.

El commit de #315 también declara que no se verificó contra un sandbox Didit real, aunque el
criterio del issue pedía la integración start → webhook → nivel. Por tanto hoy hay **plomería
general KYC**, no un producto KYC general terminado. KYC-1 posee este alcance y mantiene
Etherfuse separado para CETES/SPEI. Además, `KYC_GATE_ENABLED=false` en la configuración de
ejemplo y el código solo bloquea cuando se activa; actualmente funciona en modo audit-only.

La revisión completa encontró dos huecos adicionales dentro del mismo alcance de #315:

- `KYCScreen.tsx:74-80` lee un `approved` local y ejecuta `onApproved()` antes de consultar el
  estado backend. No salta por sí mismo la puerta transaccional del servidor, pero sí puede
  presentar o navegar como verificado a un usuario cuyo nivel expiró o fue revocado.
- La migración de `kyc_didit_sessions` dice que el webhook usará `session_id` para recuperar el
  usuario y nivel persistidos. La ruta no lo hace: actualiza la sesión por `session_id` y luego
  actualiza `users` desde `vendor_data` (`routes/kyc.ts:218-238`), sin exigir que la sesión exista
  ni que usuario/nivel coincidan con la fila almacenada. En el error además registra el cuerpo
  JSON completo (`:222-224`), que no debe asumirse libre de PII.

KYC-1 debe hacer que el backend sea la fuente de verdad, vincular cada decisión a la sesión
persistida, evitar degradaciones/revalidaciones accidentales y no registrar payloads KYC.

---

### H13 · El anchor cuenta cotizaciones onramp y omite volumen offramp

**Confianza: alta. Nuevo en v6.**

`POST /defi/ramp/quote` llama a `assertKycTierSufficient` (`ramp.ts:92-99`). Para onramp pasa el
monto MXN y por tanto **incrementa volumen al pedir una cotización**, antes de que la cotización
externa funcione y aunque nunca se cree una orden. Para offramp omite `amountMxn`, por lo que la
función ni siquiera ejecuta el contador mensual. `/defi/ramp/order` (`:133-167`) no corrige
ninguno de los dos casos.

Es una regresión independiente de #316. KYC-2 mueve la contabilidad al ciclo durable de la orden
y no mezcla el KYC propio de Etherfuse con el KYC general de Didit.

---

### H14 · Discovery redondea las coordenadas, pero publica `address_text` sin reducir

**Confianza: alta sobre el comportamiento; impacto condicionado por el contenido del campo.
Nuevo en v7.**

El arreglo de privacidad `905cf77` redondea `latitude` y `longitude` a tres decimales en
`getAvailableMerchants`, pero la misma respuesta conserva `address_text: r.address_text`
(`merchant.service.ts:223-230`). El endpoint `GET /merchants/available` es deliberadamente
público y no autenticado (`routes/merchants.ts:15-62`), y `DepositMap.tsx:291-294` muestra ese
texto. El campo se acepta como texto libre de hasta 200 caracteres en
`PATCH /merchants/me/location` (`routes/merchants.ts:119-150`). Puede contener solo una zona como
“Centro, CDMX”, pero también una calle o domicilio exacto; el backend no distingue ambos casos.

Tampoco se encontró en el SHA auditado una respuesta de trade que entregue coordenadas o
dirección exactas únicamente a sus participantes. Por eso no está implementado por completo el
contrato documentado en el commit —ubicación aproximada en discovery y exacta solo dentro de un
trade aceptado—.

**Decisión de producto pendiente:** una tienda puede querer publicar voluntariamente su dirección,
pero la Red MicoPay también admite personas que no deben exponer su domicilio. La propuesta de
RED-3 es separar un rótulo público no sensible (`area_label`) de un punto de encuentro exacto y
requerir consentimiento explícito para compartir este último dentro de una operación aceptada.
No debe asumirse todavía que toda dirección de tienda es pública ni que todo proveedor opera desde
su casa.

---

### H15 · La disputa anuncia una autoridad sobre los fondos que el backend no tiene

**Confianza: alta. Nuevo en v8.**

Las piezas existen —tabla `trade_disputes`, rutas para abrir casos, evidencia, rate limit y
resolución administrativa—, pero no forman un recorrido coherente:

- `trade-safety.ts:89` permite abrir una disputa en `completed`, mientras
  `abuse.service.ts:407` rechaza expresamente ese estado.
- `recordTradeDispute` inserta el caso y después intenta cambiar el trade a `disputed`
  (`abuse.service.ts:425-438`). El `CHECK` de `trades.status` no contiene `disputed`
  (`init.sql:60-64`) y no existe una migración que lo agregue. Las dos escrituras no están en una
  transacción: en PostgreSQL puede quedar el caso abierto aunque falle el cambio de estado.
- El APK no tiene cliente ni CTA para abrir o consultar disputas; solo hay traducciones de error.
- Las resoluciones administrativas se llaman `refund_buyer` y `release_seller`, al revés de la
  semántica del contrato. En producción todas llaman a `callRefundOnChain`
  (`admin.service.ts:221-270`), incluso la resolución que después registra `completed`.
- El contrato no tiene árbitro. `release` exige la firma del escrow buyer y paga al buyer;
  `refund` solo funciona después del timeout y siempre devuelve monto + comisión al seller
  (`contracts/micopay-escrow/src/lib.rs:132-226`). El administrador no puede ordenar ninguno de
  los dos resultados antes de tiempo.

Esto no significa que el contrato deba adivinar si hubo efectivo. Ese problema físico no tiene
oráculo. **El modelo no custodial es un invariante, no una decisión pendiente:** la disputa es un
expediente de soporte y reputación, nunca una orden administrativa sobre el dinero. Puede conservar
evidencia, pausar a una persona y guiar la recuperación, mientras los fondos siguen únicamente las
reglas del contrato: release firmado por el buyer o refund al seller después del timeout.

SAFE-1 elimina del backend y de la interfaz cualquier promesa de que soporte puede reasignar
fondos. No contempla introducir un árbitro, custodia administrativa ni una ruta alternativa para
decidir ganadores.

**Cómo falsarlo:** mostrar un modelo de caso separado y consistente, un cliente APK usable y
resoluciones administrativas que no afirmen ni escriban movimientos de fondos fuera de las
transacciones realmente confirmadas por el contrato.

---

### H16 · Hay tres reputaciones incompatibles y ninguna limita la primera exposición

**Confianza: alta. Nuevo en v8.**

Lo que hoy se llama reputación son tres cálculos distintos:

1. Discovery calcula `Nuevo/Bronce/Plata/Oro` en cada consulta, contando solo trades donde el
   usuario fue `seller_id` (`merchant.service.ts:190-211`). Por H9, los cash-outs completados por
   un proveedor —que es `buyer_id`— no aumentan su reputación; aumentan la del cliente.
2. `/users/me` calcula las mismas etiquetas, pero mezcla participaciones como buyer y seller
   (`routes/users.ts:127-155`). Es un dato propio, no la vista que recibe la contraparte.
3. Al completar un trade, `updateMerchantReputation` intenta escribir otra taxonomía
   (`espora/activo/experto/maestro`) en una tabla `merchants`
   (`trade.service.ts:737,763-848`). Esa tabla no existe en `init.sql` ni en las migraciones
   auditadas; el error se captura como no crítico. Discovery tampoco lee ese resultado.

Además, la bandeja del proveedor solo recibe handle, monto, estado y fecha
(`trade.service.ts:1174-1197`; `MerchantInbox.tsx:450-479`), y el detalle solo añade usernames y
disponibilidad (`trade.service.ts:284-299`). El proveedor que va a entregar efectivo no ve
historial del cliente, antigüedad ni una señal de identidad general verificada.

Los límites existentes tampoco forman una escalera de confianza:

- cada proveedor configura mínimo, máximo y capacidad diaria;
- el valor inicial permite **50 000 MXN por operación** y **250 000 MXN al día**
  (`merchant.service.ts:68-72`);
- el límite general del buyer permite 20 operaciones y 100 000 MXN diarios;
- ninguno baja la exposición de una persona nueva ni sube con operaciones exitosas;
- en cash-out se aplican además al participante equivocado por H9.

La reparación no debe crear identidades permanentes de “cliente” y “agente” ni dos puntajes. La
misma cuenta conserva **una reputación acumulada**. Los eventos internos usan `flow`,
`provider_id`, iniciador y actor responsable solo para atribuir correctamente cada resultado. La
contraparte ve señales mínimas de esa reputación única —identidad verificada, operaciones
completadas, tasa de cumplimiento, antigüedad y estado de confianza—, nunca documentos KYC ni
datos privados.

El monto efectivo permitido debe ser el menor entre: techo KYC de ambos participantes, techo
progresivo de reputación de ambos participantes, máximo elegido por el proveedor y capacidad
diaria restante. Es la misma regla para cualquier persona, sin importar qué función ocupa en esa
operación. Los valores concretos quedan configurables y pendientes de aprobación; no se hardcodean
desde esta auditoría.

TRUST-1 posee la reputación única y su visibilidad. TRUST-2 posee la escalera de exposición.
CASH-8/CASH-9 conservan únicamente la atribución técnica correcta; no crean reputaciones por rol.

**Cómo falsarlo:** mostrar una fuente canónica de reputación consumida por discovery y por ambos
participantes, y un control que reduzca el monto efectivo de una cuenta sin historial aunque el
proveedor haya configurado 50 000 MXN.

---

## 4. La cadena completa

1. El cliente elige agente → `createTrade(role: 'seller')` → es `seller_id`.
2. Bloquea fondos. `locked` → `revealing`.
3. `QRReveal.tsx:85-86`: *"Only the buyer can call release() — this device is the seller, so
   poll until the counterparty completes it"*. Polling cada 4 s.
4. El agente no ve la operación (**H1**), no puede abrir el chat (**H3**), su escaneo da 403 y
   aun pasando no libera (**H2**), y por Historial cae en botones muertos (**H5**) porque la
   pantalla útil es inalcanzable (**H4**).
5. El cliente no puede cancelar (**H6**) ni reembolsar desde la app (**H7**).

**La salida accidental:** el cliente se marca **no disponible** en configuración de comerciante,
y entonces H6 se invierte a su favor. Funciona por el bug, no por diseño.

---

## 5. Descartado

| Hipótesis | Cómo se descartó |
|---|---|
| El modo demo completa solo | `QRReveal.tsx` solo falsea el `qr_payload` si falla la carga del secreto. |
| Hay un proxy o rewrite delante | `services/api.ts:11` es `axios.create({ baseURL })` directo. |
| Un job completa las operaciones | Solo cumplimiento y barrido de reembolsos, que solo toma `cancelled`. |
| Ya está arreglado en un PR abierto | Ni #344 ni #364 lo tocan. |
| Un 403 en el escaneo quema el QR | Autorización en `:1245`, consumo en `:1282`. **No lo quema.** Falta la prueba. |
| ~~La ruta `merchant-confirm` no existe~~ | **Obsoleto (v1).** Existe. |
| ~~H9 es la causa raíz de todo~~ | **Obsoleto (v2).** |
| ~~Un agente suspendido puede recibir cash-outs~~ | **Obsoleto (v3).** `assertUserCanAct` corre sobre ambos en `:234-235`. |

---

## 6. Lo que **no** se verificó

- **No se ejecutó un cash-out de punta a punta con dos cuentas.**
- **No se probó contra Postgres real ni contra el store en memoria.**
- **Solo se revisaron los archivos del onboarding histórico #23 en `apps/web`/`apps/api`; no se
  auditó el resto de esas superficies.**
- **Sí se auditó estáticamente el fuente Rust del escrow para H15; no se verificó que su WASM/ID
  coincida con el contrato realmente desplegado ni se ejecutó una invocación on-chain.**
- **No se consultó el servicio ECS vivo:** quedan sin verificar `desiredCount`, `runningCount` y
  si una política de despliegue permite dos tareas simultáneas. Esta comprobación condiciona la
  premisa de instancia única del mutex en H10.
- **No se verificó el estado real de las recompensas** en Drips ni en GrantFox. Ver §8.

---

## 7. Fiabilidad de este documento

El autor (Claude) se equivocó **diez** veces sobre este mismo tema:

1. Issue #365: *"The agent is the seller"* — falso para cash-out.
2. *"No existe flujo de agente"* — impreciso.
3. *"Solo falta un botón"* — falso; el hueco es estructural.
4. **v1: leyó un árbol 67 commits viejo** declarando que era `main`.
5. **v2: declaró un SHA fijo pero mandó a verificar contra `origin/main`**, móvil.
6. **v2: H9 como causa raíz única**, y referencias inexistentes en H4.
7. **v3: afirmó un hueco de suspensión que no existe**, sin leer las 2 líneas anteriores al
   bloque que citaba.
8. **v3: encuadró KYC como política del comercio** y tituló la tabla *"todos apuntan al
   cliente"* contradiciendo tres de sus propias filas.
9. **v4: describió el control dispositivo/IP por su cobertura** ("el cliente es invisible")
   en vez de por su efecto real —falsa agregación bajo el agente—, y colgó CASH-10 de CASH-1
   sin comprobar que `createTrade` ya tiene ambos `userId` en alcance.
10. **v9: reportó solapes de propiedad inexistentes** porque mezcló las tablas `This issue owns`
    con las listas `Do not edit`; leyó coincidencias sin conservar su contexto inmediato.

Los errores 4, 5, 6, 7 y 10 son de método. **Los diez los detectó Codex o el maintainer, ninguno
el autor.** El patrón del 7 y el 10 es el más importante: se leyó un bloque o una coincidencia
sin su contexto inmediato y de ahí salió una afirmación falsa.

Vale la pena notar que **cuatro rondas de revisión no agotaron los hallazgos**: H10 —volumen KYC
consumido por operaciones que nunca se crean— apareció recién en la cuarta. Existe en la ruta de
código productiva aunque **no se verificó que haya usuarios u operaciones reales en producción**.

Esta v9 volvió a contrastarse estáticamente contra el SHA fijo. Aun así, debe tratarse como una
hipótesis verificable hasta ejecutar las pruebas de §6, no como evidencia de comportamiento en
producción.

Crédito: **@leocagli** detectó y reportó públicamente el error de roles de #365 antes de que se
abriera ningún PR, y preguntó si `revealing` entraba en alcance. Nadie le respondió. Esa
pregunta sin responder es H4/H7.

---

## 8. Riesgo de duplicar recompensas

Los issues cerrados siguientes cubren parte de estos alcances. Las correcciones deben declararse
como regresiones o criterios incumplidos; no se asume una segunda recompensa.

> **#75** ("Real buyer-merchant chat backend", cerrado) es **relacionado pero no imprescindible**
> mientras CASH-3 se limite a navegar hacia el chat sin modificar su funcionamiento interno. Si
> CASH-3 termina tocando el backend del chat, hay que citarlo también.

### Stellar Wave

| Issue | Título | Hallazgo que lo incumple |
|---|---|---|
| **#70** | Fix QR role model and merchant scan completion | **H2** |
| **#18** | Unified trade detail page (`/trade/:id`) across all states | H5, H4 |
| **#19** | Canonical trade state enum shared frontend and backend | H4 |
| **#20** | Cancel trade action with two-step confirmation and refund semantics | H6 |
| **#31** | Handle merchant-unavailable mid-trade with clear re-match option | H6, H9-A·8 |
| **#71** | Expired trade refund flow | H7 |
| **#24** | Merchant limits and rate configuration UI | H9-A·1 |
| **#76** | Push notifications for merchant incoming trades | H9-A·3 |
| **#87** | Real merchant reputation and verification data | H9-A·4, ·10; **H16** |
| **#82** | Abuse controls, device limits and P2P safety rules | H9-B·11, ·12, ·13, ·14; H9-A·8, ·9; **H15, H16** |
| **#2** | Persist audit log for trade state transitions | H9-B·14, ·15 |
| **#25** | Merchant trade inbox: incoming trades list with per-trade actions | **H1, H3** — criterio 4: *"Tap opens the existing trade detail (#18) or legacy chat screen"*; criterio 3: *"Row shows buyer handle"*, que en cash-out es el propio agente |
| **#160** | P0-1 + P0-2 — single device identity & real counterparty trade | **H8** — una identidad se conserva duplicada en estado con nombres de rol |

### GrantFox — campaña FWC26

| Issue | Título | Hallazgo que lo incumple |
|---|---|---|
| **#314** | [4a] Tiered KYC Gate Engine + Operation-Level Audit Trail | **H9-B·16** |
| **#315** | [4b] KYC Provider Integration — Didit | **H12** |
| **#316** | [4c] Monthly Cumulative Volume Caps per KYC Level | **H9-B·16, H10, H13** |

> **Terminología.** Se verificó que los issues citados existen y están **cerrados**; #314 y #316
> llevan la etiqueta `Maybe Rewarded`. **No se verificó en Drips ni en GrantFox si se
> pagaron.** Usar "cerrados y reward-eligible", no "pagados".

**Cada cuerpo nuevo debe identificarse como regresión o criterio incumplido del issue cerrado
que corresponda, citándolo.**

**Contexto, no duplicado:** #23 implementó onboarding en `apps/api`/`apps/web`, no en el APK
retail; RED-1/RED-2 deben citarlo. #355 conserva la navegación Etherfuse → CETES y KYC-1 no debe
regresarla.

**#365 ya fue corregido por PR #369**, mergeado en el propio SHA auditado. No queda un issue
pendiente sobre su cuerpo o banners.

---

## 9. Decisiones anteriores sustituidas

La cola v5 usaba `merchant_id`, dejaba la migración abierta y no separaba onboarding ni los dos
KYC. Se retiró de esta versión para evitar que un contribuidor implemente una propuesta obsoleta.
Este documento y sus cuerpos todavía están sin commit, por lo que no se afirma que la v5 esté
preservada en el historial Git.

---

## 10. Cola v11 en borrador — no publicar todavía

La cola vigente contiene **19 cuerpos en inglés**, uno por archivo, con alcance, exclusiones,
criterios, pruebas, dependencias, labels/milestone sugeridos y procedencia de campaña:

### Estado de cierre vivo

- [x] `origin/main` sigue en el SHA auditado `312e921` (reverificado el 2026-08-27).
- [x] Correcciones de la segunda revisión incorporadas: H11/ECS/§6/H12/alcance.
- [x] Mapas archivo:línea cerrados en los **19/19** cuerpos; los cruces reales incluyen orden
  explícito o una exclusión de rango.
- [x] Validación mecánica local corregida: los **19/19** mapas contienen **145 rangos `owns`**;
  las **113 referencias extraídas** resuelven contra `312e921` y ninguna excede las líneas del
  archivo. La cifra anterior de “100 referencias/rangos” mezclaba dos unidades y no era auditable.
- [x] Cruce propiedad/dependencias: los **24 pares con solape** quedan secuenciados; los dos que
  faltaban forman ahora la cadena de fuente CASH-1 → CASH-10 → CASH-8.
- [x] Las 13 referencias con línea que usaban nombres duplicados (`trade.service.ts`, `App.tsx`,
  `merchant.service.ts`) y la mención introductoria de `App.tsx` usan ya su ruta completa en los
  borradores; la comprobación de nombres ambiguos devuelve cero.
- [x] Metadatos públicos de GitHub reverificados el 2026-08-27: existen todos los labels
  sugeridos y siguen abiertos los milestones Wave 8 elegidos.
- [x] Búsqueda pública de duplicados por título exacto para `CASH-1`, `RED-1` y `RED-2`: cero
  coincidencias al 2026-08-27.
- [ ] Preflight de datos reales para CASH-1.
- [ ] Reautenticar `gh`; el token local de `ericmt-98` está vencido.
- [ ] Resolver bloqueantes de producto/campaña antes de publicar o asignar.

Esta lista se actualiza conforme se cierra cada pendiente. Tener un cuerpo redactado no significa
que sea publicable ni elegible para Drips.

- **CASH-1..10**, con CASH-5 dividido en A/B: reparación del recorrido H1-H10 salvo la
  reputación de H9-A·4/·10, que pasa a TRUST-1 para conservar un solo historial por persona.
- **RED-1/RED-2:** incorporación explícita a Red MicoPay sin convertir “comercio” en un rol
  permanente ni rediseñar los flujos existentes.
- **RED-3:** separar la zona pública del punto exacto compartido dentro de una operación.
- **KYC-1:** recorrido general Didit en el APK, separado de Etherfuse.
- **KYC-2:** contabilidad del anchor sobre órdenes durables, no cotizaciones.
- **SAFE-1:** convertir disputas en un expediente honesto de soporte/reputación, sin autoridad
  administrativa sobre los fondos.
- **TRUST-1:** una sola fuente de reputación por persona, con atribución interna correcta aunque
  cambie de función entre operaciones.
- **TRUST-2:** límites de exposición progresivos, subordinados también a KYC, configuración y
  capacidad disponible.

### Mapa de propiedad crítico contra `312e921`

| Dueño | Rango original | Regla de propiedad |
|---|---|---|
| **CASH-9** | `abuse.service.ts:225-313` | Es dueño de separar `assertCanCreateTrade` y de cambiar iniciador/dispositivo/límites (`:236-237`, `:265-312`). Mueve `:239-263` sin cambiar su política. |
| **CASH-8** | `abuse.service.ts:239-263` | Modifica la comprobación comercial **después** de que CASH-9 la extraiga; no edita el cuerpo mixto original. |
| **RED-1** | `merchant.service.ts:194-199`; `routes/users.ts:260-279`; `abuse.service.ts:499-544` | Es dueño de elegibilidad de discovery y persistencia canónica de pausa/disponibilidad. |
| **SAFE-1** | `abuse.service.ts:386-464` | Es dueño del ciclo del expediente de disputa; CASH-8 solo enruta el target del hook posterior `:465-476`. |
| **TRUST-1** | `merchant.service.ts:190-211`; `routes/users.ts:127-155`; `trade.service.ts:737,763-848` | Es dueño de reemplazar las tres reputaciones por una definición única. CASH-8 no reclama esas líneas. |
| **CASH-10** | `trade.service.ts:193`; `kyc-gate.service.ts` | Es dueño exclusivo de puerta y contabilidad KYC; CASH-8/CASH-9 no la enrutan por rol. |
| **CASH-1 → CASH-10** | `trade.service.ts:162-242` | No hay dependencia de producto, pero ambos modifican `createTrade`; el orden recomendado aterriza CASH-1 primero y prohíbe asignarlos sobre el mismo cuerpo sin rebase. |
| **CASH-10 → CASH-8** | `trade.service.ts:211` | CASH-10 aterriza primero su transacción; CASH-8 se rebasa después para enrutar la política del proveedor. No se asignan en paralelo. |
| **CASH-7 → CASH-3/5B/6/KYC-1** | `App.tsx`; props/token de `TradeDetail` | La sesión única aterriza antes que rutas, acciones o recuperación que consumen sus props. |
| **CASH-10 → KYC-2** | `kyc-gate.service.ts:78-245` | CASH-10 hace pura la decisión y crea el ledger; KYC-2 solo lo consume desde órdenes Etherfuse. |

Por la colisión anidada dentro de la función original, **CASH-8 y CASH-9 no pueden asignarse en
paralelo**. CASH-9 hace primero la separación estructural; CASH-8 consume después el helper de
proveedor. El orden de la otra colisión es CASH-1 → CASH-10 → CASH-8; tampoco se asignan sobre
el mismo `createTrade` sin rebase. Los demás
archivos compartidos se separan por campo/bloque o tienen una dependencia explícita en el índice.
Los mapas completos viven en cada cuerpo y deben conservarse al asignar.

### Decisiones cerradas de arquitectura y producto

1. Persistir `flow` y **`provider_id`**, no `merchant_id`.
2. `seller_id`/`buyer_id` conservan semántica de escrow.
3. Nuevos trades: `cashout → provider_id = buyer_id`; `deposit → provider_id = seller_id`, con
   restricción en base y derivación server-side.
4. No cargar deuda `legacy`: si el preflight confirma cero trades reales, limpiar/resembrar datos
   demo y dejar ambas columnas `NOT NULL`. Si aparecen filas ambiguas, la migración se detiene;
   no adivina.
5. Índice por `(provider_id, status)`, migraciones up/down y `init.sql` alineados.
6. **Confirmado por el maintainer (2026-08-27): no hay trades ni usuarios reales en producción.**
   Queda cerrada la decisión de arreglar el modelo de raíz: se limpian/resiembran los datos demo y
   ambas columnas nacen `NOT NULL`, sin ruta `legacy`. El preflight de la migración se conserva
   igualmente como aborto duro —si encuentra filas ambiguas, se detiene y no adivina—, porque es
   una salvaguarda de ejecución, no la decisión de producto.
7. **No custodia.** Soporte no puede liberar, reembolsar ni reasignar fondos. La única verdad es el
   contrato: release autorizado por el buyer o refund al seller tras timeout.
8. **Reputación única.** Una cuenta conserva un solo historial/puntaje visible. La atribución por
   iniciador/proveedor/actor es implementación interna para asignar responsabilidad correctamente.

### Decisiones pendientes antes de publicar

1. **Cancelación después del lock (CASH-2).** Antes del lock, cualquiera puede cancelar la
   reservación. Después, el seller no puede recuperar unilateralmente los fondos: puede solicitar
   cancelación y esperar timeout. La mejora propuesta —todavía sin issue— es un `decline` on-chain
   firmado únicamente por el buyer para renunciar y reembolsar al seller de inmediato. Después de
   la confirmación QR de entrega, la app ya no ofrece cancelar.
2. **Visibilidad de ubicación (RED-3).** Propuesta: discovery muestra zona aproximada; el punto
   exacto es privado por defecto y se comparte tras aceptar el trade. Una tienda puede publicar su
   fachada únicamente mediante consentimiento separado y explícito.
3. **Nivel requerido para activar Red MicoPay.** La arquitectura usa KYC general Didit para toda
   persona y nunca Etherfuse como sustituto. El nivel/umbral concreto y el momento de encender el
   gate siguen siendo configuración sujeta a decisión legal/operativa, no valores para hardcodear.
4. **Campaña/recompensa.** Resolver los solapes de §8 antes de aplicar `Stellar Wave` o mover una
   corrección GrantFox a Drips.
5. **Escalera de confianza (TRUST-1/TRUST-2).** Aprobar qué señales de la reputación única ve la
   contraparte y los techos iniciales/progresivos. La propuesta evita puntajes separados por rol:
   verificación, antigüedad, completadas y cumplimiento; los montos permanecen configurables.

### Regla de campaña

- **Trabajo nuevo candidato a Drips:** CASH-1, RED-1 y RED-2, una vez resueltos sus bloqueantes.
- **Privacidad RED-3:** borrador separado, pero su relación con el arreglo G1/PR #362 exige
  revisión de campaña antes de tratarlo como recompensa nueva.
- **Confianza SAFE-1/TRUST-1/TRUST-2:** borradores separados. TRUST-1/TRUST-2 siguen bloqueados
  por señales/montos de producto; SAFE-1 aplica el invariante no custodial ya cerrado. H15 y parte
  de H16 corrigen trabajo cerrado de seguridad/reputación; no reciben `Stellar Wave`
  automáticamente.
- **Regresiones de issues Stellar Wave cerrados:** pueden abrirse en GitHub, pero no reciben
  `Stellar Wave` automáticamente.
- **Correcciones de #314/#315/#316:** CASH-10, KYC-1 y KYC-2 permanecen internas/GrantFox hasta
  que el dueño de campaña decida; nunca se mezclan labels GrantFox y Drips.

El índice, grafo y orden de publicación están en
[`docs/issues/2026-08-26/README.md`](./issues/2026-08-26/README.md).
