# SEC-32 — APK de debug distribuido y firmado con la llave pública de Android

| Campo | Valor |
| --- | --- |
| **ID** | SEC-32 |
| **Severidad** | 🔴 Crítica — permite suplantar la app y extraer la llave privada del usuario |
| **Issue** | — (interno, no publicado en Drips) |
| **Componente** | `micopay/frontend/android` — `buildTypes.debug`, artefacto `app-debug.apk` |
| **Estado** | ✅ Remediado |
| **Reportado por** | Auditoría del APK 2026-08-24 (`docs/AUDITORIA_APK_2026-08-24.md`, ISSUE-01) |

---

## 1. Resumen

El único APK que apuntaba a la infraestructura de AWS (`api.micopay.app`) era un
build de **depuración**, no de release. Ese tipo de build desactiva a propósito
las protecciones que el proyecto ya tenía correctamente configuradas para
release, y —lo más grave— va firmado con el **certificado de depuración genérico
del SDK de Android**, cuya llave privada está en la máquina de cualquier
desarrollador del mundo.

Artefacto afectado:

```
app-debug.apk
SHA-256      6a71c01b1f1f916015cacfd09ddc76d8de76ff8c2df4eaa91297a5e4e29bad3e
Package      com.micopay.app.debug
Compilado    2026-07-25 23:01
```

## 2. Evidencia

### 2.1 Firma con llave pública

```
$ apksigner verify --print-certs app-debug.apk
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: 7abbd094b6a04a9c168eef36c6cf6742fa8a8ca950d52160954495c70ff22eb7
```

`CN=Android Debug` es el certificado que el SDK genera automáticamente en
`~/.android/debug.keystore`, con contraseña conocida y pública (`android`).

### 2.2 Protecciones desactivadas

```
$ aapt2 dump xmltree --file AndroidManifest.xml app-debug.apk
  E: application
    A: debuggable=true
    A: usesCleartextTraffic=true
```

El bloque `<debug-overrides>` de `network_security_config.xml` añade
`<certificates src="user" />`. Ese bloque **solo aplica a builds `debuggable`**,
es decir, aplicaba aquí.

```
$ unzip -l app-debug.apk | grep -c classes
13
```

Trece archivos DEX: R8 no corrió. Sin ofuscación ni eliminación de código muerto.

## 3. Impacto

**Suplantación de actualizaciones.** Cualquiera puede compilar un APK malicioso,
firmarlo con la llave de debug que ya tiene en su equipo, y el dispositivo lo
aceptará como actualización legítima de MicoPay. La app falsa hereda el sandbox
de la real, incluida la llave privada Stellar del Android Keystore. El usuario no
recibe ninguna advertencia: Android ve la misma firma y asume el mismo autor.

**Extracción de la llave privada.** Con `debuggable=true` y acceso físico al
dispositivo, `adb` permite adjuntar un depurador al proceso y leer la llave
Stellar de la memoria. Esto anula por completo la protección del Android
Keystore, que es la pieza central del diseño de seguridad de la app.

**Interceptación de tráfico.** Con confianza en CAs de usuario y cleartext
permitido, todo el tráfico con el backend es legible y modificable instalando un
certificado en el dispositivo.

## 4. Factor atenuante

El APK **nunca se distribuyó más allá de un cofundador** (José). No hubo piloto
abierto con este artefacto. El riesgo real de explotación fue prácticamente nulo;
la severidad se mantiene en crítica por la naturaleza del defecto, no por su
exposición efectiva.

## 5. Remediación

Compilado y firmado un APK de release con el keystore del proyecto:

```
app-release.apk
SHA-256      8245b7480213e556e930ed026e2ad40664940feb31752d41d40072bdf167e4d5
Package      com.micopay.app
versionCode  26082417
Tamaño       25 403 405 bytes
```

Verificado con cinco comprobaciones:

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Firma | `CN=Micopay, OU=Hackathon, O=Micopay, L=CDMX, ST=CDMX, C=MX` |
| 2 | Manifiesto | `debuggable` ausente, `usesCleartextTraffic=false` |
| 3 | Package | `com.micopay.app`, sin sufijo `.debug` |
| 4 | Endpoints | solo `https://api.micopay.app`; cero referencias a Render |
| 5 | R8 | un único `classes.dex` |

## 6. Pendientes asociados

- **Firma v3.1.** El APK se firma solo con esquema v2. Sin v3/v3.1 no es posible
  rotar la llave de firma si algún día se compromete.
- **Play App Signing.** Al subir a Play, la huella del certificado que verán los
  dispositivos será la de Google, no la del keystore local. Esto condiciona el
  `assetlinks.json` de los deep links (ver `docs/PLAN_REMEDIACION_APK_2026-08-24.md`,
  T-21).
- **Origen del defecto.** El build de release existía y estaba bien configurado
  desde el principio; lo que faltaba era regenerarlo tras la migración a AWS. El
  proceso de build debe quedar documentado y, preferentemente, automatizado en CI
  para que un artefacto de debug no vuelva a ser el único actualizado.

## 7. Referencias

- `docs/AUDITORIA_APK_2026-08-24.md` § ISSUE-01
- `docs/AUDITORIA_APK_PILOTO_2026-08.md` — acción bloqueante #1 (2026-08-03), no resuelta hasta ahora
- `docs/PLAN_REMEDIACION_APK_2026-08-24.md` — Fase 1, tareas T-04 y T-05
