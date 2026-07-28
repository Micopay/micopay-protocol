# SEC-29: Verificación de App Links (assetlinks.json) y consumo del deep link /claim/:id

**Severidad:** Media (Android)

---

## Resultado

**No verificado.** El archivo `assetlinks.json` existe pero contiene un marcador de posición (`TODO:`), no la huella SHA-256 real del certificado de firma del APK. La verificación de Android App Links fallará en producción, degradando el enlace a un deep link común con diálogo de desambiguación.

El consumo del `requestId` en el frontend está correctamente acotado con una regex restrictiva; el secret/preimage del HTLC **no** viaja por el deep link.

---

## Evidencia

### 1. assetlinks.json — placeholder, no la huella real

Archivo: `micopay/backend/public/.well-known/assetlinks.json` línea 8:

```json
"TODO: replace with your SHA-256 signing certificate fingerprint. (e.g. AB:CD:EF:...)"
```

El backend lo sirve correctamente (índice.ts:61-74) con `Content-Type: application/json` y `Cache-Control: public, max-age=3600`, pero el contenido no es válido para la verificación de Digital Asset Links.

### 2. Manifest declara autoVerify correctamente

`micopay/frontend/android/app/src/main/AndroidManifest.xml:35-43`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="app.micopay.xyz"
          android:pathPrefix="/claim/" />
</intent-filter>
```

Sintaxis correcta, `android:autoVerify="true"` presente, `launchMode="singleTask"` en el activity.

### 3. Keystore y huella no están en el repo

- `keystore.properties`, `*.keystore`, `*.jks` están en `.gitignore` (`.gitignore:56-58, 105-106`). La huella SHA-256 debe obtenerse del keystore de firma de release, el cual se configura en `app/build.gradle:18-28` vía `keystore.properties`. No hay keystore ni fingerprint en el repositorio.

### 4. Regex del requestId — correcta

`micopay/frontend/src/main.tsx:30`:

```ts
const claimMatch = window.location.pathname.match(/^\/claim\/([a-zA-Z0-9_-]+)$/)
```

- Solo permite caracteres alfanuméricos, guion bajo y guion medio.
- Previene path traversal, inyección de rutas, y caracteres especiales en la URL.
- El `requestId` se usa en `ClaimQR.tsx:64` para un fetch GET a `${PROTOCOL_API}/api/v1/cash/request/${requestId}`. Al estar acotado por la regex, no hay riesgo de SSRF o path traversal en la petición al backend.

### 5. Secret/preimage no viaja por el deep link

- El deep link `/claim/:requestId` solo transporta el `requestId`.
- El payload del QR (`ClaimQR.tsx:55`) incluye `htlc_tx_hash` (hash público de blockchain), no el preimage/secret del HTLC.
- El secret del HTLC nunca se expone en la URL ni en el QR.

### 6. Riesgo de intercepción

Sin `assetlinks.json` válido, Android no verifica el App Link. Esto significa:

- Al abrir `https://app.micopay.xyz/claim/<id>`, Android muestra el diálogo de desambiguación (picker) ofreciendo el navegador y MicoPay.
- **Cualquier app maliciosa** que declare el mismo `intent-filter` (`https://app.micopay.xyz/claim/*`) también aparecerá en el picker y podría interceptar el deep link.
- El usuario podría seleccionar la app maliciosa por error, y esta recibiría el `requestId`. Si bien el `requestId` no contiene el secret, un atacante con el `requestId` podría consultar el estado de la solicitud vía API (`GET /api/v1/cash/request/{id}`) y posiblemente interferir con el flujo.

Relacionado con SEC-07 (deep link interception).

---

## Reproducible en testnet

Sí. Basta con:

1. Publicar el backend con el `assetlinks.json` actual (placeholder) en `https://app.micopay.xyz/.well-known/assetlinks.json`
2. Instalar la app en un dispositivo Android e instalar una segunda app que declare el mismo intent-filter
3. Abrir `https://app.micopay.xyz/claim/<id>` — aparece el picker

Comando de verificación:

```bash
curl https://app.micopay.xyz/.well-known/assetlinks.json
# → Devuelve el JSON con placeholder, no pasa la verificación

adb shell pm get-app-links com.micopay.app
# → Mostrará el estado como "not verified" para app.micopay.xyz
```

---

## Sugerencia de fix

1. **Obtener la huella SHA-256** del keystore de firma de release:

   ```bash
   keytool -list -v -keystore release.keystore -alias micopay \
     | grep "SHA256:" | awk '{print $2}'
   ```

2. **Reemplazar el placeholder** en `micopay/backend/public/.well-known/assetlinks.json`:

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.micopay.app",
         "sha256_cert_fingerprints": [
           "AB:CD:EF:...:12:34"
         ]
       }
     }
   ]
   ```

   La huella debe usar el formato de dos puntos (`AB:CD:EF...`), 32 bytes en hexadecimal uppercase.

3. **Verificar** con la herramienta de Digital Asset Links de Google:
   `https://developers.google.com/digital-asset-links/tools/generator`

4. **Publicar** y verificar en device:

   ```bash
   adb shell pm get-app-links com.micopay.app
   ```

   Debe mostrar `verified` para `https://app.micopay.xyz`.
