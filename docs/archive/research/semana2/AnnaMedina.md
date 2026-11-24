# Historias de usuario individuales

**Nombre:** Anna Medina

**Usuario de GitHub:** annapats

---

## Casos reales en los que me baso

Mis historias salen de dos cambios de cripto a efectivo que viví de cerca. En ninguno existía MicoPay; los dos se resolvieron confiando en una persona.

**Caso 1. Caja chica de una residencia en Buenos Aires (octubre y noviembre de 2025).** Organizamos una residencia de incubación con builders de varios países. La tesorería de Funding the Commons, al ser una organización estadounidense, estaba en dólares, pero los gastos imprevistos de la casa se pagaban en pesos argentinos y en efectivo. Un residente argentino se ofreció como tesorero: nos fijaba un tipo de cambio (con un margen para él), le enviábamos USDC o USDT y él nos entregaba el efectivo. Funcionó porque lo conocíamos, en un país con alta inflación y un tipo de cambio muy volátil.

**Caso 2. Una amiga de la India de visita en CDMX y Oaxaca (agosto de 2026).** Vino a conocer México con cripto y descubrió que, aunque hay pagos digitales, el efectivo sigue siendo indispensable en mercados, transporte y comercios pequeños. En la India hacer cash-out de cripto también le resultaba complicado. Como la app aún está en desarrollo, preguntamos en grupos y nos recomendaron a alguien de confianza. A ella le daba miedo encontrarse con un desconocido, así que la persona le entregó el efectivo con un retiro en cajero sin tarjeta, solo con un código. El tipo de cambio fue un poco castigado, pero le convino a los dos.

## Mis historias de usuario

1. Como turista extranjera que llega a México con USDC y sin cuenta bancaria local quiero cambiarlos por pesos en efectivo con un proveedor verificado cerca de donde me hospedo para pagar en mercados, taxis y comercios que solo aceptan efectivo.
2. Como usuaria quiero ver el tipo de cambio final y cuántos pesos voy a recibir antes de bloquear mis USDC para comparar ofertas y saber que el margen que cobra el proveedor es justo.
3. Como usuaria que no quiere verse en persona con un desconocido quiero que el proveedor me entregue el efectivo con un código de retiro sin tarjeta en cajero, y que mis USDC solo se liberen cuando lo retire, para recibir mi dinero sin exponerme.
4. Como organización que opera en el extranjero con tesorería en dólares quiero mantener una caja chica en moneda local cambiando USDC con proveedores verificados para cubrir gastos imprevistos en efectivo sin abrir cuentas locales ni cargar billetes desde mi país.
5. Como persona con efectivo disponible (no necesariamente un comercio) quiero publicar mi propio tipo de cambio y el monto máximo que puedo entregar para ganar un margen y, en países con alta inflación, cambiar mis pesos por un activo en dólares.
6. Como usuaria primeriza que teme ser estafada quiero ver el historial de intercambios del proveedor y acordar dentro de la app el punto y la hora de entrega para confiar en él sin compartir mi número personal.
7. Como tesorera de un equipo quiero descargar el registro de cada cambio (fecha, monto, tipo de cambio y proveedor) para rendir cuentas de la caja chica a la organización.

## La más importante y por qué

| Orden de importancia | Historia # | Por qué |
| :---: | :---: | --- |
| 1 (la más importante) | 1 | Es mi caso 2 tal cual y amplía el usuario del Problem Brief: además de quien recibe remesas, hay extranjeros con cripto que necesitan efectivo y no tienen cuenta en México. El flujo central es el mismo, así que no agrega complejidad al MVP. |
| 2 | 2 | En los dos casos el tipo de cambio se negoció de palabra y aceptamos un precio castigado sin poder comparar. Ver la cotización final antes de bloquear es lo que hace que la comisión sea "conocida por adelantado", como promete la propuesta de valor. |
| 3 | 5 | El tesorero de Buenos Aires no era un comercio, era una persona con efectivo. Abrir la oferta a personas multiplica los puntos de cambio, y en países con inflación el proveedor tiene un incentivo extra: quedarse con dólares. |
| 4 | 6 | El miedo de mi amiga fue el principal freno, y la confianza vino de una recomendación. El historial verificable y coordinar la entrega dentro de la app reemplazan esa recomendación cuando no conoces a nadie. |
| 5 | 4 | Es un segmento empresarial real (residencias, eventos y equipos remotos) con montos más altos y uso repetido, pero puede usar el mismo flujo que una persona; no necesita funciones propias para el MVP. |
| 6 | 7 | La organización necesita comprobar los gastos, pero en el piloto el registro se puede consultar en el explorador de la red y pasarse a mano a una hoja de cálculo. |
| 7 (la menos importante) | 3 | Resolvió el miedo en mi caso 2, pero depende de la app de un banco y es difícil confirmar en la red que el retiro ocurrió. Queda para después del MVP, como alternativa a la entrega en persona. |
