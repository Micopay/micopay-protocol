# Plan de implementación: correcciones del escrow (auditoría 2026-10-29)

Fecha: 2026-10-29 (México). Base: `55da2f313d023bdc14679b494dc3e6047d7e7be8`.
Origen: [auditoría consolidada del escrow](../../audits/AUDITORIA_ESCROW_REFERENCIA_XRPL_2026-10-29.md) (H1-H4, N1-N4, D1-D3).
Relacionado: [plan APK y escrow seguro 2026-10-26](./PLAN_IMPLEMENTACION_APK_ESCROW_SEGURO_2026-10-26.md). Su fase 6 ya pedía calcular el hash antes de enviar y tratar el timeout como estado incierto; eso no se implementó y aquí queda como WP2. Sus listeners por contrato son la condición que habilita H1.

## Principios

- **El contrato no se toca** en WP0 a WP7. Todo se corrige en backend, base de datos y app. El contrato solo cambia en WP8, y solo si producto decide D1/D2.
- **La cadena es la fuente de verdad** de los fondos; la base de datos es la libreta. Ningún estado terminal (`completed`, `refunded`) se escribe sin evidencia del contrato correcto.
- **Identidad de una operación en cadena:** red + contrato + `trade_id`. Nunca solo `trade_id`.
- Cada WP se publica por PR a `main`, con pruebas, y se despliega primero en testnet.
- No borrar evidencia: secretos, constancias de efectivo y auditoría se conservan mientras haya una discrepancia abierta.

## Resumen

| WP | Hallazgos | Qué resuelve | Tamaño | Depende de |
|---|---|---|---|---|
| WP0 | — | Verificar producción y tomar decisiones | S | — |
| WP1 | H1, N2 | Que un evento ajeno no cierre una operación; que el agente no entregue efectivo sin poder cobrar | M | WP0 |
| WP2 | N1, N4 (parcial) | Que un lock lento no quede huérfano | M | WP1 |
| WP3 | H2 | Que el plazo de la app sea el de la cadena | M | WP1, WP2 |
| WP4 | H3, H4 | Que no se pierdan eventos | M | WP1 |
| WP5 | Adenda | Conciliación periódica contra la cadena | M | WP1, WP4 |
| WP6 | N3 | Comprobar al receptor antes del escaneo | S | WP1 |
| WP7 | N4, menores | Diagnóstico de errores y limpieza | S | — |
| WP8 | D1, D2, D3 | Contrato nuevo (opcional) | L | Decisión de producto |
| WP9 | — | Verificación de punta a punta y despliegue | M | WP1-WP6 |

Orden de despliegue: **WP0 → WP1 → WP2 → WP3 → WP4 → WP5 → WP6**. WP7 puede ir en cualquier momento. WP8 queda fuera del camino crítico.

---

## WP0: línea base y decisiones

**Verificaciones en producción** (solo lectura):
- [ ] Contratos que escucha el backend en AWS: valores reales de `ESCROW_CONTRACTS` y `ESCROW_LEGACY_CONTRACT_ID` en SSM, y log `[event-listener] Soroban event listeners active`. Si escucha más de uno, H1 es explotable hoy y WP1 pasa a hotfix.
- [ ] **Regla:** no agregar un segundo contrato en mainnet (por ejemplo USDC) antes de que WP1 esté en producción.
- [ ] Hash del WASM desplegado en cada contrato, comparado contra el build reproducible del commit base.
- [ ] Inventario de operaciones abiertas (`pending` con intento de lock, `locked`, `revealing`, `cancelled` con `lock_tx_hash`) por contrato.

**Decisiones de producto** (Eric, 2026-10-29):
- [x] **Margen mínimo en cadena para iniciar la entrega de efectivo: 20 minutos.** Configurable con `CASH_HANDOFF_MIN_MARGIN_MINUTES`.
- [ ] **Margen mínimo para aceptar un lock:** cuánto debe faltar para `expires_at` de la solicitud. Se decide en WP3.
- [x] **D1: se mantiene el contrato tal como está.** `release` sigue permitido después del plazo y compite con `refund`; no se adopta el corte de XRPL. Razón: en ambos flujos, quien libera (buyer) es quien ya entregó el efectivo, y el backend solo le entrega el secreto después de la constancia (cashout) o del reveal (depósito). Cortar la liberación tardía no protege al seller de nada (el buyer ya podía liberar desde el primer minuto) y deja sin salida al que pagó en efectivo. El riesgo residual se reduce con el margen de 20 min, la liberación inmediata tras el escaneo y D2.
- [x] **D2: el backend nunca reembolsa por su cuenta una operación con constancia de efectivo.** Ni el botón de reembolso de la app (`refundTrade` y `getRefundEligibility`) ni el sweep. La operación pasa a soporte. No impide una llamada directa al contrato; eso se atiende con soporte y reputación. Se implementa en WP1 (1d).

**Verificado el 2026-10-29:**
- [x] `https://api.micopay.app/health` indica `eventListenerState: "disabled"` y `eventListenerContracts: []`. El listener está apagado, así que **H1 no es explotable hoy en producción**. También significa que hoy no hay ninguna recuperación por eventos (N1 y WP5 suben de prioridad). **Regla:** no encender `EVENT_LISTENER_ENABLED` antes de WP1.
- [x] Producción (`api.micopay.app`) corre en testnet. El APK usa los contratos USDC `CALS46…` y XLM `CCX5E4…`.
- [x] El WASM desplegado en `CALS46…` y `CCX5E4…` es idéntico al build local de `55da2f3` (sha256 `6ec8aba7d201c6fec89e40a1437910fdc393d5b606370142ae115372afcf2693`, `stellar contract build` con stellar-cli 25.2.0). El legacy `CB4M…` (`062eb1bb…`) es la versión anterior, sin `decline`.
- [ ] Valores de `ESCROW_CONTRACTS` y `ESCROW_LEGACY_CONTRACT_ID` en la task definition de ECS, e inventario de operaciones abiertas: pendientes de una sesión de AWS.

Criterio de salida: configuración de producción documentada y decisiones registradas.

---

## WP1: identidad completa de eventos y escaneo seguro (H1 + N2)

### 1a. Evento ligado a su contrato

Estado (2026-10-29): implementado en la rama `fix/escrow-wp1-identidad-eventos` (92651ac), sin desplegar.

- [x] `event-listener.service.ts`: descarta y registra los eventos cuyo `contractId` (del RPC) no es el del listener, y pasa al dispatcher el contrato del listener.
- [x] Se descartan los eventos con `inSuccessfulContractCall === false` (el RPC los devuelve también para llamadas fallidas).
- [x] `event-dispatcher.service.ts`: `contractId` en `RawContractEvent` y `ParsedEscrowEvent`; sin contrato, el evento no se procesa.
- [x] `handleReleased` y `handleRefunded`: buscan por `contract_trade_id` y se quedan solo con la fila cuyo contrato coincide. Sin coincidencia, no tocan nada y registran el contrato; con más de una, registran el error y no aplican nada.
- [x] Filas legacy con `escrow_contract_id` nulo: se resuelven **en código** con `escrowContractForTrade` (`services/escrowContract.ts`), la misma regla que usa el resto del backend. Se descartó la migración de relleno y el índice único: el filtro por contrato ya evita el cruce, y un índice sobre filas rellenadas a mano añade riesgo sin cerrar nada más. Se reconsidera si 1c encuentra duplicados.
- [x] Clave de deduplicación: `evt:` + sha256(`{red}:{contrato}:{eventId}`) en base64url. Antes era `evt:{eventId}`.
- [x] Al arrancar (`services/escrowNetworkCheck.service.ts`, 38681e4), el RPC debe servir la red de `STELLAR_NETWORK` y cada contrato (por activo, legacy y decline) debe tener instancia en ella; si no, el arranque se detiene. Si el RPC no responde, se registra y se sigue, para no entrar en un ciclo de reinicios. Probado contra testnet y mainnet reales.

### 1b. Escaneo solo sobre operaciones cobrables

- `merchantConfirmScan` (`trade.service.ts:1971`): antes de consumir el claim token, exigir:
  1. `status === 'revealing'`; cualquier otro estado se rechaza con un código específico;
  2. `get_trade` en `escrow_contract_id`, con estado `Locked` y mismos seller, buyer y monto que la fila;
  3. margen: `(timeout_ledger - ledger actual) × segundos por ledger ≥ CASH_HANDOFF_MIN_MARGIN_MINUTES`.

  Si la consulta RPC falla, no se registra la entrega: "no se pudo confirmar, intenta de nuevo".
- La relectura de una entrega ya confirmada (`existingHandoff`) se mantiene, pero en una fila terminal debe mostrar el estado real, no la tarjeta de liberar.
- `frontend/src/pages/MerchantInbox.tsx` (`TradeConfirmationCard`): si `status` no es `revealing` ni `completed`, mostrar un estado de alto ("No entregues efectivo") en lugar de la confirmación normal. El backend ya rechaza; esto es defensa en la interfaz.

Estado (2026-10-29): implementado en 92651ac. La lectura en cadena está en `services/escrowCollectable.service.ts` y `readEscrowTrade` (`stellar.service.ts`). Solo `TradeNotFound` (#3) cuenta como "no existe"; cualquier otro error, un registro archivado o el RPC caído dan `ESCROW_UNVERIFIABLE` (503) y no se registra la entrega. El margen usa 5 s por ledger.

### 1d. Sin reembolso automático con constancia de efectivo (D2)

- `getRefundEligibility`: si existe `trade_cash_handoffs`, devolver `eligible: false` con la razón `cash_handoff_confirmed`.
- `refundTrade`: rechazar con `CASH_HANDOFF_CONFIRMED` y un mensaje que dirija a soporte.
- `sweepPendingRefunds`: excluir las filas con constancia (hoy no deberían llegar, porque `cancelTrade` ya las bloquea, pero se cubre por si acaso).
- Prueba: una operación vencida con constancia no es elegible, `refundTrade` falla y el sweep no la toca.

Estado (2026-10-29): implementado en 92651ac.

### 1c. Revisión de daños existentes (script de solo lectura)

- [x] Buscar filas `refunded` o `completed` cuyo evento de auditoría tenga `source: 'soroban_event'`. Para cada una, consultar `get_trade` en su propio contrato. Si allí sigue `Locked`, o el estado no coincide, es una posible víctima de H1: reportarla, no corregirla automáticamente.
- [x] Revisar `trade_cash_handoffs` sobre filas `refunded`.

**Resultado (2026-10-29).** Consultas en una transacción `READ ONLY`, desde una tarea suelta de ECS (task definition 33), y `get_trade` en testnet:
- **Sin daños de H1:**
  - ninguna fila de `audit_log` tiene `source: 'soroban_event'`, ni hay filas en `event_cursor`; el listener nunca aplicó un evento;
  - no hay filas `refunded`, ni constancias sobre filas `refunded` o `cancelled`, ni `contract_trade_id` duplicados.
- **Configuración de producción** (sin secretos), igual a la probada en la validación de red:
  - `ESCROW_CONTRACTS` USDC `CALS46…` y XLM `CCX5E4…`;
  - legacy `CB4M…`;
  - `EVENT_LISTENER_ENABLED=false`, TESTNET;
  - `CASH_HANDOFF_MIN_MARGIN_MINUTES` sin definir (20 por defecto).
- **Inventario de abiertas con lock:** 8 cashouts XLM (2 `locked` y 6 `revealing`), todos del contrato legacy (`escrow_contract_id` nulo) y vencidos entre el 5 y el 15 de septiembre.
  - En cadena siguen `Locked` en `CB4M…`, con plazos de los ledgers 4524852 a 4685159 (el actual es 5461428). Base y cadena coinciden.
  - Suman 29,267,855,289 stroops (2,926.7855289 XLM de testnet).
  - Ninguno tiene constancia de efectivo, así que el vendedor puede reembolsarlos; el sweep no los toca porque no están `cancelled`.
- **Otras 12 filas abiertas sin `lock_tx_hash`:** una por cada estado y flujo, creadas el 3 y el 4 de septiembre, sin contrato, sin `contract_trade_id` y sin `locked_at`. Son datos de prueba que nunca llegaron a la cadena.
- 26 filas `pending` sin lock.

**Pruebas:**
- Dispatcher con dos contratos y el mismo `trade_id`: un refund de B no modifica A; un evento con `contractId` distinto del listener se descarta.
- Escaneo sobre `refunded`, `cancelled`, `locked`, `pending` o `completed` sin entrega: falla, no consume el token y no crea la constancia.
- Escaneo con el escrow `Released` o `Refunded` en cadena aunque la base diga `revealing`: falla.
- Escaneo con margen insuficiente: falla.
- Testnet: reproducir el ataque de H1 con el contrato XLM y el legacy y comprobar que A no cambia.

Criterio de salida: todas las pruebas en verde, desplegado en testnet, script 1c ejecutado contra producción y su resultado documentado.

Avance (2026-10-29):
- Hecho:
  - pruebas del backend en verde: event-listener 30/30 (5 de las nuevas fallan contra el código anterior), cashHandoff, refund, refundEligibility, escrowCollectable (8) y el resto de suites;
  - `npm run build` limpio;
  - frontend 464/464, con `merchantInboxNotCollectable.test.tsx`, cuyo caso `refunded` falla contra la tarjeta anterior.
- H1 reproducido en testnet con eventos reales (`docs/audits/evidence/h1-testnet-2026-10-29.ts`). Se bloqueó el mismo `secret_hash` en el contrato XLM (A) y en el legacy (B) y se reembolsó B:
  - con `main` (55da2f3), A queda `refunded` y su propio release ya no la corrige;
  - con WP1, A sigue `revealing` y pasa a `completed` con su release; en cadena, A `Released` y B `Refunded`.
- **Desplegado el 2026-10-29:**
  - #471 se integró a `main` como 8fbfc17;
  - imagen `micopay-backend:escrow-wp1-20261029-215721`, construida desde un worktree limpio de 8fbfc17;
  - task definition 34 (igual a la 33, salvo la imagen).
- **El servicio quedó estable:**
  - el log muestra `Escrow contracts verified on network` con los 3 contratos;
  - `/health` está `ok` con la base conectada y el listener sigue `disabled`.
- **La imagen anterior** (`dex-20261027-213504`, rev 33) se construyó desde `e0c5bb7` con cambios sin commitear en `bank-withdraw`, `rampWithdraw.service` y `stellarDex.service`. Se comprobó que esos tres compilados son idénticos en `main` antes de reemplazarla.
- **Sin tareas en ejecución por unos 7 minutos** (22:03 a 22:10 hora de CDMX), por la configuración 100/0 del servicio.
- Script 1c ejecutado contra producción (resultado arriba).

---

## WP2: lock enviado nunca huérfano (N1)

**Estado (2026-10-30):** implementado en #472 (commit 180e26d), integrado como 98131b8 y **desplegado** el 2026-10-30 a las 00:45 (imagen `micopay-backend:escrow-wp2-20261030-004340`, construida desde una copia limpia; task def 35, que solo cambia la imagen respecto a la 34). La migración `20261029120000_trade_lock_attempt` se aplicó al arrancar; health ok, JWKS 200, sin errores en el arranque. Corte del despliegue: menos de 2 minutos (último 200 a las 00:46:22, primero a las 00:48:09), tras bajar `deregistration_delay` del target group de 300 a 20 s. Además de lo listado abajo: el ciclo `resolveSubmittedLocks` corre junto al sweep (cada 5 min) y, pasada la ventana de validez del XDR (180 s + 60 s), decide con `get_trade`. Pruebas: `test:lock-attempt` (8 casos).

- `submitLockTx` (`stellar.service.ts:219`): calcular `tx.hash()` del XDR firmado **antes** de enviarlo y devolverlo a `lockTrade`.
- `lockTrade`: persistir `lock_submitted_tx_hash` y `lock_submitted_at` antes de `sendTransaction`. La fila sigue `pending`; la app muestra "confirmando bloqueo".
- Distinguir los resultados de `sendTransaction`:
  - `PENDING` o `DUPLICATE`: seguir esperando;
  - `TRY_AGAIN_LATER`: no enviado; se permite reintentar con el mismo XDR;
  - `ERROR`: rechazo definitivo; se limpia el intento.
- Confirmar con `getTransaction` del RPC en lugar de, o además de, Horizon. Si se agota la espera, responder "pendiente de confirmación", no error definitivo.
- Evento `locked` en el dispatcher: si la fila está `pending`, coinciden contrato y `trade_id`, y seller, buyer y monto del evento son iguales a los de la fila, pasarla a `locked` con `lock_tx_hash = txHash` del evento. Cualquier diferencia se registra como discrepancia y no se aplica.
- `prepareLockTrade`: si hay un `lock_submitted_tx_hash` sin resolver, no construir un XDR nuevo; resolver antes el intento anterior (RPC y `get_trade`).
- `cancelTrade` sobre `pending` con un intento de lock sin resolver: cancelar el flujo, pero mantener la fila elegible para conciliación y sweep.
- Ligado a N4: si la simulación devuelve `Error(Contract, #10)`, consultar `get_trade` antes de decir que la operación ya existe.

**Migración:** columnas `lock_submitted_tx_hash`, `lock_submitted_at`.

**Pruebas:**
- RPC simulado que confirma después de que se agota la espera: la fila termina `locked` por el evento o por la conciliación, y se puede reembolsar desde la app.
- Un `TRY_AGAIN_LATER` no deja la fila marcada como enviada.
- Un evento `locked` con monto distinto no se aplica.

---

## WP3: un solo plazo, el de la cadena (H2)

- Persistir el vencimiento real de los fondos al confirmar el lock: columna `funds_timeout_ledger`, tomada del evento `locked` o de `get_trade`. Guardar también `funds_expires_at_estimate` solo para mostrar en la app, con la etiqueta "aprox.".
- `expires_at` queda como **caducidad de la solicitud** (hasta cuándo se puede bloquear). Deja de usarse para decidir reembolsos.
- `prepareLockTrade` y `lockTrade`: rechazar si a `expires_at` le falta menos que el margen de WP0.
- `getRefundEligibility`, `refundTrade` y `sweepPendingRefunds`: elegible si `ledger actual >= funds_timeout_ledger` (RPC). El reloj del servidor solo se usa para la cuenta regresiva aproximada.
- `getTradeSecret` y `merchantConfirmScan`: usar el margen en cadena (WP1b) en lugar de `expires_at`.
- La app muestra la cuenta regresiva estimada a partir de `funds_expires_at_estimate`, actualizada con la respuesta del servidor.
- Fuera de alcance: cambiar el contrato a timestamp absoluto (WP8).

**Migración:** `funds_timeout_ledger`, `funds_expires_at_estimate`, y relleno de las operaciones abiertas con `get_trade` mediante un script, no SQL puro.

**Pruebas:**
- Operación creada a las 12:00 y bloqueada a las 12:30: el reembolso no es elegible hasta el ledger del contrato.
- Lock a 1 minuto de `expires_at`: rechazado.
- La elegibilidad que ofrece la app coincide con lo que acepta el contrato en testnet, en el borde exacto del ledger.

---

## WP4: eventos durables y completos (H3 + H4)

- `db/schema.ts`: agregar `withTransaction(fn)` sobre `pool` (cliente dedicado, `BEGIN`/`COMMIT`/`ROLLBACK`). Revisar el store en memoria: si no soporta transacciones, documentar que el modo mock no las garantiza.
- La deduplicación y los efectos del evento (UPDATE y auditoría) van en **la misma transacción**. Si algo falla, no queda marca y el siguiente ciclo reintenta.
- `fetchEvents`: paginar con el `cursor` del RPC hasta agotar la página. Avanzar el cursor persistido **solo** hasta el último evento procesado con éxito; si un evento falla, detener el lote ahí.
- `event_cursor`: guardar también el cursor de paginación del RPC, además de `last_ledger`.
- Cursor fuera de la ventana del RPC: no reiniciar en silencio. Registrar una alerta, saltar al ledger actual **y** disparar la conciliación completa (WP5) de ese contrato.
- Métrica o log de lag por contrato (ledger actual menos cursor).

**Migración:** columna de cursor de paginación en `event_cursor`.

**Pruebas:**
- Fallo inyectado en el primer `dispatch`: el segundo intento aplica el evento una sola vez.
- 250 eventos, varios en el mismo ledger: se procesan todos y en orden.
- Cursor fuera de la ventana: se dispara la conciliación y queda la alerta.

---

## WP5: conciliación contra la cadena

Nuevo servicio `services/escrowReconciliation.service.ts`, en un intervalo como el del sweep (`index.ts`), configurable y desactivable.

- **Candidatas:**
  - filas `pending` con `lock_submitted_tx_hash`;
  - filas `locked`, `revealing` y `cancelled` con lock;
  - filas terminales marcadas por evento en los últimos N días;
  - todas las filas de un contrato cuyo cursor salió de la ventana.
- **Por cada fila:** `get_trade` (simulación, sin escritura) en `escrow_contract_id`.

  | En cadena | En la base | Acción |
  |---|---|---|
  | `Locked` | abierta | Nada (actualizar `funds_timeout_ledger` si falta) |
  | `Locked` | `refunded`/`completed` | **Discrepancia crítica:** alerta y marca `needs_review`; no reescribir sola |
  | `Released` | abierta | Pasar a `completed` con evidencia `reconciled` (contrato, ledger); hash si se encuentra |
  | `Refunded` | abierta o `cancelled` | Pasar a `refunded` con evidencia |
  | `TradeNotFound` o archivado | con lock | No cambiar estado; alerta "no verificable" |
  | Error RPC | cualquiera | No cambiar nada; reintentar en el siguiente ciclo |

- Toda corrección va con UPDATE condicionado al estado leído (idempotente) y con un evento de auditoría `reconciliation`. Nunca envía transacciones de pago.
- Columna o tabla de discrepancias abiertas para soporte, separada de la constancia de efectivo.
- La app muestra "confirmación pendiente" para filas en `needs_review`, nunca un estado terminal inventado.

**Pruebas:**
- Un evento `released` perdido se recupera por conciliación; ejecutar la conciliación dos veces no duplica nada.
- Una fila falsa `refunded` con la cadena en `Locked` genera una alerta y no se reescribe sola.
- Un RPC caído o un registro archivado no producen `refunded`.

---

## WP6: receptor listo justo antes del efectivo (N3)

- `receiverReadiness.service.ts`: identificar el activo exacto (código y emisor). Opciones: leer `name()` del SAC del contrato, que devuelve `CODE:ISSUER`, o configurarlo en el backend. Hoy el emisor solo vive en la configuración del APK.
- Comprobar: cuenta existente, trustline del emisor exacto, `is_authorized` (Horizon) y XLM gastable para la comisión de `release`.
- Llamarla **también** en `merchantConfirmScan` (cashout: el buyer es el agente), antes de registrar la entrega. Si el resultado no es concluyente, no hay entrega.
- Depósito: el receptor es el cliente; aplicar la misma comprobación antes de que el cliente entregue efectivo, en el punto del flujo que corresponda. Revisar ese flujo dentro de este WP.

**Hueco de confianza en el depósito (encontrado al implementar WP1, 2026-10-29).** En el depósito el cliente entrega el efectivo mientras la fila está `locked`, y no queda constancia durable: `trade_cash_handoffs` solo existe en cashout. El agente revela con "confirmar efectivo" (`revealTrade`) y el cliente libera, pero si el agente no revela, al vencer puede reembolsarse. D2 no protege aquí, porque no hay constancia que bloquee el reembolso.
- **Decisión (2026-10-29, D4):** el depósito conserva su orden: el cliente paga primero y el agente confirma, como en cualquier compra. No se invierte el QR. Invertirlo haría que el agente confiara en un cliente anónimo, y en la práctica el agente pediría el efectivo antes de mostrarlo, con lo que el hueco volvería.
- **Lo que se agrega, solo para el caso de problema:** en la pantalla del QR del cliente (`DepositQR.tsx`), mientras la fila está `locked`, un botón "Pagué y no me confirmaron". El flujo normal no gana ningún paso.
- **Backend:** un reclamo durable `trade_cash_claims` (`trade_id`, `claimant_id`, `created_at`), que solo puede crear el buyer de un depósito `locked`. Mientras exista:
  - `getRefundEligibility` responde `cash_claim_open`;
  - `refundTrade` rechaza con `CASH_CLAIM_OPEN`;
  - `sweepPendingRefunds` no toca la fila;
  - se avisa al agente para que confirme, y el caso queda para soporte;
  - si el agente revela después, el flujo sigue normal.
- **Límite:** no impide que el agente llame `refund` directo al contrato con su llave. El reclamo deja a soporte la evidencia para suspenderlo. Cerrarlo en cadena es WP8.
- **Reclamos falsos:** el agente honesto solo pierde tiempo (sus fondos quedan detenidos hasta que soporte decida). Soporte resuelve; reincidir suspende al cliente.
- **Pruebas:**
  - el reclamo bloquea `refundTrade` y el sweep;
  - solo el buyer de un depósito `locked` puede crearlo;
  - un reveal posterior no queda bloqueado por el reclamo.
- Se trata junto con N3 porque es el mismo momento del flujo.

**Pruebas:** buyer desautorizado, trustline de otro emisor y XLM insuficiente bloquean el escaneo; un buyer correcto pasa.

---

## WP7: diagnóstico y limpieza (N4 y menores)

- Al registrar un fallo de simulación o envío, guardar el contrato de origen del error a partir de los eventos de diagnóstico. No traducir `Error(Contract, #n)` a un nombre de `EscrowError` sin confirmar que salió del escrow.
- `executeRefundOnChain` (`trade.service.ts:1603`): limpiar `secret_enc`/`secret_nonce` y condicionar el UPDATE a `status NOT IN ('completed','refunded')`, igual que el dispatcher.
- Documentar en `contracts/` que `DataKey::Admin` no tiene funciones y que el contrato es inmutable.

---

## WP8: contrato siguiente (opcional, requiere decisión D1/D2)

Solo si WP0 lo decide. Nuevo despliegue; el contrato actual sigue escuchándose mientras tenga operaciones abiertas, como en el plan 2026-10-26.

Candidatos:
- `EscrowError` desde un rango propio (por ejemplo 100+) para eliminar N4.
- `timeout_minutes` con mínimo y máximo; rechazar 0.
- Plazo por timestamp del ledger en lugar de número de ledger.
- Si D1 adopta el corte de XRPL: `release` hasta el borde inclusive y `refund` solo después (`>`), más una vía de recuperación del agente que ya entregó efectivo, diseñada antes de programarla.
- Pruebas Rust sin `mock_all_auths` para cada función, más build reproducible con hash publicado.

---

## WP9: verificación y despliegue

**Testnet de punta a punta**, con APK release:
1. Cashout normal y depósito normal.
2. Ataque H1 (contrato XLM + legacy) contra una operación en `revealing`: el escaneo se rechaza y A no cambia.
3. Lock con confirmación tardía (forzando la espera corta): termina `locked` y se puede reembolsar.
4. Entrega de efectivo a 25 y a 15 minutos del vencimiento en cadena (con margen de 20): la primera pasa y la segunda no.
5. Release y refund en el borde, en ambos órdenes de inclusión; documentar el resultado.
6. Agente con USDC desautorizado: el escaneo se rechaza.
7. Listener detenido más tiempo que la ventana del RPC: la conciliación repara todo.

**Producción:**
- Orden: migraciones → backend → APK (la UI de WP1b puede ir después; el backend ya protege).
- Tras cada despliegue: listeners activos por contrato, lag del cursor, discrepancias abiertas y el resultado del script 1c.
- Actualizar la auditoría con el estado de cada hallazgo (corregido, desplegado, verificado) y mover este plan a `archive/` al terminar.

## Trazabilidad

| Hallazgo | WP |
|---|---|
| H1 | WP1 (1a, 1c), WP5 |
| H2 | WP3 |
| H3 | WP4 |
| H4 | WP4, WP5 |
| N1 | WP2, WP5 |
| N2 | WP1 (1b) |
| N3 | WP6 |
| N4 | WP2, WP7, WP8 |
| D1 | WP0, WP8 |
| D2 | WP0, WP1b (margen), WP3 |
| D3 | WP8 |
