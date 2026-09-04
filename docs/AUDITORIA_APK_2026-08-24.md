# Auditoría técnica del APK de MicoPay

**Fecha:** 2026-08-24
**Alcance:** APK Android de MicoPay, código fuente del frontend y configuración de build.
**Rama auditada:** `feat/map-real` @ `c77ad31`
**Pregunta que responde:** ¿qué hay que arreglar en la app antes de ponerla en manos de más gente?

---

## Cómo leer este documento

Cada hallazgo está escrito en cuatro capas, de lo simple a lo técnico:

1. **Qué pasa** — la explicación en lenguaje llano, sin jerga.
2. **Por qué importa** — qué consecuencia real tiene, y a quién le pega.
3. **Evidencia** — la prueba concreta, para que nadie tenga que creerme.
4. **Cómo se arregla y cuándo se cierra** — la acción y el criterio de aceptación.

Se distingue de forma explícita entre tres cosas:

- **Evidencia confirmada** — se verificó ejecutando una herramienta o leyendo el artefacto. Es un hecho.
- **Riesgo potencial** — se dedujo del código, pero no se observó ocurriendo en un dispositivo.
- **Recomendación general** — buena práctica, no un defecto.

Los 10 hallazgos numerados son todos **evidencia confirmada**. Lo que no pudo comprobarse está al final, en la sección de limitaciones, y no se cuenta como hallazgo.

---

## El artefacto auditado

| Campo | Valor |
|---|---|
| Archivo | `app-debug.apk` |
| Ruta | `micopay/frontend/android/app/build/outputs/apk/debug/app-debug.apk` |
| Package | `com.micopay.app.debug` |
| versionName / versionCode | `1.0.0` / `1` |
| Fecha de compilación | 2026-07-25 23:01 |
| Tamaño | 37 818 927 bytes (36,1 MiB) |
| SHA-256 | `6a71c01b1f1f916015cacfd09ddc76d8de76ff8c2df4eaa91297a5e4e29bad3e` |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| Firma | Esquema v2 únicamente — `CN=Android Debug, O=Android, C=US` |
| Backend horneado | `https://api.micopay.app` |

**Por qué se auditó este y no otro.** Hay tres APK en el workspace. El de debug es el más reciente *y* es el que se está repartiendo, según `docs/AUDITORIA_APK_PILOTO_2026-08.md`. Los otros dos son anteriores a la migración a AWS y quedaron obsoletos:

| Archivo | Fecha | SHA-256 (abreviado) | Backend horneado |
|---|---|---|---|
| `app-debug.apk` | 2026-07-25 | `6a71c01b…9bad3e` | `api.micopay.app` ✅ |
| `app-release.apk` | 2026-07-02 | `931d1156…2dda67` | `micopay-api.onrender.com` (retirado) |
| `dist/micopay-testnet-20260630.apk` | 2026-07-01 | `eb21805d…d3ebe2` | `micopay-api.onrender.com` (retirado) |

**Nota sobre duplicados.** La auditoría del 2026-08-03 retiró explícitamente como falso positivo el hallazgo "el APK apunta a Render". Se verificó y se coincide: esos dos APK son artefactos viejos que no se distribuyen. **No se vuelve a levantar.** El hallazgo del build de debug sí se mantiene, porque sigue abierto y no existe todavía un release posterior a la migración.

---

## Resumen ejecutivo

El diseño de seguridad de MicoPay es sólido y conviene decirlo antes que nada: la llave privada del usuario vive en el Android Keystore, las firmas de retos y transacciones ocurren en el dispositivo y la llave nunca sale de él, el endurecimiento de Android para release está bien configurado, y el keystore de firma no está en git. Nada de eso está en cuestión.

El problema no es el diseño, es lo que efectivamente se reparte. El único APK que apunta a la infraestructura actual es un build de depuración firmado con la llave de Android que viene en el SDK de cualquier desarrollador del mundo, y no existe un release posterior a la migración a AWS. Eso solo ya bloquea cualquier piloto ampliado.

Por debajo aparece un defecto funcional serio que no estaba documentado: la cola offline descarta los cambios del comercio mientras le confirma en pantalla que se guardaron. Más abajo, la aprobación del KYC deja al usuario en la pantalla de inicio en vez de en la funcionalidad que acaba de desbloquear, y el respaldo de la semilla se hace copiándola al portapapeles global sin marcarla como sensible.

La suite de pruebas lleva 30 de 58 tests en rojo, y ese es probablemente el motivo por el que los dos bugs anteriores llegaron al APK sin que nadie los viera. El resto son problemas de higiene con arreglo barato: `versionCode` congelado en 1, dos permisos que nada usa, 12 MB de librerías para procesadores que ningún teléfono tiene, y botones en el chat que no hacen nada al pulsarlos.

Ninguno de estos hallazgos pone fondos reales en riesgo hoy, porque el backend corre en testnet. Pero casi todos hay que cerrarlos antes de subir el número de personas en el piloto.

---

## Tabla de hallazgos

| ID | Título | Severidad | Categoría | Esfuerzo | Prioridad |
|---|---|---|---|---|---|
| ISSUE-01 | Build de debug firmado con la llave pública de Android | Crítica | Seguridad / build | S | P0 |
| ISSUE-02 | La cola offline descarta cambios y reporta éxito | Crítica | Bug / pérdida de datos | M | P0 |
| ISSUE-03 | Clave secreta Stellar al portapapeles sin protección | Alta | Seguridad / secretos | M | P1 |
| ISSUE-04 | KYC aprobado deja al usuario en el inicio, no en CETES | Media | Bug / navegación | S | P2 |
| ISSUE-05 | `versionCode 1` en todos los artefactos | Alta | Build / distribución | S | P1 |
| ISSUE-06 | Flujo `/claim/:id` inalcanzable y apuntando a localhost | Alta | Bug / configuración | M | P1 |
| ISSUE-07 | 30 de 58 tests fallando | Alta | Calidad / CI | M | P1 |
| ISSUE-08 | Permisos innecesarios (push y ubicación precisa) | Media | Permisos / privacidad | S | P2 |
| ISSUE-09 | 48,5 % del APK son librerías x86/x86_64 | Media | Rendimiento / tamaño | S | P2 |
| ISSUE-10 | Botones inertes en chat y accesibilidad ausente | Media | UX / accesibilidad | M | P2 |

---

## ISSUE-01 — Se reparte un build de debug firmado con una llave pública

| | |
|---|---|
| **Severidad** | Crítica |
| **Confianza** | Alta |
| **Categoría** | Seguridad / configuración de build |
| **Componente** | `android/app/build.gradle` (`buildTypes.debug`), `app-debug.apk` |
| **Versión afectada** | 1.0.0 (1) — `com.micopay.app.debug`, 2026-07-25 |
| **Esfuerzo** | S |
| **Etiquetas Drips** | `security`, `android`, `release-blocker`, `build`, `P0` |

### Qué pasa

Una app de Android se puede compilar de dos maneras: en modo **debug**, pensado para que un desarrollador la pruebe en su propia máquina, y en modo **release**, que es la que se le da a la gente. El modo debug apaga a propósito varias protecciones para que el desarrollador pueda inspeccionar la app mientras la construye.

El APK que se está repartiendo es el de debug. Y lo más grave no es que tenga las protecciones apagadas, sino cómo está firmado.

Toda app de Android va firmada con un certificado digital. Ese certificado es lo que le dice al teléfono "esta actualización viene de quien hizo la app original". El APK de debug no está firmado con el certificado de MicoPay: está firmado con el certificado de depuración genérico que el SDK de Android instala automáticamente en la computadora de **cualquier desarrollador del planeta**. Su llave privada es pública y conocida.

Además, el modo debug de este build:

- permite conectar un depurador al proceso desde una computadora con un cable USB,
- permite tráfico HTTP sin cifrar,
- confía en certificados instalados por el usuario, que es exactamente lo que se usa para interceptar tráfico con herramientas tipo Charles o Proxyman,
- no pasa por R8, así que el código va sin ofuscar ni comprimir.

### Por qué importa y a quién afecta

**Afecta a todos los usuarios del piloto, y el ataque no requiere sofisticación.**

Cualquier persona puede compilar un APK malicioso, firmarlo con la llave de debug —que tiene en su propia computadora— y el teléfono lo aceptará como una **actualización legítima** de MicoPay. La app falsa hereda los datos de la real, incluida la llave privada Stellar guardada en el Keystore. No hay ninguna alerta para el usuario: Android ve la misma firma y asume que es el mismo autor.

En segundo lugar, con el teléfono en la mano y un cable, `adb` permite adjuntar un depurador al proceso y leer la llave privada Stellar directamente de la memoria. Eso anula por completo la protección del Android Keystore, que es la pieza central del diseño de seguridad de la app. Un teléfono perdido, prestado o revisado en un control deja de ser un problema de privacidad y pasa a ser una pérdida de fondos.

En tercer lugar, el tráfico entre la app y el backend es interceptable instalando un certificado de CA en el dispositivo. Toda la comunicación de operaciones queda legible y modificable para quien tenga acceso al teléfono unos minutos.

Y hay un efecto secundario molesto: como el build de debug usa el identificador `com.micopay.app.debug` y no `com.micopay.app`, cuando se reparta el APK de release **no se podrá actualizar por encima**. Habrá que desinstalar, y al desinstalar Android borra el Keystore. Todo usuario que no haya respaldado su llave secreta pierde el acceso a su cuenta.

### Evidencia

```
$ apksigner verify --print-certs app-debug.apk
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: 7abbd094b6a04a9c168eef36c6cf6742fa8a8ca950d52160954495c70ff22eb7
```

```
$ aapt2 dump xmltree --file AndroidManifest.xml app-debug.apk
  E: application
    A: debuggable=true
    A: usesCleartextTraffic=true
```

En `network_security_config.xml` el bloque `<debug-overrides>` añade `<certificates src="user" />`. Ese bloque solo aplica a builds `debuggable` — es decir, aplica a este.

```
$ unzip -l app-debug.apk | grep classes
classes.dex, classes2.dex … classes13.dex   (13 archivos, 5,5 MB comprimidos)
```

Trece archivos DEX significa que R8 no corrió: sin ofuscación, sin eliminación de código muerto.

`MainActivity.java` es un `BridgeActivity` vacío, sin `FLAG_SECURE`.

Este hallazgo **ya está documentado** como acción bloqueante #1 en `docs/AUDITORIA_APK_PILOTO_2026-08.md` (2026-08-03). Se vuelve a levantar porque **sigue sin resolverse**: no existe ningún APK de release posterior a la migración a AWS.

### Cómo verificarlo

```bash
apksigner verify --print-certs app-debug.apk     # debe decir CN=Android Debug
adb install app-debug.apk
adb shell run-as com.micopay.app.debug ls        # acceso al sandbox sin root
unzip -l app-debug.apk | grep -c classes         # 13
```

### Cómo se arregla

```bash
cd micopay/frontend
npm run build:testnet
cd android && ./gradlew assembleRelease
```

Y verificar antes de repartir que el artefacto resultante trae `api.micopay.app` horneado:

```bash
unzip -o -q app-release.apk -d /tmp/apk 'assets/public/assets/*.js'
grep -rhoE "https://[a-zA-Z0-9.-]*micopay[a-zA-Z0-9./-]*" /tmp/apk | sort -u
```

Añadir también firma con esquema v3.1, que hoy no está y que es lo que permite rotar la llave de firma si algún día se compromete.

### Criterios de aceptación

- [ ] `apksigner verify --print-certs` reporta `CN=Micopay…` y `Verified using v3 scheme: true`.
- [ ] `aapt dump badging` muestra el package `com.micopay.app`, sin el sufijo `.debug`.
- [ ] El manifiesto empaquetado tiene `debuggable=false` y `usesCleartextTraffic=false`.
- [ ] `grep` sobre los `.js` del APK devuelve únicamente `api.micopay.app`.
- [ ] El README documenta el procedimiento de build y el hash SHA-256 del artefacto oficial.

---

## ISSUE-02 — La cola offline tira los cambios y le dice al usuario que los guardó

| | |
|---|---|
| **Severidad** | Crítica |
| **Confianza** | Alta |
| **Categoría** | Bug funcional / pérdida de datos |
| **Componente** | `src/hooks/useOfflineQueue.ts:46-55`, `src/services/offlineQueueManager.ts`, `src/pages/MerchantSettings.tsx:145-170` |
| **Versión afectada** | 1.0.0 (1) — presente en el APK de debug y en el de release |
| **Esfuerzo** | M |
| **Etiquetas Drips** | `bug`, `data-loss`, `offline`, `merchant`, `P0` |

### Qué pasa

La app tiene un modo offline: si el comercio cambia su configuración sin conexión, el cambio se guarda en el teléfono y se supone que se envía al servidor cuando vuelva la red. La app se lo dice con estas palabras exactas:

> ⏳ Cambios guardados localmente. Se sincronizarán cuando la conexión se restaure.

**Esa sincronización no existe.** La función que debería enviar los cambios pendientes al backend los recorre uno por uno y los marca como "ya sincronizados" sin hacer ninguna llamada de red. Los borra.

Y hay una segunda capa de rotura encima: aunque la función funcionara, nadie la llamaría. El módulo que debería detectar el regreso de la conexión y disparar la sincronización (`offlineQueueManager.ts`, 263 líneas ya escritas) **nunca se importa desde ningún archivo**. Y el único componente que llama manualmente a reintentar (`OfflineQueueStatus.tsx`) **nunca se renderiza en la app**.

Es decir: la funcionalidad está a medio cablear. La parte que guarda funciona. La parte que envía no está conectada, y la que existe está vacía por dentro.

### Por qué importa y a quién afecta

**Afecta a los comercios, que son el lado del mercado más difícil de reclutar y retener.**

Lo que se pierde no es cosmético. Por `/merchant-settings` se configura el **límite diario de operación** y la **disponibilidad** del comercio. Un comercio que cree haber bajado su límite y no lo hizo sigue recibiendo solicitudes por montos que ya no quiere aceptar. Un comercio que cree haberse marcado como no disponible sigue apareciendo en el mapa y recibiendo gente que va físicamente a buscarlo.

Lo que convierte esto en un defecto crítico y no en un bug normal es la **confirmación falsa**. Si la app dijera "no hay conexión, intenta después", el usuario sabría que tiene que volver. Al decirle que se guardó, cierra la pantalla tranquilo y nunca revisa. El fallo es invisible hasta que alguien lo sufre en una operación real, y cuando lo sufre no hay forma de que relacione el problema con lo que hizo días antes.

Es el peor tipo de fallo que puede tener un producto financiero: silencioso, con confirmación positiva, y sobre un parámetro que gobierna cuánto dinero se mueve.

### Evidencia

La función de sincronización, en `src/hooks/useOfflineQueue.ts:46`:

```ts
const retryAsync = useCallback(async (_token: string | null) => {
  setIsSyncing(true);
  try {
    const pending = await getPendingMutations();
    await Promise.all(pending.map((item) => markAsSynced(item.id).catch(() => {})));
    refreshPending();
  } finally {
    setIsSyncing(false);
  }
}, [refreshPending]);
```

No hay ni una llamada HTTP. El parámetro `token` está prefijado con guion bajo (`_token`), la convención que usa el propio proyecto para marcar argumentos sin usar — señal de que quedó como esqueleto.

El mensaje que ve el usuario, en `src/pages/MerchantSettings.tsx:159`:

```ts
if (result.queued) {
  setMessage('⏳ Cambios guardados localmente. Se sincronizarán cuando la conexión se restaure.');
  setMessageType('warning');
}
```

Y la verificación de que nadie dispara la sincronización:

```
$ grep -rn "retryAsync\|offlineQueueManager" src/
  → único llamador de retryAsync: OfflineQueueStatus.tsx:74
  → OfflineQueueStatus       : 0 referencias externas (nunca se renderiza)
  → offlineQueueManager      : 0 referencias externas (nunca se importa)
```

La base de datos local sí existe y sí se llena: la cadena `micopay_offline` (el nombre de la base IndexedDB) está presente en el bundle empaquetado dentro del APK.

### Cómo reproducirlo

1. Entrar como comercio y abrir `/merchant-settings`.
2. Activar modo avión.
3. Modificar el límite diario y guardar → aparece el mensaje "Cambios guardados localmente…".
4. Desactivar modo avión, esperar, recargar la pantalla.
5. La configuración sigue con el valor anterior. Ninguna petición salió al backend.

### Cómo se arregla

Implementar el envío real dentro de `retryAsync`, reutilizando `offlineQueueManager.ts`, que ya tiene escrita la lógica de reintentos y resolución de conflictos. Montar `OfflineQueueStatus` en el layout para que el usuario vea el estado de la cola, y suscribir el manager al evento `online` del navegador para que sincronice solo.

Si no se va a implementar en este ciclo, la alternativa honesta es **retirar el camino offline** y mostrar un error claro: "sin conexión, no se pudo guardar". Es mejor un producto que hace menos que uno que miente.

### Criterios de aceptación

- [ ] Test de integración: mutación encolada sin red → al restaurar la red se emite el `PUT /merchants/me/config` y el backend refleja el cambio.
- [ ] Una mutación que el servidor rechaza queda marcada con error y visible para el usuario, no como sincronizada.
- [ ] `markAsSynced` solo se invoca después de una respuesta 2xx.
- [ ] El indicador de cola pendiente es visible en la UI mientras haya mutaciones sin enviar.

---

## ISSUE-03 — La llave secreta se copia al portapapeles sin ninguna protección

| | |
|---|---|
| **Severidad** | Alta |
| **Confianza** | Alta |
| **Categoría** | Seguridad / manejo de secretos |
| **Componente** | `src/pages/Profile.tsx:153-161`, `src/pages/Register.tsx:72-76` |
| **Versión afectada** | 1.0.0 (1) — ambos APK |
| **Esfuerzo** | M |
| **Etiquetas Drips** | `security`, `keys`, `android`, `ux`, `P1` |

### Qué pasa

La llave secreta Stellar es una cadena de 56 caracteres que empieza con `S`. Quien la tenga tiene control total e irreversible de la cuenta y de sus fondos. No hay soporte al cliente que pueda revertir nada.

MicoPay ofrece dos formas de respaldarla —al registrarse y desde el perfil— y las dos hacen lo mismo: la copian al **portapapeles del sistema**, el mismo que se usa para copiar y pegar cualquier texto entre apps.

El portapapeles de Android permite marcar un contenido como sensible, con una bandera llamada `EXTRA_IS_SENSITIVE`. Cuando está marcada, el sistema no muestra la previsualización y la trata con cuidado. Esa bandera **no se puede poner desde un WebView**, que es donde vive toda la interfaz de MicoPay. La API web `navigator.clipboard.writeText` no la expone.

### Por qué importa y a quién afecta

**Afecta a todo usuario que respalde su llave, que es exactamente el usuario que estaba haciendo lo correcto.**

Tres consecuencias concretas:

1. **En Android 13 y superiores, el sistema muestra una previsualización de lo que se acaba de copiar.** Aparece un recuadro flotante en la parte inferior de la pantalla con el contenido en claro. La llave secreta queda visible para cualquiera que esté mirando el teléfono, y para cualquier grabación de pantalla en curso.

2. **La llave se queda en el portapapeles indefinidamente**, hasta que el usuario copie otra cosa. No hay limpieza automática. Si en ese lapso pega en la app equivocada, o si otra app con permisos de accesibilidad lee el buffer, la llave se fue.

3. **La app delega la mitigación al usuario.** El mensaje literal dice "Limpia tu portapapeles después de guardarla". Eso confirma que no hay limpieza programática, y pide algo que la mayoría de la gente no sabe hacer.

Se agrava con ISSUE-01: en un build `debuggable`, `adb shell` permite además leer el portapapeles y la memoria del proceso desde una computadora conectada.

Un punto a favor que conviene registrar: la llave **no se renderiza en pantalla** en la pantalla de registro, solo hay un botón "Copiar Llave Secreta". Eso evita el riesgo de captura de pantalla del texto. El vector es el portapapeles, no la pantalla.

### Evidencia

`src/pages/Profile.tsx:153`:

```ts
const handleExport = async () => {
  const confirmed = window.confirm(
      'Tu clave secreta da control total de tu cuenta. Nunca la compartas. Cópiala en un lugar seguro sin conexión.'
  );
  if (!confirmed) return;
  const secret = await exportSecretKey();
  await navigator.clipboard.writeText(secret);
  alert('Clave secreta copiada. Limpia tu portapapeles después de guardarla.');
};
```

`src/pages/Register.tsx:72`:

```ts
const copySecretKey = () => {
  navigator.clipboard.writeText(secretKey);
  setCopiedSec(true);
  setTimeout(() => setCopiedSec(false), 2000);
};
```

`src/lib/keystore.ts:62` expone `exportSecretKey()`, que devuelve la llave en claro desde el almacenamiento seguro.

```
$ grep -rn "FLAG_SECURE" android/app/src/main/java/
  → 0 resultados
```

### Cómo verificarlo

1. Instalar el APK en un dispositivo con Android 13 o superior, registrarse y pulsar "Copiar Llave Secreta".
2. Observar la previsualización del portapapeles mostrando la llave en claro.
3. Abrir cualquier otra app con un campo de texto y pegar → la llave sigue ahí minutos después.

### Cómo se arregla

Lo correcto es cambiar el flujo de respaldo, no parchear la copia. Mostrar la frase en pantalla con `FLAG_SECURE` activo en esa vista (lo que hace que las capturas salgan en negro) y pedir verificación de transcripción: que el usuario reescriba tres caracteres o palabras antes de continuar. Así se confirma que realmente la anotó.

Si se conserva el botón de copiar, hay que implementar un pequeño plugin nativo que use `ClipboardManager` con `EXTRA_IS_SENSITIVE` y limpie el portapapeles a los 60 segundos.

Sustituir también `window.confirm` y `alert` por diálogos de la propia app: los diálogos nativos del WebView se ven como un error del navegador y restan credibilidad justo en la pantalla donde más falta hace.

### Criterios de aceptación

- [ ] En Android 13+, la previsualización del portapapeles no muestra la llave.
- [ ] El portapapeles se limpia automáticamente tras el tiempo definido, verificable pegando en otra app.
- [ ] Intentar capturar pantalla en la vista de respaldo produce un frame negro.
- [ ] El flujo obliga a confirmar el respaldo antes de permitir continuar.

---

## ISSUE-04 — El KYC aprobado deja al usuario en la pantalla de inicio, no en CETES

> **Corrección (2026-08-24).** La versión original de este hallazgo afirmaba que la app usaba enrutado por path y que el 401 dejaba al usuario fuera del login. **Era incorrecto.** La app usa `HashRouter` (`src/App.tsx:1070`); se dedujo mal el tipo de router a partir del bundle minificado, donde el nombre está ofuscado. Al verificarlo en el código fuente, el caso del 401 resultó no ser un defecto y el del KYC tiene un síntoma distinto al descrito. La severidad baja de Alta a Media.

- **Categoría:** Bug funcional / navegación
- **Severidad:** Media
- **Confianza:** Alta
- **Componente:** `src/App.tsx:561`
- **Versión afectada:** 1.0.0 (1) — ambos APK
- **Descripción:** Al aprobarse la verificación de identidad, la app ejecuta:

  ```ts
  window.location.hash = '/#/cetes';
  ```

  Con `HashRouter`, la ruta vive en el fragmento de la URL. Asignar `'/#/cetes'` al fragmento produce `https://localhost/#/#/cetes`, y el router interpreta la ruta como `/#/cetes`, que no coincide con ninguna de las 29 rutas registradas. Cae en el catch-all (`App.tsx:1103`), que redirige a `/`.

  El usuario acaba en la pantalla de inicio en vez de en CETES, que es la funcionalidad que acaba de desbloquear.

  La función inmediatamente siguiente en el mismo archivo lo hace bien, con `navigate('/cetes')`. El patrón correcto ya está en el código, al lado.
- **Evidencia:**
  ```ts
  // src/App.tsx:561
  function Dj(){ return h.jsx(Nk,{ …, onApproved:()=>{ window.location.hash="/#/cetes" } }) }
  function Lj(){ const g=Sa(); return Ot.useEffect(()=>{ g("/cetes") }, …) }   // ← la de al lado, correcta
  ```
  ```tsx
  // src/App.tsx:1070 — el router es de hash, no de path
  <HashRouter>
  ```
  ```tsx
  // src/App.tsx:1103 — a donde acaba el usuario
  <Route path="*" element={<Navigate to="/" replace />} />
  ```
  Ninguna de las rutas registradas es `/#/cetes`: `/`, `/blend`, `/cashout`, `/cetes`, `/chat`, `/kyc`, `/kyc-approved`, `/login`, `/map`, … (29 en total).
- **Pasos para reproducir:** completar el flujo de verificación de identidad hasta la aprobación. La URL pasa a `…#/#/cetes` y la app muestra la pantalla de inicio.
- **Impacto:** Ocurre en el punto de máxima conversión. La persona ya subió documentos y esperó la aprobación; al concederse, la app la deja en el inicio sin ninguna señal de que el KYC pasó. Es razonable que concluya que falló y no vuelva a intentarlo. No pierde dinero ni datos, pero rompe el embudo justo al final.
- **Riesgo potencial, no confirmado:** el interceptor de 401 en `src/services/api.ts:769` hace `window.location.href = '/#/login'`. En la configuración actual **esto funciona**: la URL solo cambia en el fragmento, así que el navegador no recarga el documento y `HashRouter` navega al login correctamente. Es un patrón frágil —bastaría con que el path dejara de ser `/` para que provoque una recarga completa— pero hoy no es un defecto observable. Se recomienda cambiarlo por higiene, no por urgencia.
- **Recomendación de solución:** sustituir la asignación al fragmento por el `useNavigate()` que ya está disponible en la función contigua. De paso, cambiar el interceptor de 401 para que use el router en lugar de `window.location`, exponiendo la instancia del router desde un módulo, ya que el interceptor vive fuera del árbol de React.
- **Criterios de aceptación:**
  - La aprobación de KYC lleva a `/cetes`.
  - `grep -rn "window.location.href\|window.location.hash" src/` → 0 resultados.
  - Existe un test que verifica la ruta resultante tras aprobar el KYC.
- **Esfuerzo estimado:** S
- **Etiquetas sugeridas para Drips:** `bug`, `routing`, `kyc`, `frontend`

---

## ISSUE-05 — Todas las versiones de la app se llaman igual

| | |
|---|---|
| **Severidad** | Alta |
| **Confianza** | Alta |
| **Categoría** | Configuración de build / distribución |
| **Componente** | `android/app/build.gradle:11-12` |
| **Versión afectada** | Los tres APK del workspace |
| **Esfuerzo** | S |
| **Etiquetas Drips** | `build`, `release`, `ci`, `P1` |

### Qué pasa

Android identifica las versiones de una app con un número entero llamado `versionCode`. Es lo único que el sistema mira para decidir si un APK es más nuevo que el instalado. En MicoPay ese número está escrito a mano en el `build.gradle` y **nunca ha cambiado: siempre es 1**.

El resultado es que tres artefactos distintos, compilados con meses de diferencia y con contenido demostrablemente diferente (hashes distintos), se presentan al sistema operativo como exactamente la misma versión.

### Por qué importa y a quién afecta

**Afecta a la operación del piloto completo, y a la capacidad del equipo de dar soporte.**

Tres consecuencias:

1. **No hay ruta de actualización.** Instalar una build nueva sobre otra con el mismo `versionCode` es un caso indefinido para el instalador de Android: puede fallar, puede quedarse con la vieja, puede quedar en un estado inconsistente. Cada actualización del piloto se convierte en "desinstala y vuelve a instalar", y desinstalar borra el Keystore con la llave privada del usuario dentro. Cada actualización es un riesgo de pérdida de cuenta.

2. **Google Play rechaza directamente** una subida con un `versionCode` que no sea mayor al anterior. En el momento en que se quiera publicar, esto es un bloqueo duro.

3. **Es imposible dar soporte.** Cuando alguien reporta un fallo, no hay forma de saber qué build tiene instalada. Un bug ya corregido y uno nuevo se ven idénticos desde fuera. Ninguna herramienta de crash, analítica o soporte puede correlacionar un reporte con un artefacto.

Como detalle relacionado: `VITE_APP_VERSION` no está definida en ningún archivo `.env`, así que la versión que la app reportaría en cualquier telemetría sería literalmente la cadena `'dev'`.

### Evidencia

```
app-debug.apk                     (2026-07-25)  versionCode=1  versionName=1.0.0  sha256 6a71c01b…
app-release.apk                   (2026-07-02)  versionCode=1  versionName=1.0.0  sha256 931d1156…
dist/micopay-testnet-20260630.apk (2026-07-01)  versionCode=1  versionName=1.0.0  sha256 eb21805d…
```

```groovy
// android/app/build.gradle
versionCode 1
versionName "1.0.0"
```

```
$ grep -rn "VITE_APP_VERSION" .env*
  → 0 resultados
```

### Cómo verificarlo

```bash
aapt dump badging <apk> | head -1        # sobre los tres artefactos
adb install -r app-release.apk           # tras instalar el del 1 de julio
```

### Cómo se arregla

Derivar el `versionCode` del CI: el número de commits (`git rev-list --count HEAD`) o el número de run de GitHub Actions sirven y crecen solos. Derivar el `versionName` del `package.json`, que ya tiene `"version": "1.0.0"`. Inyectar `VITE_APP_VERSION` en el build de Vite con el mismo valor, para que quede horneado en el bundle y disponible para telemetría y soporte.

Publicar en la release de GitHub el SHA-256 de cada APK, para que siempre se pueda confirmar qué artefacto tiene alguien.

### Criterios de aceptación

- [ ] Dos builds consecutivas producen `versionCode` distintos y crecientes.
- [ ] `adb install -r` sobre la build anterior actualiza sin desinstalar.
- [ ] La pantalla de Perfil muestra `versionName (versionCode)` y coincide con el artefacto instalado.
- [ ] El hash del APK oficial está publicado junto a la release.

---

## ISSUE-06 — Los enlaces de claim no pueden funcionar desde la app

| | |
|---|---|
| **Severidad** | Alta |
| **Confianza** | Alta |
| **Categoría** | Bug funcional / configuración |
| **Componente** | `src/main.tsx:33-40`, `src/pages/ClaimQR.tsx:6`, `AndroidManifest.xml` (intent-filter de App Links) |
| **Versión afectada** | 1.0.0 (1) — ambos APK |
| **Esfuerzo** | M |
| **Etiquetas Drips** | `bug`, `deep-links`, `android`, `config`, `P1` |

### Qué pasa

MicoPay declara en su manifiesto que quiere abrirse cuando alguien toque un enlace del tipo `https://app.micopay.xyz/claim/<id>`. La idea, según el comentario del propio código, es que un agente de IA pueda mandarle a una persona un enlace y que la app le muestre directamente el QR de cobro.

La auditoría anterior ya detectó que el dominio `app.micopay.xyz` no existe (NXDOMAIN), y por eso la verificación de Android falla. Eso es correcto, pero es solo la primera de tres barreras.

**Aunque el dominio existiera y estuviera todo bien publicado, la pantalla seguiría sin abrirse.** Por tres motivos independientes que se acumulan:

1. **La app decide si mostrar el QR leyendo la dirección del WebView, una sola vez, al arrancar.** Bajo Capacitor el WebView siempre carga `https://localhost/`, así que esa dirección es siempre `/`. La condición nunca se cumple, pase lo que pase con el enlace.

2. **Nadie escucha el enlace entrante.** Capacitor entrega la URL del enlace mediante un evento llamado `appUrlOpen`. La app no registra ese escuchador en ninguna parte. Los únicos que registra son el de cambio de estado y el del botón atrás.

3. **La pantalla de claim apunta a un backend que no existe.** La variable que define su servidor solo está configurada en el `.env` de desarrollo local, así que el valor que quedó horneado dentro del APK es `http://localhost:3000`. Además de apuntar al propio teléfono, es HTTP sin cifrar, que el APK de release bloquea por configuración.

### Por qué importa y a quién afecta

**Afecta a una funcionalidad completa que el equipo cree operativa y no lo está.**

El escenario que esto habilita —mandar un enlace por WhatsApp o desde un agente y que abra la app en el QR correcto— es, por su descripción en el código, una pieza de la estrategia de distribución. Hoy no funciona en absoluto: el usuario que toca el enlace, en el mejor de los casos, abre la app en la pantalla inicial sin ninguna relación con lo que pidió.

Hay además un costo silencioso: `autoVerify="true"` hace que Android intente verificar el dominio en **cada instalación** de la app. Como el dominio no resuelve, esa verificación falla siempre, y una vez marcada como fallida es difícil de recuperar sin reinstalar.

Lo importante de este hallazgo es que **arreglar solo el dominio no soluciona nada**. Si se publica `assetlinks.json` y se da por cerrado, el enlace seguirá sin abrir la pantalla. Hay que tocar las tres cosas.

### Evidencia

**Barrera 1** — `src/main.tsx:33`:

```ts
const claimMatch = window.location.pathname.match(/^\/claim\/([a-zA-Z0-9_-]+)$/)
```

Con `androidScheme: 'https'` en `capacitor.config.ts`, el WebView carga `https://localhost/`. `pathname` es siempre `/`.

**Barrera 2**:

```
$ grep -o 'appUrlOpen' index-BiZA0DKT.js
  → 0 resultados

$ grep -oE 'addListener\("[a-zA-Z]+"' index-BiZA0DKT.js | sort | uniq -c
  2 addListener("appStateChange"
  1 addListener("backButton"
```

**Barrera 3** — `src/pages/ClaimQR.tsx:6`:

```ts
const PROTOCOL_API = (import.meta as any).env?.VITE_PROTOCOL_API_URL ?? 'http://localhost:3000';
```

```
$ grep -rn "VITE_PROTOCOL_API_URL" .env*
.env:2          VITE_PROTOCOL_API_URL=http://localhost:3000
.env.example:8  VITE_PROTOCOL_API_URL=http://localhost:3000
```

No está en `.env.testnet`, ni en `.env.mainnet`, ni en `.env.production`. El literal `http://localhost:3000` está confirmado dentro de ambos APK.

Y `path:"/claim…"` no aparece entre las rutas registradas del router.

### Cómo verificarlo

```bash
adb shell am start -a android.intent.action.VIEW -d "https://app.micopay.xyz/claim/abc123"
# la app abre en la pantalla inicial, nunca en el QR

grep -o 'localhost:3000' /tmp/apk/assets/public/assets/index-*.js
```

### Cómo se arregla

Cuatro cosas, todas necesarias:

1. Decidir el dominio definitivo bajo `micopay.app` y publicar `assetlinks.json` con la huella SHA-256 del certificado de **release** (no el de debug).
2. Registrar `App.addListener('appUrlOpen', …)` en `main.tsx` y enrutar el path recibido con el router, en vez de leer `window.location.pathname`.
3. Añadir `/claim/:requestId` como ruta real del router.
4. Definir `VITE_PROTOCOL_API_URL` en todos los `.env.*` de distribución, o eliminar el fallback a localhost para que un build mal configurado falle de forma ruidosa en lugar de silenciosa.

### Criterios de aceptación

- [ ] `adb shell am start -d "https://<dominio>/claim/<id>"` abre la app directamente en la pantalla de QR.
- [ ] `adb shell pm get-app-links com.micopay.app` reporta el dominio como `verified`.
- [ ] Ningún `localhost` en los `.js` del APK de release.
- [ ] Con la app en segundo plano, el enlace la trae al frente en la pantalla correcta (`launchMode="singleTask"` ya está bien puesto).

---

## ISSUE-07 — La mitad de las pruebas están rotas

| | |
|---|---|
| **Severidad** | Alta |
| **Confianza** | Alta |
| **Categoría** | Calidad / CI |
| **Componente** | `src/__tests__/Home.test.tsx`, `src/__tests__/TradeDetail.test.tsx` |
| **Versión afectada** | Rama `feat/map-real` @ `c77ad31` |
| **Esfuerzo** | M |
| **Etiquetas Drips** | `tests`, `ci`, `tech-debt`, `P1` |

### Qué pasa

Ejecutar la suite de pruebas del frontend deja 30 de 58 tests en rojo, en 2 de 5 archivos.

Es importante ser preciso aquí: **estos fallos no son bugs de producción**. Son tests que quedaron desactualizados respecto al código. En un caso, el test simula el hook de balance devolviendo un objeto incompleto que el hook real nunca devolvería. En el otro, los tests buscan textos en español que la migración a i18next ya no renderiza de forma literal.

Pero el efecto es igual de dañino: la red de seguridad que debería haber atrapado ISSUE-02 e ISSUE-04 está apagada.

### Por qué importa y a quién afecta

**Afecta al equipo, y de forma acumulativa.**

Una suite con 30 fallos permanentes deja de ser una señal. Cuando todo está rojo siempre, nadie mira la salida, y un fallo nuevo y genuino se pierde en el ruido. Es exactamente el terreno donde nacen bugs como el de la cola offline: nadie lo escribió mal a propósito, simplemente no había nada que avisara.

También impide lo más valioso: poner un gate de tests en CI. Mientras la suite no esté verde, no se puede exigir que pase antes de mergear, y sin ese gate cada PR es una apuesta.

Nótese que `npx tsc --noEmit` **sí pasa limpio** (exit 0). El tipado está sano; lo que no cubre TypeScript es precisamente el tipo de defecto que tienen ISSUE-02 e ISSUE-04, que son errores de lógica y de flujo, no de tipos.

### Evidencia

```
$ npx vitest run

 ❯ src/__tests__/Home.test.tsx        (10 tests | 10 failed)
 ❯ src/__tests__/TradeDetail.test.tsx (21 tests | 20 failed)

 Test Files  2 failed | 3 passed (5)
      Tests  30 failed | 28 passed (58)
   Duration  82.27s
```

**Causa en `Home.test.tsx`:**

```
TypeError: Cannot read properties of undefined (reading 'reduce')
 ❯ Home src/pages/Home.tsx:127:27
```

El mock `vi.mock('../hooks/useWalletBalance')` no devuelve el campo `tokens`. El hook real sí lo garantiza — lo inicializa como `[]` en `useWalletBalance.ts:36`. **Es un defecto del test, no un crash de producción.**

**Causa en `TradeDetail.test.tsx`:**

```
TestingLibraryElementError: Unable to find an element with the text: Pendiente / Bloqueado / Revelando / Revelado / Completado / Cancelado / Expirado
```

Los tests buscan literales que i18next ya no renderiza directamente.

```
$ npx tsc --noEmit
  → exit 0
```

### Cómo se arregla

En `Home.test.tsx`, crear un helper `makeWalletBalance(overrides)` que devuelva el objeto completo del hook, y usarlo en todos los mocks. Así, si el hook gana un campo nuevo, se añade en un solo sitio.

En `TradeDetail.test.tsx`, consultar por `data-testid` en vez de por texto literal, o inicializar i18next en el archivo de setup de vitest para que los textos se resuelvan.

Una vez en verde, añadir `npm test` y `tsc --noEmit` como gate obligatorio del PR, junto al build de Docker que ya existe en CI.

### Criterios de aceptación

- [ ] `npx vitest run` → 0 fallos.
- [ ] El workflow de CI ejecuta `tsc --noEmit` y `vitest run` y bloquea el merge si fallan.
- [ ] Se añade al menos un test de regresión para el flujo de la cola offline (ISSUE-02).
- [ ] Se añade un test que verifique la ruta resultante tras un 401 (ISSUE-04).

---

## ISSUE-08 — La app pide dos permisos que no usa

| | |
|---|---|
| **Severidad** | Media |
| **Confianza** | Alta |
| **Categoría** | Permisos / privacidad |
| **Componente** | `android/app/src/main/AndroidManifest.xml:16` y `:18` |
| **Versión afectada** | 1.0.0 (1) — ambos APK |
| **Esfuerzo** | S |
| **Etiquetas Drips** | `security`, `privacy`, `permissions`, `android`, `P2` |

### Qué pasa

Dos de los permisos declarados en el manifiesto no corresponden a ninguna funcionalidad que la app pueda ejecutar.

**`POST_NOTIFICATIONS`** — el permiso para enviar notificaciones push. La app no tiene ningún código de notificaciones push. Ni una sola clase de Firebase Messaging está dentro del APK. Tampoco está el plugin de Capacitor correspondiente, ni el archivo `google-services.json` que Firebase necesita. Lo único que hay es una configuración huérfana en el manifiesto apuntando a un canal de notificaciones que nadie crea.

**`ACCESS_FINE_LOCATION`** — el permiso de ubicación **precisa**, con exactitud de metros. Android tiene dos niveles: precisa y aproximada (`COARSE`, exactitud de uno a tres kilómetros). Todos los puntos del código que piden la ubicación lo hacen pidiendo explícitamente **precisión baja**. Para mostrar un mapa de agentes cercanos, la aproximada es más que suficiente.

*Nota:* la auditoría del 2026-08-03 dio ambos permisos por justificados. El análisis del código compilado y de los puntos de llamada muestra que no lo están.

### Por qué importa y a quién afecta

**Afecta a la confianza del usuario y a la publicación en Play Store.**

Cuando una app de dinero pide ubicación precisa, la persona que instala se pregunta por qué. Y en este caso no hay respuesta: no la usa. En una categoría donde la desconfianza es el principal obstáculo de adopción, pedir de más es un costo real y evitable.

Hay un efecto mecánico además: en Android 12 y superiores, pedir `FINE_LOCATION` muestra un diálogo con dos opciones (precisa / aproximada) donde el usuario puede degradar el permiso. Ese diálogo tiene peor tasa de aceptación que el simple de ubicación aproximada. Se está pagando fricción por algo que no se usa.

Y en Play Console, los permisos sensibles requieren justificación documentada. Ubicación precisa y notificaciones sin funcionalidad que las respalde son un motivo frecuente de rechazo o de requerimiento, con las semanas de retraso que eso implica.

### Evidencia

**`POST_NOTIFICATIONS`** — escaneo de todas las cadenas ASCII de `classes.dex`:

```
"messaging"        → 0 coincidencias
"Messaging"        → 0 coincidencias
"PushNotification" → 0 coincidencias
```

`capacitor.plugins.json` lista 6 plugins y ninguno es de push: secure-storage, barcode-scanning, app, browser, geolocation, status-bar.

No existe `android/app/google-services.json`. El `build.gradle` aplica el plugin de Google Services solo si encuentra ese archivo, y no está.

La meta-data huérfana en el manifiesto:

```xml
<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id"
           android:value="trade_alerts" />
```

**`ACCESS_FINE_LOCATION`** — todos los puntos de llamada, extraídos del bundle:

```js
const L = await Ng.getCurrentPosition({ enableHighAccuracy: !1, timeout: 15e3 });
```

```js
navigator.geolocation.getCurrentPosition(X, Y, { timeout: 8e3 })   // sin enableHighAccuracy
```

No hay ni un `enableHighAccuracy: true` en código de la aplicación.

### Cómo verificarlo

```bash
aapt dump badging app-debug.apk | grep uses-permission
adb shell dumpsys package com.micopay.app.debug | grep -A20 "requested permissions"
# POST_NOTIFICATIONS nunca pasa a granted=true porque nada lo solicita
```

Revocar `ACCESS_FINE_LOCATION` dejando solo `COARSE` y comprobar que el mapa sigue funcionando.

### Cómo se arregla

Quitar `POST_NOTIFICATIONS` y la meta-data de FCM del manifiesto. Si algún día se implementa push, ambos entrarán automáticamente con el plugin.

Quitar `ACCESS_FINE_LOCATION` y dejar únicamente `ACCESS_COARSE_LOCATION`.

Aprovechar para revisar que `PermissionGate` explique al usuario para qué se pide la ubicación **antes** de que salte el diálogo del sistema. Eso sube la tasa de aceptación bastante más que cualquier otra cosa.

### Criterios de aceptación

- [ ] `aapt dump badging` lista exactamente: `INTERNET`, `CAMERA`, `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`.
- [ ] El mapa de agentes localiza correctamente con solo permiso aproximado, en dispositivo real.
- [ ] Ninguna referencia a `firebase.messaging` en el manifiesto fusionado.

---

## ISSUE-09 — Casi la mitad del APK es peso muerto

| | |
|---|---|
| **Severidad** | Media |
| **Confianza** | Alta |
| **Categoría** | Rendimiento / tamaño |
| **Componente** | `android/app/build.gradle` (faltan `abiFilters` y `resConfigs`) |
| **Versión afectada** | Los tres APK |
| **Esfuerzo** | S |
| **Etiquetas Drips** | `performance`, `apk-size`, `build`, `android`, `P2` |

### Qué pasa

Los teléfonos Android usan procesadores ARM. Los emuladores y unos pocos Chromebooks usan procesadores Intel/AMD, que en Android se llaman x86 y x86_64.

El APK empaqueta las librerías nativas para **las cuatro arquitecturas**. Las versiones x86 y x86_64 de `libbarhopper_v3.so` —el motor nativo de ML Kit que lee los códigos QR— suman 12,1 MB y no las va a usar ningún teléfono real.

Como el APK está configurado con `extractNativeLibs="false"` (que es lo correcto por otras razones), esas librerías van sin comprimir y cuentan íntegras en el tamaño de descarga.

### Por qué importa y a quién afecta

**Afecta a la tasa de instalación, y de forma desproporcionada al público objetivo de MicoPay.**

El APK de release pasa de 25,2 MB a unos 13 MB solo quitando x86. Eso es la mitad de descarga y la mitad de espacio ocupado.

En México, buena parte de la gente del piloto va a descargar la app con datos móviles, no con WiFi, y en teléfonos de gama de entrada donde el almacenamiento libre es un recurso escaso. Una app de 36 MB (el debug actual) es una decisión consciente para esa persona; una de 13 MB es un clic. La diferencia entre ambas es abandono de instalación medible, y es completamente evitable.

Hay un problema secundario del mismo tipo: el archivo de recursos incluye la etiqueta de la aplicación traducida a unos 80 idiomas (afrikáans, amárico, árabe, asamés, azerí…), heredada de las librerías de AndroidX, cuando la app solo tiene traducciones a español e inglés.

### Evidencia

```
release  25 031 671 B totales — x86 + x86_64: 12 131 144 B  (48,5 %)
debug    31 019 740 B totales — x86 + x86_64: 12 131 144 B  (39,1 %)

lib/x86/libbarhopper_v3.so          6 122 368 B
lib/x86_64/libbarhopper_v3.so       5 909 280 B
lib/arm64-v8a/libbarhopper_v3.so    4 946 720 B
lib/armeabi-v7a/libbarhopper_v3.so  3 244 440 B
```

`resources.arsc` pesa 390 KB e incluye `application-label-af`, `-am`, `-ar`, `-as`, `-az`, … No hay `resConfigs` que lo limite.

Existe un `app-release.aab` en el árbol de build (2026-05-18), pero los artefactos que se reparten son APK universales.

### Cómo verificarlo

```bash
unzip -l app-release.apk | awk '/lib\/x86/ {s+=$1} END {print s}'
```

### Cómo se arregla

Para los APK que se reparten fuera de Play, añadir en `defaultConfig`:

```groovy
ndk { abiFilters "armeabi-v7a", "arm64-v8a" }
resConfigs "es", "en"
```

Si se publica en Play Store, lo correcto es cambiar a `bundleRelease` (AAB) y dejar que Play genere los splits por arquitectura, densidad de pantalla e idioma. Cada usuario descarga solo lo suyo.

Conviene mantener aparte, y claramente etiquetado, un APK universal para emuladores y pruebas internas.

### Criterios de aceptación

- [ ] `unzip -l` del APK repartido no lista ningún `lib/x86*`.
- [ ] El APK de release pesa menos de 15 MB.
- [ ] El escáner QR funciona en un dispositivo arm64 real y en uno armeabi-v7a real.

---

## ISSUE-10 — Botones que no hacen nada, y una app que no se puede usar a ciegas

| | |
|---|---|
| **Severidad** | Media |
| **Confianza** | Alta |
| **Categoría** | UX / accesibilidad |
| **Componente** | `src/pages/ChatRoom.tsx:117,266,290,303`, `src/pages/DepositChat.tsx:104,207,226`, y transversal en `src/pages` y `src/components` |
| **Versión afectada** | 1.0.0 (1) — ambos APK |
| **Esfuerzo** | M |
| **Etiquetas Drips** | `ux`, `accessibility`, `frontend`, `chat`, `P2` |

### Qué pasa

Son dos problemas sobre los mismos elementos, y por eso van juntos.

**Botones inertes.** Las dos pantallas de chat muestran controles que no tienen ninguna acción asociada: el menú de tres puntos, el botón de adjuntar (`+`) y el de emoji. Están dibujados, responden visualmente al toque, y no hacen absolutamente nada. No es que fallen: es que nunca se les conectó un manejador.

**Sin etiquetas accesibles.** De 178 botones en el código, solo 32 tienen `aria-label`. Al mismo tiempo hay 242 iconos de Material Symbols. La mayoría de los botones son solo un icono, sin texto. Para un lector de pantalla como TalkBack, un botón así no tiene nombre: se anuncia simplemente como "botón".

### Por qué importa y a quién afecta

**Los botones inertes afectan a comprador y comercio en el peor momento posible.**

El chat es el canal por el que dos desconocidos coordinan un intercambio de dinero en efectivo. Es el momento de máxima tensión de todo el producto. Ahí, la acción más natural del mundo es pulsar el `+` para mandar una foto del comprobante o del lugar de encuentro. La app lo ignora en silencio: sin mensaje, sin feedback, sin explicación.

El usuario no concluye "esta función no está disponible todavía". Concluye "esta app está rota", justo cuando tiene dinero de por medio. Eso genera tickets de soporte, abandono de la operación y desconfianza que se transfiere al resto del producto.

**La falta de etiquetas afecta a las personas que usan lector de pantalla**, para quienes la app es sencillamente inoperable: no hay forma de saber qué hace cada botón. Para un servicio financiero esto no es solo un problema de producto, es un riesgo de cumplimiento — la accesibilidad de servicios financieros está regulada en un número creciente de jurisdicciones.

Hay un tercer detalle menor del mismo barrido: la pantalla de explorar renderiza el avatar de perfil desde una URL de placeholder de una herramienta de diseño alojada en un CDN de Google. Es una dependencia externa no controlada dentro de la UI de producción: si esa URL deja de servir, el avatar desaparece.

### Evidencia

```tsx
// src/pages/ChatRoom.tsx:117 — sin onClick, sin aria-label
<button className="p-2 hover:bg-surface-container-low transition-colors rounded-full text-primary">
    <span className="material-symbols-outlined">more_vert</span>
</button>
```

```tsx
// src/pages/ChatRoom.tsx:290 y :303 — adjuntar y emoji, ambos inertes
<button className="p-3 …" disabled={isSending}>
    <span className="material-symbols-outlined">add_circle</span>
</button>
<button className="absolute right-2 p-2 text-primary">
    <span className="material-symbols-outlined">mood</span>
</button>
```

Equivalentes en `DepositChat.tsx:104` (`more_vert`) y `:226` (`add_circle`).

```
aria-label en src/        :  32
<button   en src/         : 178
material-symbols-outlined : 242
```

`src/pages/Explore.tsx:24`:

```tsx
<img alt="Perfil de usuario" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB…" />
```

Presente en ambos APK.

### Cómo reproducirlo

1. Abrir una operación y entrar al chat. Pulsar `⋮`, `+` y la carita → no ocurre nada.
2. Activar TalkBack y recorrer la pantalla → los botones se anuncian como "botón", sin descripción.
3. Abrir `/explore` con el CDN de Google bloqueado → el avatar no carga.

### Cómo se arregla

Para cada control, decidir: implementar la acción o retirar el botón. Un botón visible que no hace nada es peor que no tenerlo. Como mínimo inmediato, eliminar `more_vert`, `mood` y `add_circle` de ambas pantallas de chat hasta que exista la funcionalidad detrás.

Añadir `aria-label` a todo botón solo-icono, y activar `eslint-plugin-jsx-a11y` con la regla `jsx-a11y/control-has-associated-label` en el CI para que no vuelva a acumularse.

Sustituir el avatar placeholder por un asset local o, mejor, por las iniciales del usuario sobre un fondo de color.

### Criterios de aceptación

- [ ] Ningún `<button>` sin `onClick` (ni `type="submit"`) en `src/`.
- [ ] `eslint-plugin-jsx-a11y` corre en el pipeline sin errores.
- [ ] Recorrido con TalkBack de Chat, Mapa, Perfil y Pagar: todos los controles se anuncian con un nombre significativo.
- [ ] `grep -rn "lh3.googleusercontent.com" src/` → 0 resultados.

---

## Los tres que hay que corregir primero

### 1. ISSUE-01 — el build de debug

Es el único hallazgo que anula de golpe **todas** las protecciones que el proyecto ya tiene bien hechas. Mientras se reparta un APK firmado con `CN=Android Debug`, cualquiera puede publicar una actualización maliciosa que Android acepta como legítima, y `adb` puede leer la llave privada de la memoria del proceso. Todo el trabajo de diseño de seguridad —Keystore, firma local, endurecimiento— queda neutralizado por esta única decisión de empaquetado.

Y es, además, el arreglo más barato de los tres: un `assembleRelease` con el `.env` correcto y verificar el resultado. Horas, no días.

### 2. ISSUE-02 — la cola offline

Es el único hallazgo que **destruye datos del usuario en silencio y encima le confirma lo contrario**. Un comercio que cree haber cambiado sus límites operativos y no lo hizo es un incidente de dinero esperando a ocurrir, sin ninguna señal que lo delate hasta que alguien lo sufre en una operación real.

La confirmación falsa es lo que lo convierte en crítico. Un error visible se reintenta; un éxito falso no.

### 3. ISSUE-07 — la suite de pruebas rota

No es el más grave de los tres, pero es el que **evita que los otros dos se repitan**.

Con 30 fallos permanentes nadie mira la salida de los tests, y ese ruido es precisamente lo que permitió que ISSUE-02 e ISSUE-04 llegaran al APK sin que nadie los notara. Arreglarla y ponerla como gate de CI es lo que convierte esta auditoría en algo que no hay que repetir dentro de tres meses.

---

## Hallazgos menores confirmados (fuera del top 10)

Estos son hechos verificados, con impacto bajo. Se dejan registrados para que no se pierdan.

**Código muerto: ~926 líneas.** Archivos con cero referencias externas, verificado con `grep`:

| Archivo | Líneas |
|---|---|
| `src/services/offlineQueueManager.ts` | 263 |
| `src/components/DebugOverlay.tsx` | 182 |
| `src/components/CancelTradeDialog.tsx` | 147 |
| `src/components/MerchantAvailabilityToggle.tsx` | 118 |
| `src/components/OfflineQueueStatus.tsx` | 85 |
| `src/utils/reportError.ts` | 75 |
| `src/components/MerchantUnavailableBanner.tsx` | 56 |

**Sin telemetría de crashes en campo.** `src/utils/reportError.ts` está bien escrito —redacta JWTs, semillas Stellar y cabeceras de autorización antes de enviar nada— pero **nunca se importa desde ningún sitio**. La app no tiene ninguna forma de saber que se rompió en el teléfono de alguien. Merece issue propio en cuanto se cierre lo bloqueante.

**`file_paths.xml` expone la raíz del almacenamiento externo.** Declara `<external-path name="my_images" path="." />`. El provider es `exported="false"` y ningún plugin de cámara o compartición está instalado, así que hoy es configuración muerta heredada del boilerplate de Capacitor, no una vulnerabilidad explotable. Vale limpiarla.

**Firma solo con esquema v2.** Sin v3 ni v3.1, lo que impide rotar la llave de firma en el futuro. Incluido como criterio de aceptación de ISSUE-01.

**Verificado y correcto** (no requiere acción): `micopay-release.jks` y `keystore.properties` no están versionados; `.gitignore` los cubre. El almacenamiento de la llave privada usa Android Keystore en nativo y `localStorage` solo en la ruta web. `allowBackup=false`, `usesCleartextTraffic=false` y `network_security_config` correctos en la configuración de release. `reportError.ts` redacta secretos correctamente.

---

## Herramientas y comandos utilizados

| Herramienta | Uso |
|---|---|
| `aapt` / `aapt2` (build-tools 36.1.0) | `dump badging`, `dump xmltree`, `dump resources` |
| `apksigner` | `verify --verbose --print-certs` sobre los tres APK |
| `dexdump` | Cabecera y conteo de `classes*.dex` |
| `unzip` + `sha256sum` | Extracción, inventario y hashes de los artefactos |
| Python `zipfile` | Medición de tamaños comprimidos por ABI y por directorio |
| `grep` / `ripgrep` | Extracción de URLs, endpoints y patrones sobre el bundle minificado |
| `npx tsc --noEmit` | Typecheck del frontend (exit 0) |
| `npx vitest run` | Ejecución de la suite (30/58 fallos) |
| `git ls-files` / `git check-ignore -v` | Verificación de que el keystore y los `.env` no están versionados |

Comandos representativos:

```bash
sha256sum micopay/frontend/android/app/build/outputs/apk/debug/app-debug.apk
aapt dump badging app-debug.apk | head -10
aapt2 dump xmltree --file AndroidManifest.xml app-debug.apk
apksigner verify --verbose --print-certs app-debug.apk

unzip -o -q app-debug.apk -d /tmp/apk
grep -oE 'https?://[a-zA-Z0-9._~:/?#-]{4,70}' /tmp/apk/assets/public/assets/index-*.js \
  | sort | uniq -c | sort -rn

python -c "import zipfile; z=zipfile.ZipFile('app-release.apk'); \
  print(sum(i.compress_size for i in z.infolist() if i.filename.startswith('lib/x86')))"

cd micopay/frontend && npx tsc --noEmit && npx vitest run
```

---

## Limitaciones de la auditoría

**No se hicieron pruebas dinámicas.** No hay dispositivo ni emulador conectado (`adb devices` sin objetivos) y no se instaló el APK. Todo el análisis es estático, sobre el artefacto empaquetado y el código fuente. Los "pasos para reproducir" de cada hallazgo están redactados como guion de verificación en dispositivo, no como observación directa — salvo donde se cita literalmente el bundle o la salida de una herramienta.

**No se probó contra producción.** No se consultó `api.micopay.app` ni el dominio de deep links. Los datos de salud del backend y el NXDOMAIN de `app.micopay.xyz` se toman de `docs/AUDITORIA_APK_PILOTO_2026-08.md`; no se verificaron de nuevo.

**Sin herramientas de descompilación completas.** No hay `jadx`, `apktool` ni `dex2jar` en el entorno. El análisis del DEX se limitó a cabeceras y extracción de cadenas. Es suficiente y concluyente para lo que se afirma —la ausencia total de clases de Firebase Messaging es demostrable por cadenas— pero no permite auditar la lógica nativa de los plugins de Capacitor.

**No se modificó ni el APK ni el código.** No se ejecutaron acciones destructivas ni pruebas contra sistemas externos.

### Hipótesis no confirmadas (deliberadamente fuera de los 10)

**Degradación silenciosa a testnet.** Tres archivos resuelven la red así:

```ts
const HORIZON_URL = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
```

Si una variable falta o está mal escrita en un build de mainnet, la app cae a testnet **sin ningún error visible**. Hoy no causa daño porque el backend corre en testnet a propósito, pero conviene una aserción en tiempo de build que falle ruidosamente. Relacionado con el hallazgo menor #1 de la auditoría previa.

**Sin certificate pinning** en `network_security_config.xml`. Para una app de pagos es discutible si compensa frente al costo operativo de rotación de certificados. Se deja como decisión de producto, no como defecto.

### Áreas que requieren pruebas adicionales

- **Batería y memoria** bajo uso real. `maplibre-gl` entró en la última build y el bundle creció de 1,7 MB a 2,8 MB; el impacto en dispositivos de gama baja está sin medir.
- **Escáner ML Kit** en dispositivos de gama baja: latencia de reconocimiento y consumo.
- **Compatibilidad Android 7-9.** `minSdk` es 24 y la app corre React 19 sobre WebViews que en esos dispositivos pueden estar desactualizados si el usuario no actualiza Android System WebView.
- **Flujo de pago end-to-end** contra el escrow, incluidos los caminos de cancelación, expiración y reembolso.
- **Pruebas dinámicas de todos los hallazgos** una vez haya un dispositivo disponible, para convertir los guiones de verificación en observación directa.
