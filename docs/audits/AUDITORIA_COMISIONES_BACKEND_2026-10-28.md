# Auditoría del sistema de comisiones y bloqueo escrow

**Fecha:** 28 de octubre de 2026
**Alcance:** backend, API, base de datos, preparación y validación del XDR,
pantalla de confirmación y pruebas relacionadas con las comisiones del agente y
de MicoPay.
**Modalidad:** revisión de código y pruebas locales. No se modificó la lógica
del producto ni se ejecutaron operaciones con fondos reales.

## Actualización de implementación — 28 de octubre de 2026

El hallazgo **P1-3 quedó corregido**. El backend bloquea por defecto cualquier
operación cuyo costo real combinado (agente + MicoPay) exceda **6%**.

- Comisión de MicoPay: 0.8%.
- Máximo nominal configurable del agente con la política actual: 5.2%.
- El control se repite al guardar la tarifa, publicar una oferta y crear la
  operación. Así también quedan bloqueadas configuraciones antiguas.
- La comprobación final usa los pesos cobrados después del redondeo. Por eso
  una combinación nominal de 6% puede rechazarse en montos pequeños si los dos
  redondeos hacen que el costo real supere 6%.
- El valor se cambia con `MAX_EFFECTIVE_FEE_PERCENT`; no exige modificar ni
  volver a desplegar el contrato Soroban. Sí exige reiniciar/desplegar el
  backend con la nueva configuración.
- El backend comunica el límite vigente al APK, de modo que la interfaz no
  necesita recompilarse para reflejar un cambio posterior.

P1-1, P1-2 y los hallazgos P2 de este documento siguen pendientes salvo que se
indique expresamente lo contrario en su sección.

## Resumen ejecutivo

La decisión de mantener la comisión del agente fuera del contrato es correcta.
La aritmética principal está centralizada, la tarifa se congela en la operación,
la conversión MXN-activo usa enteros y el XDR se valida tanto en backend como en
el APK. No se encontró un error aritmético que cobre dos veces la comisión.

El riesgo importante está en la frontera comercial anterior a la firma. La
pantalla muestra una cotización obtenida durante el descubrimiento, pero al
confirmar el backend vuelve a leer la tarifa mutable del agente. No existe un
`quote_id`, una versión de tarifa ni una comparación entre lo revisado y lo que
se crea. Si la tarifa cambia en ese intervalo, la app puede construir, validar y
firmar un bloqueo distinto del que la persona acaba de revisar.

También se encontró que los límites del agente se aplican al `seller` del
escrow. Eso es correcto para depósitos, pero incorrecto para retiros, donde el
agente es el `buyer`. Al momento original de esta auditoría, el backend también
permitía tarifas de agente de hasta 100% y el límite visual era únicamente una
advertencia. P1-3 ya fue corregido mediante la actualización descrita arriba.

**Veredicto actualizado:** la arquitectura es sólida y P1-3 ya está cerrado.
P1-1 y P1-2 todavía deben cerrarse antes de usar este sistema de comisiones en
Mainnet.

## Arquitectura revisada

```text
Configuración del agente
        ↓
GET /merchants/available
        ↓ cotización mostrada
Pantalla de confirmación
        ↓
POST /trades
        ↓ nueva lectura de la tarifa
Registro congelado en PostgreSQL
        ↓
Preparación de lock(amount, platform_fee)
        ↓
Validación del XDR en APK y backend
        ↓
Firma local y envío a Soroban
```

## Fortalezas comprobadas

1. `computeTradeFees()` es la única fuente de cálculo de las dos comisiones.
2. El backend deriva `provider_id`; el cliente no puede elegir arbitrariamente
   qué participante será tratado como agente.
3. `amount_mxn` llega como entero entre 100 y 50,000 MXN.
4. La tarifa del agente, su comisión, la comisión de plataforma y el modelo se
   guardan al crear la operación.
5. La tasa del activo también se congela al crear la operación.
6. La conversión MXN-activo evita cadenas de `float` y usa `BigInt` con
   redondeo definido.
7. `prepareLockTrade` y `lockTrade` reconstruyen la comisión de plataforma con
   la misma tasa congelada.
8. El backend inspecciona contrato, función, source account y todos los
   argumentos del XDR firmado antes de enviarlo.
9. El APK rechaza red, contrato, cuenta, montos, participantes, plazo o secreto
   que no coincidan con la operación autenticada.
10. `decline` y `refund` devuelven todo lo bloqueado, incluida la comisión.

Estas propiedades justifican conservar el contrato simple. Los problemas
encontrados pueden corregirse en el backend, API y base de datos.

## Hallazgos

### P1-1. La cotización revisada no queda vinculada a la operación firmada

**Evidencia**

- El descubrimiento calcula las cifras con la tarifa vigente del agente.
- La pantalla de confirmación conserva esas cifras en el estado de navegación.
- `POST /trades` solo recibe contraparte, monto, flujo y activo. No recibe un
  identificador de cotización ni la tarifa esperada.
- Al crear la operación, el backend vuelve a consultar
  `merchant_configs.rate_percent` y recalcula las comisiones.
- Inmediatamente después, la app obtiene la nueva operación y firma un `lock`
  validado contra esas nuevas cifras, no contra las mostradas anteriormente.

**Escenario reproducible con la fórmula actual**

```text
Monto en efectivo                         500 MXN
Tarifa mostrada en confirmación           1.5%
Total mostrado para bloquear              512 MXN

El agente cambia su tarifa a              100%
Total que POST /trades puede crear       1004 MXN
```

La validación XDR funciona, pero valida coherencia con la fila recién creada.
No detecta que esa fila difiere de la cotización que la persona revisó.

**Impacto**

Un cambio legítimo, una carrera intencional o una cuenta de agente comprometida
puede provocar que el usuario firme un monto distinto al confirmado en
pantalla.

**Corrección recomendada**

1. Crear una cotización server-side con `quote_id`, valores congelados,
   `provider_id`, flujo, activo, monto y expiración corta.
2. Hacer que `POST /trades` acepte únicamente un `quote_id` válido, no cifras
   recalculadas silenciosamente.
3. Consumir la cotización de forma atómica al crear la operación.
4. Si la tarifa cambió o la cotización venció, responder `409 QUOTE_CHANGED` y
   obligar a mostrar una nueva confirmación.
5. Como segunda defensa, comparar en el APK la operación creada con la
   cotización local revisada antes de solicitar biometría o firmar.

### P1-2. En cashout se aplican los límites del cliente, no los del agente

**Evidencia**

`createTrade()` deriva correctamente el proveedor:

```text
deposit: provider = seller
cashout: provider = buyer
```

Sin embargo, después llama:

```text
validateAgainstMerchantLimits(sellerId, amountMxn)
```

La función consulta `merchant_configs` y suma volumen con
`WHERE seller_id = $1`.

En depósito coincide porque el agente es el `seller`. En retiro el `seller` es
el cliente y el agente es el `buyer`, por lo que:

- no se aplican el mínimo y máximo configurados por el agente;
- no se aplica su tope diario;
- la suma diaria se atribuye a la cuenta equivocada.

El filtro del mapa no es una defensa suficiente porque un cliente autenticado
puede llamar directamente `POST /trades` con la contraparte elegida.

**Impacto**

Se pueden crear retiros fuera de los límites aceptados por el agente y superar
su capacidad diaria.

**Corrección recomendada**

- Cambiar la función para recibir `providerId`.
- Consultar siempre la configuración por `provider_id`.
- Sumar volumen con `trades.provider_id`, no con `seller_id`.
- Añadir pruebas simétricas para `deposit` y `cashout` usando el mismo agente.

### P1-3. El backend permite comisiones de agente de hasta 100%

**Estado: corregido el 28 de octubre de 2026.** El texto siguiente conserva la
evidencia original. La solución implementada usa un tope efectivo configurable
de 6%, con 5.2% nominal máximo para el agente mientras la plataforma cobre
0.8%, y comprueba también el resultado real después del redondeo.

**Evidencia**

El esquema y el servicio aceptan `rate_percent` entre 0 y 100. La app define un
guardrail de costo efectivo de 5%, pero solo muestra una advertencia. El botón
de confirmar continúa habilitado.

Con las fórmulas actuales:

```text
cashout de 500 MXN con tarifa 100%
  comisión agente       500
  comisión plataforma     4
  total bloqueado       1004
  efectivo recibido      500

deposit de 500 MXN con tarifa 99%
  comisión agente       495
  comisión plataforma     4
  saldo recibido           1
```

**Impacto**

Un agente malicioso o comprometido puede publicar una tarifa económicamente
abusiva. La advertencia visual no es un control de seguridad y se combina con
P1-1 para crear un riesgo directo de monto inesperado.

**Corrección recomendada**

- Definir un límite efectivo en el backend, configurable pero con un máximo
  absoluto.
- Por ejemplo, si el costo total permitido es 5% y MicoPay cobra 0.8%, limitar
  al agente a 4.2%.
- Repetir la restricción con un `CHECK` en PostgreSQL.
- Rechazar la configuración, no limitarse a advertir en el frontend.
- Si se necesitan excepciones comerciales, aprobarlas mediante una política
  administrativa auditable, no mediante un máximo general de 100%.

### P2-1. El tope diario se comprueba fuera de la transacción

**Evidencia**

La validación:

1. lee las operaciones del día;
2. suma el volumen;
3. compara contra `daily_cap_mxn`;
4. más adelante abre otra transacción e inserta la operación.

No existe un `FOR UPDATE`, advisory lock o reserva de capacidad del agente en
esa comprobación.

**Impacto**

Dos peticiones concurrentes pueden leer el mismo volumen disponible, aprobarse
y superar juntas el tope diario. El problema se vuelve más probable con varias
instancias del backend.

**Corrección recomendada**

- Mover la comprobación dentro de la misma transacción que inserta el trade.
- Bloquear la fila `merchant_configs` del proveedor con `FOR UPDATE`.
- Recalcular el volumen después de tomar el lock.
- Insertar o reservar el monto antes de liberar el lock.

### P2-2. La base de datos no protege las invariantes monetarias congeladas

**Evidencia**

La tabla guarda `platform_fee_mxn`, `provider_fee_mxn`,
`provider_rate_percent`, `fee_model` y `escrow_amount_mxn`, pero no impone todas
estas restricciones:

- comisiones no negativas;
- tarifa dentro del máximo comercial;
- `fee_model` dentro del conjunto conocido;
- `cash_in_hand` exige `escrow_amount_mxn >= 1`;
- campos monetarios congelados no pueden cambiar después de crear el trade.

`fee_model` es un `VARCHAR` sin `CHECK` y `escrow_amount_mxn` permite `NULL` para
compatibilidad histórica.

**Impacto**

Un bug, script operativo o migración puede dejar una fila incoherente. La
preparación del `lock` confía en los valores almacenados y construye el XDR con
ellos.

**Corrección recomendada**

- Añadir constraints compatibles con registros históricos.
- Proteger las columnas congeladas mediante permisos de base de datos o trigger
  que rechace cambios después del estado `pending`.
- Añadir una comprobación de consistencia antes de preparar el XDR.

### P2-3. La auditoría de creación no registra el desglose financiero

**Evidencia**

El evento de creación registra monto, participantes, flujo e IDs, pero omite:

- tarifa del agente;
- comisión del agente;
- porcentaje y comisión de plataforma;
- `escrow_amount_mxn`;
- activo, tasa y fuente de la tasa;
- identificador o hash de la cotización revisada.

Tampoco se encontró un historial append-only de cambios de configuración del
agente.

**Impacto**

La fila de `trades` conserva las cifras, pero una disputa no dispone de una
evidencia independiente que explique qué oferta se mostró, cuándo cambió la
tarifa o qué desglose se aceptó.

**Corrección recomendada**

- Incluir el desglose completo y `quote_id` en el evento de creación.
- Registrar cambios de `merchant_configs` con valores anterior y nuevo.
- Aplicar retención y permisos append-only a estos eventos.

### P3-1. El porcentaje de plataforma está duplicado y no se congela

**Evidencia**

El backend y el frontend mantienen por separado el 0.8%. La operación guarda el
monto de plataforma, pero no el porcentaje aplicado.

**Impacto**

Al cambiar la política, un APK anterior puede mostrar un porcentaje o costo
efectivo diferente aunque el monto exacto proceda del servidor. También resulta
más difícil explicar operaciones históricas.

**Corrección recomendada**

- Añadir `platform_rate_percent` congelado a la operación y a la respuesta API.
- Usar siempre el valor server-side para etiquetas y costo efectivo.
- Mantener en el frontend solo un fallback para operaciones antiguas.

## Cobertura de pruebas

### Ejecutado correctamente

- Compilación TypeScript del backend: correcta.
- Pruebas unitarias de fórmula: casos de agente y plataforma correctos.
- Propiedades de `cash_in_hand`: 70 combinaciones correctas.
- Frontend: 15 pruebas aprobadas para desglose, tarjetas y validación XDR.

### Limitaciones durante la auditoría

- Los casos de descubrimiento de `tradeFees.test.ts` requieren PostgreSQL real
  y se omitieron al no estar disponible la base local.
- La prueba integrada `cashInHand.test.ts` validó primero la aritmética, pero la
  creación HTTP terminó en `503 RATE_FETCH_FAILED` porque no había acceso a una
  tasa viva.
- No existen pruebas específicas para P1-1, P1-2, P1-3 ni para la carrera del
  tope diario.

## Plan recomendado

### Antes de Mainnet

1. Implementar cotizaciones vinculantes con expiración.
2. Aplicar límites usando `provider_id` en ambos flujos.
3. Imponer un máximo efectivo de comisión en backend y PostgreSQL.
4. Hacer atómica la reserva del tope diario.
5. Añadir pruebas de regresión para los cuatro casos.

### Endurecimiento posterior

6. Añadir invariantes e inmutabilidad de columnas financieras.
7. Ampliar el audit log y registrar cambios de tarifa.
8. Versionar la comisión de plataforma.
9. Alertar cuando cotización, fila, XDR y resultado on-chain no coincidan.

## Conclusión

No hace falta trasladar la comisión del agente al contrato para resolver estos
riesgos. El contrato puede seguir limitado a `amount + platform_fee`.

La mejora clave es convertir la cotización del backend en un compromiso
verificable: lo que se muestra debe ser exactamente lo que se guarda, lo que el
APK valida y lo que finalmente se firma. Con cotizaciones vinculantes, límites
correctos por `provider_id`, topes server-side y controles transaccionales, el
modelo actual conserva la simplicidad on-chain sin sacrificar seguridad.
