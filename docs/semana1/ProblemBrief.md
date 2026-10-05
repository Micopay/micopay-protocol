# Problem Brief

## Decisión del problema

### Problema elegido

Quien recibe dinero digital en México y necesita efectivo en mano no tiene una forma cercana, barata y segura de convertirlo, sobre todo si no tiene cuenta bancaria.

La idea y el problema son de **Eric Mota Tejeda**, que creó MicoPay. Las propuestas de Raúl Vallejo ([RaulVallejo.md](RaulVallejo.md)) y Anna Medina ([AnnaMedina.md](AnnaMedina.md)) desarrollan este mismo problema desde el retiro de efectivo y desde el comerciante; el enunciado y la evidencia de este brief parten de ellas.

### Por qué elegimos este

- **Viene de un aprendizaje propio:** en un proyecto anterior, un puente entre SPEI y Stellar, nos topamos con que alguien tenía que custodiar los activos de los usuarios. El escrow resuelve justo eso, y este problema es donde más valor aporta.
- **Partes que no confían entre sí:** el cambio directo entre personas es la opción más barata, pero exige que una de las dos confíe primero en un desconocido. Es el caso más claro de la Sesión 1.
- **Un intermediario que concentra la confianza:** hoy la alternativa segura es una remesadora o una cadena de tiendas que cobra por esa confianza y obliga a desplazarse.
- **Evidencia disponible:** el problema tiene datos oficiales en México (Banxico, INEGI) y señales cualitativas de entrevistas que ya teníamos.

### Propuestas descartadas

| Propuesta | Quién la propuso | Qué pasó con ella |
|---|---|---|
| Puente entre SPEI y Stellar (proyecto anterior, en Código Alebrije) | Eric Mota Tejeda | **Se descartó** porque obligaba a custodiar los activos de los usuarios. Buscando cómo evitarlo, encontró que un escrow podía resolverlo, y eso llevó a este problema. |
| Convertir dinero digital en efectivo, con evidencia de remesas ([RaulVallejo.md](RaulVallejo.md)) | Raúl Vallejo | **No se descartó: es la base del brief.** Aporta el enunciado y la evidencia de Banxico y el INEGI. |
| Red de comercios de barrio que entregan efectivo ([AnnaMedina.md](AnnaMedina.md)) | Anna Medina | **No se descartó: se integró.** Describe el mismo problema desde el comerciante; su aporte (el incentivo del comercio y la comisión que fija cada uno) está en actores y oportunidad. |
| Convertir efectivo en dinero digital cerca de casa ([EricMota.md](EricMota.md)) | Eric Mota Tejeda | **No se descartó: es el flujo inverso del mismo proyecto,** que MicoPay también cubre. Este brief se enfoca primero en el retiro, donde hay más evidencia oficial. |

### Cómo tomamos la decisión

El problema viene de antes de este programa. En Código Alebrije, Eric empezó con un puente entre SPEI y Stellar y encontró una limitación de fondo: el puente obligaba a alguien a custodiar los activos de los usuarios. Buscando cómo evitarlo, vio que un escrow en un contrato inteligente permite que dos personas intercambien sin que nadie custodie el dinero. De ahí nació MicoPay: el cambio directo entre personas, entre efectivo y dinero digital.

Para este programa, Eric propuso el problema y el equipo lo adoptó. Cada integrante lo trabajó desde un ángulo distinto (el retiro, el comerciante y el depósito), y acordamos enfocar este brief en el retiro de efectivo, porque es donde tenemos más evidencia.

---

## Problem Brief

### Encabezado

**MicoPay** — cambiar dinero digital por pesos en efectivo con alguien de tu colonia, sin tener que confiar primero en un desconocido.

### Equipo y roles

| Integrante | GitHub | Rol |
|---|---|---|
| Raúl Vallejo | [@vallejoraul08-debug](https://github.com/vallejoraul08-debug) | Apoyo técnico y seguimiento de tareas |
| Anna Medina | [@annapats](https://github.com/annapats) | Comunicación |
| Eric Mota Tejeda | [@ericmt-98](https://github.com/ericmt-98) | CTO |

**Responsables de las entregas:** Raúl Vallejo y Eric Mota Tejeda. **Canal de coordinación interna:** grupo de WhatsApp.

### Problema y evidencia

**Enunciado:** quien recibe dinero digital en México y necesita efectivo no tiene una forma cercana, barata y segura de convertirlo.

**Contexto y alcance.** México recibió **61,791 millones de dólares en remesas en 2025**, y de las enviadas por medios electrónicos, **el 49.6% se cobró en efectivo** ([Banxico, reporte del 3 de febrero de 2026](https://www.banxico.org.mx/publicaciones-y-prensa/remesas/%7BED06F2CB-06BA-2EC6-D145-73FF4579BADA%7D.pdf)). Al mismo tiempo, solo el **63.0% de las personas de 18 a 70 años tiene una cuenta de ahorro formal**; el 37% no la tiene ([INEGI, ENIF 2024](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/enif/ENIF2024_CP.pdf)). La necesidad es frecuente: se repite cada vez que llega un pago y hay que convertirlo para gastos del día.

**Evidencia cualitativa.** Reunimos 25 reportes de validación en primera persona ([VALIDATION_DRIPS.md](https://github.com/Micopay/micopay-protocol/blob/main/docs/VALIDATION_DRIPS.md)). Son una muestra de conveniencia, no un estudio representativo, y la mayoría viene de otros países de América Latina y de Nigeria. Seis incluyen a personas en México. Las fricciones se repiten: una persona en Monterrey cobra con OXXO y cajero, y describe comisiones altas, filas y caídas del servicio (V-7); quien cambia entre particulares teme que la otra parte no cumpla (V-3, V-5); quien recibe stablecoins sigue sin una salida cercana y confiable a efectivo (V-6).

**Observación directa.** Construimos un prototipo y, el 24 de septiembre de 2026, completamos un retiro y un depósito de $500 MXN en red de prueba con un agente de demostración.

### Usuario y actores

**Usuario principal:** una persona que recibe dinero digital (una remesa o un pago de un cliente en el extranjero) y necesita pesos en efectivo para renta, mandado o transporte. Muchas veces no tiene cuenta bancaria. Necesita convertir el dinero **cerca de casa, el mismo día y sin arriesgarlo**.

**Cómo lo resuelve hoy y qué le cuesta:**
- **Ventanilla o tienda de conveniencia:** traslado, fila y comisiones de envío y retiro. En el cálculo de nuestra propuesta individual, una remesa de 390 dólares cobrada en tienda pierde cerca del 5.5% entre tipo de cambio y comisiones.
- **Banco y cajero:** exige una cuenta que el usuario no tiene, y suma comisiones.
- **Cambio informal entre personas:** es más barato, pero si una parte no cumple, el dinero se pierde y no hay a quién reclamar.

**Otros actores:**
- **Remitente:** el familiar o cliente que envía el dinero y elige el canal.
- **Remesadora o plataforma de pago:** mueve el dinero entre países y cobra por el envío y el tipo de cambio.
- **Red de pago en México:** sucursales, bancos o tiendas que entregan el efectivo e identifican a quien lo cobra.
- **Comerciante de barrio con efectivo en caja:** hoy no participa formalmente, pero podría ser el punto de cambio. En la validación, dos personas en ese papel dijeron que les interesaría a cambio de una comisión del 2 al 4%, si el dinero del cliente queda asegurado antes de entregar el efectivo (V-3, V-24).

### Flujo actual de valor

Recorrido típico de una remesa electrónica que se cobra en efectivo:

1. **Remitente → remesadora.** El familiar paga el envío en su país. La remesadora cobra una comisión y fija el tipo de cambio. *Obligación normativa:* identificación del remitente (conoce a tu cliente) por las reglas contra el lavado de dinero.
2. **Remesadora → red de pago en México.** La remesadora liquida con su socio local: un banco, una cadena comercial o una tienda. El usuario no ve este paso ni lo controla.
3. **Aviso al beneficiario.** El usuario recibe una referencia o clave para cobrar, que puede tener vencimiento y tope por operación.
4. **Traslado y fila.** El usuario va a una sucursal o tienda con horario, disponibilidad de efectivo y fila.
5. **Identificación y pago.** Muestra su identificación y la referencia. *Obligación normativa:* identificación del beneficiario. La red de pago puede cobrar otra comisión.
6. **Efectivo en mano.** El usuario recibe pesos, ya descontados el tipo de cambio y las comisiones de los pasos 1 y 5.

**Variante informal (cambio entre particulares):**

1. El usuario acuerda con un conocido o un contacto de redes cambiar su saldo digital por efectivo.
2. **Una de las dos partes entrega primero**: el usuario transfiere, o el otro entrega el efectivo.
3. La otra parte cumple, o no. **No hay intermediario, registro ni forma de reclamar.**

Intermediarios explícitos del flujo formal: remesadora, red de pago local y, en el origen, el banco o medio de pago del remitente.

### Fricciones identificadas

1. **Costo acumulado (pasos 1 y 5).** El tipo de cambio y las comisiones de envío y cobro se suman. *Causa:* cada intermediario cobra su parte. *Afecta a:* quien recibe, que ve reducido el monto final (cerca del 5.5% en nuestro cálculo de referencia).
2. **Traslado, fila y horario (paso 4).** Hay que ir a una sucursal con horario y efectivo disponible, y el servicio puede estar caído. *Causa:* la red de cobro está concentrada en sucursales. *Afecta a:* quien recibe, en tiempo y transporte (V-7).
3. **Límites y vencimientos (paso 3).** Topes por referencia y fechas de vencimiento obligan a cobrar en varias partes o a volver. *Causa:* las reglas operativas del canal. *Afecta a:* quien recibe montos más grandes o no puede ir a tiempo.
4. **Exclusión de quien no tiene cuenta (alternativa bancaria).** El camino más barato exige una cuenta que el 37% de los adultos no tiene. *Causa:* el requisito de cuenta. *Afecta a:* la población sin banco.
5. **Riesgo de contraparte en el cambio informal (paso 2 de la variante).** Alguien tiene que confiar primero en un desconocido. *Causa:* no hay garantía ni registro compartido. *Afecta a:* las dos partes. Es el temor que más se repite en la validación (V-3, V-5, V-24).

### Oportunidad e hipótesis

**Oportunidad priorizada: la fricción 5, el riesgo de contraparte en el cambio entre personas.**

La elegimos porque el cambio entre personas ya resuelve las fricciones 1 a 4: es cercano, no exige cuenta, no tiene fila y la comisión la acuerdan las partes. Lo único que lo frena es la confianza. Si se elimina ese riesgo, la opción que ya es más barata y cercana se vuelve también segura. Además, hay oferta potencial: comercios de barrio con efectivo en caja que, según la validación, participarían por una comisión del 2 al 4% si el dinero del cliente queda asegurado antes de entregar el efectivo.

**Hipótesis:** si el saldo digital del usuario queda retenido por un contrato que ninguna de las dos partes controla, y solo se libera cuando ambas confirman la entrega en persona, entonces **ninguna tiene que confiar primero en la otra**.

Para el usuario cambiaría esto:
- Cambia su dinero **a unas cuadras de casa, en minutos**, sin cuenta bancaria.
- Paga una comisión conocida por adelantado, que fija cada comerciante.
- Si el comerciante no entrega el efectivo, **sus fondos no se pierden**: vuelven a él cuando vence la operación.
- Puede elegir comerciante por un **historial de operaciones completadas** que el propio comerciante no puede maquillar.

Es una hipótesis, no una certeza. La sección de supuestos dice qué tendría que ser cierto para que funcione.

### Criterio de pertinencia

**Partes que no confían entre sí necesitan compartir un mismo registro.** El usuario y el comerciante no se conocen y están frente a frente con dinero de por medio. Los dos necesitan ver lo mismo, al mismo tiempo: que el saldo está bloqueado, a nombre de quién y en qué condiciones se libera. Si ese registro lo llevara una de las partes, la otra tendría que creerle.

**Se elimina un intermediario que concentra la confianza.** Con una base de datos tradicional, alguien tendría que **custodiar el dinero** mientras dura el intercambio: una empresa que retiene los fondos y decide cuándo liberarlos. Esa empresa es exactamente el intermediario que hoy encarece el flujo, y concentra el riesgo: puede equivocarse, cerrar o quedarse con los fondos. Con un contrato en una red distribuida, las reglas de liberación están en el código, son públicas y ninguna de las partes, incluidos nosotros, puede cambiarlas a mitad de una operación.

**El histórico no puede alterarse.** La reputación de cada comerciante se construye con sus operaciones completadas. Si ese historial viviera en nuestra base de datos, podríamos editarlo, y el usuario tendría que confiar en nosotros. En un registro inalterable, la reputación es verificable por cualquiera.

**Por qué no basta una integración entre sistemas existentes:** los sistemas actuales (remesadoras, bancos, tiendas) son justamente los intermediarios que cobran por la confianza, y el usuario sin cuenta bancaria no tiene acceso a ellos. Integrarlos no elimina ni el costo ni la exclusión.

### Supuestos y riesgos

**Supuesto 1: hay comerciantes con efectivo dispuestos a participar.** La hipótesis depende de que existan puntos de cambio cerca del usuario. La validación sugiere interés con una comisión del 2 al 4% (V-3, V-24), pero son dos opiniones, no una red real.
*Lo invalidaría:* que los comerciantes no quieran manejar efectivo ajeno, que la comisión necesaria no sea competitiva frente a la tienda de conveniencia, o que no haya suficientes cerca de los usuarios.

**Supuesto 2: el usuario puede recibir y manejar dinero digital.** Suponemos que el remitente puede enviar el dinero en un formato digital compatible, y que el usuario puede usar una app en su teléfono y resguardar su acceso.
*Lo invalidaría:* que los remitentes no tengan una forma sencilla de enviar así, o que resguardar la cuenta resulte demasiado difícil. En la validación, el respaldo de la llave fue una duda recurrente (V-4, V-22).

**Supuesto 3: la confirmación en persona es suficientemente confiable.** Suponemos que la entrega del efectivo se puede confirmar en el momento, con un código que el usuario muestra y el comerciante escanea.
*Lo invalidaría:* disputas donde una parte afirme que entregó y la otra lo niegue, fallas de conexión en el momento de la entrega (el temor principal en V-2 y V-5), o riesgos de seguridad física al llevar efectivo.

**Riesgo transversal: la regulación.** Recibir dinero digital y entregar efectivo por una comisión podría considerarse una actividad regulada de transmisión de dinero. Tenemos que confirmarlo antes de operar con dinero real.
