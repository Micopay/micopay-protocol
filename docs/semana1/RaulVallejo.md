# Propuesta individual

**Nombre:** Raúl Vallejo

**Usuario de GitHub:** vallejoraul08-debug

**Proyecto propuesto:** MicoPay — cambiar dólares digitales por pesos en efectivo con alguien de tu colonia.

## El problema

Quien recibe dinero digital en México y necesita efectivo en mano no tiene una forma cercana, barata y segura de convertirlo, sobre todo si no tiene cuenta bancaria.

## ¿Quién lo sufre?

- **Receptores de remesas y personas sin banco** que reciben dólares (o stablecoins) de un familiar o un cliente y necesitan pesos en efectivo para gastos del día: renta, mandado, transporte. Lo viven cada vez que les llega dinero y tienen que ir a buscar dónde cobrarlo. En 2025 México recibió US$61,791 millones en remesas, y de las enviadas por medios electrónicos el 49.6% se cobró en efectivo ([Banxico](https://www.banxico.org.mx/publicaciones-y-prensa/remesas/%7BED06F2CB-06BA-2EC6-D145-73FF4579BADA%7D.pdf)). Además, el 37% de los adultos de 18 a 70 años no tiene cuenta de ahorro formal ([ENIF 2024](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/enif/ENIF2024_CP.pdf)).
- **Comerciantes de barrio** (farmacia, tiendita, café) que tienen efectivo ocioso en caja y hoy no tienen forma de sacarle rendimiento.

## ¿Cómo se resuelve hoy y qué cuesta?

1. **Ventanilla de remesas o tienda de conveniencia** (Elektra, Western Union, retiro en OXXO): hay que ir hasta la sucursal y hacer fila, y pagar comisión de envío más comisión de retiro. En OXXO el retiro cuesta $17 MXN al usuario, tiene un tope de $3,000 MXN por referencia y la referencia vence a las 48 h. En nuestras cuentas, una remesa de US$390 que se cobra en OXXO pierde cerca de 5.5% entre tipo de cambio y comisiones.
2. **Cuenta bancaria + cajero:** exige tener cuenta, que es justo lo que le falta a este usuario, y suma comisiones de cajero.
3. **Cambio informal entre personas** (P2P en redes o grupos de mensajería): es más barato, pero una de las dos partes tiene que confiar primero. Si mandas los dólares y el otro no entrega el efectivo (o al revés), pierdes el dinero y no hay a quién reclamar.

Lo que cuesta en conjunto: 4–6% del monto, tiempo de traslado y fila, y en la vía informal, el riesgo de fraude.

## ¿Por qué creo que blockchain podría aportar?

*Hipótesis, no certeza.* Criterios de la Sesión 1 en los que me apoyo:

- **Eliminar un intermediario que concentra la confianza:** hoy el usuario confía en la remesadora o se arriesga con un desconocido. Un contrato de escrow (en Stellar/Soroban) retendría los dólares del usuario y solo los liberaría al comerciante cuando este confirme que entregó el efectivo en mano, por ejemplo escaneando un QR. Ninguna de las dos partes tiene que confiar primero en la otra.
- **Partes que no confían entre sí comparten un registro con un histórico que no se puede alterar:** usuario y comerciante no se conocen. Si cada intercambio completado queda registrado de forma pública e inalterable, eso da una reputación verificable del comerciante que no depende de que una empresa la administre ni pueda maquillarla.

Si la hipótesis se cumple, el usuario cambia su dinero a unas cuadras de su casa en minutos, con una comisión que fija cada comerciante (1.9–2.5%), y el comerciante cobra por el efectivo que ya tenía en caja.
