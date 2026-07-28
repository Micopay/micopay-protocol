# SEC-02 - Secreto HTLC expuesto en texto plano dentro del QR payload

## Resumen

Se confirma la exposicion del preimage HTLC en texto plano dentro de deep links/QR payloads en dos flujos:

- Cash request: `micopay://claim?...&secret=...`
- Trade P2P: `micopay://release?...&secret=...`

El preimage es el material que el contrato Soroban valida contra `secret_hash`. Por diseno del HTLC, quien obtiene ese preimage puede construir una transaccion `release`/`claim` directamente contra el contrato, sin pasar por el flujo controlado de la app ni por el escaneo del QR.

Severidad estimada: Alta.

## Alcance revisado

- `apps/api/src/routes/cash.ts`
- `apps/api/src/services/trade.service.ts`
- `apps/api/src/services/stellar.service.ts`
- `apps/api/src/routes/trades.ts`
- `apps/api/src/index.ts`
- `apps/api/src/__tests__/p2p.test.ts`

## Hallazgos

### 1. Cash request expone el preimage en el QR payload

Confirmado por codigo.

En `apps/api/src/routes/cash.ts:260-264` el backend genera `secretBytes`, `secret` y `secretHash`. Luego en `apps/api/src/routes/cash.ts:280` construye:

```text
micopay://claim?request_id=...&secret=...&amount_mxn=...&contract=...
```

El mismo `qrPayload` se guarda en memoria en `cashRequest.qr_payload` (`apps/api/src/routes/cash.ts:293`) y se devuelve al cliente en la respuesta HTTP (`apps/api/src/routes/cash.ts:319`).

Impacto: cualquier persona que vea el QR, capture la pantalla, intercepte el deep link, lea la respuesta HTTP o recupere el URI del historial puede extraer `secret`.

### 2. Trade P2P expone el preimage en el endpoint de secreto

Confirmado por codigo y por prueba existente.

En `apps/api/src/services/trade.service.ts:197-198`, el backend descifra el secreto HTLC almacenado. En `apps/api/src/services/trade.service.ts:207-209` devuelve tanto el secreto directo como un deep link que lo contiene:

```text
micopay://release?trade_id=...&secret=...
```

El endpoint esta expuesto como `GET /trades/:id/secret` en `apps/api/src/routes/trades.ts:92-106`.

La prueba `apps/api/src/__tests__/p2p.test.ts:137-140` valida explicitamente que la respuesta contiene el secret y que `qr_payload` incluye el preimage.

Impacto: una vez que el trade entra en estado `revealing`, el vendedor autorizado recibe un bearer secret reutilizable fuera de la app. Si ese valor se filtra a un tercero, el tercero puede intentar liberar los fondos directamente.

### 3. Se puede reclamar/liberar USDC directamente con el preimage

Confirmado por codigo para trade P2P; altamente probable para cash si usa el mismo contrato `MicopayEscrow`.

En `apps/api/src/services/stellar.service.ts:108-135`, `callReleaseOnChain` llama al contrato Soroban con:

```text
release(tradeIdBytes, secretBytes)
```

El contrato no recibe evidencia del escaneo del QR ni una prueba de que la transaccion viene desde la app. La autorizacion criptografica relevante es conocer el preimage que matchea `secret_hash`.

En `apps/api/src/services/trade.service.ts:225-231`, el backend reconstruye `tradeIdBytes` a partir de `secret_hash` y `secretBytes` a partir del `secret` descifrado antes de llamar `callReleaseOnChain`.

Resultado esperado: cualquier actor que tenga `secret` y pueda derivar el id esperado por el contrato puede invocar `release` directamente. No se ejecuto una prueba contra testnet en esta revision porque no se incluyeron credenciales/estado de contrato ni un trade live reproducible.

## Logs del servidor

No se encontro un log explicito del secret en el codigo revisado.

Evidencia:

- Cash: los logs en `apps/api/src/routes/cash.ts:273`, `apps/api/src/routes/cash.ts:275` y `apps/api/src/routes/cash.ts:299-301` no interpolan `secret` ni `qr_payload`.
- Trade P2P: `apps/api/src/services/trade.service.ts:200-205` registra acceso en `secret_access_log` con `trade_id`, `user_id`, `ip_address` y `user_agent`, pero no guarda el secret.
- Fastify activa logger solo en development: `apps/api/src/index.ts:33-36`.

Riesgo residual: aunque el codigo de aplicacion no imprime el secret, el valor viaja en respuestas HTTP y query params de deep links. Puede acabar en logs externos si existe logging de respuestas, proxies, analytics, crash reporting, herramientas de soporte, grabacion de pantalla o instrumentacion del frontend.

## Historial del browser

Confirmado como riesgo por formato de URL.

Si el payload se abre como URL/deep link, `secret` queda en la query string. Los navegadores, WebViews, app links, analytics SDKs, screenshots y herramientas de debugging suelen tratar la URL completa como dato registrable. Esto aplica a:

- `micopay://claim?request_id=...&secret=...`
- `micopay://release?trade_id=...&secret=...`

No se ejecuto una prueba de historial en un navegador concreto durante esta revision, pero la exposicion deriva directamente de ubicar el preimage en el query string.

## Pasos de reproduccion locales

### Cash request

1. Ejecutar `POST /api/v1/cash/request` con un `merchant_address` valido.
2. Inspeccionar la respuesta.
3. Verificar que `qr_payload` contiene `secret=<hex>`.
4. Extraer `secret` del deep link.
5. Usar ese preimage para construir una llamada directa al contrato Soroban `release`/`claim`, segun el ABI del contrato de escrow desplegado.

### Trade P2P

1. Crear un trade y llevarlo hasta estado `revealing`.
2. Ejecutar `GET /trades/:id/secret` como vendedor.
3. Verificar que la respuesta contiene `secret` y `qr_payload`.
4. Extraer `secret` de `micopay://release?trade_id=...&secret=...`.
5. Construir la transaccion directa contra Soroban con `tradeIdBytes` y `secretBytes`.

## Recomendacion

No incluir el preimage HTLC en QR payloads, deep links ni query strings.

Opciones recomendadas:

- QR opaco de un solo uso: incluir solo un `claim_token`/`release_token` aleatorio, corto TTL, estado server-side y marcado atomico como consumido.
- Entrega del preimage solo en el ultimo paso server-side, despues de autenticar al actor, validar estado, validar contexto del trade y registrar auditoria.
- Evitar query params para secretos; si un valor sensible debe viajar al cliente, usar canal autenticado, no cacheable, no loggable y con redaccion explicita.
- Redactar `secret`, `qr_payload`, `claim_token`, `release_token` y cualquier parametro sensible en logs de API, proxy, analytics y error reporting.
- Para flujos moviles, usar universal/app links que no pongan secretos en la URL visible ni en historiales.

## Respuestas solicitadas

- Se puede reclamar/liberar USDC directamente con el preimage? Si. Para trade P2P esta confirmado por el flujo `callReleaseOnChain(secretBytes)`. Para cash, el QR contiene el mismo tipo de preimage y apunta al contrato de escrow; se requiere una prueba live para confirmar el ABI exacto de claim/release en el despliegue actual.
- El secret aparece en logs del servidor? No se encontro log directo del secret en el codigo revisado. Si puede aparecer en logs externos de respuesta, proxy o instrumentacion si no hay redaccion.
- Aparece en historial del browser si el QR se abre como URL? Si el deep link se abre/registro como URL, el secret forma parte de la query string y puede quedar persistido por browser/WebView/analytics/debugging.
