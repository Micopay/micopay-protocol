# Pendientes · 2026-09-24

Estado al cierre del 24 de septiembre de 2026. Rama `feat/red-1-onboarding-interno`, con push hasta `42d859a`.
Actualizado el 2026-09-25; ver el final del documento.

---

## 0. Priorización (propuesta del 2026-09-25, para revisión de Codex)

Las secciones 1 a 8 siguen siendo el detalle. Aquí va todo en un solo orden.

**Criterios:**
- **Importancia:** qué pasa si no se hace. Dinero atorado o una demo que falla pesa más que un texto.
- **Utilidad:** a quién le sirve ya (demo, agentes reales, equipo).
- **Prioridad:** importancia × utilidad, ajustada por dependencias y fechas.
- **Dueño:** *Interno* si toca dinero, escrow, KYC, AWS o necesita decisión de Eric. *Drips* solo si es complejidad baja o media y no toca dinero (en la wave 8, los issues `low` salieron limpios y los `high` volvieron rotos).

**Prioridades:** P0 = bloquea la demo o deja operaciones atoradas. P1 = necesario para operar con agentes reales o tiene fecha. P2 = mejora importante sin urgencia. P3 = cuando haya tiempo.

| # | Pendiente | Sección | Prioridad | Dueño | Esfuerzo | Depende de |
|---|---|---|---|---|---|---|
| 1 | Depósito atorado con agente real: falta "Recibí el efectivo" (`reveal`) en `LockedView` | 2 | **P0** | Interno | Bajo | — |
| 2 | Mergear #390 (aviso del depósito) | 2 | **P0** | Interno | Nulo | — |
| 3 | QR del depósito decorativo: decidir quitarlo (recomendado) o hacerlo real | 2 | **P0** | Interno (decisión) | Bajo si se quita | — |
| 4 | "Completed" en inglés en el recibo | 2 | P0 | Interno, en el lote del APK | Bajo | — |
| 5 | Compilar el APK nuevo y volver a probar retiro y depósito en el teléfono | 2 | **P0** | Interno | Medio | 1–4 |
| 6 | Créditos de AWS se acaban ~2026-10-15; decidir el recorte (ALB) | 5 | **P1** (fecha) | Interno | Medio | — |
| 7 | Alarma `RunningTaskCount < 1` antes del próximo despliegue | 5 | P1 | Interno | Bajo | — |
| 8 | Desplegar `main` (con KYC-1): hoy `main` va por delante de producción | 1 | P1 | Interno | Medio | 7 |
| 9 | Configurar Didit en producción (secretos, webhook) y probar el alta de agente en el teléfono | 1 | P1 | Interno | Medio | 8 |
| 10 | Agente declara qué flujos atiende; la búsqueda filtra por `flow` | 8 | P2 | Interno (diseño) → posible Drips | Medio | decisión 2 de la sección 6 |
| 11 | Búsqueda de depósitos tiene en cuenta el saldo en cripto del agente | 8 | P2 | Interno | Medio | 10 |
| 12 | Comisiones H5: auditoría de Codex y las 3 decisiones abiertas | 6 | P2 | Interno | Alto | pausado por Eric |
| 13 | Vitest bloqueante en el CI | 5 | P2 | Interno | Bajo | — |
| 14 | Comparar las 5 ramas conservadas (§4 del plan de GitHub) y borrar o rescatar | 7 | P2 | Interno | Medio | — |
| 15 | Botón "Abrir chat con el vendedor" de `LockedView` sin `onClick` | 2 | P2 | **Drips** (o interno si entra en el APK) | Bajo | — |
| 16 | Textos sin traducir en toda la app | 7 | P3 | **Drips** | Bajo–medio | — |
| 17 | Scripts de prueba del backend en Windows (`cross-env`) | 7 | P3 | **Drips** | Bajo | — |
| 18 | Reforzar las 5 pruebas de discovery que no prueban nada | 7 | P3 | **Drips** | Bajo–medio | — |
| 19 | `cashHandoff.test` falla contra PostgreSQL | 7 | P3 | **Drips** | Medio | — |
| 20 | Triage de micopaybridge (GrantFox): issues #14, #18, #19, #32, #33 y PRs #25, #26, #29, #41 | 7 | P3 | Interno (decisión) | Medio | — |
| 21 | Efectivo disponible del agente y rebalanceo (¿enlazar con Etherfuse?) | 8 | P3 | Interno (exploración) | Alto | 10, 11 |

**Candidatos a issues de Drips:** 15, 16, 17, 18 y 19. El 10 podría serlo cuando el diseño esté decidido. Ninguno toca dinero, escrow ni KYC.

**Verificado en el código el 2026-09-25:** 1 (`revealTrade` solo se llama desde `QRReveal`), 15 (el botón no tiene `onClick`, `TradeDetail.tsx`) y 17 (`backend/package.json` no usa `cross-env`). El resto viene de la revisión del 2026-09-24 y no se volvió a comprobar; el 19 en particular conviene reproducirlo antes de publicar el issue.

**Preguntas para Codex:**
1. ¿El orden P0 → P1 es correcto, o el recorte de AWS (6) debería ir antes que el APK por la fecha?
2. ¿Hay algo marcado como Drips que en realidad toque dinero o necesite contexto de fundador?
3. ¿Los candidatos a Drips alcanzan para una wave, o conviene sumar el 10 ya con el diseño cerrado?

---

## 1. Didit (KYC)

### Lo que ya está hecho y desplegado

**Backend** (en `main` y en producción, `v13`):
- Integración con Didit: crea la sesión y manda a la persona a la página de Didit (`services/didit.service.ts`, desde el 2026-07-22).
- Rutas: `POST /defi/kyc/start?provider=didit`, consulta de estado y webhook `/defi/kyc/webhook/didit` con verificación de firma.
- Tabla `kyc_didit_sessions` y niveles de KYC 1 y 2 (migración `20260722130000_didit_kyc_provider`).
- Límites de volumen mensual por nivel de KYC (#316 y #322, julio).
- CASH-10: el KYC aplica al cliente y al agente, y el volumen se cuenta de forma atómica (mergeado el 2026-09-04).
- Circuit breakers y reintentos si Didit falla (2026-07-27).
- Para ser agente se pide KYC de Didit nivel 1 (RED-1 y RED-2, `d441ddb`, 2026-09-05).

**App:** la pantalla `KYCScreen` y el botón "Verificarme" en `ProviderOnboarding`.

### Hecho, pero sin mergear: PR #388 (KYC-1)

Rama `feat/kyc-1-didit-journey` (`ea75692`, `ad97e62`). Tiene CI verde y se puede mergear. **No está en el backend desplegado.** Corrige:
- **Seguridad:** el webhook tomaba el usuario y el nivel de `vendor_data`, que viene dentro del mismo mensaje. Con una firma válida se le podía subir el nivel de KYC a cualquier usuario. Ahora se resuelve con el `session_id` guardado en `kyc_didit_sessions`.
- Un aviso duplicado alargaba la vigencia de la verificación (`kyc_level_verified_at`).
- Una aprobación de nivel menor bajaba un nivel mayor que seguía vigente.
- Ante un mensaje raro se guardaba en los logs el cuerpo entero, con datos personales.
- La app daba por verificada a la persona usando solo su memoria local, sin preguntarle al servidor.

### Lo que falta para que funcione en producción

La configuración del servidor (task definition 15) **no tiene ninguna variable de Didit**. Faltan `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` y el secreto del webhook. Consecuencias según el código:
- Verificarse falla con "DIDIT_API_KEY not configured".
- El webhook rechaza todo ("webhook secret not configured"), así que la falla del #388 hoy no se puede explotar.
- Nadie puede volverse agente desde la app.
- `KYC_GATE_ENABLED=false`: no se le pide KYC a nadie para operar.

**Pasos:**
- [x] Mergear el #388 (2026-09-25).
- [ ] Guardar en AWS Secrets Manager la llave, el workflow y el secreto del webhook de Didit, y agregarlos a la task definition.
- [ ] Registrar en Didit el webhook `https://api.micopay.app/defi/kyc/webhook/didit`.
- [ ] Desplegar el backend.
- [ ] Probar "Únete a Red MicoPay" → "Verificarme" en el teléfono.

> **En demos:** no tocar "Únete a Red MicoPay" → "Verificarme" hasta terminar esto.

---

## 2. APK para demos

El APK del 2026-09-14 está instalado en el teléfono (Xiaomi 2303ERA42L); el hash coincide con el que se compiló.
El 2026-09-24 se probaron un **retiro** y un **depósito** de $500 contra producción. Los dos se completaron.

Corregir antes del próximo APK:
- [x] **El aviso del depósito regresaba a rojo** después de que el agente confirmaba el efectivo (`revealing`) y seguía diciendo "NO entregues el efectivo". Corregido en `pages/DepositChat.tsx`, en el PR #390.
- [ ] **"Completed" en inglés** en el recibo, en el campo Estado.
- [ ] **El QR del depósito es decorativo.** Solo contiene `micopay://confirm?trade_id=…`, el servidor no lo pide y el escáner del agente no reconoce ese tipo de QR. Decidir: **quitarlo** y dejar "Confirma cuando hayas entregado el efectivo" (recomendado), o **hacerlo real** con cambios en el servidor.
- [ ] **🔴 Con un agente real, el depósito se queda atorado.** Después de bloquear, la operación queda en `locked` y `TradeDetail` → `LockedView` le dice al agente "Esperando confirmación del vendedor", aunque el vendedor es él. No tiene ningún botón de **"Recibí el efectivo"**, que en el servidor es `POST /trades/:id/reveal`. Esa llamada solo existe en `QRReveal`, que usa el `activeTrade` del flujo del cliente, y el agente no llega ahí desde su bandeja. Sin esa confirmación el cliente no puede cerrar y la operación vence. El bot no sufre esto porque llama al servidor directamente. **Arreglo (solo app):** agregar "Recibí el efectivo" en `LockedView` cuando quien mira es el agente de un depósito. Se encontró leyendo el código, sin probarlo en el teléfono.
- [ ] **El botón "Abrir chat con el vendedor" de `LockedView` no hace nada**: no tiene `onClick`. Conectarlo al chat de la operación.
- [ ] Compilar el APK nuevo, instalarlo y volver a probar los dos flujos.

---

## 3. Pantallas de agente y onboarding: lo que ya existe

Revisado en el código el 2026-09-24. Ninguna de estas pantallas se probó en el teléfono.

**Onboarding de persona** (`Welcome.tsx`, `/welcome`): es solo explicativo y no cambia nada en el servidor. Explica que el dinero vive en el teléfono, que hay una llave con respaldo, qué es un cash-out y por qué el dinero queda retenido, y que el QR cierra la operación con una persona real. Además están `Register.tsx` y `Login.tsx`.

**Alta como agente** (`ProviderOnboarding.tsx`, `/join-network`, commit `d441ddb` del 2026-09-05, que cubre RED-1 y RED-2):
- Entrada con "Únete a Red MicoPay" en Perfil.
- Explicación y lista de requisitos: identidad (Didit), zona, y comisión con montos. La lista se lee de `/merchants/me/readiness`, así que el avance sobrevive a cerrar la app.
- Tres decisiones separadas: unirse (queda pendiente), activarse y ponerse disponible.
- Perfil muestra el estado: no inscrito, pendiente, activo con el interruptor disponible/pausado, o suspendido.
- La pestaña de bandeja solo aparece con `provider_status === 'active'`. Un agente activo puede seguir haciendo retiros como cliente.
- **Bloqueado en producción** porque Didit no está configurado (sección 1).

**Pantallas del agente:**

| Pantalla | Qué hace | Estado |
|---|---|---|
| Ajustes (`MerchantSettings`) | Comisión, montos mínimo y máximo, tope diario, zona con GPS y selector en el mapa, punto de encuentro, disponible o pausado | ✅ |
| Bandeja (`MerchantInbox`) | Solicitudes con filtros por estado, si es depósito o retiro, y escáner de QR | ✅ Muestra retiros desde el backend `v13` (CASH-3) |
| Retiro: escanear y liberar | Escanea el QR, confirma la entrega y libera | ✅ El bot lo probó con el mismo backend |
| Depósito: bloquear | "Bloquear fondos" en `TradeDetail` | ✅ |
| Depósito: confirmar el efectivo | — | ❌ No existe (sección 2) |

---

## 4. Bot agente de demostración

- Código en `micopay/backend/scripts/demo-agent/` (`bot.ts` y `qr_from_phone.py`), **sin commit**.
- Cuenta `agente_demo_rgjo`. Su llave está en `~/.micopay/demo-agent.json`, fuera del repo.
- La activé como agente con un UPDATE directo en RDS, porque activarla por la API pide Didit.
- Está ubicado unos 150 m al lado de donde estaba el teléfono (CDMX, 19.3568, -99.1659).
- [ ] Si la demo es en otro lugar: conectar el teléfono y correr `npx tsx scripts/demo-agent/bot.ts setup`.
- [ ] Decidir si el bot entra al repo.
- Los 4 agentes sembrados siguen en Coatepec/Xalapa (`SEED_ORIGIN_LAT/LNG` = 19.1489, -96.9663) y no aceptan operaciones solos.

---

## 5. Backend y AWS

- Desplegado el 2026-09-24: imagen `micopay-backend:v13`, task definition 15. El servicio corre sano.
- [ ] **Alarma cuando no hay ninguna tarea corriendo** (`RunningTaskCount < 1`). En el despliegue de hoy la API estuvo caída unos 5 minutos porque ECS tardó en arrancar la tarea nueva, lo mismo que el 2026-09-05. Ver `DESPLIEGUE_ECS_2026-09-08.md` §3.1.
- [ ] **Hacer bloqueantes las pruebas de vitest en el CI.** Hoy el paso lleva `continue-on-error: true` en `.github/workflows/ci.yml`. Va en su propio PR, separado del plan de orden de GitHub.
- [ ] Los créditos de AWS se acaban alrededor del **2026-10-15**; después son unos $53 al mes. Es la estimación del 2026-09-01 y no se volvió a revisar.
- Resuelto: `users.is_banned` y `users.is_admin` existen en producción y su migración (`20260903000000_add_is_banned_is_admin`, `26c3efd`) está en `main` desde el 2026-09-02, aplicada según `schema_migrations`.

---

## 6. Comisiones (H5), en pausa

- Plan escrito en `PLAN_COMISIONES_EFECTIVO_2026-09-24.md`, **sin commit**, pendiente de la auditoría de Codex.
- Decisiones abiertas:
  1. ¿Los límites y el KYC se miden sobre el efectivo o sobre la cripto?
  2. ¿Qué hace el servidor si el mapa no le manda el tipo de operación?
  3. ¿Se despliegan el backend y el APK el mismo día?
- Eric lo pospuso el 2026-09-24 para priorizar el APK de demos.

---

## 7. GitHub

- micopay-protocol: **0 issues abiertos**. #371 y #375 se cerraron el 2026-09-24, sin comentario.
- PRs abiertos:
  - [x] **#388**: KYC-1 (ver sección 1). Mergeado el 2026-09-25.
  - [x] **#373**: RED-1, de sasasamaes. Cerrado el 2026-09-25.
  - [x] **#374**: CASH-1, de canicefavour. Cerrado el 2026-09-25.
- micopaybridge (GrantFox): siguen abiertos los issues #14, #18, #19, #32 y #33 y los PRs #25, #26, #29 y #41. No se tocaron.

### Posible trabajo para Drips, si se reabre

Solo complejidad baja o media y nada que toque dinero:
- Revisar los textos sin traducir en toda la app.
- Que los scripts de prueba del backend corran en Windows (`cross-env`). Hoy fallan con `"ALLOW_IN_MEMORY_DB" no se reconoce…`.
- Reforzar las pruebas que no prueban nada (las 5 de discovery que vinieron en #373).
- Arreglar `cashHandoff.test`, que falla contra PostgreSQL desde antes del 2026-09-14.

Mantener interno: comisiones, escrow, CASH-8, KYC-2, SAFE-1, TRUST-1 y TRUST-2, lo de la demo y AWS.
RED-2 **ya está hecho** (`d441ddb`).

---

## 8. Agentes: inventario y liquidez

Revisado en el código el 2026-09-25, sobre `main` (`df21dbb`).

El agente es proveedor de liquidez por los dos lados: en un **depósito** bloquea su cripto y recibe efectivo; en un **retiro** entrega efectivo y recibe la cripto del cliente. Con el uso su inventario se carga hacia un lado y tiene que rebalancear.

Lo que hoy existe para gestionarlo: comisión, montos mínimo y máximo, tope diario (se aplica en `trade.service.ts`), zona y punto de encuentro, y el interruptor en línea / pausa / desconectado. Nada más.

- [ ] **Que el agente declare qué flujos atiende** (solo depósitos, solo retiros o ambos). El parámetro `flow` de `GET /merchants/available` existe, pero está marcado como "reservado" y no filtra nada (`merchant.service.ts`).
- [ ] **Que la búsqueda tenga en cuenta el saldo en cripto del agente para depósitos.** No encontré ninguna comprobación de saldo en `merchant.service.ts`, `trade.service.ts` ni `routes/trades.ts`: un agente sin cripto aparece en el mapa para un depósito y el problema sale cuando le toca bloquear.
- [ ] **Efectivo disponible para retiros.** El servidor no puede verlo; como mucho, que el agente lo declare o que baje su monto máximo. Decidir si vale la pena.
- [ ] **Rebalanceo.** La app no ofrece nada para pasar de efectivo a cripto o al revés; el agente lo resuelve por fuera. Evaluar si se enlaza con la rampa (Etherfuse).
- Relación con otras secciones: el alta real sigue bloqueada por Didit (sección 1), y la pregunta de si los límites se miden sobre el efectivo o la cripto está en comisiones (sección 6).

---

## Actualización 2026-09-25

- Se ejecutó `PLAN_ORDEN_GITHUB_2026-09-24.md` (v1.3): #389 y **#388 mergeados** (`main` = `df21dbb`, por delante de producción), **#373 y #374 cerrados** sin comentario, ramas mergeadas borradas y `main` **protegido** (todo entra por PR con los 3 checks en verde).
- El bot de demo (sección 4) quedó en `main` con #389.
- El arreglo del aviso del depósito (sección 2) está en el **PR #390** (`fix/apk-demo`, `def77d2`), con CI verde y sin mergear.
