# SEC-30 — QR parser: secret/htlc format validation & legacy scheme

**Issue:** [#262](https://github.com/ericmt-98/micopay-protocol/issues/262)  
**Archivo:** `micopay/frontend/src/utils/qrPayload.ts` (+ `demoMode.ts`, `qrValidation.ts`)  
**Investigador:** @ironhood  
**Fecha:** 2026-06-29  
**Entorno:** micopay-frontend (Vite + Capacitor), testnet build, análisis estático + `vitest`

---

## Resultado

**Vulnerabilidad confirmada (severidad media).** Antes del fix, `parseQRPayload` aceptaba `secret` y `htlc` sin validar formato ni longitud, y el esquema legacy `MICOPAY:` en texto plano seguía activo en builds de release. Se implementó validación estricta y se restringió el formato legacy a `VITE_DEMO_MODE=true`.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Se valida el formato de `secret`/`htlc`? | **Sí (post-fix).** `secret` debe ser hex de 64 caracteres (preimage HTLC de 32 bytes). `htlc` debe ser hash hex de 64 caracteres (tx Stellar) o prefijo `demo_htlc_` solo en demo mode. `trade_id` debe ser UUID; `request_id` alfanumérico con guiones. |
| ¿El preimage HTLC se filtra a logs/clipboard/historial? | **No a logcat/console en código de producción.** No hay `console.log` del secret en el frontend. El QR vive en estado React (`QRReveal`, `ClaimQR`) mientras se muestra — comportamiento inherente al flujo QR. No hay copia automática al portapapeles del secret HTLC. El historial del WebView no persiste el payload del QR en rutas revisadas. |
| ¿El formato legacy en claro sigue aceptándose en release? | **No (post-fix).** `MICOPAY:…` se rechaza cuando `VITE_DEMO_MODE !== 'true'`. |
| ¿Demo secret aislado a `IS_DEMO_MODE`? | **Sí.** `DEMO_QR_PAYLOAD` solo se expone vía `getDemoQrPayload()` (lanza fuera de demo). Usado en `QRReveal.tsx` únicamente cuando `getSecret` falla **y** `IS_DEMO_MODE`. `App.tsx` stub de trade demo también gated por `IS_DEMO_MODE`. |

---

## Evidencia

### 1. Reproducción pre-fix (acepta secret malformado)

Entrada: `micopay://release?trade_id=abc-123&secret=ZZZ`

Comportamiento anterior: `{ ok: true, payload: { type: 'release', tradeId: 'abc-123', secret: 'ZZZ' } }` — aceptaba cualquier string.

Comportamiento post-fix: `{ ok: false, error: '…64 caracteres…' }` o error de UUID según el campo inválido.

Tests automatizados en `micopay/frontend/src/utils/qrPayload.test.ts`:

```bash
cd micopay/frontend && npm test -- qrPayload qrValidation
```

### 2. Formato legacy `MICOPAY:` en release

- Pre-fix: `parseQRPayload('MICOPAY:DEMO:mock_secret_for_ui_preview')` → `{ ok: true, type: 'demo' }` en cualquier build.
- Post-fix: mismo input en release → `{ ok: false, error: '…legacy MICOPAY…' }`.
- Demo build (`VITE_DEMO_MODE=true`): sigue aceptando el formato para previews UI.

### 3. Filtrado del secret HTLC

| Vector | Hallazgo |
|--------|----------|
| **logcat / console** | Búsqueda en `micopay/frontend/src`: ningún `console.log/debug/info` incluye `secret`, `qrPayload` ni el preimage HTLC. Los logs de push/offline queue no tocan material HTLC. |
| **Estado WebView / React** | `QRReveal.tsx` guarda `qrPayload` en `useState` para renderizar el QR SVG. Se descarta al desmontar la pantalla. No se escribe en `localStorage`/`sessionStorage` ni en `secureStorage`. |
| **Portapapeles** | No hay `navigator.clipboard.writeText` del secret HTLC ni del QR payload. Clipboard en la app se usa para claves Stellar del usuario (`Profile.tsx`, `Register.tsx`) y recibos (`SuccessScreen.tsx`) — flujos separados. |
| **Historial de navegación** | Rutas React Router no incluyen query params con secret. Deep links `micopay://` se parsean en memoria en `MerchantInbox.handleScan`; solo se extrae `tradeId` para `merchantConfirmScan` — el secret parseado no se propaga más allá del objeto local `parsed`. |
| **Backend e2e script** | `micopay/scripts/e2e-test.ts` imprime `qr_payload` en consola — script de desarrollo, no incluido en el APK. |

### 4. Aislamiento demo (`demoMode.ts`)

```typescript
// demoMode.ts — getDemoQrPayload() throws outside demo mode
// QRReveal.tsx:42 — fallback solo si IS_DEMO_MODE && getSecret() falla
// App.tsx:753 — trade stub demo solo si IS_DEMO_MODE
```

Build prod (`build:prod`) no define `VITE_DEMO_MODE`; valor por defecto `false`.

---

## Reproducible en testnet

**Sí.** El flujo release/claim con QR `micopay://` es el usado en testnet. La validación aplica igual en testnet y prod; el formato legacy solo en builds con `VITE_DEMO_MODE=true`.

---

## Sugerencia de fix (implementada en este PR)

1. **`qrValidation.ts`** — helpers `isHex64`, `isUuid`, `isRequestId`, `isHtlcReference`.
2. **`qrPayload.ts`** — rechazar `secret`/`htlc`/`trade_id` malformados; legacy `MICOPAY:` solo con `IS_DEMO_MODE`.
3. **`demoMode.ts`** — `getDemoQrPayload()` con guard runtime; `QRReveal.tsx` actualizado.
4. **Tests** — casos negativos para secret `ZZZ`, UUID inválido, htlc `0xhash`, legacy en release.

### Follow-ups opcionales (fuera de scope)

- **SEC-02/SEC-07:** auditar que el backend no devuelva el secret en logs de acceso (`secret_access_log` ya registra acceso sin el valor).
- **MerchantInbox:** hoy solo usa `tradeId` del QR release; considerar ignorar el param `secret` en el flujo merchant (el backend valida on-chain).
- **Capacitor WebView:** deshabilitar screenshot en pantalla QR (`FLAG_SECURE` en Android) — hardening adicional P2.

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `micopay/frontend/src/utils/qrValidation.ts` | Nuevo — validadores de formato |
| `micopay/frontend/src/utils/qrPayload.ts` | Validación en parser |
| `micopay/frontend/src/utils/demoMode.ts` | Guard `getDemoQrPayload()` |
| `micopay/frontend/src/pages/QRReveal.tsx` | Usa `getDemoQrPayload()` |
| `micopay/frontend/src/utils/qrPayload.test.ts` | Tests ampliados |
| `micopay/frontend/src/utils/qrValidation.test.ts` | Tests de validadores |
