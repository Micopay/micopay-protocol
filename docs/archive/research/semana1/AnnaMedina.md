# Propuesta individual

**Nombre:** Anna Medina

**Usuario de GitHub:** annapats

**Proyecto propuesto:** MicoPay — una red de comercios de barrio que entregan pesos en efectivo a cambio de dólares digitales, sin que nadie tenga que confiar a ciegas.

---

## El problema

Quien recibe dinero digital en México y necesita pagarlo todo en efectivo no tiene una forma cercana, barata y segura de convertirlo, sobre todo si no tiene cuenta de banco.

## ¿Quién lo sufre?

- **Personas que reciben dinero digital y lo necesitan en efectivo.** Son receptores de remesas, trabajadores independientes que cobran en dólares y personas sin cuenta bancaria. Cada vez que les llega un pago tienen que trasladarse a una sucursal, hacer fila y aceptar las comisiones que les cobren. Es un problema grande: en 2025 entraron al país US$61,791 millones por remesas, y casi la mitad de las enviadas electrónicamente (49.6%) se cobró en efectivo ([Banxico](https://www.banxico.org.mx/publicaciones-y-prensa/remesas/%7BED06F2CB-06BA-2EC6-D145-73FF4579BADA%7D.pdf)). Además, 37% de los adultos de 18 a 70 años no cuenta con una cuenta de ahorro formal ([ENIF 2024](https://www.inegi.org.mx/contenidos/saladeprensa/boletines/2025/enif/ENIF2024_CP.pdf)).
- **Dueños de pequeños comercios** como tienditas, farmacias o papelerías. Manejan efectivo todos los días y lo tienen parado en la caja. Si pudieran usar ese efectivo para dar un servicio de cambio, tendrían un ingreso extra y más clientes entrando al local.

## ¿Cómo se resuelve hoy y qué cuesta?

| Opción actual | Qué implica | Costo o riesgo |
|---|---|---|
| Remesadoras y tiendas de conveniencia (Elektra, Western Union, retiro en OXXO) | Ir a la sucursal, hacer fila, respetar límites y vencimientos. En OXXO el retiro cuesta $17 MXN, el tope es de $3,000 MXN por referencia y la referencia vence en 48 h. | Entre tipo de cambio y comisiones se puede perder alrededor de 5.5% en una remesa de US$390. |
| Banco + cajero automático | Requiere tener cuenta bancaria. | Excluye justo a quien más lo necesita, y además hay comisiones de cajero. |
| Cambio informal entre personas (grupos de WhatsApp, redes sociales) | Una persona manda primero y la otra entrega después. | Es más barato, pero si la otra parte no cumple se pierde el dinero y no hay a quién reclamar. |

En resumen: hoy convertir dinero digital a efectivo cuesta entre 4 y 6% del monto, además del tiempo de traslado, o bien implica aceptar el riesgo de un fraude.

## ¿Por qué creo que blockchain podría aportar?

*Es una hipótesis que queremos comprobar, no una certeza.* Me baso en dos criterios vistos en la Sesión 1:

1. **Quitar al intermediario que concentra la confianza.** En el cambio informal el problema es que alguien tiene que confiar primero. Un contrato inteligente de escrow en Stellar/Soroban puede guardar los dólares del usuario y soltarlos al comerciante solo cuando se confirma que el efectivo ya se entregó (por ejemplo, con un código QR que se escanea en el momento). Así el intercambio es seguro para los dos lados sin necesitar una empresa en medio.
2. **Un registro compartido que nadie puede alterar entre partes que no se conocen.** El usuario no conoce al comerciante y viceversa. Si cada intercambio terminado queda guardado de forma pública y permanente, cada comercio va construyendo un historial verificable. Esa reputación no depende de una plataforma que la pueda editar o borrar.

Lo que me interesa especialmente es el lado del comerciante: si cada tienda puede fijar su propia comisión (por ejemplo, entre 1.9% y 2.5%) y ver su historial crecer, tiene un incentivo real para participar. Si la hipótesis funciona, el usuario obtiene su efectivo cerca de casa y más barato, y el comercio de barrio gana dinero con algo que ya tenía.
