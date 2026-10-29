# Wave 5 - APK Readiness & Drips Funding Issues

Auditoria validada contra el codigo real de `micopay/frontend` y `micopay/backend` el 25 de mayo de 2026. El objetivo de esta version es acercar la APK a un producto funcional y solido, no solo a una demo presentable.

---

## Resumen ejecutivo

| Area | Estado | Lectura de producto |
|------|--------|---------------------|
| Smart contracts escrow/HTLC | Parcialmente real | Hay contratos y flujo backend, pero parte del backend aun puede caer en `MOCK_STELLAR` y hashes mock. |
| Backend trade state machine | Real pero con gaps | Existen endpoints para create/lock/reveal/complete/cancel/history/audit. Falta cerrar integracion UX y consistencia de roles. |
| Auth JWT + Stellar keypairs | Backend real, APK demo | `/auth/challenge` y `/auth/token` existen, pero la app no tiene login/register/logout real y auto-crea usuarios demo. |
| Persistencia y schema DB | Riesgo P0 | `micopay/sql/init.sql` esta roto/duplicado y no contiene todas las tablas que usa el backend. |
| Merchant discovery | Demo | `ExploreMap.tsx` y `DepositMap.tsx` siguen usando ofertas hardcodeadas. |
| Merchant settings/availability | Incompleto | Hay UI y cliente API, pero faltan rutas/migraciones para que funcione de punta a punta. |
| QR scan -> completar trade | Incompleto | El scanner lee el QR, pero no dispara ningun flujo de backend. Tambien hay confusion entre quien revela y quien completa. |
| Manejo de errores frontend | Parcial | `Profile` y algunos componentes mejoraron, pero `Home`, `History`, `QRReveal` y `App` aun silencian o degradan a demo. |
| Navegacion historial -> detalle | Rota | `TradeDetail.tsx` existe, pero no esta montado en el router principal y el click del historial no navega. |
| Chat usuario/merchant | UI-only | Hay pantallas de chat, pero no hay backend, persistencia ni mensajes reales. |
| Offline-first | No implementado | No hay IndexedDB, service worker ni cola local. Debe ser P2 despues de cerrar gaps basicos. |
| DeFi Blend/CETES | Simulado | Puede quedarse como sandbox, pero debe etiquetarse claramente para no contaminar el producto core. |
| APK release/config | Incompleto | Falta endurecer build variants, env vars, signing, permisos Android y deep-link/release readiness. |
| Soporte/observabilidad | Incompleto | Hay audit trail parcial, pero faltan correlation ids, crash/error reporting y flujo visible de disputa. |
| Trust/reputation | Demo | La UI muestra verificacion, rating e intercambios, pero esos datos no estan respaldados por reputacion real. |

---

## Recomendacion de prioridad

**P0 - APK funcional minima:** Auth real, schema/migraciones, rutas API consistentes, historial->detalle, errores visibles, config/build reproducible.

**P1 - Producto P2P solido:** Merchant discovery real, merchant QR/settlement, merchant settings/availability, chat real basico, notificaciones, soporte y evidencia operacional.

**P2 - Robustez de campo:** Offline queue/sync, Horizon stream listener, DeFi real o feature-gated, reputacion avanzada y hardening de lanzamiento.

Mi recomendacion es no empezar con offline-first ni Horizon streaming como primer drip. Son valiosos, pero son epics. Primero hay que eliminar los puntos donde la APK finge identidad, proveedores, chat o exito.

---

## Issue 1: [P0][Auth] Real Login, Register, Logout & Session Recovery

**Labels:** `auth` `frontend` `backend` `apk` `p0` `wave-5`

### What it solves

La APK todavia inicia en modo demo. En `micopay/frontend/src/App.tsx` se auto-generan dos usuarios (`juan_${ts}` y `farmacia_${ts}`) llamando `registerUser()` al cargar la app. Si falla el backend, el flujo continua como `UI-only mode`.

El backend si tiene base real:

- `POST /auth/challenge`
- `POST /auth/token`
- validacion de firma Stellar cuando `MOCK_STELLAR` esta apagado
- JWT con expiracion
- `SecureStorage` nativo para guardar JSON en Capacitor

Pero la APK no expone un flujo de login/register/logout real.

### Why this is a real gap

Un producto P2P no puede sostener historial, reputacion, cumplimiento ni soporte si cada instalacion genera identidades anonimas nuevas. Esto tambien bloquea recovery de sesion y hace que un 401 se sienta como app rota.

### Technical Scope

- Crear pantallas `Login` y `Register` dentro de `micopay/frontend`, no solo en `apps/web`.
- Registrar usuario con username + Stellar public key real.
- Iniciar sesion via `/auth/challenge` + firma del challenge + `/auth/token`.
- Reemplazar auto-registro demo en `App.tsx`.
- Agregar logout en `Profile.tsx`.
- Guardar token/perfil por rol de forma explicita en SecureStorage.
- Agregar interceptor global en `services/api.ts` para 401: limpiar sesion, guardar redirect pendiente y mandar a login.
- Mantener un modo demo solo bajo flag explicito, no como fallback silencioso.

### Acceptance Criteria

- [ ] La app no auto-crea `juan_*` ni `farmacia_*` en modo normal.
- [ ] Usuario puede registrarse, cerrar la app, abrirla y conservar identidad.
- [ ] Login valida challenge-response con keypair Stellar cuando `MOCK_STELLAR=false`.
- [ ] JWT expirado redirige a login con mensaje "Sesion expirada".
- [ ] Logout limpia SecureStorage/localStorage y reinicia navegacion.
- [ ] Modo demo, si existe, esta detras de `VITE_DEMO_MODE=true` o equivalente.

---

## Issue 2: [P0][Backend/DB] Fix Database Schema, Migrations & Runtime Persistence

**Labels:** `backend` `database` `migrations` `reliability` `p0` `wave-5`

### What it solves

`micopay/sql/init.sql` tiene definiciones duplicadas y sintaxis rota: `CREATE TABLE users` repite columnas dentro del mismo bloque, y `audit_log` se define dos veces con estructuras incompatibles. Ademas, el backend usa `merchant_configs`, `merchant_available`, audit trail y otros campos que no estan consolidados en una migracion unica y confiable.

El backend tambien cae a un store en memoria cuando PostgreSQL no esta disponible (`micopay/backend/src/db/schema.ts`). Eso sirve para demo local, pero no para una APK con datos persistentes.

### Why this is a real gap

Aunque el frontend mejore, una instalacion real puede perder usuarios/trades al reiniciar si queda en memoria. Y si el SQL base no corre limpio, cualquier despliegue nuevo se rompe antes de llegar al producto.

### Technical Scope

- Reparar `micopay/sql/init.sql` para que cree una base limpia desde cero.
- Unificar `audit_log`: separar `account_audit_log` vs `trade_audit_log`, o dejar una sola forma estable.
- Agregar tabla `merchant_configs` con columnas usadas por `merchant.service.ts`.
- Agregar columnas necesarias para availability real: `availability`, `merchant_available`, location, radius, rate, caps.
- Crear migraciones forward-only para ambientes ya existentes.
- Hacer que el backend falle fuerte en production si no hay PostgreSQL, en vez de usar memoria.
- Agregar smoke test de migracion/schema.

### Acceptance Criteria

- [ ] `init.sql` ejecuta desde DB vacia sin errores.
- [ ] Todas las queries de `users`, `trades`, `merchant_configs`, `audit_log`, `processed_tx` tienen tablas/columnas reales.
- [ ] En production no se permite fallback in-memory.
- [ ] Tests cubren registro, crear trade, merchant config, history y audit contra schema real.

---

## Issue 3: [P0][Frontend/API] Normalize API Client Usage and Remove `/api` Path Drift

**Labels:** `frontend` `api-client` `reliability` `p0` `wave-5`

### What it solves

La app mezcla `axios` con `BASE_URL` y `fetch('/api/...')` directo. Ejemplos:

- `Home.tsx` consulta `/api/merchants/me/trades?state=pending`.
- `MerchantInbox.tsx` consulta `/api/merchants/me/trades?state=${state}`.
- `services/api.ts` usa `http.get('/merchants/me/trades...')`.

En Vite/Capacitor, `/api` puede funcionar en dev con proxy, pero romperse en APK si no hay proxy nativo o si `VITE_API_URL` apunta al backend directo.

### Why this is a real gap

Una APK puede verse bien en web local y fallar en dispositivo real por rutas relativas. Esto afecta inbox, notificaciones y estado de merchant justo en el flujo core.

### Technical Scope

- Mover todas las llamadas HTTP a `micopay/frontend/src/services/api.ts`.
- Eliminar `fetch('/api/...')` de pages/components.
- Exponer helpers tipados: `getMerchantTrades`, `getPendingMerchantCount`, etc.
- Agregar Axios interceptor para errores y auth.
- Documentar `VITE_API_URL` para APK/dev/prod.
- Agregar test o check de grep que falle si aparece `fetch('/api`.

### Acceptance Criteria

- [ ] No queda ningun `fetch('/api` en `micopay/frontend/src`.
- [ ] Todos los requests usan `BASE_URL`.
- [ ] APK puede apuntar a backend remoto con `VITE_API_URL` sin proxy.
- [ ] Errores HTTP se transforman en mensajes visibles en espanol.

---

## Issue 4: [P0][Frontend] Trade History -> Trade Detail Navigation

**Labels:** `frontend` `navigation` `ux` `p0` `wave-5`

### What it solves

`History.tsx` recibe `onSelectTrade(trade)` y renderiza items clickeables, pero `App.tsx` todavia tiene `/* deep-link a /trade/:id pendiente */`. `TradeDetail.tsx` existe, pero no esta montado en el router principal. `main.tsx` detecta `/trade/:id` y pasa `initialTradeId`, pero `App` no usa ese prop para renderizar detalle.

### Why this is a real gap

El usuario no puede inspeccionar una operacion pasada, ver hashes, cancelar o pedir soporte desde historial. Eso debilita confianza y soporte operativo.

### Technical Scope

- Agregar ruta `<Route path="/trade/:id" element={<TradeDetail />} />` en `App.tsx`.
- Cambiar `HistoryRoute.onSelectTrade` a `navigate(`/trade/${trade.id}`)`.
- Hacer que el back de `TradeDetail` regrese a `/history` cuando viene de historial.
- Eliminar o implementar correctamente `initialTradeId`.
- Usar token desde contexto/SecureStorage async, no solo `localStorage`, para que funcione en native.

### Acceptance Criteria

- [ ] Tocar un trade en historial abre `/trade/:id`.
- [ ] Detalle fetches fresh data de `GET /trades/:id`.
- [ ] Back vuelve a historial.
- [ ] Funciona en web y APK con SecureStorage.
- [ ] No hay prop `initialTradeId` muerto.

---

## Issue 5: [P0][Frontend/UX] Replace Silent Demo Fallbacks with Recoverable Errors

**Labels:** `frontend` `ux` `reliability` `p0` `wave-5`

### What it solves

Aun hay errores que se silencian o se degradan a demo:

- `Home.tsx` usa `.catch(() => {})` para balance, historial y pending count.
- `History.tsx` usa `.catch(() => {})`.
- `QRReveal.tsx` cae a `MICOPAY:DEMO:mock_secret_for_ui_preview`.
- `QRReveal.tsx` continua a success aunque `completeTrade()` falle.
- `App.tsx` atrapa error de trade y continua como demo.

### Why this is a real gap

En una app financiera, "fallo pero parece exito" es peor que un error visible. Puede hacer que el usuario crea que el efectivo o la liberacion on-chain ya ocurrieron.

### Technical Scope

- Crear un componente/toast de error reutilizable.
- Mapear errores API desde `utils/apiError.ts` en todos los flujos.
- En `QRReveal`, si falla `getSecret`, mostrar estado bloqueante con retry; no usar QR demo en modo normal.
- En `completeTrade`, no navegar a success si el backend falla.
- En `runTradeFlow`, mostrar error y permitir retry.
- Mantener demo fallback solo bajo flag.

### Acceptance Criteria

- [ ] No quedan `.catch(() => {})` en pages.
- [ ] No se navega a success si `completeTrade` falla.
- [ ] QR demo no aparece en modo normal.
- [ ] Errores de red/401/409/500 se muestran en espanol con accion de retry o soporte.

---

## Issue 6: [P1][Backend/Frontend] Real P2P Merchant Discovery - Replace Hardcoded Offers

**Labels:** `feature` `frontend` `backend` `p2p` `p1` `wave-5`

### What it solves

`ExploreMap.tsx` usa `DEFAULT_OFFERS` con merchants ficticios. `DepositMap.tsx` hardcodea "Tienda Don Pepe" y "Usuario @ana_m". Ninguna pantalla consulta proveedores reales.

### Why this is a real gap

La propuesta de valor de MicoPay depende de matching P2P real. Sin discovery real, el usuario siempre esta interactuando con una maqueta.

### Technical Scope

- Crear `GET /merchants/available?lat&lng&radius_km&amount_mxn&flow`.
- Persistir location, availability, rate y limites del merchant.
- Ordenar por distancia haversine y filtrar por monto/cap/disponibilidad.
- Reemplazar arrays estaticos en `ExploreMap.tsx` y `DepositMap.tsx`.
- Agregar loading, empty state, permission denied location state.
- Hacer que `onSelectOffer(offerId)` use el `seller_id` real, no un id ficticio.

### Acceptance Criteria

- [ ] Un merchant registrado aparece en mapa cercano.
- [ ] No queda data de ofertas hardcodeada.
- [ ] Seleccionar una oferta crea trade contra el merchant real.
- [ ] Empty state cuando no hay liquidez en rango.

---

## Issue 7: [P1][Merchant] Availability, Settings & Onboarding End-to-End

**Labels:** `merchant` `frontend` `backend` `settings` `p1` `wave-5`

### What it solves

Hay piezas sueltas:

- `MerchantSettings.tsx` existe, pero no esta montado en `App.tsx`.
- `services/api.ts` expone `setAvailability('/users/me/availability')`, pero backend no tiene esa ruta.
- `patchMerchantAvailability('/users/me')` tampoco coincide con `users.ts`, que no define `PATCH /users/me`.
- `merchant.service.ts` usa `merchant_configs`, pero el schema inicial no la crea.
- `trade.service.ts` lee `seller.availability`, pero el query solo pide `id, stellar_address`; por eso la disponibilidad no bloquea realmente nuevos trades.

### Why this is a real gap

Un merchant no puede pausar operaciones, cambiar comision ni controlar limites desde la APK de forma confiable. Eso afecta seguridad operativa y cancelaciones.

### Technical Scope

- Montar `MerchantSettings` en rutas y nav.
- Crear `PATCH /users/me/availability` o alinear el cliente con una ruta existente.
- Agregar columna `availability` con enum `online/offline/paused`.
- Corregir `createTrade()` para leer disponibilidad real del seller.
- Persistir rate/min/max/daily cap en `merchant_configs`.
- Mostrar banner de availability y pending sync si falla red.

### Acceptance Criteria

- [ ] Merchant puede pausar/reanudar desde APK.
- [ ] Merchant puede editar comision y limites.
- [ ] Crear trade falla con mensaje claro si merchant esta offline/paused.
- [ ] Settings persisten despues de reiniciar backend/app.

---

## Issue 8: [P1][QR/Settlement] Fix QR Role Model and Merchant Scan Completion

**Labels:** `qr` `settlement` `frontend` `backend` `p1` `wave-5`

### What it solves

`MerchantInbox.tsx` escanea QR y solo muestra el payload raw. No parsea trade id, no valida estado, no llama backend.

Ademas, el modelo actual del backend dice:

- seller llama `lock`
- seller llama `reveal`
- seller puede ver secret
- buyer llama `complete`

Pero la UX descrita para merchant scan sugiere que el merchant escanea un QR del buyer y completa el trade. Hay que decidir y cerrar un unico modelo de roles antes de implementar.

### Why this is a real gap

El flujo de cash-out no esta completo desde ambos lados. Hoy la app puede mostrar success desde el lado buyer aunque el merchant scanner nunca haya participado.

### Technical Scope

- Definir contrato UX: quien muestra QR, quien escanea, quien confirma efectivo y quien llama `complete`.
- Si merchant escanea: crear endpoint seguro para que seller envie payload firmado/secret y el backend libere solo si corresponde.
- Si buyer completa: remover expectativa de merchant scan como paso requerido y convertir scanner en "verificar entrega".
- Parsear payloads `MICOPAY:*` y `claim_url`.
- Mostrar confirmacion con monto, counterpart y estado.
- Mostrar errores por QR invalido, expirado, trade ya completado o usuario no participante.

### Acceptance Criteria

- [ ] Scanner no muestra payload raw en modo normal.
- [ ] QR escaneado produce una pantalla de confirmacion.
- [ ] El backend valida participante, estado y expiracion.
- [ ] La app solo muestra success despues de respuesta backend real con `release_tx_hash`.

---

## Issue 9: [P1][Chat] Real Buyer-Merchant Chat Backend

**Labels:** `chat` `frontend` `backend` `p2p` `p1` `wave-5`

### What it solves

El resumen ejecutivo marcaba chat como gap, pero el reporte anterior no tenia issue. `ChatRoom.tsx` y `DepositChat.tsx` son UI-only; no hay endpoints de mensajes, persistencia, delivery ni asociacion a trade.

### Why this is a real gap

En cash P2P, el chat resuelve ubicacion exacta, tiempos, prueba social y soporte. Sin chat real, el usuario depende de pantallas estaticas.

### Technical Scope

- Crear tablas `trade_messages` con `trade_id`, `sender_id`, `body`, `created_at`, `read_at`.
- Endpoints:
  - `GET /trades/:id/messages`
  - `POST /trades/:id/messages`
  - opcional `POST /trades/:id/messages/read`
- Permitir solo participantes del trade.
- Polling corto o WebSocket/SSE simple para nuevos mensajes.
- Reemplazar mensajes hardcodeados en `ChatRoom` y `DepositChat`.
- Agregar estados offline/error y empty state.

### Acceptance Criteria

- [ ] Buyer y merchant pueden enviarse mensajes ligados a un trade real.
- [ ] Mensajes persisten despues de recargar.
- [ ] No participante recibe 403.
- [ ] Chat muestra errores y retry si falla red.

---

## Issue 10: [P1][Frontend/Backend] De-Demo Success Screens and Transaction Evidence

**Labels:** `frontend` `backend` `trust` `p1` `wave-5`

### What it solves

`SuccessScreen` recibe defaults demo cuando falta trade real (`id: 'demo'`, status `completed`, hashes null). `Home.tsx` oculta hashes que empiezan con `mock`, pero la app aun puede mostrar balances y success como si fueran reales.

### Why this is a real gap

Un producto financiero necesita evidencia de estado: trade id real, hash de lock/release cuando aplique, estado backend y copy honesto si es testnet/mock.

### Technical Scope

- Bloquear success si no hay `activeTrade` real en modo normal.
- Mostrar "Testnet" o "Simulado" de forma explicita cuando `MOCK_STELLAR=true`.
- Agregar recibo con trade id, estado, lock hash, release hash, timestamps y soporte.
- Evitar hardcoded `agentName` en success.
- Cargar detalles desde `GET /trades/:id` antes de mostrar recibo final.

### Acceptance Criteria

- [ ] Success nunca usa `id: demo` en modo normal.
- [ ] Recibo final contiene trade id real y estado backend.
- [ ] Si hash es mock, la UI lo etiqueta como simulacion.
- [ ] Agent name proviene del merchant real.

---

## Issue 11: [P2][Frontend] Offline-First Queue for Merchant Mutations

**Labels:** `offline-first` `frontend` `merchant` `p2` `wave-5`

### What it solves

No hay IndexedDB, service worker ni cola local. Para zonas con cobertura intermitente, un merchant que cambia disponibilidad o ajustes puede fallar sin recuperacion.

### Recommendation

No hacerlo como primer drip. Antes hay que cerrar `Issue 7` con availability/settings reales online. Despues, implementar offline en una superficie acotada: disponibilidad y ajustes de merchant, no todo el trade lifecycle.

### Technical Scope

- Cola local IndexedDB para mutations idempotentes.
- Estado `pending_sync` visible.
- Flush al reconectar.
- Conflictos simples: server wins para trades, client retry para settings.
- No permitir operaciones financieras criticas offline sin confirmacion del backend.

### Acceptance Criteria

- [ ] Cambiar availability en modo avion no crashea.
- [ ] Usuario ve "pendiente de sincronizar".
- [ ] Al reconectar, la cola se envia y se limpia.
- [ ] Conflictos se muestran con accion clara.

---

## Issue 12: [P2][Backend/Network] Horizon/Soroban Event Listener as Latency Upgrade

**Labels:** `backend` `stellar` `infrastructure` `p2` `wave-5`

### What it solves

El backend aun depende de confirmaciones/polling y el frontend tambien usa polling para estados activos. Un listener de eventos bajaria latencia percibida.

### Recommendation

Mantenerlo P2. Antes de reemplazar polling, confirmar exactamente que eventos Soroban se pueden observar para el contrato escrow y como mapearlos a `trade_id`. El polling debe quedarse como fallback.

### Technical Scope

- Servicio background con reconnect/backoff.
- Dedupe con `processed_tx`.
- Dispatcher interno a DB y notificaciones frontend.
- Polling fallback para stream caido.
- Tests de idempotencia y reconexion.

### Acceptance Criteria

- [ ] Status update llega a frontend en menos de 1 segundo tras confirmacion cuando stream esta sano.
- [ ] Reconnect automatico funciona.
- [ ] Eventos duplicados no duplican cambios.
- [ ] Polling fallback sigue disponible.

---

## Issue 13: [P2][DeFi] Feature-Gate or Productize Blend/CETES

**Labels:** `defi` `frontend` `backend` `product` `p2` `wave-5`

### What it solves

`defi.ts`, `CETESScreen.tsx` y `BlendScreen.tsx` manejan resultados simulados/mock. Esto no bloquea el P2P core, pero puede confundir a usuarios o reviewers si aparece como producto real.

### Technical Scope

- Feature flag para ocultar DeFi en APK publica si sigue simulado.
- Etiquetas claras "Simulado/Testnet" si se mantiene visible.
- Separar demo investment flows del flujo core de cash-in/cash-out.
- Definir criterio de produccion antes de promocionarlo en home/explore.

### Acceptance Criteria

- [ ] Ningun flujo simulado se presenta como dinero real.
- [ ] DeFi se puede apagar por config.
- [ ] Copy y recibos distinguen testnet/mock/mainnet.

---

## Issue 14: [P0][Auth] Stellar Keypair Management on Device

**Labels:** `auth` `security` `frontend` `p0` `wave-5`

### What it solves

El Issue 1 asume que el usuario puede firmar un challenge con su keypair Stellar, pero la app nunca genera ni almacena una clave privada. `SecureStorage` guarda el JWT, no el keypair. El backend actualmente salta la verificacion de firma cuando `MOCK_STELLAR=true` (`auth.ts` lineas 93–115), lo que significa que el challenge-response real nunca ha sido ejercido desde la APK.

Sin keypair en el dispositivo, el auth real con Stellar es imposible y el Issue 1 no puede completarse.

### Why this is a real gap

Es el prerequisito silencioso de todo el sistema de identidad. Un usuario sin keypair no puede firmar challenges, no puede participar en HTLC con su propia direccion, y no tiene identidad on-chain real.

### Technical Scope

- Al registrarse, generar un keypair Stellar (`Keypair.random()`) en el dispositivo.
- Guardar la clave privada cifrada en `SecureStorage` nativo — nunca en localStorage.
- Mostrar la clave publica al usuario como su "direccion" y ofrecer opcion de exportar/importar keypair existente.
- Usar la clave privada almacenada para firmar el challenge en `/auth/token`.
- Nunca enviar la clave privada al backend.
- Advertir al usuario que sin backup del keypair perdera acceso.

### Acceptance Criteria

- [ ] Al registrarse se genera y persiste un keypair en SecureStorage nativo.
- [ ] La firma del challenge usa la clave privada almacenada, no un mock.
- [ ] `MOCK_STELLAR=false` funciona end-to-end desde la APK.
- [ ] La clave privada nunca viaja en ningun request HTTP.
- [ ] Usuario puede exportar su clave publica desde Profile.

---

## Issue 15: [P1][Mobile] Push Notifications for Merchant Incoming Trades

**Labels:** `mobile` `notifications` `merchant` `p1` `wave-5`

### What it solves

Cuando un buyer crea un trade con un merchant, el merchant no recibe ninguna notificacion. Para ver trades nuevos, tiene que abrir la app y navegar a `MerchantInbox.tsx`. No hay Capacitor Push Notifications configurado, no hay FCM token registrado, no hay endpoint de webhook en el backend.

Un comerciante en un tianguis no puede tener la pantalla encendida esperando. Sin push, el merchant inbox es inutilizable en produccion.

### Technical Scope

- Instalar y configurar `@capacitor/push-notifications`.
- Al iniciar sesion como merchant, registrar FCM token en el backend (`PATCH /users/me/push_token`).
- En `trade.service.ts`, al crear un trade, disparar notificacion push al seller con monto, buyer username y trade id.
- Agregar columna `push_token` a tabla `users` en schema.
- Al tocar la notificacion, abrir directamente `MerchantInbox` o el trade especifico.
- Manejar permisos de notificacion en Android con racional explicativo.

### Acceptance Criteria

- [ ] Merchant recibe push notification cuando se crea un trade para el.
- [ ] Tocar la notificacion abre el trade correspondiente en la app.
- [ ] Si el usuario niega permisos, la app funciona sin crash y muestra alternativa de polling.
- [ ] Push token se renueva si caduca o cambia.

---

## Issue 16: [P1][Mobile] Android App Links for External claim_url Deep Linking

**Labels:** `mobile` `deeplink` `android` `p1` `wave-5`

### What it solves

La ruta `/claim/:id` funciona cuando la app ya esta abierta, pero si un usuario recibe la `claim_url` por WhatsApp, SMS o Telegram y la toca en un dispositivo con MicoPay instalado, Android abre el browser en lugar de la app. `AndroidManifest.xml` no tiene `intent-filter` configurado con `android:scheme` y `android:host` para interceptar estos URLs.

Esto rompe el flujo core del protocolo: agentes de IA generan `claim_url`s que los productores rurales deben poder abrir directamente en MicoPay desde cualquier mensajeria.

### Technical Scope

- Agregar `intent-filter` en `android/app/src/main/AndroidManifest.xml` para el dominio de la app con scheme `https` y el path `/claim/`.
- Configurar Capacitor App plugin (`@capacitor/app`) para capturar el URL en `appUrlOpen`.
- En `App.tsx`, manejar el evento `appUrlOpen` y navegar a `/claim/:id` con el id extraido.
- Configurar Digital Asset Links (`/.well-known/assetlinks.json`) en el servidor para verificacion de Android App Links.
- Probar el flujo completo: link en WhatsApp → tap → MicoPay abre en `/claim/:id`.

### Acceptance Criteria

- [ ] Tap en `claim_url` desde WhatsApp abre MicoPay directamente en la pantalla de claim.
- [ ] Si la app no esta instalada, el browser maneja el URL normalmente.
- [ ] `assetlinks.json` valido en el servidor.
- [ ] Funciona con app en background y con app cerrada.

---

## Issue 17: [P1][UX/Finance] Expired Trade Refund Flow

**Labels:** `ux` `frontend` `backend` `finance` `p1` `wave-5`

### What it solves

`TradeDetail.tsx` renderiza el estado `expired` como una badge de color, pero no hay boton ni flujo que permita al usuario recuperar sus fondos. El contrato Soroban tiene `refund()` permisionless y el backend tiene `POST /trades/:id/cancel` con logica de refund, pero no hay camino visible desde la UI para activarlos.

Un usuario con un trade expirado ve su dinero en estado `expired` sin ninguna accion disponible. En una app financiera, esto es dinero atrapado sin salida visible.

### Technical Scope

- En `TradeDetail.tsx`, cuando `trade.status === 'expired'` y el usuario es el buyer, mostrar boton "Recuperar fondos".
- El boton llama `POST /trades/:id/cancel` que internamente llama `refund()` en el contrato Soroban.
- Mostrar pantalla de confirmacion con monto a recuperar y advertencia de fee de gas.
- Mostrar estado `refunded` con tx hash una vez completado.
- Si el refund falla (trade no expirado aun, ya reclamado), mostrar error especifico.
- Agregar el estado `refunded` al historial con icono y copy diferenciado de `completed`.

### Acceptance Criteria

- [ ] Trade en estado `expired` muestra boton "Recuperar fondos" para el buyer.
- [ ] Flujo completa llamando `refund()` en Soroban y actualiza estado a `refunded`.
- [ ] Tx hash del refund visible en detalle.
- [ ] Errores de refund (ya reclamado, no expirado) muestran mensaje claro.
- [ ] Estado `refunded` aparece en historial con distincion visual.

---

## Issue 18: [P0][Mobile/Config] APK Environment & Build Variant Readiness

**Labels:** `mobile` `config` `release` `p0` `wave-5`

### What it solves

La APK depende de configuracion que hoy puede variar entre web local, dev server, testnet y build nativo: `VITE_API_URL`, `MOCK_STELLAR`, contract IDs, Stellar RPC, `ESCROW_CONTRACT_ID`, `MXNE_CONTRACT_ID`, Android permissions y endpoints remotos. Si un valor queda mal, la app puede compilar y abrir, pero fallar en login, trades, inbox o QR.

### Why this is a real gap

Una APK funcional no solo es codigo React. Necesita builds reproducibles para dev/testnet/prod y una forma clara de saber contra que backend/contratos esta operando.

### Technical Scope

- Definir build variants: `dev`, `testnet`, `prod`.
- Documentar y validar env vars obligatorias para frontend/backend.
- Mostrar en una pantalla interna o debug overlay el ambiente activo, red Stellar y backend URL.
- Agregar startup validation para contract IDs y API URL.
- Alinear CORS/backend URL para APK nativa, no solo Vite proxy.
- Crear checklist de release APK: version, signing, backend target, flags mock/demo.

### Acceptance Criteria

- [ ] APK testnet se construye con `VITE_API_URL` remoto sin depender de proxy local.
- [ ] La app no arranca en modo normal si faltan config critica de backend/contratos.
- [ ] `MOCK_STELLAR`/demo mode se muestra claramente cuando esta activo.
- [ ] Existe checklist reproducible para generar una APK release candidate.

---

## Issue 19: [P0][QA] End-to-End Smoke Test for Core P2P Flow

**Labels:** `qa` `e2e` `frontend` `backend` `p0` `wave-5`

### What it solves

Hay tests unitarios y piezas aisladas, pero falta una prueba que valide el flujo que importa para producto: registro/login, merchant disponible, buyer crea trade, lock, reveal, complete, historial y detalle.

### Why this is a real gap

Sin smoke test, cada issue puede cerrar localmente y aun asi romper la experiencia completa de APK. Para funding y reviewers, un flujo core verificable vale mas que muchas afirmaciones sueltas.

### Technical Scope

- Crear script/checklist automatizable para backend + frontend.
- Seed controlado de buyer/merchant.
- Ejecutar flujo:
  - register/login
  - merchant settings/availability
  - discovery
  - create trade
  - lock/reveal/complete
  - history/detail
- Validar estados y hashes esperados.
- Correr en CI o como comando local documentado.

### Acceptance Criteria

- [ ] Un comando o checklist reproduce el flujo P2P feliz de punta a punta.
- [ ] Falla si auth, DB, API path, trade state o history/detail se rompen.
- [ ] Produce evidencia clara: logs, status final y trade id.
- [ ] Puede correrse contra modo testnet/mock de forma explicita.

---

## Issue 20: [P1][Support] Trade Dispute & Help Flow

**Labels:** `support` `disputes` `frontend` `backend` `p1` `wave-5`

### What it solves

La app tiene algunos links de soporte, pero no un flujo real de disputa ligado a un trade. Si el merchant no entrega efectivo, si el QR falla, si el buyer confirma por error o si el trade queda bloqueado, el usuario no tiene una accion estructurada dentro de la APK.

### Why this is a real gap

En P2P cash, los edge cases no son raros; son parte del producto. Sin disputa/reportes, soporte no puede priorizar casos ni reconstruir contexto.

### Technical Scope

- Crear tabla `trade_disputes` con `trade_id`, `opened_by`, `reason`, `description`, `status`, timestamps.
- Endpoints:
  - `POST /trades/:id/disputes`
  - `GET /trades/:id/disputes`
- UI en `TradeDetail` para "Reportar problema".
- Razones tipadas: merchant no llego, efectivo incorrecto, QR invalido, pago no liberado, otro.
- Incluir trade state, hashes y audit trail en payload de soporte.
- Mostrar estado de disputa en detalle e historial.

### Acceptance Criteria

- [ ] Usuario puede abrir disputa desde un trade real.
- [ ] Solo participantes pueden abrir/ver disputa.
- [ ] Soporte recibe trade id, estado, actor y razon.
- [ ] La UI muestra estado de disputa y siguiente paso.

---

## Issue 21: [P1][Observability] Correlation IDs, Error Reporting & Trade Audit Visibility

**Labels:** `observability` `support` `backend` `frontend` `p1` `wave-5`

### What it solves

El backend tiene logs y audit trail parcial, pero los errores de la APK no tienen correlation id visible para el usuario ni un rastro facil de unir entre frontend, backend y trade id.

### Why this is a real gap

Cuando un usuario dice "mi dinero se quedo atorado", soporte necesita buscar por trade id, user id, request id y estado. Sin observabilidad, cada incidente se vuelve investigacion manual.

### Technical Scope

- Generar `x-request-id`/correlation id por request.
- Incluir correlation id en respuestas de error.
- Mostrar codigo corto de soporte en errores criticos.
- Loggear transiciones de trade con actor, estado anterior/siguiente y tx hash.
- Agregar crash/error reporting para APK o endpoint interno de client errors.
- Exponer audit trail de trade para soporte/admin o vista debug.

### Acceptance Criteria

- [ ] Cada error API tiene correlation id.
- [ ] La APK muestra codigo de soporte en errores criticos.
- [ ] Logs backend permiten buscar por trade id y request id.
- [ ] Transiciones financieras quedan auditadas de forma consistente.

---

## Issue 22: [P1][Mobile/Permissions] Android Permissions UX for Camera, Location and Notifications

**Labels:** `mobile` `permissions` `ux` `android` `p1` `wave-5`

### What it solves

La APK depende de camara para QR, ubicacion para discovery y notificaciones para merchants, pero falta una experiencia completa de permisos: denied, permanently denied, rationale, fallback y reintento.

### Why this is a real gap

En Android, un permiso negado puede hacer que una feature core parezca rota. La app debe explicar por que lo necesita y ofrecer camino alterno.

### Technical Scope

- Auditar permisos en `AndroidManifest.xml`.
- Crear componentes de permission state para camara, ubicacion y push.
- Manejar `denied`, `prompt`, `granted`, `permanently denied`.
- Agregar CTA para abrir settings del sistema cuando aplique.
- Fallbacks:
  - QR manual/paste code si camara falla.
  - busqueda por zona si ubicacion falla.
  - polling/inbox si push falla.

### Acceptance Criteria

- [ ] Negar camara no crashea scanner y muestra alternativa.
- [ ] Negar ubicacion muestra busqueda manual/empty state util.
- [ ] Negar push mantiene inbox funcional.
- [ ] La APK puede recuperar permisos desde settings.

---

## Issue 23: [P1][Risk] Abuse Controls, Device Limits and P2P Safety Rules

**Labels:** `risk` `security` `backend` `p2p` `p1` `wave-5`

### What it solves

Hay rate limits basicos, pero un marketplace P2P necesita reglas de seguridad adicionales: self-trading, cuentas desechables, merchants abusivos, spam de trades, multiples cancelaciones y limites por device/IP.

### Why this is a real gap

El dinero en efectivo atrae abuso operacional. Sin controles minimos, el sistema puede ser explotado o volverse inutil por spam antes de tener volumen real.

### Technical Scope

- Bloquear self-trading y redes de cuentas relacionadas cuando sea detectable.
- Limites diarios por usuario, merchant, device/IP y monto.
- Cooldowns por cancelaciones repetidas.
- Flags de riesgo por disputes, failed trades y comportamiento anomalo.
- Endpoint/admin view minimo para desactivar merchant o usuario.
- Mensajes claros cuando una accion se bloquea por limite/riesgo.

### Acceptance Criteria

- [ ] Rate limits cubren create trade, auth, messages y disputes.
- [ ] Merchant con demasiadas cancelaciones/disputes puede pausarse.
- [ ] Usuario ve mensaje claro si excede limite.
- [ ] Eventos de riesgo quedan auditados.

---

## Issue 24: [P1][Privacy] Data Deletion Completeness and PII Minimization

**Labels:** `privacy` `compliance` `backend` `frontend` `p1` `wave-5`

### What it solves

Existe eliminacion de cuenta, pero hay que validar si realmente anonimiza o elimina datos derivados: wallets, trades, messages, disputes, push tokens, logs, phone hashes y audit trail.

### Why this is a real gap

Para una APK publica, borrar cuenta no puede ser solo cambiar `deleted_at`. Debe haber una politica consistente: que se conserva por obligaciones operativas/auditoria y que se anonimiza.

### Technical Scope

- Auditar `account.service.ts` contra todas las tablas actuales/futuras.
- Anonimizar username, stellar address visible, phone hash y push token.
- Definir retencion de trades/audit por integridad financiera.
- Borrar mensajes o anonimizar sender display.
- Actualizar Privacy copy si aplica.
- Agregar test de delete account verificando tablas relacionadas.

### Acceptance Criteria

- [ ] Delete account anonimiza PII en users/wallets/messages/disputes.
- [ ] Push token se elimina.
- [ ] Trades conservan integridad financiera sin exponer PII innecesaria.
- [ ] Test automatizado valida la eliminacion/anonimizacion.

---

## Issue 25: [P2][Trust] Real Merchant Reputation and Verification Data

**Labels:** `trust` `reputation` `merchant` `p2` `wave-5`

### What it solves

La UI muestra merchants "verificados", ratings y numero de intercambios, pero hoy esos datos aparecen hardcodeados en ofertas demo. Si se muestran en produccion sin respaldo, erosionan confianza.

### Why this is a real gap

La reputacion es una promesa de seguridad. Debe venir de datos reales o no mostrarse.

### Technical Scope

- Crear modelo de reputacion basico: completed trades, cancelled trades, disputes, average response time.
- Agregar campo `verified_at`/`verification_level` para merchants.
- Calcular rating solo con datos reales.
- Reemplazar copy hardcoded de "verificado" y stars.
- Ocultar reputacion hasta tener suficiente muestra.

### Acceptance Criteria

- [ ] Ratings/intercambios provienen de backend.
- [ ] Merchant verificado tiene estado real en DB.
- [ ] UI no muestra estrellas fake.
- [ ] Reputation se actualiza al completar/cancelar trades.

---

## Issue 26: [P2][UX] Spanish Copy, Financial Error Taxonomy and Localization Consistency

**Labels:** `ux` `localization` `errors` `p2` `wave-5`

### What it solves

Hay mezcla de espanol/ingles, mensajes tecnicos y copy de demo. Para usuarios rurales o merchants no tecnicos, los errores deben ser claros, consistentes y accionables.

### Why this is a real gap

Un error como "ConflictError" o "Backend not available" no ayuda a recuperar confianza. En dinero, el copy debe decir que paso, si los fondos estan seguros y que hacer.

### Technical Scope

- Crear taxonomia de errores financieros en espanol.
- Mapear HTTP/status/domain errors a mensajes de UX.
- Unificar terminos: trade/operacion/intercambio, merchant/agente/comerciante, escrow/garantia.
- Revisar pantallas core: auth, map, chat, QR, detail, refund, dispute.
- Preparar estructura para futura i18n si aplica.

### Acceptance Criteria

- [ ] Errores core tienen mensaje en espanol claro y accionable.
- [ ] No aparece copy tecnico al usuario final.
- [ ] Terminos financieros son consistentes en toda la APK.
- [ ] Mensajes criticos indican si los fondos estan seguros.

---

## Issue 27: [P2][Release] Android Release Hardening, Signing and Store Readiness

**Labels:** `android` `release` `security` `p2` `wave-5`

### What it solves

El repo tiene proyecto Android, iconos y splash, pero falta un issue explicito de hardening de release: signing, versioning, ProGuard/R8, network security config, backup rules, package metadata y store compliance.

### Why this is a real gap

Una APK funcional para testers no es lo mismo que una APK lista para distribucion. El hardening evita filtraciones, errores de upgrade y rechazos de store.

### Technical Scope

- Configurar signing release con keystore seguro.
- Definir `versionCode`/`versionName` strategy.
- Revisar ProGuard/R8 y minification para plugins Capacitor.
- Network security config: permitir solo HTTPS en prod.
- Deshabilitar backups sensibles si aplica.
- Revisar app name, icon, splash, permissions copy y store listing.
- Generar APK/AAB release candidate reproducible.

### Acceptance Criteria

- [ ] Release build firmado se genera de forma reproducible.
- [ ] Versioning permite upgrades limpios.
- [ ] Prod usa HTTPS y no endpoints locales.
- [ ] No se respaldan secrets/JWT/keypairs en backups inseguros.
- [ ] Checklist de store readiness completo.

---

## Notas de auditoria

- `apps/web` tiene una `LoginPage`, pero la APK vive en `micopay/frontend`. No cuenta como auth implementada para APK hasta integrarla o migrarla.
- El reporte anterior tenia 7 issues. Esta auditoria los reorganiza en 27 issues porque habia gaps separados que no conviene mezclar: schema DB, API path drift, merchant settings/availability, chat, success receipts, mobile readiness, soporte, risk y release hardening.
- Los issues grandes anteriores de offline-first y Horizon streaming se conservan como P2.
- Issue 14 (keypair) es prerequisito silencioso del Issue 1 — deben implementarse juntos o en ese orden.
