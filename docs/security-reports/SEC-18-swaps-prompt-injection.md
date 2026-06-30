# SEC-18: Prompt Injection en /api/v1/swaps/plan Dirige Swap Ejecutado con Llaves de Plataforma

## Resultado
Vulnerabilidad crítica identificada y mitigada. El sistema ahora valida todos los parámetros del plan de swap antes de almacenarlo y ejecutarlo.

## Evidencia
- **Archivo modificado**: `apps/api/src/routes/agent.ts`
- **Añadido**: Función `validatePlan()` que verifica:
  - Assets permitidos (USDC, XLM, MXNe)
  - Monto máximo (100 USD, estimación aproximada)
  - Contraparte válida (usa `DEMO_AGENT_PUBLIC_KEY` del entorno)
- **Validación aplicada en**:
  - `/api/v1/swaps/plan`: Antes de guardar el plan
  - `/api/v1/swaps/execute`: Doble verificación antes de ejecutar

## Reproducible en testnet
Sí (antes de la corrección).

## Sugerencia de fix
Ya implementado:
1. Añadir lista blanca de assets y contraparte
2. Establecer límite máximo de monto por swap
3. Validar el plan en ambos endpoints antes de procesar
