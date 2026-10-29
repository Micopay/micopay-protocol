# Fase 4 — Brief para solicitar el dictamen legal (listo para enviar)

> **Qué es esto:** un brief que puedes copiar/pegar (o adjuntar) en el primer contacto con un despacho
> fintech mexicano para arrancar el dictamen que bloquea todo lo demás en Fase 4 (SPPLD, oficial de
> cumplimiento, y la activación real de `KYC_GATE_ENABLED`). Ajusta el tono/detalles antes de enviarlo —
> esto es un punto de partida, no el mensaje final. Contexto completo en `docs/KYC_COMPLIANCE_PLAN_2026-07.md`.
>
> **No es asesoría legal.** Todo lo de abajo es investigación de fuentes públicas para llegar preparado
> a la conversación con el despacho, no para sustituirla.

---

## ⚠️ Verificación de hechos (2026-07-21) — leer antes de enviar

Se verificaron los datos regulatorios de este brief contra fuentes primarias (SAT/SPPLD, DOF, INEGI, Banxico)
porque un error factual en el primer contacto cuesta credibilidad.

> **Versión larga:** [`HALLAZGOS_VERIFICACION_REGULATORIA_2026-07.md`](./HALLAZGOS_VERIFICACION_REGULATORIA_2026-07.md) — memo interno con el detalle de cada hallazgo, su impacto y las acciones que se derivan. Lo de abajo es el resumen operativo.

### Lo que se confirmó como correcto ✅

| Dato | Estado | Fuente |
|---|---|---|
| UMA 2026 = **$117.31** diarios (vigente 1-feb-2026 → 31-ene-2027) | ✅ | INEGI / DOF 9-ene-2026 |
| Umbral de **aviso** activos virtuales = **210 UMA = $24,635.10 MXN** | ✅ exacto | Portal SPPLD del SAT |
| Umbral de **identificación** = **"Siempre"** (desde el primer peso, sin umbral) | ✅ | Portal SPPLD del SAT |
| Aviso adicional por **comisiones ≥ 4 UMA** ($469.24 MXN) | ✅ (dato nuevo, no estaba en el plan) | SPPLD / Expansión mar-2026 |
| Beneficiario controlador: umbral bajó de 50% → **25%** | ✅ | Reforma DOF 16-jul-2025 |
| Retención de expedientes: 5 → **10 años** | ✅ | Reforma DOF 16-jul-2025 |
| Reforma publicada DOF **16-jul-2025**, en vigor **17-jul-2025** | ✅ | DOF |
| Presentación de avisos: **día 17** del mes siguiente | ✅ | SAT |

### Corrección importante ❌ → ✅ : la obligación NO es futura, lleva años vigente

Circula ampliamente (en blogs SEO y resúmenes generados por IA) la afirmación de que *"la adición de la
fracción XVI entra en vigor 18 meses después del decreto"*, lo que llevaría a concluir que las
obligaciones para activos virtuales arrancan **hasta enero de 2027**. **Eso es falso**, y es una confusión
de dos decretos distintos:

- La fracción XVI **se añadió en el decreto del 9-mar-2018** (paquete de la Ley Fintech). *Ese* decreto
  traía el transitorio de 18 meses → la actividad vulnerable entró en vigor **~septiembre de 2019**.
- El decreto del **16-jul-2025 no creó la fracción XVI: la reformó** — bajó el umbral de aviso de 645 a
  210 UMA (−67%) y la extendió expresamente a operaciones hechas **desde otra jurisdicción con mexicanos**.

**Implicación práctica:** MicoPay no se está preparando para una obligación futura con margen de maniobra.
Si opera en mainnet de forma habitual y profesional, **ya está dentro del supuesto hoy**. Esto sube la
urgencia de Fase 4, no la baja. (Referencia de que ya se aplica en la práctica: en marzo de 2026 el SAT
ya requiere a plataformas cripto alta en SPPLD, identificación plena e historial a 10 años.)

### Debilidad en el argumento "somos no custodiales" ⚠️

El texto de la fracción XVI describe el supuesto como el ofrecimiento habitual y profesional de intercambio
de activos virtuales a través de plataformas que se **administren u operen**, *"facilitando o realizando"*
operaciones de compra o venta, **o** proveyendo medios para custodiar/almacenar/transferir.

La custodia aparece como **supuesto alternativo, no como requisito**. El gatillo principal es *operar una
plataforma que facilite* la compraventa — que es exactamente lo que hace MicoPay, con o sin custodia.
Por eso el brief **no debe** plantear "somos no custodiales" como si fuera una defensa que exenta de la
LFPIORPI; conviene plantearlo como lo que probablemente sí es: un argumento fuerte para **no requerir
licencia** (IFPE), pero débil para quedar fuera de la actividad vulnerable. Las preguntas de abajo ya
están reformuladas con esa distinción.

### Precisión sobre la Circular 4/2019 ⚠️

La Circular 4/2019 de Banxico va dirigida a **Instituciones de Crédito e ITF**, y les *prohíbe* ofrecer al
público operaciones con activos virtuales (solo pueden usarlos en "Operaciones Internas"). **No es la fuente
de un requisito de licencia IFPE.** De hecho apunta en sentido contrario: ser ITF/IFPE **impediría** ofrecer
cripto al público. Eso refuerza que la ruta de sociedad mercantil no financiera bajo LFPIORPI no solo es
defendible, sino posiblemente la única viable — vale la pena que el dictamen lo confirme explícitamente.

---

## Asunto sugerido

Solicitud de dictamen — cumplimiento LFPIORPI para plataforma de intercambio cash↔cripto (P2P, no custodial)

## Cuerpo del mensaje

Estamos desarrollando **MicoPay**, una red de liquidez P2P que permite el intercambio entre efectivo (pesos mexicanos) y stablecoins/cripto entre particulares, usando comercios locales como nodos de intercambio. El protocolo es **no custodial**: los fondos se bloquean on-chain (contrato HTLC en Stellar/Soroban) bajo el hash de un secreto, y se liberan automáticamente cuando se revela ese secreto — MicoPay nunca tiene control de los fondos del usuario en ningún momento.

Buscamos un **dictamen legal** que resuelva, antes de lanzar en mainnet con volumen real:

1. **¿Quién es el sujeto obligado bajo el Art. 17 fracción XVI de la LFPIORPI ("intercambio de activos virtuales", vigente desde 2019 y reformado en julio de 2025)?** ¿MicoPay como plataforma que administra y facilita las operaciones, cada comercio/nodo que intercambia habitualmente, o ambos bajo distintas figuras? Entendemos que el supuesto se activa por *operar la plataforma que facilita* la compraventa, con independencia de la custodia — nos interesa que confirmen o corrijan esa lectura.
2. **¿Qué efecto tiene el diseño no custodial (escrow HTLC en cadena, llaves en el dispositivo del usuario, MicoPay nunca controla los fondos) en dos preguntas separadas?**
   a) Para efectos de **LFPIORPI**: ¿reduce el alcance de las obligaciones o es irrelevante porque el gatillo es la facilitación y no la custodia?
   b) Para efectos de **licenciamiento**: ¿confirma que NO se requiere autorización como ITF/IFPE bajo la Ley Fintech? Notamos que la Circular 4/2019 de Banxico prohíbe a Instituciones de Crédito e ITF ofrecer activos virtuales al público, lo que sugeriría que constituirse como ITF sería contraproducente y que la ruta correcta es sociedad mercantil no financiera sujeta a LFPIORPI. ¿Es correcto?
3. **Estructura societaria recomendada** para que MicoPay pueda asumir el rol de sujeto obligado (si aplica) y absorber esa carga de cumplimiento en nombre de los comercios/nodos, en vez de que cada uno individualmente tuviera que registrarse (inviable para comercios pequeños).
4. **Ruta y requisitos para el alta en el padrón SPPLD del SAT** (RFC + e.firma de la sociedad) — qué necesitamos preparar y en qué orden.
5. **Validación de nuestra propuesta técnica de niveles KYC** (ya construida en el motor de acceso escalonado, actualmente en modo solo-auditoría):

   | Nivel | Requisitos propuestos | Límites propuestos |
   |---|---|---|
   | 0 | Solo cuenta + llave | Sin trades cash↔cripto |
   | 1 | INE/pasaporte + selfie liveness + CURP validada | ~$3,000 MXN/operación, ~$10,000 MXN/mes |
   | 2 | + comprobante de domicilio | Hasta 210 UMA/operación (~$24,600 MXN) |
   | M (comercio/nodo) | Nivel 2 + KYB si persona moral + beneficiario controlador (25%) | Operar como nodo de liquidez |

   Entendemos que para esta actividad la identificación es obligatoria **desde el primer peso** (umbral "siempre" en el portal SPPLD), que el aviso se activa en **210 UMA** por operación (~$24,635 MXN con la UMA 2026 de $117.31) y que también hay aviso por **comisiones ≥ 4 UMA** (~$469 MXN). ¿Estos niveles y límites son razonables bajo ese marco? ¿Qué ajustarían?
6. **Oficial de cumplimiento**: ¿interno o outsourced para arrancar? ¿Qué perfil/certificación se requiere?
7. **Exposición retroactiva**: dado que la fracción XVI está vigente desde ~2019 y hoy operamos únicamente en **testnet** (sin dinero real de usuarios), ¿existe alguna exposición por el periodo previo al alta en SPPLD, o el riesgo empieza a correr al momento de operar con valor real en mainnet? Esto define qué tan atrás debemos mirar y qué tan rápido debemos registrarnos.
8. **Expediente de identificación alojado por un tercero.** La verificación de identidad la ejecuta un proveedor externo (tipo Didit), que es quien recaba y almacena INE, selfie y CURP. Nosotros **no alojamos ninguno de esos datos**: en nuestra base guardamos únicamente un veredicto (nivel KYC alcanzado, fecha de verificación, proveedor) y el identificador de la sesión con el proveedor.
   a) **¿Cumplimos así la obligación de integrar y conservar el expediente de identificación por 10 años**, siendo nosotros responsables y el proveedor encargado del tratamiento? ¿O la autoridad exigiría que el expediente esté materialmente en nuestro poder?
   b) **¿Qué debe estipular como mínimo ese contrato** para que la obligación se sostenga: derecho a recuperar el expediente completo a solicitud de la autoridad, plazo de conservación garantizado, residencia de los datos, y qué pasa con los expedientes si el proveedor desaparece o se termina la relación?
   c) Si el proveedor está **fuera de México**, ¿qué requisitos adicionales impone la LFPDPPP por transferencia internacional?
   d) **Dependencia de terceros entre sujetos obligados:** usamos además un *anchor* externo (proveedor de rampa SPEI/CETES) que hace su propio KYC a los mismos usuarios. ¿Puede uno apoyarse en el expediente del otro bajo alguna figura de dependencia de terceros, o cada sujeto obligado debe identificar por separado aunque se trate del mismo cliente y la misma operación? Hoy, si activáramos nuestro gate, el usuario tendría que verificarse dos veces para la misma operación.

## Lo que ya tenemos construido (para que dimensionen el alcance)

- Motor de niveles KYC configurable + bitácora de auditoría inmutable de cada decisión de acceso (código ya en producción, actualmente en modo "solo auditoría" — no bloquea nada hasta activarlo).
- **Dos** integraciones de verificación de identidad hospedada ya funcionando: un proveedor para el flujo de rampa SPEI/CETES (el *anchor* del punto 8.d) y **Didit** para el gate de niveles propio, con sesión hospedada y webhook firmado. Los usuarios ya pueden alcanzar Nivel 1/2.
- Topes de volumen mensual acumulado por nivel, además del límite por operación.
- Motor de reporting SAT/UIF: agregación mensual, avisos del día 17 e informes en ceros.
- Contrato de escrow no custodial ya desplegado y operando en testnet.

**Precisión relevante para el punto 8:** de todo lo anterior, lo único que guardamos nosotros son *decisiones y veredictos* (qué nivel tiene cada usuario, qué operaciones se permitieron o bloquearon y cuándo). Los **documentos de identidad en sí nunca tocan nuestra infraestructura** — viven íntegros con los proveedores.

## Lo que pedimos como entregable

- Dictamen escrito sobre los 8 puntos arriba.
- Cotización y tiempo estimado.
- Si aplica, una lista de siguientes pasos priorizados (qué bloquea qué).

---

## A quién enviarlo — shortlist (investigado 2026-07-21, rankings Chambers FinTech México)

No hay relación previa con ninguno; esto es punto de partida para cotizar, no una recomendación cerrada.
Sugerencia: pedir cotización a **un boutique especialista + un despacho grande** para contrastar precio y enfoque.

| Despacho | Por qué está en la lista | Consideración |
|---|---|---|
| **Legal Paradox** (Carlos Valderrama) | Boutique mexicano especializado **específicamente en blockchain/activos virtuales** desde 2017; Chambers Band 2 FinTech. Es el perfil más cercano al caso de uso exacto. | Probablemente el mejor fit técnico y más accesible en precio que un Big Law. **Primera llamada sugerida.** |
| **Nader Hayaux & Goebel** | Fuerte en medios de pago, e-wallets y proyectos de criptomonedas; asesoría regulatoria. | Despacho grande mexicano, buen balance entre especialidad y peso institucional. |
| **White & Case México** | **Band 1** Chambers FinTech México. | El más caro casi con seguridad; útil si el dictamen se va a usar frente a inversionistas o un banco. |
| **Hogan Lovells México** | Licencias fintech + experiencia explícita en **PLD/AML** y protección de datos. | Buena opción si se quiere el paquete dictamen + programa PLD completo. |
| **Bello, Gallardo, Bonequi y García** | Especializados en obtener autorizaciones para wallets/pagos/transmisión de dinero. | Relevante si el dictamen concluye que sí hace falta alguna autorización. |

## Checklist de seguimiento (Fase 4, dueño: Eric/Jose — fuera de GrantFox)

- [ ] Enviar este brief a 2–3 despachos de la lista de arriba (cotizar en paralelo, no secuencial)
- [ ] Recibir dictamen escrito → resuelve: sujeto obligado, necesidad de licencia IFPE, estructura societaria
- [ ] Con el dictamen en mano: iniciar alta en padrón SPPLD (RFC + e.firma de la sociedad)
- [ ] Definir oficial de cumplimiento (interno vs. outsourced ~$15–40k MXN/mes)
- [ ] Con el dictamen validando (o ajustando) los umbrales de la tabla: actualizar `KYC_OPERATION_THRESHOLDS_JSON` en producción y solo entonces considerar `KYC_GATE_ENABLED=true`
- [ ] Revisar si procede agregar el nivel M (merchant/KYB) al motor — hoy deliberadamente fuera de #314 hasta que esto se resuelva

**Por qué importa ahora:** #315 (4b, Didit), #316 (4c, topes mensuales) y #317 (5a, reporting SAT/UIF) ya están asignados y en construcción — pero aunque los tres mergeen, `KYC_GATE_ENABLED` seguirá apagado y el sistema seguirá en modo "solo auditoría" hasta que el dictamen confirme los umbrales y la estructura. El trabajo de ingeniería puede terminar antes que esto — vale la pena arrancarlo ya, no cuando el código esté listo.

**Y con la verificación de arriba, más todavía:** la obligación de la fracción XVI **no arranca en 2027 — lleva vigente desde ~2019**, y el SAT ya la está aplicando activamente a plataformas cripto (marzo 2026). Hoy eso no muerde porque MicoPay opera en testnet sin dinero real, pero **el dictamen deja de ser un requisito de "antes de escalar" y pasa a ser un requisito de "antes de tocar mainnet"**. El orden correcto es: dictamen → alta SPPLD → oficial de cumplimiento → mainnet, y no al revés.

## Fuentes consultadas (2026-07-21)

- [Portal SPPLD del SAT — umbrales de actividades vulnerables](https://sppld.sat.gob.mx/pld/interiores/umbrales.html) (fuente autoritativa de los umbrales de identificación y aviso)
- [DOF — Decreto de reforma a la LFPIORPI, 16-jul-2025](https://www.diputados.gob.mx/LeyesBiblio/legis/reflxvi/decreto_05_16jul25.pdf)
- [DOF — Valor de la UMA 2026 (INEGI)](https://www.dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09%2F01%2F2026)
- [UIF — Criterio general para la aplicación de la fracción XVI del Art. 17 LFPIORPI](https://www.gob.mx/uif/prensa/comunicado-040-la-uif-emite-criterio-general-para-la-aplicacion-de-fraccion-xvi-del-articulo-17-de-la-lfpiorpi?idiom=es)
- [Banxico — Circular 4/2019 (DOF 8-mar-2019)](https://www.dof.gob.mx/nota_detalle.php?codigo=5552303&fecha=08/03/2019)
- [EY México — Reforma a la Ley Antilavado 2025](https://www.ey.com/es_mx/technical/tax/boletines-fiscales/reforma-ley-antilavado-2025-nuevas-obligaciones)
- [KPMG México — Flash: Decreto que reforma la LFPIORPI](https://kpmg.com/mx/es/tendencias/2025/07/flash-decreto-que-reforma-y-adiciona-disposiciones-a-la-lfpiorpi.html)
- [Expansión — SAT pide nombres e historial de operaciones cripto (18-mar-2026)](https://expansion.mx/finanzas-personales/2026/03/18/sat-criptomonedas-actividad-vulnerable)
- [Chambers — FinTech Legal México (rankings)](https://chambers.com/legal-rankings/fintech-legal-mexico-49:2744:144:1)
