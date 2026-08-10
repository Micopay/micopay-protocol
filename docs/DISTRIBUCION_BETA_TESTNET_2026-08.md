# Distribución de la beta en testnet — qué obligaciones aplican y por dónde publicar

**Fecha:** 2026-08-03
**Pregunta que responde:** operando en testnet, ¿quedamos fuera de los requisitos regulatorios? ¿Y qué tan viable es subir la app a Play Store para conseguir testers e iterar?

**Documentos relacionados:** `CAMINO_A_MAINNET_CUMPLIMIENTO_2026-07.md` (marco PLD), `AUDITORIA_APK_PILOTO_2026-08.md` (estado del APK).

---

## Resumen

| Pregunta | Respuesta corta |
|---|---|
| ¿Testnet nos libra de PLD/LFPIORPI? | **Sí.** Sin valor real no hay operación que identificar ni reportar. |
| ¿Nos libra de protección de datos? | **No.** Los testers son personas reales dando datos reales. |
| ¿Subimos a Play Store producción? | **No todavía.** Trae escrutinio de servicios financieros que hoy no podemos satisfacer. |
| ¿Entonces cómo conseguimos testers? | **Pista de prueba interna** (hasta 100, sin revisión) o APK firmado directo. |
| ¿Y si los reclutamos desde el sitio web? | **Se puede, y el mecanismo ya existe** — `micopay.com.mx` ya tiene lista de espera y avisos públicos. Faltan dos cosas: un aviso que cubra **la app** (el actual solo cubre el sitio) y decir en algún lado que es **red de prueba**. Ver §4. |

---

## 1. Qué nos libra testnet y qué no

### Sí nos libra: PLD / LFPIORPI

En testnet no se mueve valor real. Los tokens de prueba no tienen valor económico y no son intercambiables por pesos. Sin una operación con valor:

- no hay umbral de 210 UMA que cruzar,
- no hay aviso mensual que presentar,
- no hay expediente de identificación que integrar por una operación que no existe.

Es la posición que ya sostiene `CAMINO_A_MAINNET_CUMPLIMIENTO_2026-07.md` y se sostiene bien. La obligación empieza a correr **al tocar mainnet con valor real**, no antes.

### No nos libra: protección de datos personales (LFPDPPP)

Este es el punto que se estaba pasando por alto. **El dinero es de prueba, pero los testers son personas reales entregando datos reales.** La LFPDPPP aplica desde el primer dato personal, sin importar si la transacción tiene valor.

Lo que la app recaba hoy:

| Dato | De dónde | Nota |
|---|---|---|
| Teléfono | Registro | Se hashea en el dispositivo con SHA-256; el número crudo nunca sale. **Buena minimización.** |
| Ubicación | `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Para el mapa de agentes. |
| Cámara | `CAMERA` | Escaneo de QR. |
| Identidad completa | Flujo KYC de Etherfuse o Didit | INE, selfie, CURP — de una persona real, alojado por un tercero. |

Lo que eso implica y no depende de estar en testnet: aviso de privacidad válido y accesible, base legítima de tratamiento, mecanismo de derechos ARCO, y —si el proveedor está fuera de México— transferencia internacional de datos con su propia base legal.

> Esto es un mapa de qué marco aplica, no un criterio legal. La pregunta B del §3 de `CAMINO_A_MAINNET_CUMPLIMIENTO_2026-07.md` (expediente en manos de un tercero) sigue siendo materia del dictamen.

---

## 2. Estado de los avisos de privacidad

Hay **dos** avisos y cubren cosas distintas. Verificado 2026-08-03.

### El del sitio — existe, es público y está bien hecho

`micopay.com.mx/privacy` responde 200 sin login. Cubre LFPDPPP, tabla de datos, finalidades primarias/secundarias con opt-out, terceros nombrados (Cloudflare, Mailgun/Sinch), transferencia internacional por Art. 37, ARCO con plazos, retención 24 meses e INAI.

**Pero está acotado al formulario de lista de espera del sitio, no a la app** — ver §4.2, que es donde está el hueco real.

### El de la app — existe pero no es alcanzable ni completo

`frontend/src/pages/Privacy.tsx` y `Terms.tsx` (99 líneas el primero). Dos problemas en código:

1. **Están detrás del login.** Ambas rutas van envueltas en `<ProtectedRoute>` (`App.tsx:1101-1102`), así que nadie puede leer el aviso **antes** de registrarse — que es exactamente cuando debería leerlo.
2. **No mencionan a los terceros ni los permisos sensibles.** Cero coincidencias de "Didit", "Etherfuse", "ubicación" ni "cámara".

**Lo que Play necesita** es un aviso que describa lo que recaba **la app**, en URL pública, y que coincida con el formulario de Data Safety. Hoy ninguno de los dos lo cumple: el del sitio es público pero habla de otra cosa, y el de la app habla de lo correcto pero está tras el login e incompleto.

---

## 3. Por dónde publicar

### Por qué producción en Play Store no es el camino hoy

- **Política de servicios financieros de Google.** Las apps de intercambio cripto requieren declaración y, según el país objetivo, evidencia de registro o licencia. Ser no custodial ayuda —es el mismo argumento que usamos para no necesitar IFPE— pero la app *facilita el intercambio de cripto por efectivo*, que ante un revisor se parece bastante a un exchange. Sin la sociedad constituida ni el alta en SPPLD, no conviene abrir esa conversación.
- **Requisitos de la cuenta de Play Console.** Publicar como organización pide D-U-N-S. Y en cuentas personales recientes, Google exige de todos modos **12 testers durante 14 días en prueba cerrada** antes de habilitar producción — es decir, hay que pasar por testing igual.
- **Formulario de Data Safety.** Obliga a declarar ubicación, cámara y demás datos recabados; es donde el aviso incompleto del §2 se vuelve un problema formal de revisión.

### Opciones comparadas

| Vía | Testers | Revisión | Cuándo usarla |
|---|---|---|---|
| **Prueba interna (internal testing)** | hasta 100 | ninguna, publica casi al instante | **Recomendada ahora** |
| Prueba cerrada (closed testing) | más de 100 | ligera | Cuando se pase de 100 |
| APK firmado directo / Firebase App Distribution | sin límite | ninguna política de Google | Si son conocidos y se quiere iterar aún más rápido |
| Producción | público | completa, con escrutinio financiero | Después del dictamen y el alta en SPPLD |

**Recomendación: prueba interna**, o APK firmado directo si el grupo es chico y de confianza. Ambas permiten iterar en horas en vez de días, y ninguna obliga a la declaración de servicios financieros.

> ⚠️ La **prueba abierta** (open testing, con liga pública) sí pasa por revisión y ahí es donde se topa con la política de servicios financieros. Si se quiere reclutar en abierto, la vía es prueba **cerrada** con lista de correos — ver §4.

---

## 4. Si reclutamos testers desde el sitio web

Reclutar en público —no repartir el APK entre conocidos— cambia tres cosas.

**El sitio ya existe: `micopay.com.mx`** (Astro, servido por Cloudflare). Verificado 2026-08-03, incluye:

- Formulario de **lista de espera** ya funcionando (nombre, correo, ciudad, tipo de interés), con Turnstile anti-bots.
- **`/privacy` y `/terms` públicos**, accesibles sin login ni instalación.
- Un aviso de privacidad bien hecho: cita la LFPDPPP, tabla de datos recabados, finalidades primarias y secundarias con opt-out, terceros nombrados (Cloudflare y Mailgun/Sinch) con lo que recibe cada uno, transferencia internacional fundada en el Art. 37, derechos ARCO con plazos de 20/15 días hábiles, retención de 24 meses y referencia al INAI.

Es decir: **el mecanismo de reclutamiento que este documento recomienda ya está construido.** Lo que falta es acotado y está en §4.2 y §4.1.

### 4.1 Protección al consumidor (LFPC / PROFECO) — el riesgo aparece al distribuir la beta

Un sitio público hace **representaciones comerciales** y el riesgo es **publicidad engañosa**.

**Hoy el riesgo es bajo**, y hay que decirlo con justicia: el sitio está planteado como **lista de espera de un producto que aún no abre** ("avisarte cuando MicoPay esté disponible en tu ciudad"), marca CETES/DeFi como "Próximamente" y aclara que el mapa de proveedores es un "ejemplo ilustrativo". Ese encuadre de pre-lanzamiento es normal y defendible.

**El riesgo aparece cuando se empiece a repartir la beta desde ahí.** Verificado 2026-08-03: el sitio **no menciona testnet ni red de prueba en ningún lado** (cero coincidencias de "testnet", "red de prueba", "dinero real"), mientras el copy está en presente —"Cambia USDC por pesos en efectivo", "Llegas, muestras el QR y recibes tus pesos"— y hay una **calculadora de ganancias para comercios** ("Calcula tu ganancia", 100 operaciones/mes, $1,200 MXN promedio).

Mientras es solo lista de espera, eso es marketing de pre-lanzamiento. En el momento en que alguien descarga una app funcional desde ese mismo sitio, asumirá razonablemente que mueve dinero real — y la calculadora de ganancias proyecta ingresos que hoy no se pueden generar.

**Mitigación, visible y no en letra chica, antes de publicar la beta:**

> Beta técnica en **red de prueba**. No se mueve dinero real, los saldos son simulados y los tokens no tienen valor.

Y acotar la calculadora de ganancias como proyección ilustrativa sujeta al lanzamiento real, del mismo modo que ya se hace con el mapa de proveedores.

### 4.2 Datos personales: el aviso del sitio **no cubre la app**

Este es el hueco real, y es más fino que "falta un aviso de privacidad".

El aviso de `micopay.com.mx/privacy` está **acotado deliberadamente al formulario de lista de espera del sitio**. Dice, textual:

> "No recabamos datos personales sensibles […], ni datos financieros o patrimoniales, ni **documentos de identificación oficial**."

Eso es correcto para el sitio. Pero **la app sí recaba todo eso**: ubicación, cámara, teléfono (hasheado) y, al entrar al flujo de KYC, INE, selfie y CURP vía Didit o Etherfuse. Ninguno de esos terceros aparece en el aviso, y la frase de arriba lo contradice de frente.

Consecuencia práctica: **no se puede apuntar la ficha de Play a esa URL tal cual.** Play exige que el aviso describa lo que recaba **la app**, y el formulario de Data Safety tiene que coincidir con él. Un aviso que dice "no recabamos documentos de identificación" junto a una app que manda al usuario a subir su INE es una inconsistencia que un revisor puede detectar — y, peor, es inexacto frente al usuario.

**Lo que falta:**

- [ ] Un aviso **para la app** —sección aparte o documento propio— que nombre a Didit y Etherfuse, la ubicación, la cámara y el teléfono, y explique que el expediente de identidad lo aloja el proveedor (ver pregunta B del dictamen).
- [ ] Rellenar los marcadores `[RAZÓN SOCIAL]` y `[DOMICILIO FISCAL COMPLETO]`, hoy pendientes de la constitución de la sociedad. Play exige un responsable identificable.
- [ ] Sacar `Privacy`/`Terms` de detrás del `ProtectedRoute` en la app (§2), para que dentro del producto también se lean antes de registrarse.

Nota menor: con desconocidos en vez de conocidos sube la probabilidad de solicitudes ARCO reales, y el aviso ya compromete plazos de 20/15 días hábiles. Conviene que alguien sea dueño de ese buzón.

### 4.3 PLD no cambia, pero sí importa cómo se describe

El gatillo del Art. 17 fr. XVI es el intercambio **real con valor**. Reclutar testers para testnet no crea actividad vulnerable: seguimos fuera.

El matiz a tener presente: un sitio público que se ofrece como servicio de cambio efectivo↔cripto deja **registro público de que nos ostentamos como tal**. El brief de Fase 4 ya pregunta por exposición retroactiva (punto 7) y el SAT aplica activamente desde marzo 2026. La diferencia entre *"beta técnica en red de prueba"* y *"cambia tu efectivo por cripto"* no es cosmética — conviene que el sitio diga lo primero.

### 4.4 No mandar desconocidos a instalar por sideload

Poner el APK a descargar del sitio y pedir que activen "orígenes desconocidos" es un antipatrón de seguridad: es precisamente el vector de los troyanos bancarios en México. Para una app financiera, entrenar ese hábito trabaja en contra del producto, y además deja sin canal de actualización.

**El flujo recomendado:**

```
Sitio: formulario de lista de espera (solo correo)
   ↓
Agregar esos correos a la lista de testers de prueba CERRADA en Play
   ↓
Instalan desde Play con su cuenta de Google
```

Sin sideload, con actualizaciones automáticas, firmado, y sin pasar por revisión de producción. La prueba cerrada acepta listas de correo o grupos de Google justo para este caso.

---

## 5. Requisitos previos (aplican a cualquier vía)

- [ ] **Compilar un release firmado.** No repartir el build de debug — trae `debuggable=true`, permite cleartext y confía en CAs de usuario, lo que deja la llave privada Stellar extraíble con `adb`. Detalle en `AUDITORIA_APK_PILOTO_2026-08.md`.
- [ ] **Aviso de privacidad de la app**, publicado en `micopay.com.mx` junto al del sitio (p. ej. `/privacy-app`), nombrando a Didit, Etherfuse, ubicación, cámara y teléfono. El aviso actual del sitio **no sirve** para esto: dice que no se recaban documentos de identificación, lo cual es falso para la app (§4.2). Además, sacar `Privacy`/`Terms` de detrás de `ProtectedRoute`.
- [ ] **Etiquetar visiblemente que es una beta en red de prueba**, para que ningún tester crea que mueve dinero real.
- [ ] **Resolver el dominio de deep links** — hoy el manifiesto apunta a `app.micopay.xyz`, que no resuelve.

---

## 6. Checklist operativo para publicar en Play

### 6.0 Lo que ya cumple (verificado en el repo, no requiere acción)

| Requisito | Estado |
|---|---|
| Target API level reciente | ✅ `targetSdkVersion = 36`, `compileSdkVersion = 36` |
| minSdk soportado | ✅ `24` |
| Llave de firma creada y fuera de git | ✅ `micopay-release.jks` + `keystore.properties`, ambos gitignored |
| Config de release endurecida | ✅ `minifyEnabled`, `shrinkResources`, `debuggable=false`, solo CAs del sistema |

Lo que falta es sobre todo cuenta y contenido, no código.

### 6.1 Cuenta de Play Console

- [ ] Pagar la cuota de desarrollador: **$25 USD**, pago único de por vida.
- [ ] **Decidir personal vs. organización.** Si la sociedad ya se está constituyendo, conviene **organización** (la cuenta queda a nombre de la empresa, no de una persona), pero exige **D-U-N-S** — gratis, vía Dun & Bradstreet, no inmediato: hay que pedirlo con holgura.
- [ ] Completar la **verificación de identidad del desarrollador** que pide Google.

> ⚠️ En cuentas **personales** nuevas, Google exige **12 testers durante 14 días** en prueba cerrada antes de habilitar producción. En cuentas de organización no aplica. Es otro argumento para ir por organización si la sociedad ya viene en camino.

### 6.2 Preparar el binario

- [ ] **Subir el `versionCode`** — hoy está en `1` (`app/build.gradle`); cada subida a Play necesita uno nuevo y no se puede reutilizar.
- [ ] **Compilar un AAB, no un APK.** Play exige App Bundle para apps nuevas:
  ```bash
  npm run build:testnet
  npx cap sync android
  cd android && ./gradlew bundleRelease
  ```
- [ ] **Activar Play App Signing.** Google custodia la llave de firma real y nosotros subimos una llave de *upload*. Importante: **sin esto, perder `micopay-release.jks` significa no poder actualizar la app nunca más**.

### 6.3 Contenido de la ficha (es lo que más tiempo consume)

- [ ] **Aviso de privacidad *de la app* en URL pública** — el del sitio ya es público pero cubre solo la lista de espera (§4.2). Hay que publicar uno que describa la app.
- [ ] **Formulario Data Safety**: declarar ubicación, cámara, teléfono y los terceros (Didit, Etherfuse)
- [ ] **Declaración de servicios financieros** ← el punto delicado por tratarse de cripto
- [ ] Ícono 512×512, gráfico destacado 1024×500, mínimo 2 capturas
- [ ] Clasificación de contenido, países objetivo y descripción

### 6.4 Qué necesita cada pista

| Pista | Requiere | Cuándo |
|---|---|---|
| **Prueba interna** | 6.1 + 6.2 + aviso público | **Empezar aquí** |
| Prueba cerrada | lo anterior + lista de correos | Para reclutar desde el sitio (§4.4) |
| Producción | todo + declaración financiera + dictamen + SPPLD | Después |

### 6.5 Los tres bloqueadores reales

1. **Aviso de privacidad público** — único que bloquea *todas* las pistas, incluida la interna. Es trabajo de código y hosting.
2. **Declaración de servicios financieros** — solo pega en producción; prueba interna y cerrada no la piden. Es justamente la conversación que no conviene abrir sin sociedad ni alta en SPPLD.
3. **D-U-N-S** — solo si se va por cuenta de organización.

**Ruta recomendada:** prueba interna primero. Con 6.1 + 6.2 + el aviso público ya hay gente instalando desde Play, sin revisión y sin tocar la declaración financiera.

---

## 7. Acciones en orden

1. Sacar `Privacy` y `Terms` de detrás del login y completarlos con terceros y permisos.
2. Publicar un aviso **de la app** en `micopay.com.mx` (el sitio ya existe y ya sirve `/privacy` y `/terms`, así que es agregar una página más), y rellenar los marcadores `[RAZÓN SOCIAL]` / `[DOMICILIO FISCAL COMPLETO]` cuando exista la sociedad.
3. Compilar y firmar el binario de release — `assembleRelease` si es APK directo, `bundleRelease` si va a Play (§6.2).
4. Elegir vía según el alcance:
   - grupo chico y conocido → prueba interna, o APK directo;
   - reclutamiento abierto desde el sitio → lista de espera + prueba **cerrada** (§4.4).
5. Etiquetar la app como beta de red de prueba — en la app **y** en el sitio (§4.1).
6. Si hay sitio: redactar el aviso de la lista de espera y cuidar que el copy describa una beta técnica, no un servicio de cambio activo (§4.3).
7. Si se va por Play: abrir la cuenta de Console y preparar la ficha siguiendo el checklist del §6.
8. (Paralelo, sin bloquear) seguir con el alta en SPPLD y el dictamen — son los que habilitan mainnet y, eventualmente, producción en Play.

---

## Notas de calibración

- **Las políticas de Google Play cambian con frecuencia** y la información de esta nota tiene corte a enero de 2026. Verificar los requisitos vigentes directamente en Play Console antes de comprometer fechas — en particular el umbral de testers para cuentas personales, el trámite y tiempos del D-U-N-S, el target API level mínimo exigido y la política de servicios financieros. Los datos del §6.0 sí están verificados contra el repo; los del §6.1–6.3 son requisitos de plataforma y hay que reconfirmarlos.
- **Nada de este documento es asesoría legal.** Es el mapa de qué marcos aplican y qué preguntas hay que hacer. Los criterios los fija el dictamen de Fase 4.
