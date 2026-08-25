# Issues para Drips — Auditoría del APK 2026-08

**Origen:** `docs/AUDITORIA_APK_2026-08-24.md`
**Formato:** según `docs/DRIPS_TEAM_GUIDE.md` § "Required parts of every issue"
**Etiqueta común:** `auditoria-2026-08`
**Superficie:** `micopay/frontend` (in-scope de la Wave actual)

> ⚠️ **No publicar hasta que el APK de release esté repartido.** Ver `docs/PLAN_REMEDIACION_APK_2026-08-24.md` Fase 5.
>
> ⚠️ **Verificar cada issue contra el código actual antes de publicar** (tarea T-18). Las fases 2 y 3 del plan de remediación pueden haber arreglado alguno de paso.

---

## Índice

| # | Título | Complejidad | Depende de |
|---|---|---|---|
| 1 | El KYC aprobado deja al usuario en el inicio, no en CETES | Medium | — |
| 2 | Reparar `Home.test.tsx`: el mock de `useWalletBalance` está incompleto | Trivial | — |
| 3 | Reparar `TradeDetail.test.tsx`: busca literales que i18next ya no renderiza | Medium | — |
| 4 | Quitar los permisos de notificaciones y ubicación precisa | Trivial | — |
| 5 | Excluir las librerías x86 y limitar los idiomas empaquetados | Trivial | — |
| 6 | Retirar los 7 botones sin acción de las pantallas de chat | Medium | — |
| 7 | Poner nombre accesible a los botones solo-icono | Medium | #6 |

---

# Issue 1 — El KYC aprobado deja al usuario en el inicio, no en CETES

**Complejidad:** Medium
**Etiquetas:** `auditoria-2026-08`, `bug`, `frontend`, `routing`, `kyc`

## Problem statement

Al aprobarse la verificación de identidad, `src/App.tsx:561` ejecuta:

```ts
window.location.hash = '/#/cetes';
```

La app usa `HashRouter` (`src/App.tsx:1070`), así que la ruta vive en el fragmento de la URL. Asignar `'/#/cetes'` al fragmento produce `https://localhost/#/#/cetes`, y el router interpreta la ruta como `/#/cetes`. Ninguna de las 29 rutas registradas coincide, así que cae en el catch-all:

```tsx
// src/App.tsx:1103
<Route path="*" element={<Navigate to="/" replace />} />
```

El usuario acaba en la pantalla de inicio, no en CETES, que es justo la funcionalidad que se le acaba de desbloquear.

La función inmediatamente siguiente en el mismo archivo lo hace bien:

```ts
function Lj(){ const g = useNavigate(); return useEffect(() => { g("/cetes") }, …) }
```

El patrón correcto ya está en el código, al lado.

## Why it matters

Ocurre en el punto de máxima conversión del producto. La persona ya subió documentos y esperó a que la aprobaran. Cuando por fin se concede, la app la deja en el inicio sin ninguna señal de que el KYC pasó.

No hay mensaje de éxito, no hay pantalla nueva, no hay nada que indique que algo cambió. Es razonable que concluya que la verificación falló y que no vuelva a intentarlo. Se pierde al usuario justo al final del embudo más caro que tiene el producto.

## In-scope files

- `micopay/frontend/src/App.tsx` (~línea 561)
- `micopay/frontend/src/services/api.ts` (interceptor de 401, ~línea 769) — ver "Alcance secundario"

## Alcance secundario, opcional

El interceptor de 401 en `api.ts:769` hace `window.location.href = '/#/login'`. **Hoy funciona**: la URL solo cambia en el fragmento, el navegador no recarga el documento y `HashRouter` navega al login correctamente.

Es un patrón frágil —bastaría con que el path dejara de ser `/` para que provocara una recarga completa de la app— pero **no es un defecto observable ahora mismo**. Arreglarlo es bienvenido y suma al issue, pero no es obligatorio para cerrarlo. Si lo tomas, ten en cuenta que el interceptor vive fuera del árbol de React y no puede usar `useNavigate()`: hay que exponer la instancia del router desde un módulo.

## Out-of-scope

- **No migrar a `BrowserRouter`.** `HashRouter` es correcto para una app empaquetada en Capacitor, donde el WebView sirve desde `https://localhost/`.
- **No configurar ESLint.** El proyecto no tiene ESLint hoy; montarlo es un issue aparte.
- No rediseñar la pantalla de KYC ni la de CETES.
- No tocar la lógica de verificación de identidad ni la integración con el proveedor.

## Acceptance criteria

- [ ] Al aprobarse el KYC, la app navega a `/cetes` y muestra esa pantalla.
- [ ] La URL resultante es `…#/cetes`, sin el `#` duplicado.
- [ ] `grep -rn "window.location.hash" micopay/frontend/src/` → 0 resultados.
- [ ] Existe un test que verifica la ruta resultante tras aprobar el KYC.
- [ ] `npx tsc --noEmit` sale en 0.
- [ ] Los tests que ya fallaban siguen siendo exactamente 30; ni uno más.

## Test notes

Es un arreglo de una línea; el valor del issue está en el test que lo acompaña.

Para probarlo sin backend: renderiza el componente que recibe `onApproved`, dispáralo y comprueba la ruta resultante con el `MemoryRouter` de react-router o con `renderHook`. Hay ejemplos del patrón en `src/__tests__/useOfflineQueue.test.ts`.

**Cuidado con verificar solo que `navigate` fue llamado.** Eso pasaría igual con el bug presente si alguien lo mockea mal. Comprueba la ruta final.

## Dependency notes

Ninguna. Se puede tomar de inmediato.

---

# Issue 2 — Reparar `Home.test.tsx`: el mock de `useWalletBalance` está incompleto

**Complejidad:** Trivial
**Etiquetas:** `auditoria-2026-08`, `tests`, `good-first-issue`

## Problem statement

Los 10 tests de `src/__tests__/Home.test.tsx` fallan con:

```
TypeError: Cannot read properties of undefined (reading 'reduce')
 ❯ Home src/pages/Home.tsx:127:27
```

La causa es el mock, no el componente. El archivo hace `vi.mock('../hooks/useWalletBalance')` y devuelve un objeto que **no incluye el campo `tokens`**. El hook real sí lo garantiza: lo inicializa como `[]` en `useWalletBalance.ts:36` y lo devuelve siempre.

`Home.tsx:127` hace `tokens.reduce(...)` y revienta porque el mock le dio `undefined`.

**Esto no es un bug de producción.** En la app real `tokens` nunca es `undefined`. Es un test que quedó desactualizado cuando el hook creció.

## Why it matters

Con 30 tests en rojo de forma permanente, nadie mira la salida de la suite. Un fallo nuevo y real se pierde en el ruido, y no se puede exigir que las pruebas pasen antes de mergear.

Estos 10 son el trozo más fácil de rescatar y el que más rápido devuelve señal útil sobre la pantalla principal de la app.

## In-scope files

- `micopay/frontend/src/__tests__/Home.test.tsx`

## Out-of-scope

- **No modifiques `src/pages/Home.tsx`.** El componente está bien; el defecto está en el test. Si crees que has encontrado un bug real en el componente, dilo en el issue en vez de cambiarlo.
- **No toques `src/hooks/useWalletBalance.ts`.**
- No toques `TradeDetail.test.tsx`: es el issue #3.
- No añadas dependencias nuevas.

## Acceptance criteria

- [ ] `npx vitest run src/__tests__/Home.test.tsx` → 10 passed, 0 failed.
- [ ] Existe un helper reutilizable (por ejemplo `makeWalletBalance(overrides)`) que devuelve el objeto **completo** que retorna el hook, y todos los mocks del archivo lo usan.
- [ ] Ningún test hace `as any` ni `@ts-ignore` para saltarse el tipo del hook.
- [ ] `npx tsc --noEmit` sale en 0.
- [ ] El total de tests fallando en la suite baja de 30 a 20.

## Test notes

Mira la firma real del hook en `src/hooks/useWalletBalance.ts:113`:

```ts
return { balance, xlmBalance, stellarAddress, loading, error, refresh, tokens, usdMxnRate };
```

El helper debe devolver los 8 campos con valores por defecto sensatos, y aceptar overrides parciales para que cada test cambie solo lo suyo. Así, cuando el hook gane un campo más, se añade en un sitio y no en diez.

Los tests cubren varios estados (cuenta sin fondear, Horizon cargando, Horizon con error, tipo de cambio fallando). Fíjate en qué campo simula cada uno antes de tocarlos.

## Dependency notes

Ninguna. Es un buen primer issue para alguien que llega nuevo al repo.

---

# Issue 3 — Reparar `TradeDetail.test.tsx`: busca literales que i18next ya no renderiza

**Complejidad:** Medium
**Etiquetas:** `auditoria-2026-08`, `tests`, `i18n`

## Problem statement

20 de los 21 tests de `src/__tests__/TradeDetail.test.tsx` fallan con variantes de:

```
TestingLibraryElementError: Unable to find an element with the text: Pendiente
TestingLibraryElementError: Unable to find an element with the text: Bloqueado
TestingLibraryElementError: Unable to find an element with the text: Revelando
… (Revelado, Completado, Cancelado, Expirado, "detalle de operación", "contactar soporte")
```

Los tests buscan cadenas literales en español. Tras la migración a i18next, esos textos se resuelven a través de `t()` y no aparecen tal cual en el DOM durante el test, porque i18next no está inicializado en el entorno de pruebas.

Como los anteriores, **no es un bug de producción**: en la app los textos se ven bien. Es la suite la que quedó atrás.

## Why it matters

Es el bloque más grande de tests rotos y cubre la pantalla de detalle de una operación, que es donde el usuario ve el estado de su dinero. Es precisamente el sitio donde más falta hace tener regresiones cubiertas, y hoy no cubre nada.

Recuperar estos 20 tests es lo que permite poner un gate de pruebas en CI, que a su vez es lo que evita que vuelvan a colarse bugs como los de esta auditoría.

## In-scope files

- `micopay/frontend/src/__tests__/TradeDetail.test.tsx`
- `micopay/frontend/vitest.config.ts` y el archivo de setup, si hace falta inicializar i18next para las pruebas
- Añadir `data-testid` en los componentes de estado, **solo si** se elige esa vía (ver Test notes)

## Out-of-scope

- **No cambies los textos de las traducciones** en `src/i18n/`.
- **No cambies la lógica del componente.** Si encuentras un bug real, repórtalo aparte en vez de arreglarlo aquí.
- No toques `Home.test.tsx`: es el issue #2.
- No conviertas los tests a snapshots.

## Acceptance criteria

- [ ] `npx vitest run src/__tests__/TradeDetail.test.tsx` → 21 passed, 0 failed.
- [ ] Los tests siguen comprobando **el comportamiento**, no solo que el componente renderiza. Cada estado de la operación sigue teniendo su aserción propia.
- [ ] La solución elegida está documentada en un comentario al principio del archivo, para que el siguiente sepa por qué.
- [ ] `npx tsc --noEmit` sale en 0.
- [ ] El total de tests fallando en la suite baja a 0 si el issue #2 ya está mergeado, o a 10 si no.

## Test notes

Hay dos caminos válidos y hay que elegir uno, no mezclarlos:

**Opción A — inicializar i18next en el setup de vitest.** Los tests siguen buscando textos en español y pasan a probar también que las traducciones existen. Más fiel a lo que ve el usuario, pero acopla los tests al contenido de los archivos de idioma: si alguien cambia una traducción, el test se cae.

**Opción B — consultar por `data-testid`.** Desacopla los tests del texto. Requiere tocar los componentes para añadir los atributos, lo que amplía un poco el alcance.

**Recomendación:** la opción A, porque no obliga a modificar componentes y porque en una app con dos idiomas verificar que la traducción existe tiene valor real. Pero si al implementarla resulta frágil, la B es aceptable; explica el motivo en el PR.

Hay un test aparte que falla por otra razón:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'unique-trade-456', 'mock-token' ]
```

Ese no es de i18next. Míralo por separado; puede ser el único fallo que apunte a algo real.

## Dependency notes

Independiente del issue #2, aunque ambos tocan la suite. Si se toman en paralelo, no hay conflicto de archivos: son ficheros distintos. Solo coordina si tocas el setup compartido de vitest.

---

# Issue 4 — Quitar los permisos de notificaciones y ubicación precisa

**Complejidad:** Trivial
**Etiquetas:** `auditoria-2026-08`, `android`, `privacy`, `good-first-issue`

## Problem statement

El manifiesto declara dos permisos que ninguna funcionalidad de la app puede usar.

**`POST_NOTIFICATIONS`** (`AndroidManifest.xml:67`). La app no tiene código de notificaciones push. El escaneo de todas las cadenas del `classes.dex` del APK compilado da 0 coincidencias para `messaging`, `Messaging` y `PushNotification`. `capacitor.plugins.json` lista 6 plugins y ninguno es de push. No existe `google-services.json`, y `build.gradle` solo aplica el plugin de Google Services si encuentra ese archivo. Lo único que hay es una meta-data huérfana en `AndroidManifest.xml:55-57` apuntando a un canal de notificaciones que nadie crea.

**`ACCESS_FINE_LOCATION`** (`AndroidManifest.xml:65`). Es el permiso de ubicación precisa, con exactitud de metros. Todos los puntos del código que piden ubicación lo hacen con `enableHighAccuracy: false` explícito, o sin especificarlo. No hay ni un `enableHighAccuracy: true` en código de la app. Para el mapa de agentes cercanos, `ACCESS_COARSE_LOCATION` (1 a 3 km) es suficiente y ya está declarado.

## Why it matters

Cuando una app de dinero pide ubicación precisa, la persona que la instala se pregunta por qué. En este caso no hay respuesta: no la usa. En una categoría donde la desconfianza es el principal obstáculo de adopción, pedir de más cuesta instalaciones.

Hay además un efecto mecánico: desde Android 12, pedir `FINE_LOCATION` muestra un diálogo con dos opciones donde el usuario puede degradar el permiso, y ese diálogo tiene peor tasa de aceptación que el simple de ubicación aproximada. Se está pagando fricción por algo que no se usa.

Y en Play Console los permisos sensibles requieren justificación documentada. Ubicación precisa y notificaciones sin funcionalidad detrás son motivo frecuente de rechazo o de requerimiento, con las semanas de retraso que eso implica.

## In-scope files

- `micopay/frontend/android/app/src/main/AndroidManifest.xml`

## Out-of-scope

- **No implementes notificaciones push.** Si algún día se hacen, el permiso vuelve con el plugin.
- **No toques `ACCESS_COARSE_LOCATION`,** `INTERNET`, `CAMERA` ni `ACCESS_NETWORK_STATE`: los cuatro están justificados.
- No modifiques el código de geolocalización en `src/`. El permiso sobra; las llamadas están bien.
- No toques los `<uses-feature>`.

## Acceptance criteria

- [ ] `AndroidManifest.xml` ya no declara `POST_NOTIFICATIONS` ni `ACCESS_FINE_LOCATION`.
- [ ] Se elimina la meta-data `com.google.firebase.messaging.default_notification_channel_id`.
- [ ] `aapt dump badging` sobre el APK compilado lista **exactamente** estos permisos: `INTERNET`, `CAMERA`, `ACCESS_COARSE_LOCATION`, `ACCESS_NETWORK_STATE`, y el `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` que genera Capacitor.
- [ ] `./gradlew assembleDebug` compila sin errores.
- [ ] El mapa de agentes sigue obteniendo la ubicación con permiso aproximado.

## Test notes

Para verificar los permisos del APK resultante:

```bash
cd micopay/frontend/android && ./gradlew assembleDebug
~/AppData/Local/Android/Sdk/build-tools/36.1.0/aapt.exe dump badging \
  app/build/outputs/apk/debug/app-debug.apk | grep uses-permission
```

Ojo: algunos permisos entran por **fusión de manifiestos** desde las librerías, no desde el manifiesto de la app. Si tras borrarlos siguen apareciendo en el APK, revisa el manifiesto fusionado en `app/build/intermediates/merged_manifests/` para ver qué librería los mete, y repórtalo en el PR. En ese caso haría falta un `tools:node="remove"`, pero **confírmalo antes de añadirlo**.

Si tienes un dispositivo, comprueba que el mapa localiza correctamente concediendo solo ubicación aproximada. Si no tienes, dilo en el PR y lo verifica el integrador.

## Dependency notes

Ninguna. Toca un solo archivo y no colisiona con los demás issues.

---

# Issue 5 — Excluir las librerías x86 y limitar los idiomas empaquetados

**Complejidad:** Trivial
**Etiquetas:** `auditoria-2026-08`, `android`, `performance`, `good-first-issue`

## Problem statement

El APK empaqueta las librerías nativas para las cuatro arquitecturas de Android. Las versiones x86 y x86_64 de `libbarhopper_v3.so` (el motor nativo de ML Kit que lee los QR) suman **12,1 MB** y solo sirven en emuladores y unos pocos Chromebooks. Ningún teléfono las usa.

Medición sobre los APK actuales:

```
release  25 031 671 B totales — x86 + x86_64: 12 131 144 B  (48,5 %)
debug    31 019 740 B totales — x86 + x86_64: 12 131 144 B  (39,1 %)

lib/x86/libbarhopper_v3.so          6 122 368 B
lib/x86_64/libbarhopper_v3.so       5 909 280 B
lib/arm64-v8a/libbarhopper_v3.so    4 946 720 B
lib/armeabi-v7a/libbarhopper_v3.so  3 244 440 B
```

Como el APK usa `extractNativeLibs="false"`, esas librerías van sin comprimir y cuentan íntegras en la descarga.

Problema secundario del mismo tipo: `resources.arsc` (390 KB) incluye la etiqueta de la app traducida a unos 80 idiomas heredados de AndroidX (`application-label-af`, `-am`, `-ar`, `-as`, `-az`…), cuando la app solo tiene traducciones a español e inglés.

## Why it matters

Quitando x86 el APK de release baja de 25,2 MB a unos 13 MB. La mitad de descarga y la mitad de espacio ocupado.

Buena parte de la gente del piloto en México va a descargar con datos móviles, no con WiFi, y en teléfonos de gama de entrada donde el almacenamiento libre escasea. Una app de 25 MB es una decisión que la persona se piensa; una de 13 MB es un clic. Esa diferencia es abandono de instalación medible y completamente evitable.

## In-scope files

- `micopay/frontend/android/app/build.gradle`

## Out-of-scope

- **No apliques el filtro de ABIs al build de `debug`.** Rompe los emuladores del equipo; ver Test notes.
- **No migres a App Bundle (`.aab`).** Es la solución correcta para Play Store, pero cambia el proceso de distribución y es una decisión del equipo, no de este issue.
- No toques `extractNativeLibs`, `minifyEnabled` ni `shrinkResources`: los tres están bien.
- No quites plugins ni dependencias.
- No toques los archivos de traducción en `src/i18n/`.

## Acceptance criteria

- [ ] El bloque `buildTypes.release` incluye `ndk { abiFilters "armeabi-v7a", "arm64-v8a" }`.
- [ ] **`buildTypes.debug` NO lleva el filtro**, para que el emulador x86_64 siga funcionando.
- [ ] `defaultConfig` incluye `resConfigs "es", "en"`.
- [ ] `unzip -l` sobre el APK de **release** no lista ningún `lib/x86*`.
- [ ] `unzip -l` sobre el APK de **debug** sí sigue listando `lib/x86_64`.
- [ ] El APK de release pesa menos de 15 MB; deja la cifra exacta en el PR.
- [ ] `./gradlew assembleDebug` y `./gradlew assembleRelease` compilan sin errores.

## Test notes

**El filtro va solo en `release`, nunca en `debug`.** Esto es deliberado y es el punto delicado del issue.

Los emuladores de Android Studio son x86_64 por defecto, porque corren nativos sobre un procesador Intel/AMD y por eso son rápidos. Si el APK de debug no lleva `lib/x86_64`, Android detecta que ninguna arquitectura del paquete coincide con la del dispositivo y **rechaza la instalación** con `INSTALL_FAILED_NO_MATCHING_ABIS`. No es que falle el escáner: es que no instala. Dejando el filtro solo en `release`, los usuarios descargan la mitad y el equipo conserva el emulador.

Verificación de las dos variantes:

```bash
cd micopay/frontend/android
./gradlew assembleRelease assembleDebug

unzip -l app/build/outputs/apk/release/app-release.apk | grep "lib/"   # sin x86
unzip -l app/build/outputs/apk/debug/app-debug.apk     | grep "lib/"   # CON x86_64
ls -l app/build/outputs/apk/release/app-release.apk                    # tamaño
```

**No necesitas dos teléfonos de arquitecturas distintas.** Basta con demostrar que ambas variantes compilan, que la de release ya no lleva `lib/x86*`, que la de debug sí, y cuánto pesa la de release. La prueba del escáner QR en dispositivos arm64 y armeabi-v7a reales la hace el integrador al mergear; déjalo dicho en el PR.

`assembleRelease` requiere el keystore de firma, que no está en el repo. Si no lo tienes, compila solo `assembleDebug` y verifica la parte de release con `./gradlew :app:assembleRelease --dry-run` o pídele al integrador que la confirme.

## Dependency notes

Ninguna. Un solo archivo, sin solapamiento con otros issues.

---

# Issue 6 — Retirar los 7 botones sin acción de las pantallas de chat

**Complejidad:** Medium
**Etiquetas:** `auditoria-2026-08`, `bug`, `ux`, `frontend`

## Problem statement

Las dos pantallas de chat muestran **7 botones que no tienen ningún manejador de eventos**. Están dibujados, responden visualmente al toque y no hacen absolutamente nada.

| Archivo | Línea | Control | Tiene texto visible |
|---|---|---|---|
| `ChatRoom.tsx` | 117 | `more_vert` (menú) | no |
| `ChatRoom.tsx` | 266 | `location_on` + "Compartir ubicación" | **sí** |
| `ChatRoom.tsx` | 290 | `add_circle` (adjuntar) | no |
| `ChatRoom.tsx` | 303 | `mood` (emoji) | no |
| `DepositChat.tsx` | 104 | `more_vert` (menú) | no |
| `DepositChat.tsx` | 207 | `location_on` + "Compartir ubicación" | **sí** |
| `DepositChat.tsx` | 226 | `add_circle` (adjuntar) | no |

Los dos de "Compartir ubicación" son los peores: llevan etiqueta de texto, ocupan la mitad de la fila de acciones y tienen su propia clave de traducción (`chatRoom.shareLocation`). Prometen una función con nombre que no existe.

Ejemplo, `ChatRoom.tsx:266`:

```tsx
<button className="flex items-center justify-center gap-3 w-full h-[46px] rounded-lg …">
    <span className="material-symbols-outlined …">location_on</span>
    <span className="font-body text-sm">{t('chatRoom.shareLocation')}</span>
</button>
```

Sin `onClick`. Compáralo con el botón de al lado (`:270`), que sí tiene `onClick={onViewQR}`.

## Why it matters

El chat es el canal por el que un comprador y un comercio, que no se conocen, coordinan un intercambio de dinero en efectivo. Es el momento de más tensión de todo el producto.

Ahí, la acción más natural del mundo es pulsar el `+` para mandar la foto de un comprobante, o "Compartir ubicación" para decir dónde estás. La app ignora ambas en silencio: sin mensaje, sin feedback, sin explicación.

El usuario no concluye "esta función todavía no está". Concluye "esta app está rota", justo cuando tiene dinero de por medio. Eso genera tickets de soporte, abandono de la operación y desconfianza que se contagia al resto del producto.

Un botón visible que no hace nada es peor que no tener el botón.

## In-scope files

- `micopay/frontend/src/pages/ChatRoom.tsx`
- `micopay/frontend/src/pages/DepositChat.tsx`
- `micopay/frontend/src/i18n/` — solo para retirar claves que queden huérfanas

## Out-of-scope

- **No implementes las funciones.** Ni adjuntar imágenes, ni compartir ubicación, ni menú contextual, ni selector de emoji. Cada una es una feature con backend detrás y va en su propio issue.
- **No toques los botones que sí funcionan:** enviar mensaje, ver QR, escanear QR, volver.
- **No rediseñes el layout del chat.** Al quitar los botones el espaciado cambia; ajústalo lo mínimo para que no queden huecos raros, nada más.
- No toques la lógica de mensajería ni `useChatMessages.ts`.

## Acceptance criteria

- [ ] Los 7 botones de la tabla ya no están en el DOM.
- [ ] El layout de ambas pantallas se ve correcto sin huecos ni elementos descolocados; adjunta capturas de antes y después.
- [ ] Los botones que funcionan siguen funcionando: enviar mensaje, ver QR, escanear QR, volver.
- [ ] Las claves de traducción que queden sin uso (`chatRoom.shareLocation` y las que aparezcan) se retiran de `es` y de `en`.
- [ ] `npx tsc --noEmit` sale en 0.
- [ ] Los tests que ya fallaban siguen siendo los mismos; ni uno más.

## Test notes

**Adjunta capturas.** Es un cambio visual en dos pantallas y hay que verlo. Ambas pantallas, antes y después.

La fila de acciones de "Compartir ubicación" es un `grid grid-cols-2` en `DepositChat.tsx:206`. Al quitar uno de los dos botones el grid queda cojo: pasa a una sola columna o deja que el botón restante ocupe el ancho. Decide y explica en el PR.

En `ChatRoom.tsx`, el botón de emoji está posicionado en `absolute` dentro del contenedor del `textarea` (`:303`), con el `textarea` llevando `pr-12` para dejarle sitio. Al quitarlo hay que ajustar ese padding o el texto queda con un margen derecho sin motivo.

Antes de borrar una clave de i18n, comprueba que no se usa en otro sitio:

```bash
grep -rn "shareLocation" micopay/frontend/src/
```

## Dependency notes

Ninguna hacia atrás. **El issue #7 depende de este** y debe mergearse después: ambos tocan `ChatRoom.tsx` y `DepositChat.tsx`, y si van en paralelo hay conflicto garantizado.

---

# Issue 7 — Poner nombre accesible a los botones solo-icono

**Complejidad:** Medium
**Etiquetas:** `auditoria-2026-08`, `accessibility`, `frontend`

## Problem statement

La app tiene 178 elementos `<button>` y solo 32 llevan `aria-label`. Al mismo tiempo hay 242 iconos de Material Symbols. La mayoría de los botones son solo un icono, sin texto visible.

Para un lector de pantalla como TalkBack, un botón así no tiene nombre: se anuncia simplemente como "botón". El usuario no tiene forma de saber si es "volver", "copiar", "cerrar" o "cancelar operación".

Ejemplo típico, en `CETESScreen.tsx:287`:

```tsx
<button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full …">
  <span className="material-symbols-outlined">arrow_back</span>
</button>
```

Un span con el nombre del icono dentro. TalkBack puede llegar a leer literalmente "arrow_back", que no ayuda a nadie.

Aparte, hay un detalle del mismo barrido: `src/pages/Explore.tsx:24` renderiza el avatar de perfil desde una URL de placeholder de una herramienta de diseño alojada en un CDN de Google (`https://lh3.googleusercontent.com/aida-public/…`). Es una dependencia externa no controlada dentro de la UI de producción.

## Why it matters

Para las personas que usan lector de pantalla, MicoPay es hoy inoperable: no hay forma de saber qué hace cada botón. Para un servicio financiero eso no es solo un problema de producto, es un riesgo de cumplimiento, porque la accesibilidad de servicios financieros está regulada en un número creciente de jurisdicciones.

Y no afecta solo a quien usa TalkBack a diario. También a quien lo activa temporalmente, a quien navega con teclado externo, y a las herramientas automáticas de auditoría que Play Store aplica.

El avatar remoto es menor pero real: si esa URL deja de servir, la pantalla de explorar aparece rota, y estamos cargando una imagen de un CDN de terceros en cada visita.

## In-scope files

- `micopay/frontend/src/pages/**` — botones solo-icono
- `micopay/frontend/src/components/**` — botones solo-icono
- `micopay/frontend/src/pages/Explore.tsx` — avatar placeholder
- `micopay/frontend/src/i18n/` — claves nuevas para los textos accesibles

## Out-of-scope

- **No configurar ESLint.** El proyecto no tiene ESLint hoy. Montarlo con `eslint-plugin-jsx-a11y` es valioso pero es un issue aparte; no lo metas aquí.
- **No rediseñar componentes.** Nada de cambiar iconos, tamaños, colores ni layout.
- **No tocar el sistema de temas ni Tailwind.**
- **No añadir dependencias.**
- No toques `ChatRoom.tsx` ni `DepositChat.tsx` hasta que el issue #6 esté mergeado.
- No conviertas botones a otros elementos ni cambies su comportamiento.

> Este issue es de los que se desbordan con facilidad. Si te ves modificando estructura de componentes, te saliste del alcance. Son atributos, no rediseño.

## Acceptance criteria

- [ ] Todo `<button>` sin texto visible tiene un `aria-label` descriptivo de **la acción**, no del icono. "Volver", no "arrow_back". "Copiar dirección", no "content_copy".
- [ ] Los textos accesibles pasan por i18n, con sus claves en `es` y en `en`. Nada de literales sueltos en el JSX.
- [ ] El avatar de `Explore.tsx` ya no apunta a `lh3.googleusercontent.com`: usa un asset local o las iniciales del usuario sobre un fondo de color.
- [ ] `grep -rn "lh3.googleusercontent.com" micopay/frontend/src/` devuelve 0 resultados.
- [ ] Recorrido con TalkBack de al menos Mapa, Perfil, Pagar e Historial: todos los controles se anuncian con un nombre que se entiende. Adjunta notas o vídeo.
- [ ] `npx tsc --noEmit` sale en 0.
- [ ] Cero cambios visuales. Si una captura de antes y después difiere, algo se salió del alcance.

## Test notes

Para localizar los candidatos:

```bash
grep -rn -A3 '<button' micopay/frontend/src/pages micopay/frontend/src/components --include=*.tsx \
  | grep -B3 'material-symbols-outlined'
```

Filtra a mano los que **sí** tienen texto visible al lado del icono: esos no necesitan `aria-label` y añadírselo empeora la experiencia, porque el lector leería el label en vez del texto.

Si no puedes probar con TalkBack, dilo en el PR y describe qué label pusiste a cada botón para que el integrador lo revise. **No inventes que lo probaste.**

Cómo activar TalkBack: Ajustes → Accesibilidad → TalkBack. Para salir, mantén pulsados ambos botones de volumen.

## Dependency notes

**Depende del issue #6** y debe mergearse **después**. Ambos tocan `ChatRoom.tsx` y `DepositChat.tsx`; el #6 elimina botones que si no habrías etiquetado para nada.

Si tomas este issue antes de que el #6 esté mergeado, deja esos dos archivos para el final y avisa en el PR.

---

## Seguimiento (no son issues de esta tanda)

Candidatos a issues futuros que surgieron al redactar los anteriores:

- **Configurar ESLint con `eslint-plugin-jsx-a11y`.** Sin lint, la accesibilidad del issue #7 se degrada en cuanto alguien añada un botón. Encaja en Track D (contributor enablement).
- **Implementar "Compartir ubicación" en el chat.** `@capacitor/geolocation` ya está instalado y en uso, así que es viable. Es feature, no bug.
- **Implementar adjuntar imagen en el chat.** Requiere plugin de cámara y almacenamiento en backend; es bastante más grande.
- **Telemetría de crashes.** `src/utils/reportError.ts` existe, está bien escrito y redacta secretos correctamente, pero nunca se importa. La app no tiene forma de saber que se rompió en el teléfono de alguien.
