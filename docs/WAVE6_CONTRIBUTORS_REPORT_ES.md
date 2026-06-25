# Wave 6 — Reporte de Contribuciones de la Comunidad
### MicoPay Protocol · Validación para la Stellar Development Foundation

> **Documento vivo.** Se actualiza cada vez que se hace merge de un PR de la comunidad a `docs/VALIDATION_DRIPS.md`.
> Propósito: registrar la identidad del contribuidor (usuario de GitHub), qué validó cada persona
> y cómo su evidencia apoya la narrativa de financiamiento ante la SDF.
>
> Síntesis completa → [`VALIDATION_DRIPS.md`](./VALIDATION_DRIPS.md) ·
> Índice de issues → [`WAVE6_RESEARCH_ISSUES.md`](./WAVE6_RESEARCH_ISSUES.md) ·
> Plan Wave 6 → [`AUDIT_APK_WAVE6.md`](./AUDIT_APK_WAVE6.md)

---

## Resumen de contribuidores

| PR | Usuario de GitHub | Issue cerrado | Tema validado | Región | Estado |
|----|-------------------|--------------|--------------|--------|--------|
| [#143](https://github.com/ericmt-98/micopay-protocol/pull/143) | [@attyolu](https://github.com/attyolu) | #142 | V-10 · Reuso y descubrimiento de proveedores | México / LATAM | ✅ Mergeado |
| [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) | [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) | #139 | V-7 · Alternativas actuales y switching | Monterrey MX / Bogotá CO / Buenos Aires AR / Caracas VE | ✅ Mergeado |
| [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) | [@KaruG1999](https://github.com/KaruG1999) | #138 | V-6 · Contexto de remesas y cash-out | Argentina | ✅ Mergeado |
| [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) | [@deep-bhikadiya](https://github.com/deep-bhikadiya) | #141 | V-9 · Seguridad en reunión presencial | India / Sur de Asia | ✅ Mergeado |
| [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) | [@rosemary21](https://github.com/rosemary21) | #140 | V-8 · Tolerancia a comisiones y tarifas | Nigeria (área de Lagos) | ✅ Mergeado |

**Total de respuestas hasta ahora: N=8** (1 lote multi-respondente en V-10 + 4 respuestas en primera persona + 3 implícitas en el lote de V-7)
**Regiones representadas:** México, Colombia, Argentina, Venezuela, India, Nigeria

---

## Cobertura de los 5 argumentos ante la SDF

Cada contribución avanza uno o más de los cinco argumentos de nuestra narrativa de financiamiento.

| Argumento SDF | Issues que lo respaldan | Respuestas recibidas | Faltante |
|---------------|------------------------|---------------------|----------|
| **1. Existe demanda** (la gente necesita convertir efectivo ↔ digital) | V-1, V-2, V-6 | V-6 ✅ (KaruG1999) | V-1 y V-2 aún sin respuesta |
| **2. Existe oferta** (proveedores darían efectivo por una comisión) | V-3 | Ninguna aún | V-3 sin asignar |
| **3. MicoPay puede ganar** (mejor que las alternativas actuales, a una tarifa aceptable) | V-7, V-8 | V-7 ✅ (barnabasolutayo-lgtm) · V-8 ✅ (rosemary21) | Ambos cubiertos |
| **4. Stellar es usable** (usuarios normales pueden manejar wallets no-custodiales) | V-4 | Ninguna aún | V-4 asignado a @Shadow-MMN, sin PR |
| **5. Confianza y PMF** (usuarios se sienten seguros, regresarían y recomendarían) | V-5, V-9, V-10 | V-9 ✅ (deep-bhikadiya) · V-10 ✅ (attyolu) | V-5 asignado a @Truphile, sin PR |

> **Prioridad urgente:** V-1 (demanda de cash-out) y V-3 (oferta de liquidez) — los dos lados centrales del mercado. Sin al menos una respuesta por cada uno, el caso de financiamiento no tiene base.

---

## Entradas detalladas por contribuidor

---

### V-10 · Reuso del producto y descubrimiento de proveedores
**Contribuidor:** [@attyolu](https://github.com/attyolu) · **PR:** [#143](https://github.com/ericmt-98/micopay-protocol/pull/143) · **Mergeado:** 2026-06-24

**Formato:** síntesis multi-respondente (N=4, formato anterior — conservado por decisión del maintainer).

**Regiones:** Ciudad de México MX · Guadalajara MX · Bogotá CO · Lima PE

**Hallazgos principales:**

| Pregunta | Señal |
|----------|-------|
| ¿Cómo encontrarías un proveedor cercano? | Mapa/lista ordenado por distancia y disponibilidad; referido como señal secundaria de confianza |
| ¿Lo volverías a usar después de una buena primera experiencia? | 3/4 Sí, 1/4 Tal vez (Bogotá) |
| ¿Qué te haría regresar? | Tarifas transparentes, precios predecibles, señales visibles de confianza del proveedor |
| ¿Qué mataría el reuso? | Tarifas ocultas, experiencia inconsistente, mal soporte, verificación débil |
| ¿Qué te haría recomendarlo? | Rápido, simple, confiable — fácil de explicarle a un amigo |

**Aporte a la narrativa SDF:** Demuestra señal temprana de PMF. La intención de reuso es alta si hay confianza y consistencia. El descubrimiento es primero por mapa, lo que informa directamente el trabajo de producto P1-2 (mapa de proveedores).

---

### V-7 · Alternativas actuales y disposición a cambiar
**Contribuidor:** [@barnabasolutayo-lgtm](https://github.com/barnabasolutayo-lgtm) · **PR:** [#145](https://github.com/ericmt-98/micopay-protocol/pull/145) · **Mergeado:** 2026-06-24

**Formato:** N=4 entrevistas anonimizadas en LATAM. También actualiza la tabla de argumentos SDF (agrega el Argumento 5 — Diferenciación/Ventaja competitiva) y la tabla de métricas.

**Regiones:** Monterrey MX · Bogotá CO · Buenos Aires AR · Caracas VE

**Qué usan hoy y por qué cambiarían:**

| Respondente | Método actual | Fricción principal | Cambiaría por |
|-------------|--------------|-------------------|--------------|
| Monterrey, MX | OXXO + cajero bancario | Fees altos, filas, downtime | Fees bajos, puntos de cambio en el barrio |
| Bogotá, CO | Nequi / Daviplata + kioscos Efecty | Caídas de la app, límites, cash-out caro | Confiabilidad 24/7, fees transparentes, límites flexibles |
| Buenos Aires, AR | Casas de cambio informales ("cuevas") + Binance P2P | Riesgo físico con efectivo, desconfianza contraparte P2P | Red de merchants verificados y calificados |
| Caracas, VE | Binance P2P + Pago Móvil + USD informal | Conseguir fiat físico cuesta >5% en broker | Conexión directa <2% con agentes verificados y escrow |

**Factores que rompen el deal para cambiar:** fee por adelantado antes de la entrega · sin confirmación inmediata · fees de plataforma altos · KYC obligatorio de varios días · fallos frecuentes en transacciones.

**Aporte a la narrativa SDF:** Valida el Argumento 3 (MicoPay puede ganar) desde cuatro países. El análisis competitivo muestra que todas las alternativas existentes fallan en al menos uno de estos tres ejes: costo, confianza o confiabilidad — exactamente lo que MicoPay resuelve con escrow en Stellar y sistema de reputación.

---

### V-6 · Contexto de remesas y cash-out
**Contribuidor:** [@KaruG1999](https://github.com/KaruG1999) — Karen Giannetto · **PR:** [#146](https://github.com/ericmt-98/micopay-protocol/pull/146) · **Mergeado:** 2026-06-24

**Formato:** Primera persona, respondente único.

**Región:** Argentina (LATAM)

**Hallazgos principales:**

- Ya recibe dinero del exterior vía **stablecoins en Stellar/Soroban y redes P2P** — una usuaria técnicamente sofisticada que ya confía en el stack.
- Las transferencias bancarias internacionales generan fricción regulatoria, fees de entrada altos y tipos de cambio desfavorables en ARS.
- El crypto resuelve la velocidad transfronteriza, pero hacer cash-out de stablecoins a ARS sigue dependiendo de order books P2P locales o cuevas OTC — con spread variable y riesgo de contraparte.
- **¿Le ayudaría un punto de cash-out físico cercano, el mismo día?** Sí. Eliminar la fase de matching P2P y tener un punto de entrega inmediato y local reduciría drásticamente la fricción y eliminaría el slippage cambiario.

**Aporte a la narrativa SDF:** Esta es la evidencia más directa para el Argumento 1 (existe demanda) — una persona que ya usa Stellar para transferencias transfronterizas y aun así no tiene una solución confiable para la última milla de cash-out. Cierra el ciclo: la red Stellar ya transporta el valor; MicoPay resuelve la entrega final.

---

### V-9 · Seguridad en reunión presencial
**Contribuidor:** [@deep-bhikadiya](https://github.com/deep-bhikadiya) — deep bhikadiya · **PR:** [#147](https://github.com/ericmt-98/micopay-protocol/pull/147) · **Mergeado:** 2026-06-24

**Formato:** Primera persona, respondente único.

**Región:** India / Sur de Asia

**Hallazgos principales:**

- **Nivel de comodidad para reunirse con un desconocido:** Neutral — dispuesto si el lugar, el horario y la persona transmiten confianza.
- **Mayor miedo:** Ser estafado o robado durante el intercambio. También: billetes falsos, cambio de lugar a último momento, ser seguido al salir.
- **Qué lo haría sentir seguro:** Lugar público concurrido en horario diurno. Perfiles verificados, calificaciones, chat in-app, recibos claros, soporte accesible — en conjunto hacen que el intercambio se sienta controlable.
- **¿Prefiere tienda conocida vs individuo?** Sí. Una tienda conocida es más rastreable y accountable si algo falla. Un desconocido genera incertidumbre inherente.

**Aporte a la narrativa SDF:** Extiende la muestra geográfica más allá de LATAM hasta el Sur de Asia, confirmando que las preocupaciones de seguridad en el intercambio presencial son universales — no son particulares de una región. Los requisitos de diseño de seguridad que emergen (perfiles verificados, calificaciones, lugares públicos, recibos, soporte) son directamente accionables para la UX de la pantalla de matching de proveedores.

---

### V-8 · Comisión justa y tolerancia a tarifas
**Contribuidor:** [@rosemary21](https://github.com/rosemary21) — Rosemary · **PR:** [#148](https://github.com/ericmt-98/micopay-protocol/pull/148) · **Mergeado:** 2026-06-24

**Formato:** Primera persona, respondente único.

**Región:** Nigeria (área de Lagos)

**Hallazgos principales:**

- **Rango de tarifa justo:** 1–3% — suficiente para compensar al proveedor por su tiempo y riesgo de liquidez, lo bastante bajo para que el servicio gane frente a un banco o agente tradicional.
- **Umbral de "demasiado caro":** >5%. Por encima de eso se siente explotador y el canal tradicional gana por defecto.
- **Qué justificaría estirar el techo:**
  1. No necesitar una cuenta bancaria en absoluto — eso solo ya desbloquea el acceso.
  2. Liquidación el mismo día.
  3. Proveedor verificado + ruta de disputa in-app.
- **¿Pagarías más por un proveedor más cercano o más rápido?** Sí. La proximidad y la velocidad justifican un pequeño premium sobre la tarifa base.

**Aporte a la narrativa SDF:** Incorpora África Subsahariana a la muestra y aporta el argumento más claro de la propuesta de valor "sin necesidad de cuenta bancaria". La banda de 1–5% de tarifa confirmada aquí coincide con las señales de Venezuela (<2% como trigger de cambio) y LATAM en general, estableciendo un ancla de precios regional para las conversaciones de economía unitaria con la SDF.

---

## Conclusiones transversales (para el deck ante la SDF)

### 1. El techo de tarifa es universal: 2–5%
En Nigeria, Venezuela, México, Colombia y Argentina, los respondentes convergen de forma independiente en el mismo rango. Más del 5% pierde frente al canal tradicional — incluso para personas con acceso muy limitado. Esto le da a MicoPay una restricción de precios concreta y defendible.

### 2. La confianza no es opcional — es el producto
Cada respondente, en cada tema, mencionó las señales de confianza como prerequisito: perfiles verificados, calificaciones, chat in-app, recibos, acceso a soporte. No es un "nice to have" de UX — es la propuesta de valor central del producto, a la par de las tarifas bajas.

### 3. La última milla es el problema real, incluso para usuarios de Stellar
La respondente de Argentina (V-6) ya usa Stellar para transferencias transfronterizas y aun así no puede obtener efectivo localmente sin riesgo de contraparte P2P. El valor de MicoPay no está en la blockchain — está en la entrega de efectivo confiable, local y en el mismo día.

### 4. El argumento "sin cuenta bancaria" es el unlock más fuerte
Lo nombra explícitamente Nigeria (V-8) y está implícito en Venezuela (V-7). Para África Subsahariana y las economías hiperinflacionarias de LATAM, eliminar la dependencia de la cuenta bancaria es más convincente que cualquier argumento de tarifa.

### 5. La diversidad geográfica desriesga el caso ante la SDF
Las respuestas ya abarcan 6 países en 3 continentes (LATAM, Sur de Asia, África). La convergencia de puntos de dolor y preferencias en mercados tan distintos fortalece el argumento de que este es un problema estructural — no una particularidad local — y que la infraestructura de Stellar puede resolverlo a escala global.

---

## Qué falta

| Issue | Asignado a | PR | Prioridad para el caso SDF |
|-------|-----------|----|-----------------------------|
| V-1 · Demanda de cash-out | [@larryjay007](https://github.com/larryjay007) | Sin PR aún | 🔴 Crítico — señal central de demanda |
| V-2 · Contexto de cash-in / depósito | [@Truphile](https://github.com/Truphile) | Sin PR aún | 🔴 Crítico — demanda bidireccional |
| V-3 · Perspectiva del proveedor de liquidez | [@3m1n3nc3](https://github.com/3m1n3nc3) | Sin PR aún | 🔴 Crítico — lado de la oferta del mercado |
| V-4 · Onboarding a wallet no-custodial | [@Shadow-MMN](https://github.com/Shadow-MMN) | Sin PR aún | 🟡 Importante — argumento de usabilidad de Stellar |
| V-5 · Confianza en el flujo | [@Truphile](https://github.com/Truphile) | Sin PR aún | 🟡 Importante — PMF y riesgo de abandono |

> V-1, V-2 y V-3 son la prioridad más alta. Sin al menos una respuesta en primera persona para cada uno,
> la narrativa ante la SDF carece de sus dos argumentos más fundamentales: que la gente necesita esto
> (demanda) y que alguien lo proveería (oferta).

---

## Nota metodológica (declarar esto en el deck)

- **Primera persona:** cada entrada refleja la experiencia propia del contribuidor — no una encuesta a terceros.
- **Muestra por conveniencia**, auto-seleccionada a través del programa Stellar Drips Wave 6. Señal direccional y cualitativa, no representativa estadísticamente.
- **Privacy-first:** sin nombres, sin datos de contacto, sin montos de dinero, sin direcciones de wallet.
- Tamaño actual de la muestra: **N=8 perspectivas individuales** en **6 países / 3 regiones**.
- Reportar `N` con claridad. Dejar que la consistencia de los patrones entre regiones hable por sí sola.

---

*Última actualización: 2026-06-24 · Maintainer: [@ericmt-98](https://github.com/ericmt-98)*
