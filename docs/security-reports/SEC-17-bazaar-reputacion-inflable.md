# Reporte de Seguridad: [SEC-17] Reputación del Bazaar inflable

**Resultado:**
Es posible inflar artificialmente la reputación de cualquier agente en el Bazaar ("tier", "swaps_completed", "completion_rate", y "volume_usdc") sin completar ningún swap real. Un atacante puede aprovechar la falsificación del pagador (payer falsificable vía el header X-PAYMENT descrito en SEC-12) para asignar el crédito a una dirección arbitraria y controlar el volumen reportado, logrando por ejemplo el nivel de confianza máximo "maestro" 🍄 sin realizar swaps cross-chain reales.

**Evidencia:**
1. En `apps/api/src/routes/bazaar.ts` (línea 120-122), la ruta `POST /api/v1/bazaar/intent` utiliza `request.payerAddress` (que proviene del header falsificable de L402) como la dirección del agente (`agentAddress`) para el intento. Luego, acredita el intento (`recordBroadcast`).
2. En la ruta `POST /api/v1/bazaar/accept` (línea 342 y 354), se llama a `recordCompletion(intent.agent_address, amountUsdc)` únicamente por aceptar el intent (estado "negotiating"), antes de que el swap se liquide realmente.
3. Además, el `amountUsdc` se toma del cuerpo de la petición (`body.amount_usdc`), por lo que un atacante puede reportar volúmenes arbitrariamente altos, afectando métricas críticas que confieren reputación a la cuenta falsificada.
4. Esto contradice la premisa de diseño (línea 285) donde se afirma que la reputación no es transferible ni comprable.

**Reproducible en testnet:**
Sí. (Si la vulnerabilidad de validación X-PAYMENT SEC-12 está presente, un script automatizado puede generar el tier máximo enviando múltiples requests a `/intent` y `/accept` por un costo nulo o mínimo).

**Sugerencia de fix:**
1. **Verificación de Origen:** Utilizar mecanismos criptográficos reales para autenticar la identidad del agente y no depender ciegamente del `request.payerAddress` extraído del pago.
2. **Registro Post-Liquidación:** Mover `recordCompletion` para que sólo se ejecute después de confirmar on-chain que el AtomicSwap (HTLC) se ha liquidado exitosamente por ambas partes, en lugar de hacerlo durante la mera aceptación y bloqueo.
3. **Validación de Volúmenes:** Validar los volúmenes (`amountUsdc`) contrastándolos con las condiciones y montos pactados on-chain, en lugar de confiar en la entrada arbitraria (`body.amount_usdc`) del request `accept`.
