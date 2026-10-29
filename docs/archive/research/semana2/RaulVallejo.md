# Historias de usuario individuales

**Nombre:** Raúl Vallejo

**Usuario de GitHub:** vallejoraul08-debug

---

## Mis historias de usuario

1. Como receptor de remesas sin cuenta bancaria quiero cambiar mis dólares digitales (USDC) por pesos en efectivo en un comercio a pocas cuadras de mi casa para no ir hasta una sucursal ni perder cerca de 5% entre tipo de cambio y comisiones.
2. Como usuario que cambia dinero con un desconocido quiero que mis USDC queden retenidos en un escrow y solo se liberen al comercio cuando yo confirme que recibí el efectivo para no tener que confiar primero en la otra persona.
3. Como usuario quiero que, si el comercio no me entrega el efectivo dentro del plazo acordado, mis USDC regresen solos a mi billetera para no perder mi dinero ni depender de que alguien atienda un reclamo.
4. Como usuario quiero ver en un mapa los comercios cercanos con su comisión y su historial de intercambios completados para elegir el más barato y confiable antes de salir de casa.
5. Como comerciante de barrio quiero publicar mi comisión y el monto máximo de efectivo que puedo entregar al día para ganar dinero con el efectivo que hoy tengo parado en caja.
6. Como comerciante quiero escanear el código QR del usuario al entregar el efectivo para cobrar mis USDC en ese momento, sin conciliar pagos a mano.
7. Como usuario nuevo quiero crear mi billetera en menos de un minuto solo con mi teléfono para empezar a usar el servicio sin abrir una cuenta de banco ni entender de cripto.

## La más importante y por qué

| Orden de importancia | Historia # | Por qué |
| :---: | :---: | --- |
| 1 (la más importante) | 2 | Es la hipótesis central del Problem Brief: el cambio informal ya es barato, lo que falla es que alguien tiene que confiar primero. Si el escrow no resuelve eso, el producto no tiene razón de existir. |
| 2 | 1 | Es el resultado que busca el usuario principal (receptor de remesas sin banco): efectivo cerca y más barato. Sin este flujo de cash-out no hay producto. |
| 3 | 6 | Es la otra mitad del intercambio: el comercio solo participa si cobra en el momento en que entrega el efectivo. Cierra la historia 2 de punta a punta. |
| 4 | 3 | Protege al usuario en el peor caso (el comercio no aparece). Sin devolución automática el escrow solo traslada el riesgo, no lo elimina. |
| 5 | 4 | La reputación verificable es lo que permite elegir entre desconocidos, pero en el arranque puede bastar con una lista corta de comercios conocidos. |
| 6 | 5 | Sin oferta de comercios no hay mercado, pero para el MVP la configuración puede hacerse con el equipo y no requiere una pantalla propia. |
| 7 (la menos importante) | 7 | Reduce fricción de entrada, pero es un requisito técnico que el usuario solo vive una vez; las primeras pruebas pueden acompañarse en persona. |
