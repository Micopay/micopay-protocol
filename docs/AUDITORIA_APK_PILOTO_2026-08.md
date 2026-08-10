# Auditoría del APK — aptitud para piloto ampliado

**Fecha:** 2026-08-03
**Alcance:** APK Android de MicoPay (`com.micopay.app`) y el backend al que apunta.
**Pregunta que responde:** ¿es seguro empezar a probar la app con más personas?

---

## Veredicto

**Sí, con una condición: hay que repartir un build de _release_ firmado, no el de _debug_ que se está usando hoy.**

No hay hallazgos que comprometan el diseño de seguridad de la app. El manejo de llaves, el endurecimiento de Android y el backend están bien construidos. El problema es que el APK que actualmente funciona es un build de depuración, y ese tipo de build desactiva justo las protecciones que el proyecto ya tiene correctamente configuradas para release.

Riesgo financiero acotado: el backend corre en **testnet** (`mockStellar: false` pero red de prueba), así que no hay fondos reales en juego durante el piloto.

---

## Hallazgo principal — el APK en uso es un build de debug

### Qué se encontró

Existen tres artefactos de APK en el repositorio local:

| Archivo | Fecha | API horneada |
|---|---|---|
| `dist/micopay-testnet-20260630.apk` | 2026-07-01 | `micopay-api.onrender.com` (obsoleto) |
| `android/app/build/outputs/apk/release/app-release.apk` | 2026-07-02 | `micopay-api.onrender.com` (obsoleto) |
| `android/app/build/outputs/apk/debug/app-debug.apk` | 2026-07-25 | **`api.micopay.app`** ✅ |

El único que apunta a la infraestructura actual de AWS es el de **debug**, compilado el mismo día que se completó la migración. Los dos builds de release son anteriores a la migración y apuntan a Render, cuyo backend hoy responde `{"status":"unavailable","dbConnected":false}`.

### Por qué importa

El build de debug desactiva cuatro protecciones:

1. **`android:debuggable="true"`** (verificado en el manifiesto empaquetado de debug). Con el teléfono en la mano y `adb`, se puede adjuntar un depurador al proceso y extraer la llave privada Stellar de la memoria. Esto anula la protección del Android Keystore.
2. **`usesCleartextTraffic="true"`** — `app/src/debug/AndroidManifest.xml` sobrescribe explícitamente el `false` del manifiesto principal, permitiendo HTTP en claro.
3. **Confianza en CAs instaladas por el usuario** — el bloque `<debug-overrides>` de `network_security_config.xml` añade `<certificates src="user" />`, lo que hace el tráfico interceptable con un certificado tipo Charles/Proxyman.
4. **Firma con la llave de debug**, que es compartida y pública. Además impide actualizar después a un release sin desinstalar.

### Acción

```bash
npm run build:testnet
cd android && ./gradlew assembleRelease
```

Verificar antes de repartir que el APK resultante trae `api.micopay.app` horneado:

```bash
unzip -o -q app-release.apk -d /tmp/apk 'assets/public/assets/*.js'
grep -rhoE "https://[a-zA-Z0-9.-]*micopay[a-zA-Z0-9./-]*" /tmp/apk | sort -u
```

---

## Lo que está correcto

Estos puntos se verificaron y no requieren acción.

### Almacenamiento de la llave privada

`src/services/secureStorage.ts` usa `@aparajita/capacitor-secure-storage` (v8) cuando corre en nativo, respaldado por Android Keystore. `localStorage` solo se usa en la ruta web/PWA. El issue **SEC-05** ("llave en localStorage plano") aplica al build web, **no al APK**.

La llave nunca sale del dispositivo: `keystore.ts` firma retos y XDR localmente y solo devuelve la firma o el XDR ya firmado.

### Endurecimiento de Android (configuración de release)

| Control | Estado |
|---|---|
| `android:allowBackup` | `false` |
| `android:usesCleartextTraffic` | `false` |
| `network_security_config` | solo CAs del sistema; CAs de usuario únicamente en debug |
| `minifyEnabled` / `shrinkResources` | `true` |
| `debuggable` (release) | `false` |
| Firma | desde `keystore.properties`, fuera del control de versiones |

Permisos declarados, todos justificados: `INTERNET`, `CAMERA` (escaneo QR), `ACCESS_COARSE/FINE_LOCATION` (mapa de agentes), `POST_NOTIFICATIONS`.

### Llave de firma fuera de git

`micopay-release.jks` y `keystore.properties` **no están rastreados**. `git ls-files` solo devuelve `keystore.properties.example`, y `.gitignore` cubre `*.jks`, `keystore.properties` y `local.properties`.

### Backend

`https://api.micopay.app/health` responde `200`:

```json
{"status":"ok","mockStellar":false,"dbConnected":true,
 "eventListenerState":"disabled","configCheck":{...todo true}}
```

Cabeceras de seguridad correctas: HSTS con `preload`, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, COOP/CORP, `Referrer-Policy: strict-origin-when-cross-origin`.

Validación de configuración al arranque (`config.ts`): rechaza `JWT_SECRET` ausente o débil en producción, bloquea `MOCK_STELLAR=true` en producción, exige `SECRET_ENCRYPTION_KEY` de 64 hex. CORS con allowlist explícita que rechaza todo si está vacía. `trustProxy: 1` (no `true`), por lo que los rate limits por IP no se evaden con una cabecera `X-Forwarded-For`.

---

## Hallazgos menores

### 1. El build de mainnet miente sobre la red — no distribuir

`.env.mainnet` define `VITE_STELLAR_NETWORK=PUBLIC`, Horizon de mainnet y el emisor USDC de mainnet, pero apunta a `api.micopay.app`, que corre en modo testnet. Un usuario vería saldos de mainnet contra un escrow de prueba. El propio archivo ya lo advierte en un comentario. **Usar solo `build:testnet` mientras no exista un backend real en mainnet.**

### 2. Deep links rotos

El manifiesto declara App Links para `https://app.micopay.xyz/claim/*` con `autoVerify="true"`. Ese host **no resuelve** (NXDOMAIN), por lo que la verificación de Digital Asset Links falla y los enlaces `/claim/` no abren la app. Hay que decidir el dominio definitivo (`app.micopay.xyz` vs. algo bajo `micopay.app`) y publicar `assetlinks.json`.

### 3. Event listener deshabilitado en producción

`eventListenerState: "disabled"` en `/health`. Conviene confirmar que ningún flujo del piloto dependa de la escucha de eventos on-chain.

### 4. Override de estado de trade — presente pero inerte

`getTradeStateDebugOverride()` sigue leyendo `?trade_state=` de la URL y `micopay_trade_state_override` de localStorage, pese a que **SEC-24** figura cerrado.

**No es explotable como vector de fraude**, y se verificó punto por punto:

- En `QRReveal.tsx` el valor se escribe con `setTradeState(...)` pero **nunca se renderiza** — es estado muerto.
- En `CashoutRequest.tsx` y `DepositRequest.tsx` alimenta un `TradeStateBadge` decorativo en la pantalla de captura de monto, **antes de que exista un trade**; no hay estado de backend que pueda tergiversarse frente a una contraparte.

Vale limpiarlo por higiene, pero no bloquea el piloto.

### 5. Gate de KYC apagado por defecto

`kycGateEnabled` requiere `KYC_GATE_ENABLED=true`. Es coherente con que el dictamen legal siga pendiente, pero conviene tenerlo presente si el piloto crece en número de personas o montos.

---

## Pendiente: consumo de AWS

**No se pudo obtener.** La sesión de AWS CLI está expirada y `aws login` no completa desde la red actual.

Causa identificada — la red local descarta silenciosamente ciertas IPs públicas:

| Endpoint | Resultado |
|---|---|
| `portal.sso.us-east-1.amazonaws.com` | **timeout** ← lo requiere `aws login` |
| `console.aws.amazon.com` | **timeout** ← lo requiere el navegador |
| `sts.amazonaws.com` | OK |
| `ce.us-east-1.amazonaws.com` (Cost Explorer) | OK |
| `github.com` | **timeout** |
| `1.1.1.1` | OK |

No es un problema de credenciales ni de permisos: el host del flujo de autenticación es uno de los que la red bloquea.

**Cómo resolverlo:** completar `aws login --profile micopay-admin` desde otra red (hotspot del celular). El endpoint de Cost Explorer sí responde, así que con una sesión válida la consulta funciona de inmediato. Alternativa por navegador: entrar directo a `https://us-east-1.console.aws.amazon.com/costmanagement/home` (ese host sí responde; `console.aws.amazon.com` a secas no).

**Referencia, no dato real:** el plan de migración estimaba **~$44 USD/mes** (ALB ~$17, ECS Fargate 0.25 vCPU/0.5 GB, RDS `db.t4g.micro`), con un budget configurado y alerta a $60/mes. Es una estimación del plan, **no el gasto facturado**.

---

## Correcciones a hallazgos preliminares

Dos hallazgos que se reportaron en la revisión inicial resultaron **falsos** y se retiran. Se dejan documentados para que no se vuelvan a levantar.

### "El ALB está medio muerto" — RETIRADO

Se midió que una de las dos IPs de `api.micopay.app` (`54.88.67.3`) daba timeout mientras la otra (`3.214.109.33`) respondía en 0.12 s, y se concluyó que una AZ del ALB estaba rota.

**Era la red local, no AWS.** Desde la misma máquina, `github.com` y una IP de Google también dan timeout, mientras `1.1.1.1` responde normal. El error fue medir un endpoint y culpar al servidor sin descartar antes al cliente.

> **Regla para futuras revisiones:** antes de declarar caído un endpoint de AWS desde un `curl` local, verificar `curl -k https://140.82.113.6/` (GitHub) y `https://1.1.1.1/`. Si IPs públicas sin relación también fallan, la falla es local. Confirmar contra la salud del target group o desde otra red.

### "El APK apunta a Render, que está muerto" — RETIRADO

Se auditó `app-release.apk` del 2 de julio, anterior a la migración, asumiendo que era el artefacto que se distribuye. El APK realmente en uso (`app-debug.apk`, 25 de julio) apunta correctamente a `api.micopay.app`. Render está efectivamente decomisionado, pero eso no afecta al APK en uso.

---

## Acciones recomendadas

| # | Acción | Prioridad |
|---|---|---|
| 1 | Compilar y firmar un APK de **release** con `build:testnet` y repartir ese | **Bloqueante** |
| 2 | Resolver el dominio de deep links y publicar `assetlinks.json` | Alta |
| 3 | Completar `aws login` desde otra red y revisar el gasto real contra el budget de $60 | Alta |
| 4 | Confirmar que ningún flujo del piloto dependa del event listener | Media |
| 5 | Eliminar `getTradeStateDebugOverride` y cerrar SEC-24 de verdad | Baja |
| 6 | No distribuir builds de `.env.mainnet` hasta tener backend en mainnet | Permanente |
