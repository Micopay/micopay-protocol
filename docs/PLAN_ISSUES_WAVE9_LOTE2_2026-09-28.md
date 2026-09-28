# Plan · Segundo lote de issues para Drips (wave 9)

**Fecha:** 2026-09-28. **Versión:** 0.3, con las dos revisiones de Codex incorporadas.
**Base revisada:** `main` en `9c3bcd3`.
**Estado:** propuesta. Borradores en `docs/issues/2026-09-28/`. No se ha publicado nada.

## 0. Contexto

- La primera tanda de la wave 9 se cerró: #394 (DEV-1, `cross-env`) con #398, y #395 (I18N-1) con #397, integrado vía #400.
- Los resultados de vitest en el CI de `main` se leyeron del log de cada corrida (no de la conclusión del paso, que es informativo): 34/34 archivos en #396.
- Lección de la wave 8: los issues `complexity: low` salieron limpios y los `high` volvieron rotos. Este lote solo publica complejidad baja.

## 1. Criterios de selección

Entra a Drips solo si cumple todo:
1. No **modifica** dinero, escrow, KYC, sesión, llaves, rutas admin ni AWS. Traducir o probar una pantalla que *muestra* información sensible puede entrar si el alcance prohíbe explícitamente tocar su comportamiento.
2. Tiene alcance cerrado: archivos concretos y criterios verificables sin acceso a producción.
3. No choca con trabajo interno en curso (el chat de la operación, DRIPS-1, tocará `TradeDetail.tsx`, `ChatRoom.tsx`, `DepositChat.tsx`, `useChatMessages.ts` y `App.tsx`).

## 2. Para publicar

| Orden | Issue | Borrador | Resumen | Choques |
|---|---|---|---|---|
| 1 | **TEST-1** | `TEST-1-accessible-names-windows.md` | La comprobación de íconos decorativos omite sus pantallas en Windows (`accessibleNames.test.ts:89` y `:120`). Exige normalizar rutas, fallar si la selección queda vacía y una prueba negativa en Windows y Linux | Ninguno |
| 1 | **DEV-2** | `DEV-2-remove-xrpl.md` | Quitar `xrpl`, que no se importa (`package.json:41`). Exige `npm ci` con el lockfile entregado, porque el CI borra el lock (`ci.yml:64`) | Ninguno |
| 2 | **UX-1** | `UX-1-receipt-status.md` | El recibo muestra el estado crudo (`SuccessScreen.tsx:210`). Agrega `home.status.expired` y un fallback `home.status.unknown`; prueba los 7 estados en los dos idiomas. Solo presentación | Ninguno |
| 3 | **I18N-2** | `I18N-2-history.md` | Traducir `History.tsx`, reutilizando las claves de estado de UX-1 | Depende de UX-1 |
| 2 | **I18N-3** | `I18N-3-offline-queue-status.md` | Traducir el aviso sin conexión. Solo texto: el reintento autenticado (`OfflineQueueStatus.tsx:74`) y su lógica no se tocan | Ninguno |

TEST-1, DEV-2, UX-1 e I18N-3 no comparten archivos de código. UX-1 e I18N-3 comparten `i18n/*.json`; los conflictos ahí son triviales.

## 3. Pendientes de decisión o de trabajo previo

### I18N-4 · Pantallas de entrada (Registro, Login, Bienvenida). **Decisión de Eric**

- Codex comprobó que `Register.tsx:45` genera y revela llaves, `Register.tsx:63` guarda la sesión, `Login.tsx:50` restaura la llave y la sesión, y `Welcome.tsx` explica el respaldo de la llave. Los mensajes están dentro de esos manejadores.
- Traducir no cambia la seguridad, pero el contribuidor trabajaría dentro de código sensible.
- **Opciones:** (a) publicarlo con reglas estrictas: solo sustituir textos por claves; prohibido tocar condiciones, códigos de error, validaciones, llamadas, almacenamiento o navegación; pruebas con API, llavero y almacenamiento simulados. (b) Hacerlo interno.
- **Recomendación:** (b), interno. Es poco trabajo para nosotros y evita que un externo toque la creación de llaves.

### CI-1 · Pruebas del backend en el CI. **Requiere línea base**

- Comprobado: el job `backend` de `ci.yml` (línea 19) solo compila; hay 26 scripts `test:*`, y algunos dependen de cotizaciones externas (`rate.ts:23`).
- **Antes de publicarlo (nuestro):** correr los 26 scripts en `main` y adjuntar una matriz con comando, entorno, resultado y motivo de exclusión.
- **Reglas del issue cuando se publique:** solo se cambia el workflow; cualquier arreglo de negocio va a otro issue. PostgreSQL efímero como servicio, migraciones, credenciales exclusivamente de prueba, `pull_request` con permisos `contents: read`, sin secretos ni `pull_request_target`. Un script incluido que falla tiene que fallar el job (nada de `|| true`). "No obligatorio" significa que no está en las reglas de merge, lo cual configuramos nosotros, no el contribuidor.

### I18N-5 · `TradeDetail` y `DepositQR`. **Espera a DRIPS-1**

- `TradeDetail.tsx` concentra acciones de chat y escrow (por ejemplo, la línea 324) y `DepositQR.tsx:56` liga el estado con la acción de completar el depósito. Se publica cuando termine DRIPS-1, separando traducción de comportamiento. Los conteos heurísticos de texto no serán criterio de aceptación.

## 4. Interno

- **DEV-3 · Registro con teléfono duplicado:** `users.ts:79` no revisa `phone_hash`, que es `UNIQUE` (`init.sql:18`), y el servidor responde 500. Afecta registro, sesión y controles de abuso: `abuse.service.ts:143` usa el teléfono compartido para detectar cuentas relacionadas, así que ignorar el duplicado quitaría esa señal. Antes hay que decidir la política. Si se conserva la unicidad, hay que manejar la colisión de PostgreSQL (incluidos registros concurrentes); una consulta previa sola no basta.
- Volver bloqueante el paso de vitest en `ci.yml`.
- DRIPS-1 (chat de la operación), seguridad de `/admin/*`, suspensión de cuentas, Didit en producción y AWS.

## 5. Cambios respecto a la v0.1 (revisión de Codex)

- I18N-2 se partió: Historial (I18N-2) y aviso sin conexión (I18N-3) se publican; las pantallas de entrada (I18N-4) quedan a decisión, con recomendación interna.
- DEV-3 pasa de "decisión" a interno, por los controles de abuso y la concurrencia.
- TEST-1: título más preciso, aserción contra la selección vacía y prueba negativa con un botón sin `aria-label`. No se amplía a otras pruebas (`iconSubset.test.ts` ya normaliza).
- DEV-2: se exige `npm ci` con el lockfile entregado; la reducción de tamaño es informativa.
- UX-1: los 7 estados en los dos idiomas más un desconocido, con fallback traducido; prohibido tocar importes y datos del recibo.
- CI-1: queda condicionado a la matriz de los 26 scripts, con reglas de seguridad para forks.
- Se corrigió la contradicción de la v0.1, que decía que DEV-3 no compartía archivos con la traducción de la entrada.

## 6. Cambios de la v0.3 (segunda revisión de Codex)

- I18N-2: el español queda idéntico salvo una excepción autorizada (un estado desconocido pasa de "Pendiente" a "Estado desconocido", con prueba y el color actual); se excluyen datos del usuario, códigos de moneda, nombres de íconos y el formato de fechas e importes (`es-MX`).
- I18N-3: se permite explícitamente importar y llamar `useTranslation`; las pruebas cubren modo compacto y completo, los dos idiomas, que no pinta nada si está conectado y sin pendientes, y el reintento en modo completo.
- Orden: TEST-1 y DEV-2 en paralelo; UX-1 e I18N-3 también pueden empezar; I18N-2 después de integrar UX-1. Los cambios a `i18n/*.json` se coordinan al mergear.
