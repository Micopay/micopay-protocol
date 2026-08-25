# Plan de remediación — hallazgos de la auditoría del APK

**Origen:** `docs/AUDITORIA_APK_2026-08-24.md`
**Fecha:** 2026-08-24 · **Revisado:** 2026-08-24 (objetivo Play Store)
**Ejecutor previsto:** agente Sonnet, con validación de Eric en los puntos marcados como 🔒
**Objetivo final:** publicar en Google Play y reclutar testers.

---

## Contexto que cambió el plan original

El plan se escribió asumiendo un piloto ya repartido. Eric corrigió dos cosas que lo reordenan:

1. **El APK de debug solo lo tiene José**, un cofundador. El riesgo de que alguien suplante la app con la llave de debug es prácticamente nulo. La Fase 1 dejó de ser un hotfix de emergencia; el APK de release sigue siendo obligatorio, pero porque **Play no acepta nada firmado con la llave de debug**.
2. **La base de datos se va a reiniciar** y se obligará a usar el APK nuevo. No hace falta plan de migración de usuarios.

Y añadió un objetivo nuevo: **subir a Play Store y buscar testers.** Eso introduce requisitos que el plan original no cubría (Fase 4) y sube la prioridad de las fases 2 y 3, porque van a entrar personas de fuera a usar la app.

---

## Cómo usar este plan

Fases secuenciales. Cada tarea `T-NN` trae objetivo, archivos exactos, pasos, comando de verificación y criterio de terminado.

Los pasos marcados con 🔒 **requieren a Eric**; el agente se detiene y pregunta, no improvisa.

### Reglas para el ejecutor

1. **No modifiques ningún `.apk`, `.aab` ni el contenido de `android/app/build/`.** Son artefactos; se regeneran.
2. **Nunca commitees `keystore.properties` ni `micopay-release.jks`.** Verifica con `git status` antes de cada commit.
3. **Nunca imprimas el contenido de `keystore.properties`** en salida, logs ni mensajes de commit.
4. **No ejecutes pruebas contra `api.micopay.app`** más allá de un `GET /health`.
5. **Un commit por tarea**, con el ID en el mensaje: `fix(offline): T-08 enrutar el sincronizador por el cliente de API`.
6. **Antes de cada commit**, corre `npx tsc --noEmit`. Debe salir en 0.
7. **No cambies de rama.** Todo va en `fix/auditoria-apk-2026-08`.
8. Si una verificación falla y no sabes por qué, **detente y reporta**. No inventes un workaround.

### Contexto técnico que el ejecutor necesita

- Frontend React + Vite empaquetado con Capacitor en un WebView Android.
- El WebView carga `https://localhost/`. **Cualquier `fetch` con URL relativa apunta a la propia app, no al backend.** Es la causa raíz de uno de los bugs.
- El cliente HTTP del proyecto es `http` (axios) en `src/services/api.ts:10`, con `baseURL` desde `VITE_API_URL`.
- **Gradle necesita JDK 17+.** El `java` del PATH es Java 8 y falla con un error confuso sobre "JVM runtime version 11". Usa el JDK 21 de Android Studio en cada invocación:
  ```bash
  JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew <tarea>
  ```
- La suite de tests tiene **30 fallos preexistentes**. No son culpa tuya y no los arregles en estas fases (van a Drips). Solo verifica que no aumenten.

---

## Fase 0 — Preparación ✅ COMPLETADA

### T-01 · Crear la rama de trabajo ✅

Rama `fix/auditoria-apk-2026-08`, creada desde `feat/map-real` en `c77ad31`.

**Por qué desde `feat/map-real` y no desde `main`:** `main` todavía tiene `VITE_API_URL=https://micopay-api.onrender.com` en `.env.testnet`. El commit que apunta los builds a AWS (`8108aeb`) solo existe en `feat/map-real`. Compilar desde `main` habría producido un APK apuntando a un backend apagado.

> ⚠️ **Deuda separada:** `feat/map-real` lleva 20 commits sin mergear a `main`, incluidos arreglos de seguridad (IDOR en `/defi/ramp/order`, prueba de posesión de llave al registrar, rate-limit en `/merchants/available`). Mientras no se mergeen, `main` no sirve como fuente de verdad. Fuera del alcance de este plan, pero hay que resolverlo.

### T-02 · Línea base de tests ✅

```
npx tsc --noEmit   → exit 0
npx vitest run     → 30 failed | 28 passed (58)
                     Home.test.tsx 10/10 · TradeDetail.test.tsx 20/21
```

**El número a vigilar es 30.** Si sube en cualquier fase, algo se rompió.

---

## Fase 1 — Build de release ✅ COMPLETADA

### T-03 · Dejar de mentir sobre el guardado offline ✅

`src/pages/MerchantSettings.tsx:159`. El mensaje de encolado se sustituyó por uno honesto de error, con un `TODO(T-11)` para revertirlo cuando la sincronización funcione.

Los otros dos sitios con mensajes de encolado (`MerchantAvailabilityToggle.tsx`, `OfflineQueueStatus.tsx`) están en componentes que nunca se montan; se arreglan en la Fase 2 al cablearlos.

### T-04 · versionCode dinámico ✅

`android/app/build.gradle`. Esquema **AAMMDDHH** a partir de la fecha del build.

**Por qué la fecha y no un contador de commits:** el contador depende de la rama, y compilar desde una rama con menos historial generaría un número menor que el ya repartido, impidiendo instalar encima. La fecha siempre crece, es independiente de la rama e identifica el build al dar soporte. Se puede forzar con `MICOPAY_VERSION_CODE` para reproducir un build concreto.

### T-05 · Compilar y firmar el APK de release ✅

```
SHA-256  8245b7480213e556e930ed026e2ad40664940feb31752d41d40072bdf167e4d5
Tamaño   25 403 405 bytes (24,2 MiB)
versionCode  26082417
Ruta     micopay/frontend/android/app/build/outputs/apk/release/app-release.apk
```

Las cinco comprobaciones: firma `CN=Micopay` ✅ · `debuggable` ausente y `usesCleartextTraffic=false` ✅ · package `com.micopay.app` sin sufijo ✅ · endpoints ⚠️ · un solo `classes.dex` ✅

**Sobre la comprobación de endpoints:** aparece `https://api.micopay.app` y **cero referencias a Render**. También aparece `http://localhost:3000` cuatro veces; se revisó una por una:

- Tres son **parámetros por defecto** de `useChatMessages`, `ChatRoom` y `DepositChat`. Los puntos de uso en `App.tsx:356` y `:374` pasan `apiBaseUrl={import.meta.env.VITE_API_URL}`, así que nunca entran en juego.
- Una es `PROTOCOL_API` de `ClaimQR.tsx`, que sí queda resuelta a localhost porque `VITE_PROTOCOL_API_URL` no está en `.env.testnet`. **No bloquea**: `ClaimQR` es inalcanzable desde el APK (ISSUE-06). Código muerto llamando a una URL muerta. Se arregla en la Fase 5.

### T-06 · Nota de migración para el piloto ❌ CANCELADA

Sin efecto: la base de datos se reinicia y el APK de debug solo lo tiene José.

---

## Fase 2 — Reparar la cola offline

**Prioridad:** alta. Van a entrar testers de fuera y esto pierde datos del comercio en silencio.

**Contexto.** Esto NO es implementar desde cero. `src/services/offlineQueueManager.ts` ya tiene 263 líneas funcionales: `flushQueue()`, `initNetworkMonitoring()`, `subscribeToQueueStatus()`, `retryFailedMutations()`. El problema es triple:

1. El módulo nunca se importa desde ningún sitio.
2. Usa `fetch('/users/me')` con **URL relativa**, que en el WebView resuelve a `https://localhost/users/me`.
3. Los payloads que se encolan **no tienen la forma que el sincronizador espera**.

### T-07 · Corregir los contratos de payload

Dos desajustes confirmados:

| Quién encola | Qué encola | Qué espera el sincronizador |
|---|---|---|
| `updateMerchantConfigWithOfflineSupport` (`api.ts:543`) | `{ config }` | el objeto config **plano** como body |
| `updateMerchantAvailabilityWithOfflineSupport` (`api.ts:557`) | `{ available }` | `payload.merchant_available` |

El segundo enviaría `merchant_available: undefined`.

**Pasos:**

1. En `offlineQueue.ts`, junto a `MutationType`, define y exporta:
   ```ts
   export interface ConfigMutationPayload { config: MerchantConfig }
   export interface AvailabilityMutationPayload { merchant_available: boolean }
   ```
2. `updateMerchantAvailabilityWithOfflineSupport` encola `{ merchant_available: available }`.
3. `syncConfigMutation` envía `payload.config`, no `payload`.
4. Tipa `syncMutation` con esos tipos en vez de `any`, para que TypeScript atrape el desajuste si vuelve.

**Verificación:** `npx tsc --noEmit` en 0 y el `any` desaparece de las dos funciones de sync.

### T-08 · Enrutar el sincronizador por el cliente de API

**Archivos:** `src/services/offlineQueueManager.ts`

1. Elimina los dos `fetch()` crudos.
2. Reutiliza lo que ya existe en `api.ts`, que va por axios con `baseURL` y cabeceras correctas: `updateMerchantConfig(token, config)` y `patchMerchantAvailability(token, available)`.
3. **Cuidado con el ciclo de importación:** `api.ts` no debe importar `offlineQueueManager.ts`. Si TypeScript se queja, extrae las dos llamadas a `src/services/merchantApi.ts` que ambos importen.

**Verificación:** `grep -n "fetch(" src/services/offlineQueueManager.ts` → 0 resultados.

### T-09 · Cablear la sincronización automática

**Archivos:** `src/hooks/useOfflineQueue.ts`, `src/App.tsx`

1. `retryAsync` delega en el manager:
   ```ts
   const retryAsync = useCallback(async (token: string | null) => {
     setIsSyncing(true);
     try {
       await flushQueue(token);
       refreshPending();
     } finally {
       setIsSyncing(false);
     }
   }, [refreshPending]);
   ```
   El parámetro deja de llamarse `_token` y **se usa**.
2. Quita el `_` de `useOfflineQueue(_token)` y pásalo a `initNetworkMonitoring(token)` en el `useEffect` de arranque.
3. Monta `<OfflineQueueStatus token={token} />` en el layout de `App.tsx`, visible en las pantallas de comercio.

**Verificación:** `grep -rn "markAsSynced" src/hooks/useOfflineQueue.ts` → 0 resultados.

### T-10 · Corregir el encolado indiscriminado

`updateMerchantConfigWithOfflineSupport` tiene un `catch {}` pelado: un 400 de validación o un 401 de sesión expirada se tratan como "sin conexión" y se encolan, cuando el servidor los va a rechazar igual.

```ts
} catch (err: any) {
  if (err?.response) throw err;      // el servidor respondió: error real, propágalo
  await queueFn('config', { config });
  return { config, queued: true };
}
```

Aplica lo mismo a la variante de availability.

### T-11 · Restaurar el mensaje correcto y añadir tests

1. Revierte el `TODO(T-11)` de T-03. Vuelve el mensaje de encolado con `messageType: 'warning'`.
2. Crea `src/__tests__/offlineQueue.test.ts` con tres casos:
   - **Encola sin red:** error sin `response` → `queued: true`, 1 mutación pendiente.
   - **Sincroniza al volver:** `flushQueue(token)` llama al endpoint correcto con el payload correcto y marca como sincronizada.
   - **No traga errores del servidor:** respuesta 400 → queda marcada con error, **no** como sincronizada.

El tercero es el que impide que el bug vuelva. No lo omitas.

**Criterio de terminado:** los fallos preexistentes siguen siendo 30 y los 3 nuevos pasan.

---

## Fase 3 — Respaldo de la llave secreta

### T-12 · Plugin nativo para pantalla segura

**Archivos:** `android/app/src/main/java/com/micopay/app/SecureScreenPlugin.java` (nuevo), `MainActivity.java`

Plugin mínimo de Capacitor con `enable()` y `disable()` que apliquen y quiten `WindowManager.LayoutParams.FLAG_SECURE`. Los cambios de flags de ventana van en el hilo de UI (`runOnUiThread`).

**Por qué no global:** activarlo para toda la app rompería las capturas que la gente mande a soporte. Solo mientras se muestra la llave.

### T-13 · Rehacer el flujo de respaldo

**Archivos:** `src/pages/Profile.tsx`, `src/pages/Register.tsx`

1. Sustituye la copia al portapapeles por: mostrar la llave con `SecureScreen.enable()` activo y pedir confirmación reescribiendo los últimos 4 caracteres.
2. Desactiva `FLAG_SECURE` al salir de la vista, incluso si el usuario cancela o navega atrás.
3. **Elimina** `navigator.clipboard.writeText(secretKey)` de ambos archivos.
4. La copia de la **dirección pública** se queda: no es un secreto.
5. Sustituye `window.confirm` y `alert` por los diálogos de la app.

**Verificación:** `grep -rn "clipboard.writeText(secret" src/` → 0 resultados.

🔒 **Punto de parada.** Cambia el onboarding. Enseña las pantallas a Eric antes de cerrarlo.

### T-14 · Documentar como SEC-32 y SEC-33

En `docs/security-reports/`, siguiendo el formato de los existentes (`SEC-03-cash-request-sin-auth.md` como plantilla):

- `SEC-32-apk-debug-firmado-con-llave-publica.md` → ISSUE-01
- `SEC-33-llave-secreta-al-portapapeles.md` → ISSUE-03

La numeración llega a SEC-31; 32 y 33 están libres.

---

## Fase 4 — Preparación para Play Store 🆕

**Prerrequisito:** fases 2 y 3 terminadas. No conviene meter testers en una app con la cola offline rota y el KYC sin salida.

> ⚠️ **Las políticas de Play cambian con frecuencia.** Todo lo de esta fase debe verificarse en la Play Console antes de darlo por hecho. Lo que sigue es lo que hay que revisar, no una garantía de que siga vigente.

### T-19 · Quitar los dos permisos innecesarios

**Archivos:** `android/app/src/main/AndroidManifest.xml`

Era el issue #4 de Drips, pero **bloquea la subida**: `ACCESS_FINE_LOCATION` obliga a llenar una justificación en la consola, y `POST_NOTIFICATIONS` sin funcionalidad detrás es difícil de explicar. Quitarlos cuesta media hora y evita ambos formularios.

1. Elimina `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />` (línea 65).
2. Elimina `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (línea 67).
3. Elimina la meta-data `com.google.firebase.messaging.default_notification_channel_id` (líneas 55-57).
4. **No toques** `ACCESS_COARSE_LOCATION`, `INTERNET`, `CAMERA` ni `ACCESS_NETWORK_STATE`.

**Justificación técnica:** todas las llamadas de geolocalización usan `enableHighAccuracy: false`; `COARSE` basta. Y el escaneo del `classes.dex` da 0 coincidencias para `messaging`, `Messaging` y `PushNotification`: no hay push implementado.

**Verificación:**
```bash
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew :app:assembleDebug
~/AppData/Local/Android/Sdk/build-tools/36.1.0/aapt.exe dump badging \
  app/build/outputs/apk/debug/app-debug.apk | grep uses-permission
```

Esperado: `INTERNET`, `CAMERA`, `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE` y el `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` que genera Capacitor.

Si algún permiso persiste, viene por **fusión de manifiestos** desde una librería. Revisa `app/build/intermediates/merged_manifests/` para ver cuál y **reporta antes de añadir un `tools:node="remove"`**.

> **Consecuencia en Drips:** al hacerse aquí, la lista de issues publicables baja de 7 a 6. Actualiza `docs/DRIPS_ISSUES_AUDITORIA_2026-08.md` retirando el issue #4 y renumerando.

### T-20 · Generar el AAB

**Play no acepta APK para apps nuevas.** Hace falta un Android App Bundle.

```bash
cd micopay/frontend
npm run build:testnet
npx cap sync android
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease
```

Sale en `app/build/outputs/bundle/release/app-release.aab`. Hay uno viejo de 2026-05-18 en el árbol; **se regenera, no se reutiliza**.

**Efecto colateral bueno:** con AAB, Play genera una descarga distinta por arquitectura, densidad e idioma. El problema de los 12 MB de librerías x86 (ISSUE-09) **se resuelve solo** para quien instale desde Play. El issue de Drips sigue teniendo valor únicamente si se reparte APK por enlace directo; anótalo en su descripción.

**Verificación:** el AAB existe, su `versionCode` coincide con el esquema AAMMDDHH y `sha256sum` queda registrado.

### T-21 · Firma de Play y sus consecuencias 🔒

Al subir la primera vez, Play ofrece **Play App Signing**: Google guarda la llave de firma real y tu keystore pasa a ser la **llave de subida**.

Dos cosas que hay que entender antes de aceptar:

1. **La huella del certificado que verán los dispositivos es la de Google, no la tuya.** Esto es crítico para la Fase 5: el `assetlinks.json` de los deep links debe llevar **la huella de Play**, que solo se conoce después de subir. Publicar el archivo con la huella local haría que los enlaces no verifiquen nunca.
2. Si pierdes el keystore local, la llave de subida se puede resetear con Google. Sin Play App Signing, perder el keystore significa no poder actualizar la app nunca más.

🔒 **Decisión de Eric.** El agente no crea la cuenta ni sube nada.

### T-22 · Completar la política de privacidad 🔒

Ya existen y están publicadas en `micopay.com.mx`:

| Página | URL |
|---|---|
| Términos de uso | `https://micopay.com.mx/terms` |
| Aviso de privacidad (sitio) | `https://micopay.com.mx/privacy` |
| **Privacidad de la app** | `https://micopay.com.mx/privacy-app` |

`/privacy-app` es la que va en el campo de política de privacidad de la Play Console. Tiene 13 apartados, derechos ARCO, retención, transferencias internacionales y procedimiento de reclamos. Última actualización: 4 de agosto de 2026.

**Le falta una cosa.** Los datos del responsable están sin rellenar:

```
Responsable: [RAZÓN SOCIAL]
Domicilio: [DOMICILIO FISCAL COMPLETO]
```

Play exige identificar quién responde por los datos, y la LFPDPPP también. Está encadenado a la constitución de la empresa. Si va a tardar, se puede poner temporalmente el nombre y domicilio de Eric como persona física.

**Coherencia obligatoria:** Play cruza la política de privacidad con el formulario de seguridad de datos y con los permisos del APK. Tras T-19 los permisos coinciden con lo declarado en el documento, que menciona ubicación y cámara pero no notificaciones. Verifica que siga cuadrando antes de enviar.

🔒 El texto legal lo decide Eric.

### T-23 · Formulario de seguridad de datos y ficha de la tienda 🔒

Play pide declarar qué datos se recopilan y para qué. Según `/privacy-app`, lo que hay que declarar es: teléfono (hasheado con SHA-256), ubicación aproximada, nombre de usuario, dirección Stellar pública, historial de operaciones y documentos de identificación en el flujo de verificación externa.

**Dos puntos que requieren criterio de Eric:**

**La app corre en testnet.** El dinero no es real. Publicar en Play una app que se presenta como servicio de pagos cuando las operaciones son de prueba hay que redactarlo con cuidado en la ficha. Si un revisor entiende que se ofrece un servicio financiero real y no lo es, puede ser rechazo. Si queda claro como beta o demo, no hay problema. Es una decisión de cómo se cuenta, no un impedimento técnico.

**Las apps financieras y de cripto tienen política propia** en Play, con declaraciones específicas y, en algunos países, documentación de licencia. Conviene revisarlo en la consola **antes** de invertir tiempo en la ficha, porque puede condicionar cómo se describe la app.

🔒 Ambos son decisiones de producto y legales. El agente no las toma.

### T-24 · Tipo de cuenta de desarrollador 🔒

Las cuentas nuevas de desarrollador **personal** requieren 12 testers durante 14 días antes de poder publicar en producción. Las cuentas de **organización** están exentas.

Como Eric está constituyendo empresa, abrir la cuenta a nombre de la empresa evita ese requisito. Si la constitución va a tardar y hay prisa por meter testers, la cuenta personal sirve para pruebas cerradas.

🔒 Decisión de Eric, con impacto en tiempos. Verifica el requisito vigente en la consola.

---

## Fase 5 — Deep links 🔒 BLOQUEADA

### T-15 · Decisión de dominio 🔒

`app.micopay.xyz` no resuelve (NXDOMAIN). Hay que elegir el dominio definitivo.

**Recomendación:** usar `micopay.com.mx`, que ya existe, ya está publicado y ya sirve las páginas legales. Evita dar de alta un dominio nuevo y configurar DNS desde cero.

### T-16 · Una vez desbloqueado

**Depende de T-21.** El `assetlinks.json` necesita la huella SHA-256 del certificado con el que Play firma la app, que solo se conoce tras la primera subida. Publicarlo con la huella del keystore local haría que la verificación falle siempre.

Trabajo interno:
1. Publicar `https://micopay.com.mx/.well-known/assetlinks.json` con la huella de Play.
2. Cambiar `android:host` en el intent-filter de `AndroidManifest.xml`.
3. Definir `VITE_PROTOCOL_API_URL` en los `.env.*` de distribución, o eliminar el fallback a localhost para que un build mal configurado falle de forma ruidosa.

El trabajo de código en el frontend (registrar `appUrlOpen`, añadir la ruta `/claim/:requestId` al router) se convierte en un issue de Drips adicional una vez desbloqueado.

---

## Fase 6 — Publicar los issues en Drips

> **La restricción original quedó sin efecto.** El plan decía no publicar hasta repartir el APK de release, porque el documento de auditoría describe cómo explotar el build de debug. Con un solo teléfono afectado y ese teléfono siendo de un cofundador, no hay nada que proteger. **Se puede publicar cuando se quiera.**

### T-17 · Preparar los cuerpos de issue ✅ REDACTADOS

Están en `docs/DRIPS_ISSUES_AUDITORIA_2026-08.md`, en el formato que exige `docs/DRIPS_TEAM_GUIDE.md`.

| # | Issue | Complejidad | Estado |
|---|---|---|---|
| 1 | Navegación rota en 401 y KYC aprobado | Medium | listo |
| 2 | Reparar `Home.test.tsx` | Trivial | listo |
| 3 | Reparar `TradeDetail.test.tsx` | Medium | listo |
| ~~4~~ | ~~Quitar permisos innecesarios~~ | — | **movido a T-19** |
| 5 | Excluir ABIs x86 y limitar `resConfigs` | Trivial | listo, revisar nota de AAB |
| 6 | Retirar botones inertes del chat | Medium | listo |
| 7 | `aria-label` en botones solo-icono | Medium | listo, depende del #6 |

### T-18 · Verificar antes de publicar

Para cada issue, comprueba en el código **actual de la rama** que el problema sigue existiendo. Las fases 2, 3 y 4 pueden haber arreglado alguno de paso — el #4 seguro. **Un issue que ya no reproduce quema el tiempo de un contribuidor y la credibilidad del proyecto.**

🔒 Eric revisa los cuerpos y publica. El agente no publica nada en Drips por su cuenta.

---

## Resumen de secuencia

| Fase | Tareas | Estado | Requiere a Eric |
|---|---|---|---|
| 0 · Preparación | T-01, T-02 | ✅ completada | no |
| 1 · Build de release | T-03 … T-05 (T-06 cancelada) | ✅ completada | no |
| 2 · Cola offline | T-07 … T-11 | pendiente | no |
| 3 · Llave secreta | T-12 … T-14 | pendiente | 🔒 T-13 |
| 4 · Play Store | T-19 … T-24 | pendiente | 🔒 T-21, T-22, T-23, T-24 |
| 5 · Deep links | T-15, T-16 | bloqueada | 🔒 T-15, depende de T-21 |
| 6 · Drips | T-17 ✅, T-18 | cuerpos listos | 🔒 T-18 |

Las fases 2 y 3 son independientes entre sí. La 4 exige que ambas estén hechas. La 5 depende de la 4. La 6 se puede hacer en cualquier momento.

## Definición de terminado global

- [x] Existe un APK de release firmado con `CN=Micopay`, con `versionCode` mayor que 1, verificado con las cinco comprobaciones.
- [ ] Una mutación encolada sin red llega al backend al recuperar la conexión, con test que lo demuestra.
- [ ] Un error del servidor ya no se confunde con falta de conexión.
- [ ] La llave secreta no pasa por el portapapeles.
- [ ] El manifiesto declara solo los cuatro permisos que la app usa.
- [ ] Existe un AAB firmado y verificado, listo para subir.
- [ ] La política de privacidad tiene los datos del responsable rellenados y cuadra con los permisos declarados.
- [ ] `npx tsc --noEmit` en 0 y los fallos de tests siguen siendo exactamente 30, ni uno más.
- [ ] SEC-32 y SEC-33 documentados.
- [ ] 6 cuerpos de issue verificados contra el código actual y revisados por Eric.
