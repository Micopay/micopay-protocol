# Memo interno — Verificación regulatoria PLD/cripto (julio 2026)

> **Fecha:** 2026-07-21 · **Audiencia:** Eric, Jose (interno — no es el documento que sale al despacho)
> **Qué es:** los hallazgos de verificar contra fuentes primarias los supuestos regulatorios sobre los que
> estábamos construyendo el gate de KYC. Tres de ellos cambian decisiones, no solo datos.
>
> **No es asesoría legal.** Es investigación de fuentes públicas para llegar preparados al dictamen, no
> para sustituirlo.
>
> **Documentos relacionados:**
> - [`FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md`](./FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md) — el brief que **sí** se manda al despacho (ya incorpora estas correcciones)
> - [`KYC_COMPLIANCE_PLAN_2026-07.md`](./KYC_COMPLIANCE_PLAN_2026-07.md) — el plan de cumplimiento completo (ya actualizado)
> - [`GRANTFOX_KYC_QUEUE_2026-07.md`](./GRANTFOX_KYC_QUEUE_2026-07.md) — la cola de issues de ingeniería

---

## TL;DR — lo que cambia

| # | Hallazgo | Tipo | Qué cambia |
|---|---|---|---|
| 1 | La obligación **lleva vigente desde ~sept 2019**, no arranca en 2027 | ❌ Error corregido | El dictamen pasa de "antes de escalar" a **"antes de tocar mainnet"** |
| 2 | "Somos no custodiales" es **débil** para LFPIORPI | ⚠️ Argumento reformulado | No anclar al despacho en una defensa que no sostiene |
| 3 | Circular 4/2019 estaba **mal citada** | ⚠️ Precisión | Refuerza (no debilita) la ruta de sociedad no financiera |
| 4 | Aviso también por **comisión ≥ 4 UMA** | ➕ Dato nuevo | Pega directo al **fee del protocolo**, no solo al monto de la operación |
| 5 | Shortlist de despachos con ranking | ➕ Accionable | El checklist decía "manda a 2-3" sin nombrar ninguno |

**El resto del marco regulatorio que ya teníamos documentado resultó correcto** (ver §6).

---

## 1. ❌ La obligación no es futura: lleva ~7 años vigente

### Qué creíamos
Que el Art. 17 fracción XVI (activos virtuales) era producto de la reforma de julio 2025 y que, por un
transitorio de 18 meses, las obligaciones arrancaban **hasta enero de 2027** — es decir, con margen cómodo.

### Qué es realmente
Son **dos decretos distintos** y la afirmación de los 18 meses los confunde:

| Decreto | Qué hizo | Vigencia |
|---|---|---|
| **9-mar-2018** (paquete Ley Fintech) | **Añadió** la fracción XVI | Transitorio de 18 meses → en vigor **~septiembre 2019** |
| **16-jul-2025** | **Reformó** la fracción XVI: bajó el umbral de aviso 645→210 UMA (−67%) y la extendió a operaciones desde otra jurisdicción con mexicanos | En vigor **17-jul-2025** |

El transitorio de 18 meses pertenece al decreto de **2018**, no al de 2025.

### Por qué nos lo tragamos
La afirmación errónea aparece repetida en blogs SEO de vendors de software PLD y en resúmenes generados
por IA — que es exactamente lo que devuelven las primeras páginas de búsqueda. Fue necesario ir al portal
del SAT y a los decretos para desarmarlo.

> **Lección operativa:** en temas regulatorios, los primeros resultados de búsqueda son contenido de
> vendors optimizado para SEO. Solo cuentan SAT/SPPLD, DOF, UIF, Banxico, y en segundo lugar Big Four.

### Evidencia de que ya se aplica en la práctica
En **marzo de 2026** el SAT ya requiere a plataformas cripto: alta en SPPLD, identificación plena de
usuarios, historial de operaciones conservado **10 años**, y avisos el día 17. No es letra muerta.

### Impacto — esto sí cambia el plan
- MicoPay **no se está preparando para una obligación futura**: si opera de forma habitual y profesional
  en mainnet, **ya cae en el supuesto hoy**.
- Hoy no muerde porque estamos en **testnet sin dinero real de usuarios**.
- **El orden correcto es: dictamen → alta SPPLD → oficial de cumplimiento → mainnet.** No al revés.
- Se agregó al brief una pregunta nueva (la 7) sobre **exposición retroactiva**: dado que la fracción está
  vigente desde 2019, ¿corre algún riesgo por el periodo previo al registro, o el reloj empieza al operar
  con valor real? Eso define qué tan rápido hay que registrarse.

---

## 2. ⚠️ "Somos no custodiales" no nos saca de la actividad vulnerable

### Qué asumía el brief original
Planteaba la pregunta como *"¿la naturaleza no custodial cambia el análisis?"* — redactada esperando un sí,
como si el diseño HTLC fuera una defensa que nos deja fuera del supuesto.

### Qué dice el texto de la fracción XVI
Describe el supuesto como el ofrecimiento habitual y profesional de intercambio de activos virtuales a
través de plataformas que se **administren u operen**, *"facilitando o realizando"* operaciones de compra o
venta, **o** proveyendo medios para custodiar, almacenar o transferir.

La custodia entra como **supuesto alternativo** (esa "o"), **no como requisito**. El gatillo principal es
*operar una plataforma que facilite la compraventa* — que es literalmente lo que hace MicoPay, con o sin
custodia de por medio.

### Impacto
Hay que separar dos preguntas que veníamos mezclando:

| Pregunta | ¿Ayuda ser no custodial? |
|---|---|
| ¿Somos **sujeto obligado** bajo LFPIORPI? | **Probablemente no ayuda** — el gatillo es facilitar |
| ¿Necesitamos **licencia** (ITF/IFPE)? | **Sí, ayuda mucho** — no captamos ni custodiamos fondos |

El brief ya está reformulado para preguntar ambas por separado, en vez de anclar al despacho en una
defensa que puede no sostenerse. Nota: el `KYC_COMPLIANCE_PLAN` ya era más cuidadoso que el brief en este
punto — decía explícitamente "aunque el escrow sea non-custodial" cae en el supuesto.

---

## 3. ⚠️ Circular 4/2019 estaba mal citada (y en realidad juega a favor)

### Cómo la citaba el brief
Como si fuera la fuente de un posible requisito de **licencia IFPE**: *"¿Se requiere licencia IFPE
(Circular 4/2019 CNBV/Banxico)?"*.

### Qué es realmente
Es regulación de **Banxico dirigida a Instituciones de Crédito e ITF** (DOF 8-mar-2019). Les **prohíbe
ofrecer al público** operaciones con activos virtuales; solo pueden usarlos en "Operaciones Internas".
No crea ningún requisito de licencia para terceros.

### Impacto — apunta en sentido contrario al que asumíamos
Ser ITF/IFPE **nos impediría** ofrecer cripto al público. Entonces la ruta de **sociedad mercantil no
financiera sujeta a LFPIORPI** no solo es defendible: posiblemente es **la única viable**. Vale la pena que
el dictamen lo confirme explícitamente, porque convierte una duda ("¿necesitamos licencia?") en un
argumento estructural ("la licencia sería contraproducente").

---

## 4. ➕ Dato nuevo: el aviso también se dispara por la comisión (≥ 4 UMA)

No lo teníamos en el plan. Además del umbral por monto de operación, se activa obligación de aviso cuando
**la comisión cobrada ≥ 4 UMA = $469.24 MXN** (UMA 2026).

**Por qué importa:** hasta ahora razonábamos los umbrales sobre el **monto del trade**. Este umbral pega
sobre el **fee del protocolo**, que es otra variable y la controlamos nosotros vía configuración de
`platform_fee`. Hay que modelarlo explícitamente cuando se definan los parámetros económicos de mainnet —
no es lo mismo un fee que cruza los $469 que uno que no.

Ya agregado como fila propia en la tabla regulatoria del `KYC_COMPLIANCE_PLAN`.

---

## 5. ➕ Shortlist de despachos (rankings Chambers FinTech México)

El checklist de Fase 4 decía "enviar a 2–3 despachos" sin nombrar ninguno. Sin relación previa con
ninguno de estos; es punto de partida para cotizar, no recomendación cerrada.

| Despacho | Perfil | Nota |
|---|---|---|
| **Legal Paradox** (Carlos Valderrama) | Boutique mexicano especializado **específicamente en blockchain/activos virtuales** desde 2017; Chambers Band 2 | El fit más cercano al caso de uso. Probablemente más accesible que Big Law. **Primera llamada sugerida.** |
| **Nader Hayaux & Goebel** | Medios de pago, e-wallets, proyectos de criptomonedas | Despacho grande mexicano; balance especialidad/peso institucional |
| **White & Case México** | **Band 1** Chambers FinTech México | El más caro casi con seguridad. Útil si el dictamen se usará frente a inversionistas o un banco |
| **Hogan Lovells México** | Licencias fintech + **PLD/AML** explícito | Opción si se quiere dictamen + programa PLD completo |
| **Bello, Gallardo, Bonequi y García** | Autorizaciones para wallets/pagos/transmisión de dinero | Relevante solo si el dictamen concluye que sí hace falta autorización |

**Estrategia sugerida:** cotizar en paralelo con **un boutique especialista + un despacho grande** para
contrastar precio y enfoque. No secuencial — el tiempo aquí es el recurso escaso.

---

## 6. ✅ Lo que resultó correcto (no tocar, ya está verificado)

| Dato | Fuente |
|---|---|
| UMA 2026 = **$117.31** diarios (vigente 1-feb-2026 → 31-ene-2027) | INEGI / DOF 9-ene-2026 |
| Umbral de **aviso** = **210 UMA = $24,635.10 MXN** (exacto) | Portal SPPLD del SAT |
| Umbral de **identificación** = **"Siempre"**, desde el primer peso | Portal SPPLD del SAT |
| Beneficiario controlador: 50% → **25%** | Reforma DOF 16-jul-2025 |
| Retención de expedientes: 5 → **10 años** | Reforma DOF 16-jul-2025 |
| Avisos mensuales, **día 17** del mes siguiente | SAT |
| Reforma publicada **16-jul-2025**, en vigor **17-jul-2025** | DOF |

**Consecuencia de diseño que se sostiene:** como la identificación es obligatoria desde el primer peso,
el **Nivel 0 = sin trades cash↔cripto** del motor de tiers es la decisión correcta y no hay que rediseñarla.

---

## 7. Acciones que se derivan

- [ ] **Mandar el brief** a 2–3 despachos de §5 (única acción bloqueante real; nadie más puede hacerla)
- [ ] En el dictamen, pedir explícitamente respuesta a la **pregunta 7** (exposición retroactiva desde 2019)
- [ ] Modelar el umbral de **comisión ≥ 4 UMA** al fijar los parámetros económicos de mainnet
- [ ] No mover mainnet hasta: dictamen → alta SPPLD → oficial de cumplimiento
- [ ] Mantener `KYC_GATE_ENABLED=false` hasta que el dictamen valide o corrija los umbrales

---

## Fuentes primarias consultadas (2026-07-21)

- [Portal SPPLD del SAT — umbrales de actividades vulnerables](https://sppld.sat.gob.mx/pld/interiores/umbrales.html) — **la fuente autoritativa** de los umbrales de identificación y aviso
- [DOF — Decreto de reforma a la LFPIORPI, 16-jul-2025](https://www.diputados.gob.mx/LeyesBiblio/legis/reflxvi/decreto_05_16jul25.pdf)
- [DOF — Valor de la UMA 2026 (INEGI)](https://www.dof.gob.mx/nota_detalle.php?codigo=5778072&fecha=09%2F01%2F2026)
- [UIF — Criterio general para la aplicación de la fracción XVI del Art. 17 LFPIORPI](https://www.gob.mx/uif/prensa/comunicado-040-la-uif-emite-criterio-general-para-la-aplicacion-de-fraccion-xvi-del-articulo-17-de-la-lfpiorpi?idiom=es)
- [Banxico — Circular 4/2019 (DOF 8-mar-2019)](https://www.dof.gob.mx/nota_detalle.php?codigo=5552303&fecha=08/03/2019)
- [EY México — Reforma a la Ley Antilavado 2025](https://www.ey.com/es_mx/technical/tax/boletines-fiscales/reforma-ley-antilavado-2025-nuevas-obligaciones)
- [KPMG México — Flash: Decreto que reforma la LFPIORPI](https://kpmg.com/mx/es/tendencias/2025/07/flash-decreto-que-reforma-y-adiciona-disposiciones-a-la-lfpiorpi.html)
- [Expansión — SAT pide nombres e historial de operaciones cripto (18-mar-2026)](https://expansion.mx/finanzas-personales/2026/03/18/sat-criptomonedas-actividad-vulnerable)
- [Chambers — FinTech Legal México (rankings)](https://chambers.com/legal-rankings/fintech-legal-mexico-49:2744:144:1)
