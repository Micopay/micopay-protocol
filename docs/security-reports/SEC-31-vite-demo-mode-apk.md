# Reporte de Seguridad: SEC-31 - Flag de Demo en APK de Release

## Resultado
- **¿El bundle de release trae IS_DEMO_MODE activo o el secret de demo?**
  Sí. Si el APK de release se construye con `VITE_DEMO_MODE=true` (ya sea por variables heredadas de la máquina local o por un pipeline de CI mal configurado), el bundle final del frontend contiene la variable `IS_DEMO_MODE` activa y el secreto estático de demo `MICOPAY:DEMO:mock_secret_for_ui_preview` embebido en los activos finales.
- **¿Qué comportamiento de demo quedaría disponible en producción?**
  1. **Autoregistro silencioso**: La aplicación auto-aprovisiona un usuario de pruebas en el arranque en lugar de redirigir al flujo real de autenticación.
  2. **Exposición de Secretos Estáticos**: En caso de fallo en la API (o desconexión del backend), el componente `QRReveal.tsx` cae de vuelta a mostrar el secreto estático `'MICOPAY:DEMO:mock_secret_for_ui_preview'` y marca la transacción como exitosa de forma simulada (`secretLoaded=true`), permitiendo saltearse validaciones criptográficas reales en el frontend.
  3. **Comercio simulado**: El flujo de creación de transacciones en `App.tsx` crea un trade falso localmente si la API falla.
- **¿Hay guarda de build que lo impida?**
  Antes de este cambio, no existía ninguna guarda de compilación. El script de compilación de producción finalizaba sin errores incluso si la variable de entorno estaba habilitada.

## Evidencia
1. **Compilación de producción exitosa con flag activo** (antes del fix):
   Al ejecutar `$env:VITE_DEMO_MODE="true"; npm run build:prod`, se generó exitosamente el archivo `dist/assets/index-CSvwycNT.js`.
2. **Presencia de la cadena secreta de demo en el bundle de producción**:
   Búsqueda de la cadena en los activos compilados de producción:
   ```bash
   grep "mock_secret_for_ui_preview" micopay/frontend/dist/assets/*.js
   # Resultado: Encontrado en index-CSvwycNT.js:
   # const F1="MICOPAY:DEMO:mock_secret_for_ui_preview"
   ```

## Reproducible en testnet
**Sí**. De hecho, los builds de `testnet` también se veían afectados si se compilaba con `VITE_DEMO_MODE=true`, lo que permitía embeber atajos y simulación de transacciones en entornos de pruebas que deberían usar la red real de pruebas de Stellar (Soroban).

## Sugerencia de fix (Implementado)
Se ha implementado una guarda a nivel de configuración de compilación de Vite (`micopay/frontend/vite.config.ts`) que:
1. Lee las variables de entorno usando `loadEnv` de Vite.
2. Si el modo de compilación no es `development` (es decir, es `production` o `testnet`) y `VITE_DEMO_MODE` está configurado como `true`, se lanza un error crítico deteniendo la compilación inmediatamente.
3. Se permite el uso de `VITE_DEMO_MODE=true` únicamente en compilaciones locales con modo `development` para pruebas de interfaz por parte de desarrolladores.
