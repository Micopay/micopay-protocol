# Auditoría del escrow móvil frente al escrow nativo de XRPL

Fecha: 2026-10-29 (México). Código revisado: `55da2f313d023bdc14679b494dc3e6047d7e7be8`.

## Dictamen y alcance

El contrato tiene controles útiles: autorización de quien bloquea y de quien cobra, destinatarios fijados al bloquear, comprobación SHA-256, devolución del monto y comisión, y estados terminales que evitan pagar dos veces. Sin embargo, la revisión encuentra problemas en la conexión cadena/backend y una semántica de vencimiento distinta de XRPL. H1 es crítico para cashout cuando el backend escucha más de una instancia del contrato: permite bloquear la liberación después de entregar efectivo y terminar con el efectivo y la cripto. Esa condición está documentada para Testnet; no se comprobó la configuración de producción. No recomiendo considerar terminada la validación para fondos reales hasta resolver H1/N2, recuperar locks cuya confirmación se pierda y probar los escenarios de entrega de efectivo cerca del vencimiento.

Revisión de `micopay/contracts/escrow/src/{lib,types,errors,test}.rs`, servicios de trades, construcción/verificación de transacciones y escucha de eventos del backend. Referencia: documentación oficial de XRPL y, en `rippled` rama `release/3.4.x`, los transactors `EscrowCreate`/`EscrowFinish`/`EscrowCancel` y la función `after()` de `View.cpp`. No es una auditoría del consenso de XRPL ni de MicoPay Bridge.

Se revisó el código local y se ejecutaron pruebas locales. No se verificaron en esta sesión el WASM desplegado, AWS, saldos reales ni activación de amendments de XRPL. Los IDs de Testnet del repositorio son contexto documental, no atestación del despliegue actual. No se cambió código productivo ni se enviaron transacciones.

## Comparación

| Propiedad | Escrow nativo XRPL | MicoPay móvil |
|---|---|---|
| Destinatario | Fijado al crear | `buyer` almacenado en `lock` |
| Condición | Puede usar PREIMAGE-SHA-256 | SHA-256 del secreto obligatorio |
| Quién completa | Cualquier cuenta que cumpla las condiciones y restricciones aplicables | Exige autorización de `buyer` y secreto |
| Expiración | Finish se permite mientras `now <= CancelAfter`; Cancel solo cuando `now > CancelAfter` | Desde `sequence >= timeout_ledger`, refund y release están permitidos y compiten |
| Devolución | Requiere transacción `EscrowCancel`; no ocurre sola | Requiere `refund`; el backend automatiza ciertos casos cancelados |
| Cancelación anticipada | No ofrece equivalente nativo a nuestra renuncia del beneficiario | `decline`: buyer autoriza devolver todo a seller |
| Identidad | Owner + secuencia/ticket, dentro del ledger | SHA-256(secret_hash), dentro de cada contrato |
| Efectivo físico | No lo verifica | No lo verifica; la constancia está en la base de datos |

Fuentes: [EscrowCreate](https://xrpl.org/docs/references/protocol/transactions/types/escrowcreate), [EscrowFinish](https://xrpl.org/docs/references/protocol/transactions/types/escrowfinish), [EscrowCancel](https://xrpl.org/docs/references/protocol/transactions/types/escrowcancel), y código de `rippled` [EscrowFinish.cpp](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/tx/transactors/escrow/EscrowFinish.cpp) / [EscrowCancel.cpp](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/tx/transactors/escrow/EscrowCancel.cpp) / [EscrowCreate.cpp](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/tx/transactors/escrow/EscrowCreate.cpp). `after(now, mark)` ([View.cpp:672-675](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/ledger/View.cpp)) es una comparación estricta (`now > mark`): en el borde exacto XRPL permite Finish y todavía rechaza Cancel. MicoPay usa otra convención: refund ya es elegible cuando el número de ledger es igual a `timeout_ledger`. XRPL usa `parentCloseTime` y MicoPay calcula un número de ledger suponiendo aproximadamente cinco segundos por cierre.

## Hallazgos

### H1 — P0 condicional en cashout: eventos de otro contrato pueden cerrar la operación equivocada

Evidencia: `lib.rs:15-26` calcula el ID solo a partir del hash. `index.ts:547-570` inicia listeners para varios contratos. `event-dispatcher.service.ts:18-27,59-77` no conserva el contrato de origen y sus consultas de las líneas 140 y 192 buscan únicamente `contract_trade_id`.

Escenario: una operación legítima está bloqueada en A. Un atacante observa su hash público, crea con sus propios fondos una operación mínima en B, otro contrato escuchado, usando el mismo hash y plazo cero, y la reembolsa. El ID coincide. El evento auténtico de B puede marcar como `refunded` la fila de A, aunque A continúe `Locked`. Para producir `refunded` no necesita conocer el secreto ni las llaves de la víctima. El filtro RPC por contrato no evita esto porque todos los listeners desembocan en el mismo dispatcher sin preservar ese dato.

Impacto directo: falsa liquidación, bloqueo del flujo normal de la app y pérdida del secreto cifrado de la fila al procesar el reembolso. El contrato A conserva inicialmente sus balances, pero en cashout el mismo usuario puede explotar esa desconexión para quedarse con el efectivo y luego recuperar la cripto de A al vencer.

Ruta de pérdida en cashout: el usuario bloquea en A; el agente escanea y entrega efectivo; antes de que el agente libere, el usuario crea con sus propios fondos una operación mínima en B con el mismo hash y la reembolsa o la declina. `handleRefunded` encuentra A solo por `contract_trade_id`, la marca `refunded` y elimina `secret_enc`. `prepareReleaseTrade` y `completeTrade` exigen `revealing`, por lo que el agente ya no puede preparar ni completar la liberación desde la app. Al vencer A, el usuario llama `refund` y recupera también la cripto. Esta ruta requiere que el backend escuche A y B.

No requiere ganar una carrera contra la liberación. Por N2, el usuario puede provocar el falso `refunded` después de generar el QR y antes del escaneo: `merchantConfirmScan` no rechaza `refunded`, consume el claim token (vigencia máxima de 15 minutos, `trade.service.ts:98`) y registra la entrega. En la app del agente, `TradeConfirmationCard` (`frontend/src/pages/MerchantInbox.tsx`) muestra la tarjeta normal de confirmación con el botón de liberar; la única señal es la etiqueta gris "Reembolsado". Que el agente entregue el efectivo en ese caso depende de que lea esa etiqueta; no se probó con un agente real.

Depósito: ahí el seller es el agente, que ya controla `reveal` (`revealTrade` exige `seller_id`). H1 no le da una capacidad sustancialmente nueva, pero el riesgo de que el cliente entregue efectivo antes de que el agente revele no se evaluó en esta auditoría.

Confirmación: una prueba Rust local reproduce IDs iguales en dos instancias y devolución en B con A aún bloqueado. La corrupción de la fila y el bloqueo de la liberación se confirman por lectura de `event-dispatcher.service.ts` y `trade.service.ts`; no se ejecutó un ataque contra una base real. Testnet documenta tres contratos escuchados: dos en `ESCROW_CONTRACTS` y uno legacy en `contracts/TESTNET.md:97-98`; `index.ts:547-570` inicia un listener por cada ID. No se verificó si producción mantiene más de una instancia, por lo que la severidad P0 es condicional a esa configuración y al flujo cashout.

Corrección: identificar por red + contrato + ID; transportar el contrato desde la recepción hasta la consulta y verificar que corresponde al `escrow_contract_id` fijado en la operación. Tratar explícitamente las filas legacy. Releer estado del contrato correcto ante discordancias. Prueba obligatoria: refund de B nunca modifica A.

### H2 — P2: el reloj de la app no coincide con el vencimiento en cadena

Evidencia: `trade.service.ts:95,476` establece 120 minutos desde la creación en base de datos; `stellar.service.ts:30` envía 120 minutos al contrato. `lib.rs:88` los transforma en 1440 ledgers desde la ejecución de lock. No se actualiza `expires_at` al bloquear. `getRefundEligibility` y `refundTrade` usan el reloj de servidor (`trade.service.ts:1691-1750`), no `timeout_ledger`.

Ejemplo: crear a las 12:00 y bloquear a las 12:30 produce una fecha de app de 14:00, mientras la cadena vence 1440 ledgers después de las 12:30. Incluso suponiendo cinco segundos por ledger, sería alrededor de 14:30. La velocidad real de cierre añade otra diferencia. El resultado puede ser una app que anuncia reembolso disponible mientras el contrato lo rechaza, o un contrato reembolsable antes de lo que indica la app si los ledgers avanzan más rápido.

Corrección: separar caducidad de la solicitud y vencimiento de fondos; persistir el plazo confirmado del lock y consultar la cadena para elegibilidad. Si la promesa de producto son minutos, evaluar un timestamp absoluto del ledger en la siguiente versión y definir explícitamente el instante desde el que cuenta. No basta con igualar ambas constantes a 120.

Agravante: `lockTrade` (`trade.service.ts:802-880`) exige `pending`, pero no comprueba cuánto falta para `expires_at`. Una solicitud creada a las 12:00 puede bloquearse a las 13:59; un minuto después `getTradeSecret` y `merchantConfirmScan` la consideran vencida, mientras los fondos permanecen bloqueados unos 120 minutos desde el lock. El backend debe rechazar locks sin margen suficiente o reemplazar la fecha de aplicación por el vencimiento confirmado de los fondos.

### H3 — P2: un fallo al aplicar un evento puede perderlo definitivamente

Evidencia: `event-listener.service.ts:190-193` llama a `isDuplicate` antes de `dispatch`. La implementación de `isDuplicate` (líneas 235-248) inserta inmediatamente la marca en `processed_tx`.

Si la inserción funciona y luego falla el UPDATE o la auditoría, el siguiente intento considera el evento procesado y lo omite. La fila puede quedarse bloqueada aunque los fondos ya hayan salido. Una caída entre ambas operaciones produce la misma ventana. Evidencia estática; no se inyectó un fallo de PostgreSQL en esta sesión.

Corrección: marca de procesamiento y efectos en una transacción de base de datos, o bandeja durable con estados pending/applied y reintentos. Prueba: fallar el primer dispatch y comprobar que el segundo aplica el evento.

### H4 — P2: paginación incompleta puede omitir liquidaciones

Evidencia: `event-listener.service.ts:218-227` solicita como máximo 200 eventos y devuelve `res.latestLedger`. Tras esa única página, las líneas 196-198 avanzan el cursor a ese ledger, sin consumir las páginas restantes.

Con más eventos que el límite durante el intervalo, incluidos periodos de desconexión, eventos pendientes pueden quedar detrás del cursor. Impacto: estados desactualizados en la app. Es una condición de carga/recuperación, no evidencia de que ya haya ocurrido en producción.

Corrección: consumir todas las páginas con cursor de evento; solo avanzar el punto de recuperación hasta lo efectivamente procesado. Probar más de 200 eventos y varios dentro de un mismo ledger. Al salir de la ventana histórica RPC también hace falta reconciliar operaciones abiertas, no solo reiniciar al ledger actual.

El reinicio de historial agrava el problema: si el cursor quedó antes de la ventana conservada por RPC, `event-listener.service.ts:176-184` guarda cero. En el siguiente ciclo arranca desde el ledger actual, por lo que el intervalo perdido no se recupera por eventos. La conciliación independiente de operaciones abiertas es obligatoria en esa ruta.

### N1 — P1: un lock confirmado puede quedar sin vía de recuperación en la app

`submitLockTx` envía la transacción y sondea Horizon 15 veces, con 2 s de pausa y hasta 5 s por consulta (`stellar.service.ts:116-145,249-263`): entre unos 30 y 105 segundos, aunque el mensaje de error dice 30 s. Si la red confirma después, el servicio lanza `STELLAR_TIMEOUT` y `lockTrade` no persiste `lock_tx_hash`, `contract_trade_id` ni el estado bloqueado. El contrato puede quedar financiado mientras la fila sigue `pending`.

El listener no repara la fila: `applyEscrowEvent` declara `locked` como no-op (`event-dispatcher.service.ts:107-115`). Además, `refundTrade`, `getRefundEligibility` y el sweep requieren `lock_tx_hash`; reintentar el mismo lock puede fallar con `TradeAlreadyExists`. Ese código no basta para diagnosticar: un saldo insuficiente produce el mismo valor (N4). El usuario solo podría recuperar los fondos llamando manualmente al contrato después del plazo.

Corrección: persistir el hash y un estado `lock_submitted` antes de sondear; diferenciar `PENDING`, `DUPLICATE`, `TRY_AGAIN_LATER` y rechazo definitivo; aplicar eventos `locked` únicamente cuando coincidan red, contrato, ID, seller, buyer, activo e importes; e incluir estas filas en conciliación. Prueba: una confirmación posterior a 30 segundos termina reflejada y puede reembolsarse desde la app.

### N2 — P2: el escaneo del agente acepta una fila reembolsada

`merchantConfirmScan` (`trade.service.ts:1988-2091`) rechaza `cancelled` y trata `completed` como relectura, pero no exige `status === 'revealing'`. Una fila `refunded`, incluida una falsa por H1, puede conservar un claim token vigente y registrar una constancia de entrega, induciendo al agente a entregar efectivo cuando la app ya no le permitirá cobrar. La respuesta incluye `status: 'refunded'` y la app lo muestra solo como etiqueta, sin bloquear el flujo (ver H1).

Corrección: exigir `revealing` antes de consumir el token; consultar el contrato correcto y exigir `Locked`; verificar receptor, activo, participantes, importes y margen real hasta `timeout_ledger` antes de registrar la entrega. Prueba: escanear una fila `refunded` siempre falla y no consume el token ni crea `trade_cash_handoffs`.

### N3 — P2: si el buyer deja de poder recibir, el seller recupera todo al vencer

El token puede rechazar la transferencia de `release` si el emisor desautoriza o congela al buyer; también puede fallar si falta la trustline correcta. La prueba adicional revoca la autorización del buyer, confirma que `release` falla y que `refund` devuelve el total al seller al vencer. En cashout, si el agente ya entregó efectivo, pierde ese efectivo.

`assertReceiverCanReceive` solo se ejecuta al crear la operación (`trade.service.ts:414-422`). Su implementación comprueba que exista la cuenta y estime XLM disponible; busca la trustline solo por código, sin conocer el emisor, y no inspecciona autorización ni congelamiento. La situación también puede cambiar entre creación y escaneo.

Corrección: identificar exactamente emisor/activo y volver a comprobar cuenta, trustline, autorización, congelamiento y XLM inmediatamente antes del escaneo y de la entrega. Si la consulta no es concluyente, no registrar el handoff. XRPL también puede rechazar Finish si el receptor no está listo; es un riesgo inherente al activo, no una prueba de defecto en la transferencia del contrato.

### N4 — P3: los errores del token se confunden con errores del escrow

Cuando `token::Client::transfer` falla, el error del SAC sube con el mismo tipo `Error(Contract, #n)` que usa `EscrowError`. Los códigos 1-11 del SAC (`soroban-env-host-25.2.2/src/builtin_contracts/contract_error.rs`) coinciden uno a uno con los 11 de `errors.rs`, así que el cliente los decodifica como errores del escrow. Reproducido en pruebas del SDK:

- buyer desautorizado (`BalanceDeauthorizedError`, #11) en `release` → se lee `AmountOverflow`;
- seller sin saldo (`BalanceError`, #10) en `lock` → se lee `TradeAlreadyExists`, sin que exista la operación.

Otros choques posibles por código: #4 `UnauthorizedError` como `InvalidSecret`, y #6 `AccountMissingError` como `TimeoutNotReached`. #13 `TrustlineMissingError` no choca. El backend no traduce estos códigos, por lo que hoy el impacto es de diagnóstico, logs y soporte, no de fondos. Sin embargo, combina mal con N1: un reintento fallido no distingue una operación ya bloqueada de un saldo insuficiente. En red, los eventos de diagnóstico de la simulación indican el contrato de origen; no se verificó qué conserva el backend de ellos.

Corrección: en backend, no interpretar el número sin su origen; ante un error, consultar `get_trade` en el contrato correcto. En una versión futura del contrato, separar el rango de `EscrowError` (por ejemplo, desde 100) requiere un nuevo despliegue y migración, por lo que no es requisito para H1-N3.

## Diferencias de diseño y riesgos conocidos

### D1 — Release y refund compiten después del plazo

`release` (`lib.rs:130-195`) no comprueba el plazo. `refund` sí lo comprueba (`lib.rs:210`). Las pruebas nuevas confirman release después del vencimiento y refund en el borde; una vez ejecutado uno, el otro falla. No hay doble pago en esas pruebas, pero el resultado depende del orden de inclusión.

XRPL separa las ventanas sin superposición: [EscrowFinish.cpp](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/tx/transactors/escrow/EscrowFinish.cpp) rechaza Finish solo cuando `now > CancelAfter`, y [EscrowCancel.cpp](https://github.com/XRPLF/rippled/blob/release/3.4.x/src/libxrpl/tx/transactors/escrow/EscrowCancel.cpp) rechaza Cancel mientras `now <= CancelAfter`. En el instante exacto solo Finish es válido; Cancel empieza después. MicoPay permite refund desde `sequence == timeout_ledger` y nunca corta release, por lo que ambas operaciones compiten desde el borde. Esto es una diferencia confirmada, no un requisito automático de copiar XRPL.

Hay que decidir si nuestro plazo es una expiración exclusiva o solo apertura del reembolso. Añadir una prohibición de release tardío sin adaptar la entrega de efectivo podría empeorar la recuperación de quien ya pagó efectivo.

### D2 — Confirmar efectivo no desactiva refund en cadena

El backend bloquea cancelación y decline al encontrar `trade_cash_handoffs` (`trade.service.ts:1289-1298,1537-1547`), pero `refundTrade` y su elegibilidad no consultan esa constancia. El contrato tampoco tiene ese dato: cualquiera puede solicitar refund al vencer, siempre a seller.

Si el efectivo ya pasó a quien bloqueó cripto y el release no se confirma a tiempo, esa persona podría recuperar además su cripto. Es el riesgo físico/digital ya reconocido; XRPL tampoco lo resuelve. La carencia concreta de mitigación es que el backend sigue ofreciendo una vía de refund en ese estado. Deshabilitarla en la API no impediría una llamada directa al contrato.

Mitigación propuesta: comprobar el margen real en cadena antes de entregar efectivo, evitar nuevas entregas cerca del límite, priorizar la liquidación y definir recuperación/soporte. Una futura protección en cadena requiere diseño explícito de disputas, confianza y salida por bloqueo; no debe añadirse como si el contrato pudiera observar efectivo.

### D3 — Parámetros y disponibilidad

- Plazo cero se acepta y permite devolución inmediata, en el mismo ledger: reproducido. Como referencia, `EscrowCreate.cpp:425` rechaza un `CancelAfter` ya vencido, pero acepta uno igual a la hora actual. XRPL tampoco impone un mínimo real, aunque Cancel solo puede ocurrir en un ledger posterior. El endpoint actual fija y verifica 120, por lo que no afirmo bypass de su validación. Llamadas directas al contrato sí pueden usar cero. Definir mínimo/máximo y aritmética comprobada; los overflows de u32 abortan con el perfil actual, no se demostró wraparound ni robo.
- `trade_id` global al hash dentro de una instancia permite ocuparlo antes del lock legítimo si se conoce a tiempo. El guard evita sobrescribir fondos ya bloqueados, pero no elimina esa denegación de servicio previa. No se probó front-running en red.
- Mantener autorización del buyer para release es una elección de seguridad válida, aunque exija su disponibilidad. No recomiendo eliminarla solo porque XRPL permite terceros: nuestro backend custodia el secreto cifrado.
- Las comisiones quedan fijadas por operación y las devoluciones incluyen la comisión de plataforma. El contrato no impone el límite comercial del 6%; ese límite depende del backend y de verificar la transacción firmada. Esto coincide con la decisión de mantener simple el escrow.
- TTL no equivale a pérdida definitiva: el almacenamiento persistente puede archivarse y restaurarse. Las llamadas de simulación no garantizan por sí solas renovación durable. Verificar recuperación y financiación de recursos con operaciones antiguas antes de afirmar que jamás se bloquean por archivo. Referencia: [CAP-0066](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0066.md).
- `executeRefundOnChain` confirma la devolución y actualiza la fila, pero no limpia `secret_enc`/`secret_nonce` ni protege el UPDATE con `status NOT IN ('completed','refunded')`; el dispatcher sí hace ambas cosas. Alinear ambos caminos reduce exposición innecesaria del secreto y evita que una escritura tardía contradiga un estado terminal.
- `DataKey::Admin` se guarda en el constructor y ninguna función actual lo usa. Si el contrato se pretende inmutable, documentarlo; si se espera administración futura, no atribuirle facultades que todavía no existen.

## Pruebas y límites de evidencia

1. Suite original: `cargo test --locked`, 9/9 aprobadas.
2. Copia aislada del mismo contrato, con nueve pruebas de auditoría: 18/18 aprobadas el 2026-10-29, ejecutadas desde los archivos de `evidence/` (el crate de `micopay/contracts/escrow` sin cambios). Las cuatro primeras confirman release tardío, refund en el borde, plazo cero e ID idéntico entre instancias. Las cinco siguientes comprueban:
   - autorización real del buyer para release;
   - rechazo de decline firmado solo por seller;
   - ocupación anticipada del hash;
   - fallo de release y reembolso posterior cuando el buyer queda desautorizado;
   - choque de códigos de error del token (N4).

   En la revisión final se endurecieron las aserciones: los casos de autorización exigen un fallo del host (`Err(Err(_))`) y que la operación siga `Locked`, en lugar de aceptar cualquier error. El caso desautorizado exige el código exacto y que no haya liquidación parcial. Al hacerlo apareció N4: la versión anterior pasaba con cualquier error y no lo detectaba. La prueba original `test_lock_rejects_reused_secret_hash` se revisó: el atacante tiene saldo, así que su `TradeAlreadyExists` es genuino y no el choque de N4.
3. Evidencia: [primeras cuatro pruebas](./evidence/escrow-xrpl-2026-10-29.rs) y [cinco pruebas adicionales](./evidence/escrow-claude-2026-10-29.rs). Se reprodujo con `cargo test --locked --offline --manifest-path <copia>/Cargo.toml --target-dir micopay/contracts/escrow/target`. Para otro checkout, copiar el crate a una carpeta temporal, añadir ambos archivos como módulos de prueba y declarar `#[cfg(test)] mod audit;` y `#[cfg(test)] mod audit_claude;` en esa copia.

La suite original usa `mock_all_auths`; las pruebas adicionales sí ejercitan dos casos negativos de autorización mediante `mock_auths`, pero no sustituyen pruebas integrales con billeteras y red real. Faltan pruebas de múltiples operaciones intercaladas, fallos y congelamientos en red, transferencia de comisiones, recuperación de almacenamiento y reconciliación con PostgreSQL. H1-H4 y N1-N2 se comprobaron principalmente por lectura de código; no se ejecutó el ataque contra infraestructura desplegada. N3 y N4 se reprodujeron en el entorno de contrato del SDK con un activo Stellar; no se probaron en red. La lectura de la app del agente (H1/N2) es estática; no se ejecutó la interfaz. No se usó Raven en esta revisión.

## Orden recomendado

1. **H1 + N2:** identidad completa en eventos y consultas; escaneo únicamente sobre una fila `revealing` cuyo escrow correcto siga `Locked`, pueda pagar al receptor y tenga margen suficiente.
2. **N1:** persistir el envío del lock antes del sondeo, manejar el evento `locked` con verificación completa y reconciliar confirmaciones tardías.
3. **H2:** persistir el vencimiento real desde el lock, consultar la cadena para elegibilidad y rechazar locks o entregas sin margen.
4. **H3 + H4:** procesar eventos de forma durable, paginar por completo y conciliar al perder la ventana histórica.
5. **N3:** comprobar el receptor y el activo exactos inmediatamente antes del escaneo y la entrega.
6. **D1/D2:** tomar una decisión de producto antes de modificar el contrato. Si se adopta el corte de XRPL, conservar una ventana sin competencia —release hasta el borde inclusive y refund solo después— y diseñar la recuperación del agente que ya entregó efectivo.
7. Limpiar los dos detalles menores, diagnosticar errores con su contrato de origen (N4), ampliar pruebas integrales y verificar WASM y configuración desplegados contra la revisión aprobada.

Podemos conservar el escrow simple. La comparación con XRPL muestra que lo prioritario es identificar correctamente cada escrow, expresar un plazo inequívoco y reflejar fielmente la liquidación confirmada.

## Adenda — conciliación, Trustless Work y decisiones de alcance

Fecha de incorporación: 2026-10-29 (México). Esta adenda documenta las conclusiones de la conversación posterior y una consulta de documentación oficial. Conserva los hallazgos y resultados de pruebas anteriores; no significa que se hayan corregido, desplegado o vuelto a probar. La revisión de Trustless Work es documental, no una auditoría de su código ni de su infraestructura.

### Liquidación en cadena y conciliación con la aplicación

Conviene separar dos responsabilidades:

- **Liquidación:** mover los fondos y cambiar el estado del escrow dentro de una transacción. En XRPL, una finalización o cancelación exitosa mueve los fondos y elimina el objeto escrow. Nuestro contrato también ejecuta las transferencias y el cambio de estado de forma atómica en Stellar; un fallo de ejecución no deja una liquidación parcialmente aplicada. Esto no implica que toda transacción fallida esté exenta de comisiones.
- **Conciliación:** comprobar que la base de datos de la aplicación coincide con lo confirmado en cadena y corregir diferencias. Una app sobre XRPL también necesita sincronizar sus registros externos. Que el escrow sea nativo del protocolo no actualiza automáticamente la base de datos de esa app.

Analogía: la cadena es el registro del banco; nuestra base de datos es la libreta con la que atendemos al cliente. Si se pierde una notificación del banco, debemos consultar el registro y corregir la libreta. La conciliación no vuelve a mover el dinero.

Fuentes de XRPL: [escrow](https://xrpl.org/docs/concepts/payment-types/escrow), [EscrowFinish](https://xrpl.org/docs/references/protocol/transactions/types/escrowfinish) y [EscrowCancel](https://xrpl.org/docs/references/protocol/transactions/types/escrowcancel). Para MicoPay, la evidencia es el contrato local revisado, no una comprobación del despliegue.

### Qué aporta la referencia de Trustless Work

Trustless Work usa contratos Soroban en Stellar y una API para operarlos y consultar estados y balances. Su producto incluye roles, hitos y disputas. Es una arquitectura de contratos propios con servicios externos, no un escrow nativo del protocolo como el de XRPL. [API oficial](https://docs.trustlesswork.com/trustless-work/api-rest/introduction).

En el esquema y ciclo de vida revisados no aparece un plazo de vencimiento ni una operación directa de refund. La ruta documentada para devolver fondos es abrir una disputa y hacer que el rol `Dispute Resolver` asigne los fondos; su [diseño de escrow](https://docs.trustlesswork.com/trustless-work/introduction/technology-overview) describe expresamente que ese rol "arbitrates disputes and can re-route funds when a dispute is raised". La misma página lista `refunded` como estado de cierre, pero no contiene texto sobre plazos, timeouts o expiración (consultada el 2026-10-29). Por tanto, Trustless Work evita la competencia temporal de D1 mediante un modelo distinto: reemplaza la salida automática por plazo con intervención de un rol autorizado. Esta conclusión es documental y corresponde a la versión consultada; no se auditó todo su contrato ni se afirma que ninguna versión futura pueda incorporar plazos.

Su documentación describe un mecanismo de actualización del indexador mediante el hash de una transacción: se genera una transacción desde su API, se firma y envía a Stellar, y se entrega el `txHash` al indexador. El flujo requiere que los datos asociados ya existan en su cola interna; después se guardan en Firebase. Esto demuestra una separación entre cadena y base de datos. [Update From Tx Hash](https://docs.trustlesswork.com/trustless-work/api-rest/indexer/update-escrow-properties).

Límite de evidencia: esa página no basta para certificar recuperación automática de todos los eventos perdidos, reintentos durables, paginación completa o conciliación periódica. Tampoco demuestra cobertura de transacciones arbitrarias enviadas sin pasar por su API. No se verificaron esas garantías ni el alcance de auditorías de terceros. Además, la página discrepa entre el esquema OpenAPI (`PUT /indexer/update-from-txhash`) y el ejemplo (`POST /indexer/update-from-txHash`); habría que confirmar la interfaz antes de integrarla.

La documentación habla de desplegar/inicializar escrows y asignarles una dirección, pero no se tomó como prueba suficiente de que siempre exista exactamente un contrato por operación. Por eso no se atribuye a ese diseño una inmunidad demostrada frente a H1. La enseñanza aplicable es separar la lógica que custodia fondos de la que mantiene los registros de la aplicación. No es necesario copiar sus hitos, roles o disputas para resolver H1-H4 y N1-N3.

### Decisión: mantener sencillo el contrato

Se mantiene la preferencia de producto de mitigar el riesgo del efectivo mediante el backend, la operación, soporte y el futuro sistema de disputas y reputación. Esta adenda no propone añadir al escrow funciones para observar efectivo ni implementar arbitraje en cadena.

No se recomienda copiar automáticamente la prohibición de cobro tardío de XRPL: si alguien ya entregó efectivo y la liquidación se retrasó, impedir `release` puede perjudicarlo. D1 sigue siendo una diferencia de diseño conocida: al vencer, `release` y `refund` compiten y gana la primera transacción válida incluida. La conciliación muestra el resultado real; no elimina esa competencia ni demuestra que se entregó efectivo.

Para D2 se propone consultar el plazo real en cadena, impedir iniciar la entrega de efectivo sin margen suficiente, facilitar la liquidación inmediata y dirigir a completar o soporte después de una constancia durable de entrega. La app y el backend deben evitar ofrecer o preparar cancelación, `decline` o un reembolso rutinario en ese estado. El margen queda pendiente de definir y probar; ocultar esas acciones no impide un `refund` directo al contrato cuando ya sea elegible.

### Conciliación propuesta para el backend — pendiente de implementar

1. **Identidad completa:** utilizar red + contrato + ID de operación tanto en eventos como en consultas. Verificar activo, participantes e importes cuando corresponda antes de asociar una liquidación a una fila. H1 tiene prioridad.
2. **Entrega recuperable:** aplicar H3/H4 con procesamiento durable, deduplicación por evento y su origen, reintentos y consumo de todas las páginas. Avanzar el punto de recuperación solo hasta datos efectivamente procesados.
3. **Comprobación independiente:** consultar periódicamente el contrato correcto para operaciones abiertas o pendientes de confirmación, y hacerlo también tras desconexiones, pérdida de historial RPC o contradicciones. Incluir filas terminales sospechosas o afectadas por H1: revisar solo las abiertas dejaría falsas liquidaciones sin reparar.
4. **Evidencia antes de cambiar estados:** conservar red, contrato, ID, estado confirmado y referencia de ledger; registrar hash de transacción cuando esté disponible. Un hash enviado, un vencimiento de reloj o `cancelled` en la base no demuestran devolución. Mostrar `refunded` solo con evidencia confirmada de devolución. Un fallo RPC o dato archivado no equivale a fondos devueltos.
5. **Corrección trazable:** actualizar el estado financiero y su evidencia de forma atómica e idempotente, conservar la constancia de efectivo por separado y registrar discrepancias. La conciliación no debe reenviar pagos ni borrar evidencia necesaria para soporte. Si ya se eliminó un secreto por una falsa liquidación, corregir la fila no lo recupera automáticamente.
6. **Recuperación visible:** alertar sobre diferencias persistentes y operaciones que no se pueden comprobar. Cuando falte evidencia, mostrar confirmación pendiente y derivar a soporte en lugar de inventar un estado terminal.

### Criterios de aceptación adicionales

- Un evento de B nunca modifica una operación de A aunque compartan ID; incluir separación por red.
- Un refund o decline en B no impide preparar o completar A ni elimina su secreto.
- El escaneo de una fila `refunded`, `cancelled`, `pending` o `locked` falla sin consumir el claim token ni registrar efectivo; solo `revealing` puede avanzar.
- Un lock confirmado después del timeout de 30 segundos queda asociado a su fila, se concilia y puede reembolsarse desde la app.
- Un lock o escaneo sin margen de liquidación suficiente se rechaza usando el vencimiento real del contrato.
- Un buyer sin cuenta, XLM, trustline exacta, autorización o capacidad de recibir el activo no puede llegar a la entrega de efectivo.
- La app del agente no muestra una confirmación de entrega para una fila que no sea `revealing`; el bloqueo debe venir del backend, no solo de la etiqueta.
- Un error de contrato se registra con su contrato de origen; `#10` u otro código compartido no se presenta como "operación ya existe" sin consultar `get_trade`.
- Una caída entre recepción y aplicación permite reintentar sin omitir ni duplicar efectos; más de 200 eventos y varios en un ledger se procesan completos.
- Un evento perdido de `release` o `refund` se recupera consultando la cadena; ejecutar la conciliación otra vez no provoca pagos ni efectos duplicados.
- Una fila marcada terminal por error puede detectarse y corregirse con evidencia del contrato correcto, preservando el historial y escalando pérdidas de datos irrecuperables.
- Un RPC inaccesible, almacenamiento archivado o una transacción fallida no generan un falso `refunded`; el reloj local no sustituye la elegibilidad real.
- Probar entrega de efectivo próxima al vencimiento y ambos órdenes de inclusión de `release`/`refund`, documentando el riesgo residual y el comportamiento de soporte.

Estas son recomendaciones y pruebas pendientes. El orden consolidado es H1/N2, N1, H2, H3/H4, N3 y N4; D1/D2 requieren una decisión de producto antes de tocar el contrato. La corrección prioritaria sigue estando en el backend y la conciliación, sin ampliar las funciones del escrow como requisito para ese trabajo.
