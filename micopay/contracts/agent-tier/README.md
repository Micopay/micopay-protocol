# agent-tier — reputación privada de agentes con ZK

> **Prototipo para revisión del team.** No toca el escrow, el backend ni la app. No mueve fondos.

Un agente demuestra **"soy Plata"** (o Bronce/Oro) **sin revelar** cuántas operaciones tiene ni su % de cumplimiento, y un contrato Soroban lo verifica.

- Circuito Noir: [`micopay/circuits/agent_tier_v1`](../../circuits/agent_tier_v1/src/main.nr)
- Contrato: `AgentTierRegistry` ([`src/lib.rs`](src/lib.rs)), verificador UltraHonk sobre BN254 (Protocol 25)

## Cómo funciona

1. El agente genera un `secret` en su teléfono y entrega a MicoPay solo `H(secret)`.
2. MicoPay arma un árbol Merkle con hojas `H(H(secret), agent_id, trades, rate)` y publica la raíz con `publish_root` (época 1, 2, …).
3. El agente genera la prueba en su teléfono: "mi hoja está en el árbol y `trades ≥ umbral del tier`".
4. `prove_tier(agent, tier, context, nullifier, proof)`:
   - arma los inputs públicos **él mismo**, con la raíz guardada en cadena (no acepta una raíz que mande el cliente);
   - deriva `agent_id` de la `Address`, así que la prueba no se puede prestar a otra cuenta;
   - quema el `nullifier` del contexto, así que no se puede reusar;
   - emite `TierProven { agent, tier, context, epoch }`.

**Solo tiers fijos** (`BRONCE=1` ≥ 1, `PLATA=2` ≥ 10, `ORO=3` ≥ 50 operaciones; los de `merchant.service.ts`). `min_rate` = 0 porque hoy el backend no exige %. Si el contrato aceptara cualquier umbral, se podría encontrar el número exacto pidiendo "≥ 30", "≥ 40", "≥ 35"…

## Correrlo

Requiere Docker. Desde la raíz del repo:

```bash
bash micopay/circuits/agent_tier_v1/scripts/demo.sh
```

Arma la imagen `micopay-zk-toolchain` (nargo 1.0.0-beta.9 + bb 0.87.0, las versiones que pide el verificador), corre los tests del circuito, genera una prueba real, la verifica off-chain y corre los tests del contrato contra **esa** prueba.

| | Resultado |
|---|---|
| Circuito | 9/9 tests |
| Contrato | 13/13 tests (+1 ignorado: `sondeo_maleabilidad`) |
| Prueba | 14,592 bytes |

Lo que se intentó y falla: presumir un tier más alto, pedir un umbral a la medida, inventar números, usar la prueba de otra cuenta, reusarla en el mismo trade o en otro, usarla tras una raíz nueva, alterar bits de la prueba, publicar raíz sin el admin.

## Testnet

`AgentTierRegistry`: [`CAAZZOYORT5NP6YMTY2PFGWXJ7MJHTF43YU7OYTQ2T7LTALNTUQ2UKR5`](https://stellar.expert/explorer/testnet/contract/CAAZZOYORT5NP6YMTY2PFGWXJ7MJHTF43YU7OYTQ2T7LTALNTUQ2UKR5) (misma VK que `fixtures/vk`).

- Prueba verificada (Lupe, tier Plata): [tx `5a2afab3…`](https://stellar.expert/explorer/testnet/tx/5a2afab3bb9424b0c0749e5d726a5a7a70d3e2597fdb0997b6d7b4d49ce862df)
- Simulados y rechazados: Oro y Bronce con la prueba de Plata (`#5`), tier 4 o 30 (`#6`), reuso (`#4`), otra cuenta (`#5`).
- **Costo:** 95.3 M de 400 M instrucciones por tx (~24 %; el límite es igual en mainnet), ~0.05 XLM.

## En el teléfono

[`circuits/agent_tier_v1/bench`](../../circuits/agent_tier_v1/bench/README.md) genera la prueba en el navegador con `noir_js` + `bb.js` (el mismo motor que el WebView de Capacitor).

| Dispositivo | Hilos | Generar prueba | Todo, primera vez |
|---|---|---|---|
| PC | 8 | 0.65 s | 2.3 s |
| PC | 1 | 2.6 s | 4.9 s |
| OPPO Reno6 Lite (Snapdragon 680) | 1 | **15.5 s** | 38 s |

Con un solo hilo es el peor caso; con hilos no está medido. 15–30 s en medio de un trade es demasiado, por eso la propuesta es que el contexto sea la **época de la raíz** y no el trade: la app del agente genera la prueba en segundo plano cuando se publica una raíz nueva, y en el trade solo se consulta el `TierProven` ya registrado. **Este contrato todavía usa `context = trade`; el cambio a época es chico y está pendiente.**

## Lo que ZK no resuelve

1. **MicoPay sigue conociendo los números** (arma el árbol). Se ocultan al público y a la contraparte, no a MicoPay. Igual que el KYC.
2. **No es anónimo**: `agent_id` es público. Se ocultan los números, no la identidad.
3. **El explorador**: la dirección del agente aparece en cada escrow, así que sus operaciones se pueden contar en cadena. Lo que sí se protege es lo que expone la API y el % de cumplimiento.

## Caveats técnicos

1. **Verificador de terceros sin auditoría** (`yugocabrio/rs-soroban-ultrahonk@661db07`). Antes de mainnet: auditoría o verificador oficial.
2. **Maleabilidad de codificación** (test `sondeo_maleabilidad`): el verificador ignora los bytes altos de relleno de los limbs G1, así que hay variantes de bytes de la misma prueba que pasan. No rompe la seguridad (alterar bits reales siempre falla) y el anti-reuso es el nullifier. Regla: nunca usar `hash(proof)` como id.
3. **Pedersen** porque nargo beta.9 no exporta Poseidon; Protocol 25 ya trae Poseidon nativo. Migrarlo es opcional.
4. **TTL de nullifiers**: ~180 días por llamada; para anti-reuso permanente hace falta extenderlos.
5. Las cuentas de `demo/agents.json` son deterministas, sin fondos, **solo demo**.

## Pendiente (fuera de este PR)

- Contexto por época en vez de por trade.
- Backend: job que arma el árbol y publica la raíz; endpoint con la ruta Merkle del agente.
- App: generar la prueba (`noir_js` + `bb.js`) y mostrar "Plata ✓ verificado en Stellar".
- Decisión de producto: dejar de devolver `trades_completed` / `completion_rate` exactos en `/merchants/available`.
