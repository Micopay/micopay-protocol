# SEC-09: DebugOverlay — Análisis de Exposición en Bundle de Producción

Fecha: 2026-06-30  
Severidad: ⚪ Baja / Informativa  
Estado: Cerrado — sin exposición activa confirmada

---

## Resumen

`DebugOverlay.tsx` es un panel de depuración interna que expone en su código fuente:
`escrowContractId`, `mxneContractId`, los flags `MOCK_STELLAR`/`Demo Mode`, y las versiones
`Stellar SDK: v14.6` y `Vite: v6.2`. El componente se importa en `App.tsx` (línea 43) pero
**nunca se renderiza** — no existe ningún `<DebugOverlay />` en el árbol JSX, y `setDebugOpen`
nunca se invoca con `true` desde ningún caller en el código.

El objetivo de esta auditoría fue determinar si el tree-shaking de Rollup/Vite elimina el código
del componente del bundle de producción y si existe algún trigger oculto (gesto, query param,
atajo de teclado) que pudiera reactivarlo en runtime.

---

## Alcance

- Archivo fuente: `micopay/frontend/src/components/DebugOverlay.tsx`
- Punto de importación: `micopay/frontend/src/App.tsx:43`
- Bundle analizado: `micopay/frontend/dist/assets/index-Di_VIVad.js` (build de producción, 1.5 MB minificado)
- Entorno: Vite 6.2 + Rollup, build mode `production`, sin `manualChunks` ni `sideEffects: false`

---

## Pasos ejecutados

1. Leídos `DebugOverlay.tsx` (componente completo) y `App.tsx` (importación, declaración de
   estado, y árbol JSX completo) para identificar todos los posibles puntos de activación.

2. Compilado build de producción:
   ```
   cd micopay/frontend && ./node_modules/.bin/vite build
   ```
   Build exitoso. Resultado: `dist/assets/index-Di_VIVad.js` (1,532.32 kB antes de gzip).

3. Buscados en el bundle los 14 strings exclusivos de `DebugOverlay.tsx`:
   `Depuración Interna`, `bug_report`, `Escrow Contract ID`, `MXNE Contract ID`,
   `Herramientas de Desarrollador`, `Stellar SDK: v`, `Vite: v6`, `Build Variant:`,
   `Restablecer Usuarios Locales`, `Ver Detalles de Sesión`, `Identidad de Comprador`,
   `Identidad de Comercio`, `Copiado`, `Conexión Backend`.

4. Buscados en todo el código fuente (`src/**/*.tsx`) triggers ocultos:
   llamadas a `setDebugOpen(true)`, listeners `keydown`, gestos `touchstart`/swipe, lectura de
   query params (`URLSearchParams`, `window.location.search`), y secuencias konami.

5. Buscadas en el bundle las strings propias del `AppContext` que comparte props con el overlay:
   `isMockStellar`, `isDemoMode`, `backendHealth`, `setDebugOpen`.

---

## Resultados

### 1. ¿El código del overlay queda en el bundle de producción?

**No.** El tree-shaking de Rollup eliminó completamente el JSX y la lógica de `DebugOverlay.tsx`
del bundle.

De los 14 strings exclusivos del componente, **0 están presentes** en ninguno de los 11 chunks JS
generados:

```
DebugOverlay-ONLY strings found in bundle: 0 / 14

  absent: 'Depuración Interna'
  absent: 'bug_report'
  absent: 'Escrow Contract ID'
  absent: 'MXNE Contract ID'
  absent: 'Herramientas de Desarrollador'
  absent: 'Stellar SDK: v'
  absent: 'Vite: v6'
  absent: 'Build Variant:'
  absent: 'Restablecer Usuarios Locales'
  absent: 'Ver Detalles de Sesión'
  absent: 'Identidad de Comprador'
  absent: 'Identidad de Comercio'
  absent: 'Copiado'
  absent: 'Conexión Backend'
```

### 2. ¿Existe algún trigger oculto que lo reactive?

**No.** El análisis completo del código fuente (`src/**/*.tsx`) no encontró ninguna ruta de código
que invoque `setDebugOpen(true)`. La búsqueda de patrones cubrió:

- Llamadas directas a `setDebugOpen` → solo la declaración en `App.tsx:621` y la asignación al
  contexto en `App.tsx:857`.
- Listeners de teclado (`keydown`, Konami, atajos) → ninguno presente.
- Gestos táctiles (`touchstart`, `swipe`, multi-tap) → ninguno presente.
- Lectura de query params (`URLSearchParams`, `window.location.search`, `debug`, `__debug`) →
  ninguno presente.
- El estado `debugOpen` se declara en `useState(false)` y **nunca puede volverse `true`** por
  interacción del usuario.

### 3. ¿El bundle expone versiones del SDK?

**No, a través del overlay.** Los strings `Stellar SDK: v14.6` y `Vite: v6.2` —que serían las
versiones expuestas— están completamente ausentes del bundle.

**Caveat — strings del AppContext:** Las claves `isMockStellar`, `isDemoMode`, `backendHealth` y
`setDebugOpen` **sí aparecen** en el bundle (una ocurrencia de cada una, en la función `ZE` que
construye el `AppContext`). Su presencia se debe a que son **propiedades del contexto de aplicación**
utilizadas por `ExploreRoute` y la lógica de negocio de `App.tsx`, **no** al componente
`DebugOverlay`. El string `delete_forever` proviene del botón "Eliminar mi cuenta" en `Profile.tsx`,
no del overlay.

Contexto literal de `setDebugOpen` en el bundle:

```
...backendUrl:pe,isDemoMode:W,isMockStellar:X,backendConnected:Oe,backendHealth:be,setDebugOpen:We}
```

Esto corresponde al objeto `ctx` de `AppContext` — la función `setDebugOpen` existe como
callback vacío en el contexto pero no hay código que la active.

---

## Riesgo residual

| Vector | Riesgo | Justificación |
|---|---|---|
| JSX del overlay en bundle | ❌ Ninguno | Tree-shaking confirmado — 0 strings del componente en bundle |
| Versiones SDK en bundle | ❌ Ninguno | `Stellar SDK: v14.6` y `Vite: v6.2` ausentes |
| Trigger oculto de reactivación | ❌ Ninguno | `setDebugOpen` nunca se llama con `true` en ningún path |
| Props del AppContext (`setDebugOpen`, `isMockStellar`) | ⚠️ Mínimo | Nombres de propiedades presentes, sin valor sensible |

El único riesgo residual es que los nombres de las props del contexto (`isMockStellar`,
`isDemoMode`) son legibles en el bundle minificado. Esto revela que el build tiene un modo
"MOCK_STELLAR", lo que podría orientar a un atacante sobre la arquitectura interna. El impacto
es mínimo en producción porque: (a) Vite ya guarda en `vite.config.ts` que
`VITE_DEMO_MODE=true` en modo no-development lanza un error en build-time; (b) no hay valor
sensible expuesto, solo el nombre de la flag; (c) ambas variables son falsas en builds de
producción según el flujo de health-check del backend.

---

## Sugerencia de fix

> ⚠️ Solo descripción — no implementar en este PR.

**Fix 1 (Definitivo) — Eliminar la importación muerta:**  
Borrar `import DebugOverlay from "./components/DebugOverlay"` de `App.tsx` (línea 43) y remover
las declaraciones `debugOpen`/`setDebugOpen` del estado y del `AppContext`. Esto cierra toda
superficie futura: si en un cambio posterior alguien añade `<DebugOverlay />` accidentalmente,
quedaría sin las props necesarias y fallaría en compilación.

**Fix 2 (Complementario) — Eliminar el archivo fuente:**  
Borrar `DebugOverlay.tsx` si no hay planes de uso en ningún build. Un componente de depuración
interna debería vivir en una rama de feature o generarse solo en builds de desarrollo mediante
un plugin de Vite, no en el árbol de producción.

**Fix 3 (Contexto) — Limpiar el AppContext:**  
Remover `setDebugOpen` del tipo `AppCtx` y del objeto `ctx` — al no tener componente que lo
consuma, es ruido en el contrato de contexto y en el bundle minificado.

---

## Evidencia de artefactos revisados

| Artefacto | Hash / Tamaño | Notas |
|---|---|---|
| `dist/assets/index-Di_VIVad.js` | 1,532.32 kB | Bundle principal analizado |
| `dist/assets/index-BcJkOr0f.css` | 72.39 kB | No analizado (CSS) |
| Build: `./node_modules/.bin/vite build` | exit 0 | Build limpio, sin errores |
| Strings buscados | 14 exclusivos del componente | 0 encontrados |

---

## Conclusión

**No hay exposición activa.** El tree-shaking de Rollup funcionó correctamente: ningún string,
ningún JSX y ninguna lógica propia de `DebugOverlay.tsx` quedó en el bundle de producción.
No existe ningún mecanismo (gesto, query param, atajo de teclado, Konami code) que permita
activar el panel en un build de producción. Las versiones de SDK (`Stellar SDK: v14.6`,
`Vite: v6.2`) no están expuestas.

El hallazgo es **código muerto con riesgo informativo mínimo**: el `import` huérfano en `App.tsx`
y la presencia de `setDebugOpen` en el `AppContext` constituyen deuda técnica que debería
limpiarse, pero no representan una superficie de ataque activa.

---

*Reportado por: Kiro (automated security audit)  
Fecha de compilación analizada: 2026-06-30  
Build command: `cd micopay/frontend && ./node_modules/.bin/vite build`*
