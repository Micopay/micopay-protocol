# Plan de implementación — Onboarding de trustlines + escrow multi-asset (UX en pesos)

> **Fecha:** 2026-07-02 · **Origen:** discusión de diseño (Eric + Fable) tras detectar que una cuenta
> nueva de MicoPay nace sin fondos ni trustlines y hubo que fondearla a mano.
> **Ejecutor: Sonnet.** Las decisiones de diseño ya están tomadas y revisadas — tu trabajo es
> implementar, no rediseñar. Reglas de ejecución:
> 1. **Un WP por vez, en orden.** Cada WP termina con su bloque **Verify** en verde y un commit
>    propio (`feat(escrow-multiasset): WPn — <qué>`). No mezclar WPs en un commit.
> 2. **No refactorices nada fuera del alcance del WP**, aunque veas código mejorable. Si encuentras
>    un bug fuera de alcance, anótalo al final del PR/reporte, no lo arregles.
> 3. **Verifica antes de asumir:** las referencias `archivo:línea` de este doc eran correctas el
>    2026-07-02 pero el código puede haberse movido — confirma con grep antes de editar.
> 4. **Condiciones de PARO (detente y reporta a Eric, no continúes):**
>    - WP0 revela que la instancia actual está en USDC (ver HALLAZGO-1).
>    - Una migración SQL falla o el resultado difiere de lo esperado — **la DB es la de producción
>      en Render y el backend aplica migraciones al deployar** (migrate.ts como preDeploy): mergear
>      una migración = aplicarla en prod. Nunca pruebes una migración directo en esa DB; usa una DB
>      local o transacción con ROLLBACK primero.
>    - Necesitas una llave secreta que no está en los `.env` locales, o fondos que no existen.
>    - Un test preexistente que pasaba se rompe y la causa no es obvia en <30 min.
> 5. Comandos de verificación estándar: backend `cd micopay/backend && npx tsc --noEmit && npm test`;
>    frontend `cd micopay/frontend && npx tsc --noEmit && npm run build`. Córrelos al cierre de CADA WP.
> 6. Secretos: nunca imprimas valores de `.env` en logs/salida; los `.env` locales ya tienen
>    `PLATFORM_SECRET_KEY` de testnet — úsalo leyéndolo del archivo, no lo copies a ningún lado.
> **Decisiones ya tomadas en la discusión** (este doc las implementa, no las reabre):
> 1. Trustlines se abstraen **al fondear**, no al registrar (antes de fondear la cuenta no existe
>    on-chain y cada trustline exige ~0.5 XLM de reserva).
> 2. Escrow multi-asset por **instancia por asset** (opción A), no contrato multi-token.
> 3. La selección de activo vive en la **creación de la oferta, lado vendedor** — el comprador solo
>    ve pesos y un badge del asset.
> 4. Default **MXNe** (es pesos, 1:1); USDC como opción con tasa; **CETES fuera del escrow** por ahora
>    (instrumento de inversión, gated por `VITE_ENABLE_DEFI_TRADING`, audit B2: no mueve fondos reales).
> 5. Mainnet usa **sponsored reserves** (el usuario nunca necesita XLM); testnet usa friendbot.

---

## 0. Punto de partida (verificado contra el código, 2026-07-02)

**Lo que existe hoy:**
- Registro (`micopay/frontend/src/App.tsx:824-828`): genera keypair en el dispositivo y registra al
  usuario. **No** llama a friendbot ni crea trustlines — la cuenta no existe on-chain hasta que
  alguien la fondea a mano.
- Trustlines lazy: `ensureTrustline()` (`frontend/src/services/payment.ts:71`) solo se invoca en
  `TradeDetail.tsx:773` y `QRReveal.tsx:51`, ya dentro del trade, y lanza `UNDERFUNDED` si la cuenta
  no tiene ~0.5 XLM.
- El asset del escrow es una env var global: `VITE_ESCROW_ASSET_CODE || 'USDC'`.
- Contrato escrow (`micopay/contracts/escrow/src/lib.rs:37-47`): **un solo token por instancia**,
  fijado en `initialize` (instance storage). Instancia testnet actual:
  `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ`.
- La tabla `trades` YA es peso-first (`micopay/sql/init.sql:49-50`): `amount_mxn INTEGER` +
  `amount_stroops BIGINT`. Falta: asset, tasa, fuente de tasa.
- Rates: `backend/src/routes/rate.ts` ya tiene XLM→MXN y USDC→MXN multi-fuente (coinbase/kraken/
  coingecko/binance × er-api) con fallbacks — la infraestructura de cotización existe.
- Cuenta plataforma testnet `GDKK…BJJK`: 17,905 XLM, 1.52 USDC.

**⚠️ HALLAZGO-1 (pre-requisito de todo lo demás):** `trade.service.ts:59,210` convierte con constante
fija `STROOPS_PER_MXN = 10_000_000` → `amountStroops = amountMxn × 10^7`, o sea **asume que el asset
del escrow vale exactamente 1 MXN** (MXNe). Pero el frontend defaultea la trustline a **USDC**. Si la
instancia deployada fue inicializada con USDC, un trade de 100 MXN bloquea **100 USDC (~1,750 MXN)**;
si fue inicializada con MXNe, el bug es el default `'USDC'` del frontend (trustline del asset
equivocado). En cualquier caso hay una inconsistencia real hoy. **Paso 0 obligatorio:** leer el
`token_id` del instance storage del contrato `CB4M…` en testnet (via `stellar contract read` o RPC
`getLedgerEntries`) y documentar cuál de las dos patas está mal antes de tocar nada.

---

## 1. Work packages

### WP0 — Diagnóstico del HALLAZGO-1 · ~30 min · bloqueante

> **✅ RESUELTO (Fable, 2026-07-02, verificado on-chain):** el instance storage de `CB4M…` dice
> `TokenId = CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` → **la instancia actual es
> MXNe** (admin y plataforma: `GDKK…BJJK`). La conversión 1:1 del backend es CORRECTA; el bug es el
> default `'USDC'` del frontend: `ensureTrustline('USDC')` crea la trustline del asset equivocado,
> así que a un comprador nuevo sin trustline MXNe el release del escrow le puede fallar.
> **Para el ejecutor:** el paso 1 ya no es necesario; aplica directamente la rama "token es MXNe"
> del paso 2 (fix de una línea + env var) como primer commit. En WP3, la instancia NUEVA a deployar
> es la de **USDC**.
1. Leer `token_id` del instance storage de la instancia `CB4M…` en testnet. El contrato NO expone un
   getter (`lib.rs` solo exporta initialize/lock/release/refund/get_trade), así que se lee el ledger
   entry directamente. Script listo (correr con `node` desde `micopay/backend`, que ya tiene
   `@stellar/stellar-sdk`):
   ```js
   // wp0-check-token.mjs — leer TokenId del instance storage del escrow
   import { rpc, xdr, Address, scValToNative } from '@stellar/stellar-sdk';
   const s = new rpc.Server('https://soroban-testnet.stellar.org');
   const CONTRACT = 'CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ';
   const entry = await s.getContractData(
     CONTRACT, xdr.ScVal.scvLedgerKeyContractInstance(), rpc.Durability.Persistent);
   const storage = entry.val.contractData().val().instance().storage();
   for (const item of storage ?? []) {
     const key = scValToNative(item.key());
     console.log(key, '→', (() => { try { return scValToNative(item.val()); } catch { return item.val().switch().name; } })());
   }
   ```
   El valor de la clave `TokenId` es un contract address `C…`. Compararlo:
   - MXNe SAC = `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (TESTNET.md:11)
   - Si no es ese, resolver a qué asset corresponde (probable USDC SAC del issuer `GBBD…FLA5`).
   Nota: pistas circunstanciales apuntan a MXNe (TESTNET.md documenta MXNe junto al escrow, y la
   conversión 1:1 del backend solo tiene sentido con MXNe) — pero se confirma on-chain, no se asume.
2. Documentar el resultado **en esta sección del doc** (editar aquí mismo) y aplicar la corrección:
   - Si el token es MXNe → cambiar el default de `TradeDetail.tsx:772` / `QRReveal.tsx:50` a
     `'MXNE'` y setear `VITE_ESCROW_ASSET_CODE=MXNE` en `micopay/frontend/.env.testnet` (fix de una
     línea). Continuar con WP1.
   - Si el token es USDC → **PARO: reportar a Eric antes de continuar** (los montos de los trades
     reales están mal denominados; WP2 pasa de mejora a fix y hay que decidir qué hacer con los
     trades históricos).

**Verify:** el asset de la trustline que crea el flujo de trade coincide con el token del contrato
donde se bloquea; el resultado quedó escrito en este doc.

---

### WP1 — Onboarding testnet: friendbot + trustlines al registrarse · ~0.5 día · bajo riesgo
**Archivos:** `frontend/src/App.tsx` (flujo de registro), nuevo `frontend/src/services/onboarding.ts`,
reusa `toAsset`/`hasTrustline` de `payment.ts`, `.env.testnet`.

Desbloquea las pruebas del equipo esta semana (hoy cada cuenta nueva requiere fondeo manual).

1. Crear `frontend/src/services/onboarding.ts` con una única función exportada
   `setupTestnetAccount(): Promise<void>` y llamarla (sin `await` bloqueante del flujo de registro —
   fire-and-forget con manejo de error propio) tras registro exitoso (`App.tsx` ~línea 828, después
   de `getPublicKey()`), solo si `import.meta.env.VITE_STELLAR_NETWORK === 'TESTNET'`:
   1. `fetch('https://friendbot.stellar.org/?addr=' + pubKey)` — idempotente: si la cuenta ya existe
      friendbot responde 400 (`op_already_exists` en el detalle), tratar como éxito.
   2. **Una sola transacción** con `changeTrust` × [USDC, MXNe] firmada con la llave del dispositivo
      (un fee, un round trip). Reusar `toAsset`/`hasTrustline`/el patrón de submit de `payment.ts`
      (no duplicar la lógica de red/passphrase). Idempotente: filtrar por `hasTrustline` antes de
      agregar cada op; si ambas existen, no someter nada.
2. UI: estado "Preparando tu cuenta…" no bloqueante. Si friendbot da 429/timeout, el registro
   **completa igual** — el lazy `ensureTrustline` existente queda como self-heal (no se elimina).
3. CETES **no** se incluye: su trustline se crea al entrar a `CETESScreen`/flujo de inversión
   (cada trustline son 0.5 XLM de reserva; no regalarla para un asset que la mayoría no usará).
4. Fondeo de assets de prueba para el equipo (operativo, no código): la plataforma solo tiene 1.52
   USDC — conseguir USDC/MXNe de prueba de sus emisores testnet (`GBBD…FLA5` / `GBZXN…OALV`) o
   emitir, y documentar en el README interno cómo pedir saldo de prueba.

**Verify:** cuenta recién registrada en build testnet → Horizon muestra XLM + trustlines USDC y MXNe
sin intervención manual; registro sobrevive a friendbot caído; correr dos veces no duplica nada.

---

### WP2 — Conversión por asset + tasa congelada por trade · ~1 día · CORE
**Archivos:** `backend/src/services/trade.service.ts`, `backend/src/routes/rate.ts` (extraer a
servicio), migración nueva en `micopay/sql/migrations/` (patrón `YYYYMMDDHHMMSS_*.up/.down.sql`),
`backend/src/index.ts` (queries de trades), `frontend/src/services/api.ts`.

Es la pieza que hace real el "UX en pesos con activos por detrás": el peso es la denominación
primaria (ya lo es: `amount_mxn`), el asset y la tasa son metadata del trade.

1. **Migración** en `micopay/sql/migrations/` con el patrón de nombre timestamped y su `.down.sql`
   (espejo de `20260702090000_ramp_order_ownership.{up,down}.sql`, el más reciente):
   ```sql
   -- 2026MMDDHHMMSS_trade_asset_rate.up.sql
   ALTER TABLE trades
     ADD COLUMN asset_code     VARCHAR(12) NOT NULL DEFAULT 'MXNE',  -- confirmado en WP0
     ADD COLUMN rate_mxn       NUMERIC(18,7) NOT NULL DEFAULT 1,  -- MXN por 1 unidad del asset
     ADD COLUMN rate_source    VARCHAR(32),
     ADD COLUMN rate_locked_at TIMESTAMPTZ;
   ```
   El DEFAULT preserva la semántica de los trades históricos según lo que diga WP0. Recordatorio de
   la regla 4 del encabezado: esta migración se aplica a la DB de producción al deployar — probarla
   antes en local o dentro de una transacción con ROLLBACK.
2. `createTrade` recibe `asset_code` (default MXNe) y reemplaza la constante. Crear
   `backend/src/services/assetRate.service.ts` con UNA función de conversión
   `mxnToAssetStroops(amountMxn: number, assetCode: string): Promise<{ stroops: bigint; rateMxn: string; rateSource: string }>`
   — toda conversión del sistema pasa por ahí, nadie más multiplica:
   - MXNe → `rate = 1` exacto, `amount_stroops = amount_mxn × 10^7` (comportamiento actual).
   - USDC → tasa viva de `rate.ts` (extraer la lógica de fetch a este servicio o importarla — no
     duplicar las fuentes) **congelada y persistida** en el row:
     `amount_stroops = round(amount_mxn × 10^7 / rate_mxn)`. Aritmética con `BigInt`/enteros: la
     tasa se maneja como entero escalado (p.ej. milésimas de centavo), el redondeo se define UNA vez
     (round half-up, documentado en el JSDoc de la función) y se testea en los bordes; nunca floats
     encadenados.
   - Asset no soportado → 400 con código de error del taxonomy existente
     (`backend/src/utils/errors.ts`).
3. **Ventana de tasa:** la tasa congelada al crear vale hasta el `lock`. Si el vendedor bloquea
   > 10 min después de creado el trade con asset ≠ MXNe, el backend recotiza y actualiza
   `rate_mxn/amount_stroops` **antes** de armar la tx de lock (el monto MXN nunca cambia — es el
   ancla del acuerdo P2P). Para MXNe la ventana es irrelevante (1:1).
4. Respuestas de la API de trades incluyen `asset_code`, `rate_mxn`, `rate_source` — el frontend
   puede mostrar "≈ 5.71 USDC" como secundario del monto en pesos, y una disputa de "acordamos X
   pesos" tiene la tasa y fuente persistidas como evidencia.

**Verify:** unit tests de conversión (bordes de redondeo, montos mínimos, rate con 7 decimales);
trade MXNe reproduce byte a byte los montos actuales; trade USDC de 100 MXN a rate 17.5 bloquea
exactamente 57,142,857 stroops (o el redondeo documentado); recotización al lock tardío.

---

### WP3 — Escrow multi-asset por instancias · ~0.5 día + deploy · bajo riesgo (cero Rust nuevo)
**Archivos:** deploy (CLI), `backend/src/config.ts`, `backend/src/services/stellar.service.ts`,
`backend/src/services/trade.service.ts`, `frontend/src/pages/TradeDetail.tsx`, `QRReveal.tsx`,
`frontend/src/services/api.ts`.

1. **Deploy** de una segunda instancia del **mismo WASM ya auditado** del escrow, `initialize` con el
   SAC del asset faltante según WP0 (si la instancia actual es MXNe, la nueva es USDC — SAC del
   issuer `GBBD…FLA5`; se obtiene con `stellar contract asset id --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 --network testnet`,
   y si el SAC no está deployado, `stellar contract asset deploy` con los mismos args). Seguir el
   procedimiento documentado en `micopay/contracts/TESTNET.md` (build, deploy, initialize) — **leer
   la firma real de `initialize` en `lib.rs:37` para los argumentos**, no inventarla; usar el mismo
   admin/plataforma que la instancia actual. Registrar el contract id nuevo en TESTNET.md. El
   allowlist de assets ES el conjunto de instancias deployadas — nadie puede meter un token basura,
   y no se reabre el contrato auditado.
2. Backend: mapa `asset → contract_id` en `config.ts` (`ESCROW_CONTRACT_USDC`,
   `ESCROW_CONTRACT_MXNE`; la var vieja `ESCROW_CONTRACT_ID` se mapea al asset que diga WP0 para no
   romper deploys existentes). `stellar.service.ts` (`lock`/`release`/`refund`, ~líneas 147-235)
   recibe el `contract_id` del trade en vez de leer el global.
3. API: los responses de trade incluyen `escrow_contract_id` junto a `asset_code`.
4. Frontend: `TradeDetail.tsx` y `QRReveal.tsx` leen `trade.asset_code` y `trade.escrow_contract_id`
   del trade — `VITE_ESCROW_ASSET_CODE` y `VITE_ESCROW_CONTRACT_ID` quedan solo como fallback una
   release y luego se retiran.

**Verify:** e2e en testnet por cada asset: trade MXNe y trade USDC completos
(lock → reveal → release) + camino de refund en ambos; un trade creado antes de la migración sigue
funcionando con la instancia vieja.

---

### WP4 — Pantalla de selección de activo (lado vendedor) · ~1 día · UX
**Archivos:** flujo de creación de oferta (entra por `App.tsx:916` → `createTrade`;
`TradeConfirmation.tsx` es el pre-flight summary existente), `frontend/src/services/api.ts`,
`frontend/src/i18n/{es,en}.json`.

1. Selector **antes del pre-flight de `TradeConfirmation`**, solo para quien bloquea fondos
   (vendedor). Framing peso-first — la pregunta no es "elige tu activo":
   - Título: **"¿En qué guardas tu dinero?"** — el monto en MXN siempre como número principal.
   - Opción default (preseleccionada): **Pesos digitales (MXNe)** — "sin tipo de cambio".
   - Opción: **Dólares (USDC)** — muestra equivalente y tasa viva: "≈ 5.71 USDC · $17.50/USD".
   - CETES no aparece (decisión de diseño, ver encabezado).
2. Al seleccionar un asset sin trustline → `ensureTrustline(asset)` ahí mismo con estado
   "Preparando tu cuenta…" (aquí convergen WP1 y WP4: en testnet ya existirá por onboarding; en
   cuentas viejas se crea en este momento, que es el natural).
3. `api.ts createTrade` envía `asset_code`; el comprador ve el monto en pesos + badge discreto del
   asset que lo respalda ("respaldado en USDC"), nunca una decisión.
4. i18n completo es/en desde el primer commit (lección de los PRs de i18n recientes).

**Verify:** crear oferta MXNe y USDC desde la UI y completar ambos trades; el comprador nunca elige
asset; con trustline faltante el selector la crea y continúa; textos en ambos idiomas.

---

### WP5 — Mainnet: sponsored reserves (el usuario nunca toca XLM) · ~2–3 días · **NO IMPLEMENTAR EN ESTE CICLO**

> **Para el ejecutor:** este WP es diseño de referencia para el track mainnet. Tu alcance termina en
> WP4. No crees `wallet.ts` ni el servicio de co-firma ahora.
**Archivos:** nuevo `backend/src/routes/wallet.ts` (`POST /wallet/sponsor-setup`), nuevo servicio de
co-firma, `frontend/src/services/onboarding.ts` (rama mainnet).

No bloquea WP1–WP4. Es la versión mainnet del mismo concepto de WP1 y se secuencia con los
blockers del audit mainnet, no antes.

1. Flujo sandwich estándar de Stellar: la app construye la tx
   `beginSponsoringFutureReserves(plataforma)` → [`createAccount` si no existe] → `changeTrust`
   (source: usuario) → `endSponsoringFutureReserves`, firma con la llave del dispositivo y manda el
   XDR al backend; la plataforma co-firma con `PLATFORM_SECRET_KEY` y somete. La llave del usuario
   nunca sale del dispositivo; la plataforma solo paga reservas.
2. **El backend NUNCA co-firma a ciegas** (misma lección que la Fase 0 del ZKaaS): valida el XDR
   recibido — exactamente las operaciones esperadas, sponsoring source = plataforma, `changeTrust`
   solo de assets del allowlist (USDC/MXNe con issuers pinneados), fee acotado, nada más en la tx.
   Cualquier op extra → rechazo.
3. Gancho de activación: **primer ramp-in de Etherfuse** (webhook de orden SPEI completada) — la
   cuenta se crea patrocinada y con trustlines de forma invisible, que es el momento "al fondear"
   de la decisión original.
4. Anti-farming: patrocinar reservas cuesta XLM real → rate limit por usuario/dispositivo y gated a
   usuarios con ramp-in real (u orden KYC), no a cualquier registro.

**Verify:** en testnet con `STELLAR_NETWORK=MAINNET` simulado no aplica — probar el sandwich completo
en testnet con la rama mainnet forzada; XDR adulterado (op extra, asset fuera de allowlist, otro
sponsor) → rechazado; cuenta nueva queda operable con 0 XLM propios.

---

## 2. Orden de ejecución

```
WP0 (30 min, hoy) → WP1 (desbloquea al equipo) → WP2 → WP3 → WP4
                                                              WP5 (track mainnet, tras blockers del audit)
```

- **WP0 primero y solo:** hasta no saber qué token tiene la instancia actual, cualquier otro cambio
  puede estar construyendo sobre montos mal denominados.
- WP2 antes que WP3: la migración y la conversión definen el contrato de datos que WP3 y WP4 leen.
- WP4 al final del camino testnet: es la capa visible; sin WP2/WP3 no tiene qué seleccionar.

---

## 3. Definición de "hecho"

- [ ] WP0: token de la instancia `CB4M…` documentado y la inconsistencia HALLAZGO-1 corregida.
- [ ] Cuenta nueva en build testnet queda fondeada (friendbot) y con trustlines USDC+MXNe sin
      intervención manual; el registro no se rompe si friendbot falla.
- [ ] `trades` tiene `asset_code`, `rate_mxn`, `rate_source`, `rate_locked_at`; la tasa se congela al
      crear y se recotiza en lock tardío; conversión con enteros/BigInt y tests de borde verdes.
- [ ] Dos instancias de escrow (USDC, MXNe) del mismo WASM auditado; backend y frontend resuelven
      contrato y asset **por trade**, no por env var global.
- [ ] El vendedor elige asset en una pantalla peso-first (default MXNe); el comprador solo ve pesos;
      trades e2e completos en ambos assets (lock → reveal → release y refund).
- [ ] i18n es/en completo; `tsc --noEmit` y `npm test` verdes en frontend y backend; el APK testnet
      existente no se rompe (fallback de env vars una release).
- [ ] WP5 diseñado aquí queda explícitamente **fuera** de este ciclo — se ejecuta con el track
      mainnet.

---

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| ~~HALLAZGO-1: montos mal denominados si la instancia es USDC~~ **RESUELTO**: instancia es MXNe; el bug real era el default `'USDC'` del frontend (trustline equivocada → release puede fallar a compradores nuevos) | Fix de una línea en WP0 paso 2; queda cubierto además por el onboarding de WP1 (crea ambas trustlines) |
| Redondeo MXN↔asset (7 decimales) | Una sola función de conversión, enteros/BigInt, regla de redondeo documentada, tests de borde (WP2) |
| Friendbot rate-limita en registros masivos de prueba | Registro nunca depende de friendbot; retry lazy + `ensureTrustline` self-heal (WP1) |
| Plataforma casi sin USDC/MXNe de prueba (1.52 USDC) | Punto operativo WP1.4 — conseguir saldo de emisores testnet antes de las pruebas del equipo |
| Tasa USDC se mueve entre crear y lock | Ventana de 10 min + recotización en lock; el monto MXN nunca cambia (WP2.3) |
| Env vars viejas (`VITE_ESCROW_*`, `ESCROW_CONTRACT_ID`) en builds/deploys existentes | Fallback mapeado una release, retiro después (WP3) |
| Farming de reservas patrocinadas en mainnet | WP5.4: gated a ramp-in real + rate limit; no patrocinar por registro |
| Co-firma de XDR del cliente en WP5 | Validación estricta de ops/allowlist antes de firmar — nunca firmar a ciegas |
