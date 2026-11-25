# Camino a mainnet — estado de cumplimiento PLD y plan de avance

> **Fecha:** 2026-07-21 · **Para:** todo el equipo MicoPay (Eric, Jose, Anna) · **Autor:** sesión de trabajo con Claude
> **Propósito:** que todo el equipo tenga la misma foto completa de dónde estamos con el tema regulatorio,
> qué sabemos con certeza, qué no, y cómo avanzamos a mainnet **sin quedar bloqueados** por lo que no podemos
> resolver hoy.
>
> **Esto NO es asesoría legal.** Es investigación de fuentes públicas oficiales (SAT, DOF, INEGI, Banxico) +
> decisiones de producto/ingeniería. La pregunta legal de fondo sigue abierta (ver §3) — la decisión del equipo,
> documentada aquí, es avanzar con las certezas que sí tenemos.

---

## 0. La decisión que tomamos (para que quede por escrito)

**No tenemos recursos ahora para pagar un dictamen a un despacho ($50k–150k MXN).** El equipo decidió que
**eso no bloquea seguir construyendo hacia mainnet**, siempre que:

1. Construyamos sobre las **certezas verificadas** (los umbrales oficiales del SAT), no sobre suposiciones.
2. Todo quede **documentado** (este doc + los tres de soporte) para no perder el contexto ni el riesgo asumido.
3. Reconozcamos explícitamente qué queda **sin resolver** y por qué es un riesgo aceptado, no ignorado.

Este documento cumple el punto 2 y 3.

---

## 1. Qué es esto en una frase

MicoPay facilita el intercambio habitual de efectivo↔cripto entre particulares. Bajo la ley mexicana eso es
una **"actividad vulnerable"** (Art. 17 fracción XVI de la LFPIORPI, la ley antilavado), y **eso trae
obligaciones concretas** de identificar usuarios, avisar al SAT y guardar registros. No es opcional ni futuro.

Ya construimos la maquinaria técnica para cumplir (el "gate" de KYC, ver §4). Lo que falta es afinarla con los
datos correctos, registrarnos ante el SAT, y — cuando haya recursos — validar con un abogado la única pregunta
que no podemos resolver solos.

---

## 2. Lo que sabemos CON CERTEZA (fuentes oficiales, verificado 2026-07-21)

Esto viene directo del portal del SAT, el DOF e INEGI — no de blogs. Se puede tomar como dato duro y construir
sobre ello **hoy**.

| Obligación | Regla | Qué significa para nosotros |
|---|---|---|
| **Identificar al usuario** | **Siempre, desde el primer peso** (sin umbral) | Cualquier trade cash↔cripto real exige identidad. Un "Nivel 0" que permita operar sin identificarse **no es legal**. |
| **Aviso al SAT por monto** | Operación ≥ **210 UMA = $24,635.10 MXN** | Arriba de eso, se reporta la operación. |
| **Aviso al SAT por comisión** | Comisión cobrada ≥ **4 UMA = $469.24 MXN** | ⚠️ **Ojo:** esto pega a NUESTRO fee, no al monto del trade. Si el fee del protocolo cruza ~$469, genera aviso. Hay que modelarlo al fijar precios. |
| **Cómo registrarse** | Alta en el padrón **SPPLD del SAT** | Trámite en línea, requiere RFC + e.firma. **No requiere abogado** (ver §5). |
| **Cuándo avisar** | Mensual, **día 17** del mes siguiente; "informes en ceros" si no hubo nada reportable | El motor de reporting (#317) automatiza esto. |
| **Beneficiario controlador** | Identificar a quien tenga **≥ 25%** de la empresa | Relevante al constituir la sociedad. |
| **Guardar expedientes** | **10 años** | ⚠️ Ojo con confundir dos cosas: nuestra **bitácora de decisiones** del gate sí es append-only y es nuestra, pero el **expediente de identificación** (INE, selfie, CURP) lo aloja el proveedor (Didit), no nosotros. La obligación pide lo segundo. Ver §3, pregunta B. |
| **UMA 2026** | **$117.31** diarios (vigente feb-2026 → ene-2027) | Es la unidad con la que se calculan todos los umbrales de arriba. |

**Consecuencia de diseño que se sostiene:** como identificar es obligatorio desde el primer peso, nuestra
decisión de que **Nivel 0 = no puede hacer trades cash↔cripto** es la correcta. No hay que rediseñarla.

---

## 3. Lo que NO sabemos (y por qué no nos frena)

Hay **dos** preguntas de fondo que la investigación no puede resolver, porque no son buscar un dato: son aplicar
la ley a nuestro caso específico, que es exactamente lo que hace un abogado.

> **Pregunta A — ¿Quién es el "sujeto obligado": MicoPay como plataforma, o cada comerciante que opera como nodo?**

> **Pregunta B — Si el expediente de identificación lo aloja un tercero (Didit), ¿cumplimos?** Nosotros no
> guardamos INE, selfie ni CURP: solo un veredicto (`kyc_level`) y un `session_id`. El expediente vive íntegro
> en Didit. ¿Basta con ser *responsable* y que Didit sea *encargado*, y qué debe decir ese contrato como mínimo
> para sostener los 10 años? ¿Y puede el anchor que usamos para la rampa SPEI apoyarse en nuestro expediente
> bajo dependencia de terceros, o cada uno identifica por separado?

Y una relacionada: **¿nuestro diseño no-custodial nos ayuda?** La investigación aclaró que:
- El texto de la ley se activa por **operar una plataforma que facilite** la compraventa. La custodia es un
  supuesto **alternativo**, no un requisito. → Ser no-custodial es un argumento **débil** para quedar fuera de
  la obligación, pero **fuerte** para no necesitar una licencia bancaria (IFPE).

**Cómo avanzamos sin resolverla:** asumimos la lectura **más estricta y conservadora** — que **MicoPay es el
sujeto obligado**. Es lo que ya estamos construyendo, y si resulta que no lo somos, no perdimos nada: absorber
el cumplimiento por los tenderos (que individualmente no podrían) **es parte de nuestra propuesta de valor**,
no un costo tirado.

**El riesgo que esto deja vivo (hay que tenerlo claro, no esconderlo):** registrarnos y construir el gate nos
pone en cumplimiento *operativo*, pero **no nos da cobertura legal formal** sobre esa pregunta estructural.
Como la obligación está vigente desde ~2019 (ver §6) y el SAT ya la aplica, esa incertidumbre sigue ahí hasta
que un despacho la cierre. **Es un riesgo aceptado a conciencia por falta de recursos, no un descuido.**

---

## 4. Lo que YA construimos (ingeniería)

El motor de cumplimiento ya está en `main` (issue #314, mergeado). Qué hace:

- **Motor de niveles KYC (0/1/2):** cada operación (trade P2P, cash-in, cash-out, compra de CETES) se revisa
  contra el nivel del usuario antes de ejecutarse.
- **Bitácora de auditoría inmutable:** cada decisión del gate (permitir/bloquear) se registra y no se puede
  borrar ni editar — es la base de los reportes al SAT.
- **Umbrales configurables:** los límites viven en configuración, no en el código, así que se ajustan sin
  reprogramar (importante porque pueden cambiar con el dictamen o con la UMA anual).
- **Está en modo "solo auditoría" por ahora** (`KYC_GATE_ENABLED = false`): registra todo pero **no bloquea
  nada todavía**. Se prende cuando confirmemos que los umbrales son correctos.

### Issues que completaban el sistema — ✅ los cuatro mergeados (actualizado 2026-08-03)
- **#315 (Didit):** ✅ mergeado. Proveedor real de verificación integrado (`didit.service.ts`), sesión hospedada
  + webhook firmado. Los usuarios ya pueden *alcanzar* Nivel 1/2.
- **#316 (topes mensuales):** ✅ mergeado (PR #322). Techo acumulado por mes con lock por usuario para que dos
  operaciones simultáneas no rebasen juntas el tope.
- **#317 (reporting SAT/UIF):** ✅ mergeado (`compliance.service.ts`). Avisos del día 17, informes en ceros y
  job mensual automático.
- **#318 (phone_hash):** ✅ mergeado (PR #319). El registro ya pide teléfono y lo hashea en el dispositivo.

### ✅ El bug de configuración ya está corregido
Los defaults permitían hasta $3,000 MXN en Nivel 0, contradiciendo la regla del primer peso. **Ya se corrigió**
(`config.ts`, marcado `CORRECTED 2026-07-21`): hoy las cuatro operaciones —`p2p_transfer`, `cash_in`,
`cash_out`, `cetes_purchase`— arrancan en `requiredLevel: 1`, así que **ningún trade cash↔cripto puede correr
en Nivel 0**. No queda acción pendiente aquí.

### ⚠️ Lo que sí quedó abierto y no estaba en esta lista
- **`cetes_purchase` es config muerta.** Está en la tabla de umbrales pero ningún punto del código la usa: la
  compra de CETES entra por la rampa como `cash_in`. O se cablea o se quita, pero hoy engaña al leer el config.
- **Solo Didit sube el `kyc_level`.** El único `UPDATE users SET kyc_level` trae `kyc_provider = 'didit'` fijo.
  Es correcto —el KYC de Etherfuse es requisito **del anchor**, no de nuestro gate— pero conviene tenerlo
  explícito: al prender el gate, la rampa SPEI/CETES pasa por **los dos** filtros (ver §3, pregunta B).
- **No guardamos rastro probatorio de qué se verificó.** `kyc_didit_sessions` guarda veredicto y `session_id`,
  pero no el tipo de documento, ni el hash del payload de decisión, ni el `workflow_id` usado. En 10 años habrá
  que poder explicar *qué* se verificó exactamente; hoy no se puede sin depender de Didit para todo.

---

## 5. El desbloqueo barato: registro en SPPLD (NO necesita abogado)

Este es el hallazgo más útil para avanzar sin gastar:

**El alta en el padrón del SAT es un trámite en línea, no requiere despacho.** Hay uno específico:
*"Registra tu actividad de activos virtuales"* (trámite SAT 70111).

- **Requisitos:** RFC + e.firma vigente de la sociedad. Nada más.
- Para persona moral se designa un representante que acepta el cargo con su propia e.firma — al inicio puede
  ser Eric o Jose (no vimos requisito de certificación externa; **confirmar**, pero no parece exigir el oficial
  de cumplimiento outsourced de $15–40k/mes desde el día uno).
- Como ya estamos constituyendo la empresa, el costo incremental de esto es **~cero**.

Es la obligación más concreta, más barata y más verificable de todas. Debería ir primero.

---

## 6. Un mito que hay que enterrar (importante para no confiarse)

Circula MUCHO — en blogs de vendors de software PLD y en resúmenes generados por IA — la idea de que *"la
obligación para cripto entra en vigor 18 meses después de la reforma de 2025, o sea hasta enero de 2027"*.

**Es falso.** Confunde dos leyes distintas:
- La obligación para activos virtuales **se creó en 2018** (paquete Ley Fintech) y está **vigente desde
  ~septiembre de 2019**. Ese "18 meses" era de *esa* ley.
- La reforma de **julio 2025** solo la **endureció** (bajó el umbral de aviso, subió sanciones).

**En la práctica ya se aplica:** en marzo de 2026 el SAT ya está requiriendo a plataformas cripto el alta en
SPPLD, identificación de usuarios e historial a 10 años.

**Por qué importa para el equipo:** no estamos "adelantándonos" a una regla futura. Si operamos en mainnet de
forma habitual, **ya caemos en el supuesto hoy**. Hoy no nos afecta solo porque estamos en **testnet, sin dinero
real de usuarios**. El momento en que esto empieza a correr en serio es **al tocar mainnet con valor real** — por
eso el orden correcto es registrarnos y tener el gate funcionando *antes* de ese salto, no después.

---

## 7. Plan de avance — qué hacemos ahora vs. después

### AHORA (sin costo, desbloquea mainnet técnicamente)
1. ~~**Corregir los defaults del config**~~ → ✅ hecho (`CORRECTED 2026-07-21`). Sigue pendiente **modelar el
   umbral de comisión de 4 UMA** al fijar el fee (ver punto 6).
2. **Alta en SPPLD** (RFC + e.firma) — trámite 70111. Dueño: Eric/Jose.
3. ~~**Terminar #315 (Didit) + #316 (topes)**~~ → ✅ los dos mergeados.
4. ~~**Terminar #317**~~ → ✅ mergeado.
5. **Probar `KYC_GATE_ENABLED = true` en testnet** — validar que el gate bloquea correctamente antes de mainnet.
   **Ahora es el siguiente paso real de ingeniería**, ya que los tres issues que lo alimentaban están cerrados.
   Al probarlo, verificar explícitamente el camino de la rampa SPEI/CETES, que pasa por dos filtros distintos
   (el del anchor y el nuestro).
6. **Definir el fee del protocolo con conciencia del umbral de 4 UMA** ($469) para no disparar avisos sin querer.
7. **Persistir el rastro probatorio del KYC** — agregar a `kyc_didit_sessions` el tipo de documento verificado,
   el hash del payload de decisión, el `workflow_id` y el timestamp firmado del webhook. Cambio chico, sin costo,
   y es lo único de la pregunta B (§3) que depende solo de nosotros.
8. **Resolver `cetes_purchase`** — o se cablea como tipo de operación propio, o se quita de la tabla de umbrales.

### DESPUÉS (cuando haya recursos / ingresos)
7. **Dictamen legal** ($50–150k una vez) — cierra **las dos** preguntas del §3 (sujeto obligado, y expediente
   en manos de un tercero). Shortlist de despachos ya investigado en `FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md`
   (Legal Paradox primero). ✅ La pregunta B ya está incorporada al brief como **punto 8**, con sus cuatro
   sub-preguntas (conservación por tercero, contenido mínimo del contrato, transferencia internacional y
   dependencia de terceros con el anchor). El brief está listo para enviar.
8. **Oficial de cumplimiento** outsourced (~$15–40k/mes) — cuando el volumen lo justifique.
9. **Nivel M / KYB de comercios** — verificación de los nodos como personas morales. Depende del dictamen.

### El orden no negociable para mainnet
> **corregir config → alta SPPLD → gate funcionando y probado → recién entonces mainnet con valor real.**
> Nunca al revés.

---

## 8. Documentos de soporte (para quien quiera el detalle)

- **`HALLAZGOS_VERIFICACION_REGULATORIA_2026-07.md`** — el detalle técnico de cada hallazgo de la verificación,
  con evidencia y fuentes. (Memo interno.)
- **`FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md`** — el brief listo para el despacho + shortlist, para cuando haya
  recursos.
- **`KYC_COMPLIANCE_PLAN_2026-07.md`** — el plan de cumplimiento completo (mapa regulatorio, proveedores, costos).
- **`GRANTFOX_KYC_QUEUE_2026-07.md`** — la cola de issues de ingeniería y sus dependencias.

## 9. Fuentes oficiales (por si alguien del equipo quiere verificarlo)

- [Portal SPPLD del SAT — umbrales de actividades vulnerables](https://sppld.sat.gob.mx/pld/interiores/umbrales.html)
- [SAT — Registra tu actividad de activos virtuales (trámite 70111)](https://wwwmat.sat.gob.mx/tramites/70111/registra-tu-actividad-de-activos-virtuales)
- [SAT — Date de alta en el Portal de Prevención de Lavado de Dinero](https://www.sat.gob.mx/tramites/85869/date-de-alta-en-el-portal-de-lavado-de-dinero)
- [DOF — Decreto de reforma a la LFPIORPI, 16-jul-2025](https://www.diputados.gob.mx/LeyesBiblio/legis/reflxvi/decreto_05_16jul25.pdf)
- [DOF — Valor de la UMA 2026 (INEGI)](https://www.dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09%2F01%2F2026)
- [Banxico — Circular 4/2019](https://www.dof.gob.mx/nota_detalle.php?codigo=5552303&fecha=08/03/2019)
- [Expansión — SAT pide historial de operaciones cripto (mar-2026)](https://expansion.mx/finanzas-personales/2026/03/18/sat-criptomonedas-actividad-vulnerable)
