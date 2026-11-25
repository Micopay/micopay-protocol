# Plan KYC / Cumplimiento PLD — Mercado Mexicano (julio 2026)

> Investigación al 2026-07-16. **No es asesoría legal** — el paso 0 de cualquier opción es un dictamen de un despacho fintech mexicano. Este doc fija el mapa regulatorio, las opciones y el plan técnico mapeado al código actual.

---

## 1. Mapa regulatorio (post-reforma LFPIORPI, DOF 16-jul-2025)

MicoPay facilita intercambio habitual efectivo↔USDC entre particulares. Eso cae en **Art. 17 fracción XVI LFPIORPI** ("intercambio de activos virtuales") = **actividad vulnerable**, aunque no exista licencia VASP en México y aunque el escrow sea non-custodial. La reforma de julio 2025 endureció todo:

> ⚠️ **Vigencia (verificado 2026-07-21): la fracción XVI no es nueva ni entra en vigor en 2027.** Se añadió en el decreto del 9-mar-2018 (Ley Fintech), cuyo transitorio de 18 meses la puso en vigor **~septiembre de 2019**; el decreto del 16-jul-2025 solo la **reformó** (bajó el umbral de aviso 645→210 UMA y la extendió a operaciones desde el extranjero con mexicanos). Circula en blogs SEO/resúmenes de IA la idea de que arranca 18 meses después de la reforma de 2025 (≈ enero 2027) — **es falso**, confunde los dos decretos. En marzo de 2026 el SAT ya la aplica activamente a plataformas cripto. Detalle y fuentes en [`FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md`](./FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md).

| Obligación | Regla post-reforma |
|---|---|
| Identificación del cliente | **Siempre — desde el primer peso** (antes había umbral) |
| Aviso al SAT/UIF | Operaciones ≥ **210 UMA = $24,635.10 MXN** (2026, UMA $117.31; antes 645 UMA — bajó 67%) |
| Aviso por comisión | También se activa aviso cuando la **comisión cobrada ≥ 4 UMA = $469.24 MXN** ⚠️ relevante para el fee del protocolo |
| Registro | Padrón **SPPLD del SAT** (requiere RFC + e.firma de la sociedad) |
| Avisos | Mensuales (día 17), **informes en ceros** si no hubo reportables |
| Operaciones inusuales | Aviso a UIF en **24 horas**; requiere **monitoreo automatizado** (Art. 18 X — nuevo) |
| Beneficiario controlador | Identificar desde **25%** de participación (antes 50%) |
| Retención de expedientes | **10 años** (antes 5) |
| Alcance | Explícitamente incluye operar **desde otra jurisdicción con mexicanos** |
| Sanciones | Hasta 65,000 UMA (~$7.6M MXN) o 10–100% del valor de la operación; clausura |

Contexto CNBV/Banxico: bancos e ITFs tienen prohibido ofrecer cripto a clientes (Circular 4/2019), pero una sociedad mercantil no-financiera opera legalmente bajo LFPIORPI sin licencia. Al ser **non-custodial** (HTLC en Soroban, firmas en dispositivo), MicoPay no capta ni custodia fondos → argumento fuerte de que **no** requiere licencia IFPE. **Watch:** la industria empuja "Fintech Law 2.0" en 2026 (nueva dirección CNBV) — podría crear licencia VASP por niveles.

**Nota clave sobre los merchants:** si MicoPay no es el sujeto obligado, cada tendero que intercambia habitualmente lo sería individualmente — inviable para ellos. Que MicoPay asuma el rol de sujeto obligado y les resuelva el cumplimiento **es parte de la propuesta de valor**, no solo un costo.

## 2. Qué pide el mercado (estándar de facto)

Flujo estándar mexicano (Bitso, exchanges CNBV-adjacentes, fintechs):
- **INE o pasaporte** + **selfie con liveness** (prueba de vida)
- **CURP** validada contra RENAPO; INE validada contra lista nominal
- **Comprobante de domicilio** y/o **RFC** para límites altos
- **Modelo de niveles** con límites crecientes (patrón Bitso: 3 niveles)

## 3. Proveedores evaluados

| Proveedor | Fuerte | Débil | Fit |
|---|---|---|---|
| **Incode** (absorbió MetaMap 2024) | El mejor acceso a fuentes gubernamentales MX (CURP/RENAPO, INE, RFC); biometría top (NIST); estándar bancario MX | Pricing enterprise, ciclo de ventas | Escala / mainnet serio |
| **Truora** | Especialista LATAM, checks contra fuentes oficiales, flujos por WhatsApp, más barato | Menos profundidad biométrica | Arranque con costo bajo |
| **Sumsub** | Global, muy fuerte en crypto (Travel Rule, wallets screening) | Caro, sin foco en fuentes MX | Si hay expansión multi-país |
| **Didit** | Free tier / muy barato | Menos validación de fuentes MX | Piloto / demo |
| **Etherfuse hosted** (ya integrado) | Cero costo, ya funciona | Solo cubre SU servicio (CETES); no es delegable para el P2P core de MicoPay | Se queda para el ramp CETES |

## 4. Opciones

### Opción A — Statu quo plus (piloto/testnet)
Solo KYC de Etherfuse para CETES; P2P sin identificación, con límites bajos hardcodeados.
- ✅ Costo cero, nada que construir.
- ❌ Post-reforma es **insostenible en mainnet**: la identificación es obligatoria desde el primer peso para intercambio de AV. Solo defendible mientras todo sea testnet sin dinero real.
- **Veredicto: es la fase actual, no una opción de destino.**

### Opción B — KYC por niveles con proveedor (RECOMENDADA para mainnet)
Modelo tipo Bitso, adaptado:

| Nivel | Requisitos | Permisos |
|---|---|---|
| 0 — Explorar | Solo cuenta + keypair | Ver mapa, recibir pagos directos pequeños; **sin** trades cash↔crypto |
| 1 — Identificado | INE/pasaporte + selfie liveness + CURP validada | Trades hasta ~$3,000 MXN/op, techo mensual ~$10,000 MXN |
| 2 — Verificado | + comprobante domicilio (+ RFC opcional) | Hasta <210 UMA/op ($24.6k); operaciones mayores generan aviso automático |
| M — Merchant/Agente | Nivel 2 + KYB si persona moral + beneficiario controlador (25%) + domicilio del negocio | Operación como nodo de liquidez |

- ✅ Cumple identificación universal; los límites del Nivel 1 mantienen fricción mínima para el usuario de a pie (el mercado objetivo: no bancarizados, tickets chicos).
- ✅ Los umbrales en UMA viven en config (cambian cada año).
- Proveedor: **Truora o Didit para arrancar barato → Incode al escalar** (o Incode directo si el pricing inicial lo permite).

### Opción C — Programa PLD completo (obligatorio antes de escalar, complementa B)
No es alternativa a B: es la capa institucional que la ley exige al sujeto obligado:
1. Constitución/estructura societaria clara + RFC + e.firma → **alta en padrón SPPLD**.
2. **Oficial de cumplimiento** (outsourced al inicio, ~$15–40k MXN/mes) + manual PLD + matriz de riesgo.
3. **Motor de avisos**: agregación mensual por cliente, XML SAT, informes en ceros, aviso 24h.
4. **Monitoreo automatizado** (Art. 18 X): reglas (estructuración/pitufeo bajo umbral, velocidad, geografía) + screening de listas (UIF, OFAC, PEPs) en onboarding y recurrente.
5. Retención cifrada 10 años de expedientes y avisos.

### Secuencia recomendada: **A (hoy, testnet) → B (gate de mainnet) → C (antes de volumen real)**
El lanzamiento mainnet **no debe ocurrir sin B funcionando y el registro SPPLD de C iniciado.**

## 5. Plan técnico (mapeado al código actual)

Lo ya construido que se reutiliza: `users.kyc_status`, `KYCScreen.tsx` (patrón hosted-flow: `startKYC` → browser del sistema → polling de status), auth challenge-response Ed25519, `trade.service.ts` como choke-point de todas las operaciones.

**Fase 1 — Esquema y motor de límites (independiente del proveedor):**
- Migración: `users.kyc_level` (0/1/2/M), `kyc_provider`, `kyc_verified_at`; tabla `kyc_events` (audit); tabla `user_monthly_volume` o agregación sobre trades.
- Middleware en `trade.service.ts`: valida nivel + límite por operación + acumulado mensual **antes** de crear/lockear cualquier trade. Límites en UMA en config, no hardcodeados.
- Feature-flag por ambiente (testnet laxo, mainnet estricto).

**Fase 2 — Integración del proveedor:**
- Generalizar el patrón KYCScreen actual a multi-provider: `POST /kyc/start?provider=` → URL hosted del proveedor → webhook firma resultado → actualiza `kyc_level`.
- El KYC de Etherfuse queda como requisito **adicional** solo para el ramp CETES (ellos siguen siendo sujeto obligado de su servicio).

**Fase 3 — Cumplimiento operativo (C):**
- Job mensual de agregación → candidatos a aviso → XML SAT; screening de listas en onboarding + batch recurrente; reglas de inusualidad con cola de revisión y timer de 24h.

**Fase 4 — Societario/legal (en paralelo desde ya):**
- Dictamen legal (¿sujeto obligado MicoPay o los merchants? ¿estructura societaria?), alta SPPLD, oficial de cumplimiento.
- Brief listo para enviar a despachos + checklist de seguimiento: `docs/FASE4_LEGAL_DICTAMEN_BRIEF_2026-07.md`. Dueño: Eric/Jose, fuera de GrantFox — no bloquea el trabajo de ingeniería (#315/#316/#317) pero sí bloquea activar `KYC_GATE_ENABLED` en producción.

## 6. Costos estimados (orden de magnitud)
- Verificación: ~$0.5–2 USD por check (Truora/Didit abajo, Incode arriba) → a 1,000 onboardings/mes: $500–2,000 USD/mes.
- Oficial de cumplimiento outsourced: $15–40k MXN/mes.
- Dictamen legal inicial: $50–150k MXN una vez.
- Desarrollo Fases 1–2: ~2–4 semanas de trabajo interno; Fase 3: ~3–4 semanas.

## 7. Fuentes
- Reforma LFPIORPI y umbrales: kyc-systems.com/blog/lfpiorpi · kimgomezfranco.com (actualización umbrales 2025) · ey.com/es_mx (reforma antilavado 2025) · hoganlovells.com (modificaciones reglamento)
- Marco general cripto MX: globallegalinsights.com (Blockchain & Crypto Laws Mexico 2026) · cms.law (crypto regulation Mexico) · license.aiying.cc (Fintech Law 2.0 push 2026)
- Proveedores: signzy.com (KYC platforms Mexico 2026) · sacra.com (MetaMap→Incode) · didit.me (pricing comparison)
- Modelo de niveles: soporte y blog de Bitso
