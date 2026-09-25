# Auditoría de implementación: selector de activo

## Dictamen

**Con correcciones; no marcar todavía como listo para desplegar.** La política XLM, los guards y la aritmética de las cantidades están bien encaminados y las suites backend de activo, seed y flujo pasaron en memoria. Hay problemas de integración con reembolsos, una pantalla QR de depósito sin cubrir y dependencia de la configuración del APK para crear trustlines. El recibo de depósito también necesita distinguir el neto contable de lo que efectivamente entrega el contrato.

No modifiqué código de producto, configuración, bases de datos desplegadas ni hice commits o despliegues. Este documento es el único archivo añadido por la auditoría.

### Alcance exacto

- HEAD inspeccionado: `1dbf2788a393203046963da08fc08d9c487b7a72`, rama solicitada `feat/red-1-onboarding-interno`.
- `git log 28a3d2c..1dbf278` devuelve **7 commits**, porque el extremo izquierdo se excluye. Son 8 contando `28a3d2c`, que contiene el plan y la auditoría anterior. Se leyó también ese contexto.
- Cambios: WP-A `05004f3`, WP-B `9cec109`, WP-C `e129b16`, iconos `34b1f87`, WP-D `c31679b`, WP-E `6d07868`, WP-F `1dbf278`.
- Plan leído completo, incluidas precisiones v2.1 y notas de implementación. Su encabezado todavía dice «v2» y «No hay código escrito»; es una inconsistencia documental menor.
- Se inspeccionaron dependencias anteriores al rango cuando determinan el resultado de los cambios. Los hallazgos distinguen esos antecedentes de defectos introducidos por el selector.

## Hallazgos por prioridad

### H1 · P1 · Un reembolso confirmado puede seguir apareciendo «En garantía»

**Referencias:** `micopay/frontend/src/utils/escrowAmounts.ts:76`, `:90`; `micopay/backend/src/services/event-dispatcher.service.ts:82`, `:175`, `:189-200`; `micopay/backend/src/services/trade.service.ts:1321`, `:1487`.

**Escenario:** una operación bloqueada se reembolsa directamente en cadena —el contrato permite que cualquiera invoque refund tras el vencimiento— y el listener recibe `refunded`. `handleRefunded` escribe `status='cancelled'`, conserva `lock_tx_hash` y **no escribe** `release_tx_hash`. El resumen nuevo interpreta exactamente esa combinación como `inEscrow`. El dinero ya regresó al vendedor, pero la app afirma que sigue retenido. Si la operación ya estaba cancelada, el dispatcher ignora el evento por considerarla terminal.

Hay otra secuencia problemática: el refund HTTP/sweep guarda correctamente `refunded` y el hash; posteriormente el listener no reconoce `refunded` como terminal y puede degradarlo a `cancelled`. El resumen entonces desaparece, en lugar de informar del reembolso.

El sweep no resuelve necesariamente el primer caso: busca canceladas sin hash de liquidación y vuelve a intentar un refund ya ejecutado; el contrato rechaza la segunda liquidación. Tampoco cubre automáticamente todas las operaciones vencidas: su filtro es exclusivamente `status='cancelled'`.

**Origen:** defecto previo del dispatcher; integración no contemplada al introducir la nueva afirmación de garantía. No es una falla de la suma de stroops.

**Corrección:** reconciliar eventos de reembolso como `refunded`, guardar su hash y fecha, admitir la liquidación de operaciones canceladas y hacer idempotentes los eventos posteriores. Probar refund externo, refund de una cancelada y evento posterior al sweep. No arreglarlo ocultando todas las canceladas: algunas sí conservan fondos.

**Evidencia ejecutada:** harness en memoria con el código real del dispatcher y del helper de presentación, transpilado sin escribir archivos; DB y auditoría sustituidas por dobles. Resultados:

| Estado inicial | Después del evento refunded | Hash de liquidación | Vista del vendedor |
|---|---|---|---|
| locked | cancelled | null | inEscrow |
| cancelled | cancelled | null | inEscrow |
| refunded | cancelled | conservado | ninguna |

No fue una transacción real ni una prueba contra PostgreSQL; reproduce las decisiones de aplicación y la mutación solicitada al store.

### H2 · P2 · El detalle deja de actualizarse mientras espera el refund automático

**Referencias:** `micopay/frontend/src/pages/TradeDetail.tsx:73`, `:853`, `:908`, `:1113`, `:1185`.

**Escenario:** el usuario cancela una operación bloqueada y deja abierto el detalle. El resumen muestra «En garantía» correctamente al principio. Al pasar a `cancelled`, se desactiva el polling, porque solo incluye pending/locked/revealing. Aunque el sweep liquide y actualice bien el servidor, esa pantalla sigue mostrando el monto retenido y la recuperación pendiente hasta una nueva consulta provocada por otra acción o navegación.

**Origen:** polling previo, ahora también afecta al resumen nuevo de activo. Independiente de H1: ocurre incluso si el sweep y el dispatcher se corrigen.

**Corrección:** seguir refrescando mientras haya un bloqueo sin liquidación, incluso en cancelled/expired, y detenerse cuando se confirme completed/refunded. Añadir una prueba que cambie la respuesta de cancelled a refunded sin desmontar el detalle.

### H3 · P2 · La trustline todavía depende del APK y precede a los guards del backend

**Referencias:** `micopay/frontend/src/pages/QRReveal.tsx:76-78`; `micopay/frontend/src/pages/TradeDetail.tsx:952-954`; `micopay/frontend/src/services/payment.ts:74-105`.

**Escenario:** APK compilado con `VITE_ESCROW_ASSET_CODE=USDC`, operación XLM pendiente y cuenta sin esa trustline. Antes de llamar a `/trades/:id/lock/prepare`, ambas pantallas ejecutan `ensureTrustline('USDC')`. Puede pedir presencia del usuario, firmar y enviar un ChangeTrust innecesario, consumir comisión/reserva o fallar impidiendo bloquear XLM. El guard backend no puede impedir una transacción frontend anterior a la petición.

**Origen:** código previo, explícitamente relacionado con la fuente de verdad del activo de este cambio. También ocurre en TradeDetail, no solo en QRReveal.

**Corrección ahora:** en este ciclo XLM nativo no necesita ChangeTrust. Quitar esa dependencia de configuración del flujo XLM o validar el activo real de la operación antes de cualquier efecto, sin intentar habilitar activos desconocidos. La resolución issuer/contrato para activos emitidos sí corresponde a WP3. Probar un APK/configuración discordante con una operación XLM y una operación inconsistente.

Esto no demuestra que el APK desplegado actualmente tenga esa variable mal configurada; describe una ruta de fallo verificable en el código.

### H4 · P2 · El QR que abre el cliente de depósito no muestra activo ni cantidad

**Referencias:** `micopay/frontend/src/App.tsx:470`, `:493-503`; `micopay/frontend/src/pages/DepositQR.tsx:7`, `:14`, sección QR; `micopay/frontend/src/__tests__/escrowDisplay.test.tsx:226`.

**Escenario:** cliente inicia depósito, ve XLM en monto y confirmación, abre el chat y pulsa ver QR. Navega a `/qr-deposit`, que renderiza **DepositQR**, no QRReveal. DepositQR no incorpora `TradeEscrowSummary`, no recibe viewerId y no consulta una versión actualizada de la operación. El activo y las unidades desaparecen precisamente en esa pantalla real del flujo.

**Origen:** omisión del alcance implementado en WP-D. El test de integración estructural enumera QRReveal, pero no exige el resumen en DepositQR. El test de copy incluye DepositQR, aunque eso únicamente verifica ausencia de palabras prohibidas.

**Corrección:** incluir el QR de depósito en el circuito de datos del servidor y mostrar el monto que recibe el comprador. Añadir una prueba de la ruta que el cliente abre desde DepositChat. No hace falta rediseñar el protocolo QR como parte de esta corrección.

### H5 · P2 · El recibo de depósito presenta dos significados incompatibles de «recibido»

**Referencias:** `micopay/frontend/src/pages/SuccessScreen.tsx:82`, `:162-177`; `micopay/frontend/src/i18n/es.json:156`, `:384`; `micopay/backend/src/services/trade.service.ts:374`, `:684`; `micopay/backend/src/services/tradeFees.ts:68-73`; `micopay/contracts/escrow/src/lib.rs:175-183`.

**Escenario:** depósito de $500, tasa congelada 3 MXN/XLM, proveedor al 1.5%. El backend calcula proveedor=$8, plataforma=$4, payout=$488; el contrato entrega al comprador `amount_stroops`, aproximadamente **166.6666667 XLM**, cuyo valor a esa tasa es aproximadamente **$500**. Éxito muestra «Valor recibido $488» y, debajo, «Recibiste 166.6666667 XLM».

Usar payout del servidor evita inventar un neto, pero no demuestra que sea el valor del activo entregado. La diferencia no es redondeo: son conceptos de liquidación distintos.

**Origen:** discrepancia previa entre política de comisiones y liquidación, que WP-D ahora expone junta en el recibo. El test de recibo completo solo cubre cashout; el caso depósito usa datos incompletos y no detecta la contradicción.

**Corrección:** definir y rotular el neto contable y el activo efectivamente recibido por separado, o corregir la liquidación en el trabajo que corresponda. No cambiar silenciosamente `amount_stroops` ni el contrato para hacer coincidir la pantalla. Añadir prueba con depósito completo, ambas comisiones y transferencia esperada. En cashout, payout sí puede expresar el efectivo neto que se entrega al cliente; eso no vuelve intercambiables las cifras de depósito.

### H6 · P3 · El límite de longitud no siempre devuelve INVALID_ASSET_CODE

**Referencias:** `micopay/backend/src/services/assetRate.service.ts:144-145`; `micopay/backend/src/routes/trades.ts:52-55`, `:66`; `micopay/backend/src/index.ts:168-176`.

**Escenario:** `asset_code` contiene diez espacios y `XLM` (13 caracteres). preValidation mide la cadena ya recortada, la acepta, pero deja el body original. AJV rechaza su longitud y el handler global devuelve 400 `VALIDATION_ERROR`, no 400 `INVALID_ASSET_CODE`. Una llamada directa al servicio acepta esa misma cadena como XLM.

**Corrección:** acordar si el límite se aplica a la entrada cruda o normalizada y hacer que preValidation y schema usen la misma política. Si el contrato es «más de 12 caracteres => INVALID_ASSET_CODE», comprobar la longitud original antes del trim. Añadir el caso con espacios al test.

**Evidencia:** reproducción con normalizador real y Fastify local: la entrada de longitud 13 llega al error de validación de AJV; `123` da INVALID_ASSET_CODE y `' XLM '` se acepta. No afecta al caso normal que genera el selector.

## Resultado por WP

### WP-A: política y cantidades

- **Creación:** `resolveRequestedEscrowAsset` se ejecuta en `trade.service.ts:301`, después de desestructurar el argumento y antes de log, límites, KYC, secreto, tasa, INSERT y notificaciones. Esa desestructuración no constituye un efecto de negocio. El guard cumple la intención del plan.
- **HTTP:** preValidation comprueba el tipo crudo antes de AJV; los casos de tipo, cadena vacía/blanca, código largo ordinario y activo deshabilitado pasan en la suite. Excepción H6.
- **Locks:** ambos usan `assertLockableEscrowAsset`, sin normalización ni default para filas, antes de mock y de funciones Stellar (`:659`, `:710`). Autorización y comprobación de pending preceden al guard; eso es correcto. Un participante autorizado con fila pending incoherente recibe 409 ASSET_ESCROW_MISMATCH. El catch puede registrar el fallo de auditoría: «cero efectos» aquí no significa «cero logs», sino no bloquear ni transmitir.
- **Cantidades:** para filas válidas del esquema, respuesta, prepare y submit usan el mismo amount entero y la misma función `stroopsAtFrozenRate(platform_fee_mxn, rate_mxn)`. `platform_fee_mxn` es INTEGER NOT NULL (`sql/init.sql:73`), por lo que el Number del serializador no altera ese valor. La suma se hace en BigInt y se serializa a cadena.
- **Firma:** `stellar.service.ts:179-180` coloca amount y fee en el lock; `:228-238` verifica esos argumentos del XDR firmado antes de enviarlo. Coincidencia por inspección y prueba aritmética local; **no** se firmó ni simuló un XDR real en esta auditoría.
- El total representa la transferencia al contrato, **no** el coste total de la cuenta incluyendo comisión de red/Soroban.
- La clase de error conserva `assetCode`, pero el handler global no lo serializa como `asset_code`; el contrato descrito en v2.1 solo exige el código 422. Si algún consumidor espera el payload más amplio de versiones anteriores del plan, habría que añadirlo expresamente.
- Robustez menor: `escrowAmountsForTrade` convierte `platform_fee_mxn=null` en cero, aunque promete no adivinar campos incompletos. NOT NULL impide ese caso en filas normales; conviene cubrirlo si se usa con objetos parciales. No lo trato como bloqueo de despliegue.

### WP-B/C: catálogo, tasa, selector y estado

- Catálogo separado de wallet, cinco opciones, solo XLM habilitado, claves por red/código y decimales solo de presentación.
- `getEscrowAssetRate` reutiliza el cliente XLM y valida tasa finita/positiva; admite cadenas numéricas. No envía el estimado al backend.
- Radios nativos con disabled; el handler además comprueba enabled. La tasa depende de activo/fetcher, no del monto. El cleanup del efecto descarta respuestas tardías de la selección anterior. Con un solo activo habilitado no identifiqué un fallo operativo en ese mecanismo.
- Error de tasa oculta el equivalente sin intervenir en la acción continuar. `activeAssetKey` se reinicia y su código llega a createTrade (`App.tsx:1100-1101`). Los tipos incluyen las tres cantidades opcionales y nullable.
- Estas conclusiones son de lectura y revisión de tests; Vitest no arrancó en este entorno.

### WP-D: rol × fase

La elección de rol por seller_id/buyer_id es correcta y se invierte naturalmente entre flujos:

| Fase | Quien bloquea: cliente cashout / agente depósito | Quien recibe: agente cashout / cliente depósito |
|---|---|---|
| pending sin lock | Total y comisión, futuro «Vas a bloquear» | Monto, futuro «Vas a recibir» |
| locked/revealing | Total «En garantía» | Monto esperado |
| completed | Monto liberado y comisión, sin garantía vigente | Monto recibido |
| refunded | Total reembolsado | Sin resumen |
| cancelled/expired, lock sin liquidación | Total todavía retenido | Sin resumen |

La tabla es correcta **si el estado refleja la liquidación real**; H1/H2 muestran por qué eso no está garantizado hoy. Para una liberación, el copy del vendedor desglosa monto y comisión en vez de repetir el total: aceptable y fiel al contrato.

No encontré una conversión de unidades del activo con una tasa viva después de crear la operación en las superficies revisadas. `formatStroops` formatea cadenas sin flotantes. **Sí queda una suma de comisión en el cliente:** SuccessScreen suma `platform_fee_mxn + provider_fee_mxn` para presentarlas juntas. Son importes del servidor, no porcentajes ni tasas locales; la considero una agregación de presentación aceptable. Si se exige literalmente cero aritmética monetaria cliente, exponer también esa suma en la API.

SuccessRoute ahora usa el detalle y el proveedor: seller_username en depósito y buyer_username en cashout para filas coherentes. El neto se toma de payout_mxn. Faltan la coherencia semántica de H5 y pruebas de SuccessRoute con proveedor en ambos flujos. El prop `type` aún proviene del flujo local; no lo presento como regresión nueva, pero conviene preferir el flujo persistido al ampliar la recuperación de operaciones.

### WP-E: eliminaciones y cobertura real

Se buscaron referencias en el árbol anterior y actual, importaciones y patrones lazy/glob. Las tres eliminadas no tenían consumidores activos en `micopay/frontend`; aparecían sus propias declaraciones y un comentario antiguo. La pantalla vigente es `pages/TradeConfirmation.tsx`, que permanece. Las rutas de cancelación viven en TradeDetail. **La eliminación es válida.**

`escrowAssetCopy.test.ts` cubre estáticamente 15 archivos del flujo y nueve secciones i18n, incluyendo DepositQR, TradeDetail, confirmación final y éxito. **No renderiza esas pantallas** ni descubre automáticamente nuevas dependencias. Sirve como comprobación de textos fijos, no como prueba de que todas muestran el activo correcto o de que los imports eliminados eran muertos. Por eso no detecta H4.

El eliminador de comentarios es una regex, no un parser TSX; sus resultados deben tratarse como complemento. Los tests renderizados de escrowDisplay cubren el componente resumen, confirmación y éxito, pero no recorren todos los flujos reales ni el listener/sweep.

### WP-F: seeds

El helper declara XLM, tasa 3.0000000 y origen demo_seed_synthetic; usa la aritmética compartida. Ambos INSERT escriben esas columnas. `test:demo-seed` pasó. Elegir tasa fija para no depender de una API durante el arranque es una desviación razonable.

No se ejecutó el arranque del servidor con PostgreSQL limpio, ni se verificaron las 68 filas reportadas por el implementador. La marca sintética queda en BD, pero la UI del resumen no la usa: la declaración interna no hace que una operación ficticia se identifique visualmente como ficticia.

## Respuestas a los cinco puntos explícitos

### 1. MerchantOfferCard sin activo

**Aceptable en este ciclo**, como desviación documentada, mientras solo se pueda elegir XLM y la confirmación final obligatoria muestre XLM/Stellar y el estimado. No introduce selección ambigua entre agentes. Al habilitar un segundo activo o filtrar liquidez, las tarjetas/mapas deberán contextualizar la oferta. Esto no justifica omitir DepositQR, que forma parte de la etapa posterior a creación.

### 2. cancelled/expired con lock sin liberar

**Correcto como regla de contrato; insuficiente como inferencia con el backend actual.** Cancelar en la app o llegar al timeout no ejecuta por sí mismo refund. El total continúa retenido hasta una transacción de refund o release. Sin embargo, H1 impide inferirlo siempre de esos tres campos. Además el sweep solo selecciona canceladas, no todo locked/revealing vencido, y H2 deja la pantalla desactualizada aun cuando sí se liquide.

### 3. Trustline por VITE_ESCROW_ASSET_CODE

**Corregir ahora en QRReveal y TradeDetail.** XLM no requiere trustline y el guard del servidor llega demasiado tarde para evitar ChangeTrust del cliente. WP3 queda para seleccionar issuer/contrato y habilitar realmente activos emitidos, no para eliminar esta contradicción.

### 4. SEED_DEMO_DATA=true y filas antiguas 1:1

No consulté producción: tomo el valor de la variable como dato reportado, no como verificación propia. El despliegue no reescribe las filas existentes. `seedData` se salta la inserción si encuentra cualquier trade; el seed de agentes conserva historial si detecta la cuenta esperada. **No encontré un bloqueo automático de fondos provocado por WP-F al arrancar.**

Hay riesgos concretos que ya existían:

- El guard valida el activo, no la calidad de la tasa ni `rate_source`. Una fila XLM a tasa 1 no se rechaza por ese motivo. No deben reutilizarse como operaciones reales.
- Los seeds originales escriben estados pending/locked/revealing con secretos ficticios (`hash_${i}`), sin hash real de lock, sin secreto cifrado y con vencimientos calculados desde fechas sintéticas (`index.ts:276-316`). Las pending concretas de ese bucle nacen ya vencidas. Los locks no comprueban vencimiento antes de intentar preparar; las direcciones/secretos inválidos hacen fallar el recorrido real, pero no son una política deliberada de aislamiento de demo.
- La nueva presentación admite `locked` como evidencia aunque no haya hash; por tanto una fila demo locked 1:1 puede mostrar «En garantía» y una cantidad ficticia. `rate_source` no se usa para marcarla. Una fila así no significa que exista esa cantidad en cadena.
- El sweep exige `lock_tx_hash`; no toca los seeds sin ese dato. Si hay hashes mock/manuales en la base real, eso requiere inventario de filas; no puede concluirse por lectura del seed.

**Medida operativa antes de dar por validada la demo desplegada:** inventariar sin modificar las filas demo/legacy y su estado/hash, separarlas de operaciones reales y excluir su presentación como evidencia de fondos. No reescribir importes de operaciones reales ni borrar filas solo por tasa=1. Desactivar seeds no sanea datos ya existentes. No certifico ausencia de riesgo en una base que no consulté, ni afirmo que haya una pérdida de fondos comprobada.

### 5. Caminos fuera de guards

- Creación normal micopay: único llamador productivo localizado, `routes/trades.ts:82` → createTrade. Llamadas directas al servicio quedan cubiertas; fixtures y los dos INSERT de seeds no pasan por él.
- Bloqueo gestionado de trades: prepareLockTx y submitLockTx se invocan desde los dos servicios guardados. No encontré otro llamador productivo que actualice una operación micopay como bloqueada eludiendo esos guards. Mock pasa también por ellos.
- **Existe un relay genérico** `/stellar/submit` (`routes/stellar.ts:11-49`) que acepta XDR firmado y lo transmite sin esta política. También cualquier dueño de una cuenta puede invocar el contrato directamente. Eso puede crear un lock on-chain fuera de `/trades`, pero no inserta ni convierte por sí solo una fila de trades: el listener ignora el evento locked (`event-dispatcher.service.ts:100`). No es una capacidad de gastar cuentas ajenas sin firma ni una activación de USDC en el escrow XLM.
- ensureTrustline envía otra clase de transacción antes del guard: H3.
- `apps/api` conserva su propio producto y servicios; no se trasladan estos guards automáticamente a ese backend, excluido por el plan. La demo local de App.tsx fabrica estado cliente, no una operación real del servicio.

## Verificación: ejecutado frente a leído

| Verificación | Resultado real en esta auditoría |
|---|---|
| git log/diff/status, plan, código y tests relacionados | Ejecutados/leídos; HEAD coincide. |
| npm run test:trade-asset | El wrapper npm falló en Windows por sintaxis `ALLOW_IN_MEMORY_DB=true ...`. |
| Misma suite con variables PowerShell + node --import tsx src/tests/tradeAsset.test.ts | **Pasó, exit 0, en memoria** tras fallar la autenticación PostgreSQL y usar fallback. Incluyó ambos flujos, tipos inválidos, política directa, ambos locks mock/real y cantidades. |
| npm run test:demo-seed | **Pasó, exit 0**. Test del helper y estructura de INSERT; no es arranque con DB. |
| npm run test:trade-flow | Mismo problema de sintaxis del wrapper. |
| Misma suite con variables PowerShell + node --import tsx src/tests/tradeFlow.test.ts | **Pasó, exit 0, en memoria** tras fallback de PostgreSQL. |
| npx tsc --noEmit -p . backend | **Pasó, exit 0**. |
| npx tsc --noEmit -p . frontend | **Pasó, exit 0**. |
| npx vitest run frontend | **No arrancó**: failed to load vitest.config.ts, esbuild `spawn EPERM`. No se verifican aquí los 308/308 reportados. |
| migrate + test:trade-asset-pg | **No ejecutados**: la conexión configurada rechazó autenticación para postgres y no había una conexión de pruebas validada. No se aplicaron migraciones a una base desconocida. La suite PG se leyó, incluido control XLM que exige dos reservas. |
| cashHandoff contra PostgreSQL | No ejecutado. El fallo previo reportado no se atribuye a estos commits. |
| Reproducción de dispatcher refunded + helper visual | Ejecutada con código transpilado en memoria y dobles; reproduce H1. No toca PostgreSQL ni Stellar. |
| Reproducción de longitud con espacios y preValidation | Ejecutada con Fastify y normalizador local; reproduce H6. |
| Reinyecciones de defectos reportadas por el implementador | No repetidas: no se modificó código. Los tests actuales no contienen espías de cero llamadas Stellar ni una reinyección automática. Se inspeccionó el orden real. |
| Comparación con XDR firmado / transferencia / refund testnet | Solo lectura de aritmética, argumentos y contrato. No ejecución on-chain. |
| APK, dispositivo, ECS, SEED_DEMO_DATA remoto y filas desplegadas | No verificados en esta sesión. |

Los scripts que agrupan comandos pueden terminar con el exit code del último comando; los fallos intermedios anteriores se registran expresamente y no se convierten en «verde» por el exit code global.

### Pruebas que faltan para cerrar los hallazgos

1. Integración evento refund → persistencia → resumen, incluyendo cancelada y evento posterior a refund HTTP/sweep.
2. Detalle abierto mientras sweep cambia cancelled a refunded.
3. Ruta real DepositChat → DepositQR mostrando unidades recibidas del servidor.
4. Ambos puntos de lock frontend con variable VITE discordante, sin ChangeTrust innecesario.
5. Recibo completo de depósito y conciliación entre payout y unidades transferidas.
6. Longitud cruda con espacios y código exacto del error.

Después, repetir las suites completas en un entorno donde Vitest y PostgreSQL sí estén disponibles y completar las comprobaciones testnet/APK del plan. Los resultados reportados por otra ejecución son antecedentes útiles, no sustituyen la evidencia propia indicada aquí.
