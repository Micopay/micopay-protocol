# SEC-13 [x402] Acepta un pago sin confirmarlo on-chain ni verificar firma/saldo

## Resultado
Sí. El flujo de verificación x402 puede aceptar como “pago válido” un XDR de Stellar que contenga una operación `payment` hacia `PLATFORM_ADDRESS` por un monto >= mínimo **aunque la transacción nunca se envíe on-chain** o esté **sin firma válida / sin fondos**. El endpoint responde como si el pago fuese válido y se entrega el recurso, porque la verificación es puramente declarativa sobre el XDR (parseo + búsqueda de operación + anti-replay por hash), sin consultar Horizon/RPC ni validar firmas.

## Evidencia
Archivo relevante: `apps/api/src/middleware/x402.ts`

1) `verifyPayment()` construye la transacción solo con parseo del XDR:
- `const tx = new Transaction(xdrBase64, NETWORK_PASSPHRASE);`
- Lee `tx.source` y calcula `txHash = Buffer.from(tx.hash()).toString("hex");`

2) La “validación” del pago se limita a:
- anti-replay por hash (`isPaymentUsed` / `usedTxHashes`)
- iterar `tx.operations` y comprobar:
  - `op.type === "payment"`
  - `op.destination === PLATFORM_ADDRESS`
  - `op.asset.code === "USDC"`
  - `parseFloat(op.amount) >= parseFloat(minAmountUsdc)`

3) **No hay**:
- envío a red (`submitTransaction`) 
- consulta a Horizon/RPC (p.ej. `loadAccount`, `transactions/{hash}`, etc.)
- verificación de firmas (`tx.signatures`) o validación cryptográfica de que el XDR realmente esté firmado por las cuentas necesarias
- validación de `sequence`/memo
- verificación de saldo/trustline de `tx.source`

Como consecuencia, un atacante puede generar un XDR “bien formado” que contenga la operación requerida pero que:
- no exista on-chain (nunca fue submitteada)
- sea inválida por falta de firma
- provenga de una cuenta sin saldo suficiente

y el middleware igualmente lo considerará válido.

## Reproducibilidad en testnet
**Sí (reproducible en Testnet)** si el backend está configurado para `STELLAR_NETWORK=TESTNET` y el endpoint x402 utiliza este middleware. El comportamiento no depende de que la transacción exista en Horizon, solo del contenido del XDR proporcionado por el atacante.

> Nota: el anti-replay usa el hash del XDR; si el atacante mantiene el mismo XDR/hx para repetir, se bloqueará; pero para obtener recursos repetidos, puede generar nuevos XDR que satisfagan los checks declarativos.

## Pasos de reproducción (propuesto)
1) Construir una transacción Stellar con una operación `Operation.payment`:
   - `destination = PLATFORM_ADDRESS`
   - `asset = USDC`
   - `amount = minAmount` (o mayor)
   - (sin necesidad de que sea enviada a red)
2) Obtener el XDR base64 de esa transacción.
   - Caso A: XDR **no firmado**
   - Caso B: XDR **firmado** con una cuenta sin fondos / sin trustline
3) Enviar una petición HTTP al endpoint protegido por x402 que use el preHandler `requirePayment(...)`.
   - Incluir el header `x-payment: <signed-xdr-base64>` (según lo espera el middleware)
4) Verificar que el endpoint responde **200/éxito** y entrega el recurso asociado al intercambio/plan.
5) Confirmar en Horizon que la transacción **no aparece** on-chain (por hash), i.e. el “pago” no fue liquidado.

## Se verifica contra Horizon/RPC en algún punto del flujo?
**No en `verifyPayment()`**. El middleware únicamente parsea el XDR y valida la estructura/contendido (operación, destino, asset y monto) y el anti-replay por hash.

## Impacto
- Ingreso por x402 puede ser simulado sin transferir valor real.
- Un atacante puede obtener recursos/servicios pagando “de papel” (XDR declarativo).
- Anti-replay evita reutilización del mismo XDR, pero no evita el uso de transacciones nunca enviadas o inválidas por firma/fondos.

## Sugerencia de fix (no implementada)
Implementar validación **on-chain** y checks de autenticidad antes de conceder el recurso, por ejemplo:
1) Verificar que el XDR tenga firmas válidas para `tx.source` (y umbrales/medios requeridos) y que las firmas estén presentes.
2) Enviar/confirmar on-chain:
   - consultar Horizon por `txHash` y comprobar que la transacción fue incluida en un ledger
   - o bien usar `submitTransaction` si aplica en el flujo (aunque usualmente el cliente debe submittearla)
3) Validar ejecución:
   - confirmar que la operación payment a `PLATFORM_ADDRESS` ocurrió efectivamente (resultado/metadata)
4) Validar saldo/trustline antes (opcional como mitigación adicional) pero lo crítico es la confirmación on-chain.
5) Considerar que el anti-replay debería estar ligado a ledger confirmado / transacción ejecutada.

---

## Entorno / configuración relevante
- `apps/api/src/middleware/x402.ts`
- Variables usadas:
  - `STELLAR_NETWORK` (default: TESTNET)
  - `PLATFORM_SECRET_KEY` o `PLATFORM_STELLAR_ADDRESS`
- Implementación anti-replay:
  - `apps/api/src/db/x402.ts` con tabla `x402_payments` (fallback in-memory si falla la inicialización DB)

