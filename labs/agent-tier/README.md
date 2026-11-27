# agent-tier — reputación privada de agentes con ZK

> **Prototipo de labs, solo testnet.** No toca el escrow, el backend ni la app. No mueve fondos.
>
> Trabajo de Raúl Vallejo (#533, 630f26b). Se mudó a `labs/agent-tier/` en R1 sin cambiar el circuito ni el contrato.

Un agente demuestra **"soy Plata"** (o Bronce/Oro) **sin revelar** cuántas operaciones tiene ni su % de cumplimiento, y un contrato Soroban lo verifica.

| Carpeta | Qué es |
|---|---|
| [`circuit/`](circuit/src/main.nr) | Circuito Noir `agent_tier_v1`, bench de navegador y toolchain Docker |
| [`contract/`](contract/src/lib.rs) | Contrato `AgentTierRegistry` (crate `micopay-labs-agent-tier`), verificador UltraHonk sobre BN254 (Protocol 25) |
| [`scripts/`](scripts/demo.sh) | Demo completa, prueba real e IDs de demo |

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
bash labs/agent-tier/scripts/demo.sh
```

Solo el contrato, sin Docker: `cd labs/agent-tier/contract && cargo test`. El CI de labs corre esto en cada PR; el circuito (nargo) todavía no está en el CI.

Arma la imagen `micopay-zk-toolchain` (nargo 1.0.0-beta.9 + bb 0.87.0, las versiones que pide el verificador), corre los tests del circuito, genera una prueba real, la verifica off-chain y corre los tests del contrato contra **esa** prueba.

| | Resultado |
|---|---|
| Circuito | 9/9 tests |
| Contrato | 21/21 tests (+1 ignorado: `sondeo_maleabilidad`); 13 de #533, 3 de R2, 2 de R3 y 3 de R4 |
| Prueba | 14,592 bytes |

Lo que se intentó y falla: presumir un tier más alto, pedir un umbral a la medida, inventar números, usar la prueba de otra cuenta, reusarla en el mismo trade o en otro, usarla tras una raíz nueva, alterar bits de la prueba, publicar raíz sin el admin.

## Testnet

`AgentTierRegistry`: [`CAAZZOYORT5NP6YMTY2PFGWXJ7MJHTF43YU7OYTQ2T7LTALNTUQ2UKR5`](https://stellar.expert/explorer/testnet/contract/CAAZZOYORT5NP6YMTY2PFGWXJ7MJHTF43YU7OYTQ2T7LTALNTUQ2UKR5) (misma VK que `contract/fixtures/vk`).

- Prueba verificada (Lupe, tier Plata): [tx `5a2afab3…`](https://stellar.expert/explorer/testnet/tx/5a2afab3bb9424b0c0749e5d726a5a7a70d3e2597fdb0997b6d7b4d49ce862df)
- Simulados y rechazados: Oro y Bronce con la prueba de Plata (`#5`), tier 4 o 30 (`#6`), reuso (`#4`), otra cuenta (`#5`).
- **Costo:** 95.3 M de 400 M instrucciones por tx (~24 %; el límite es igual en mainnet), ~0.05 XLM.

## En el teléfono

[`circuit/bench`](circuit/bench/README.md) genera la prueba en el navegador con `noir_js` + `bb.js` (el mismo motor que el WebView de Capacitor).

| Dispositivo | Hilos | Generar prueba | Todo, primera vez |
|---|---|---|---|
| PC | 8 | 0.65 s | 2.3 s |
| PC | 1 | 2.6 s | 4.9 s |
| OPPO Reno6 Lite (Snapdragon 680) | 1 | **15.5 s** | 38 s |

Con un solo hilo es el peor caso; con hilos no está medido. 15–30 s en medio de un trade es demasiado, por eso la propuesta es que el contexto sea la **época de la raíz** y no el trade: la app del agente genera la prueba en segundo plano cuando se publica una raíz nueva, y en el trade solo se consulta el `TierProven` ya registrado. **Hecho en R3:** el contexto ya es la época de la raíz.

## Lo que ZK no resuelve

1. **MicoPay sigue conociendo los números** (arma el árbol). Se ocultan al público y a la contraparte, no a MicoPay. Igual que el KYC.
2. **No es anónimo**: `agent_id` es público. Se ocultan los números, no la identidad.
3. **El explorador**: la dirección del agente aparece en cada escrow, así que sus operaciones se pueden contar en cadena. Lo que sí se protege es lo que expone la API y el % de cumplimiento.

## Caveats técnicos

1. **Verificador de terceros sin auditoría** (`yugocabrio/rs-soroban-ultrahonk@661db07`). Antes de mainnet: auditoría o verificador oficial.
2. **Maleabilidad de codificación** (test `sondeo_maleabilidad`): el verificador ignora los bytes altos de relleno de los limbs G1, así que hay variantes de bytes de la misma prueba que pasan. No rompe la seguridad (alterar bits reales siempre falla) y el anti-reuso es el nullifier. Regla: nunca usar `hash(proof)` como id.
3. **Pedersen** porque nargo beta.9 no exporta Poseidon; Protocol 25 ya trae Poseidon nativo. Migrarlo es opcional.
4. **TTL de nullifiers**: ~180 días por llamada; para anti-reuso permanente hace falta extenderlos.
5. Las cuentas de `circuit/demo/agents.json` son deterministas, sin fondos, **solo demo**.
6. **Vida de la configuración (arreglado en R2).** En #533, `prove_tier` y `publish_root` no extendían el TTL de la instancia (admin, VK, raíz, época), y el contrato se podía archivar por desuso. Ahora los dos la extienden a ~30 días.

## Cambios en labs

| ID | Cambio |
|---|---|
| R2 | **Raíz por época.** Cada `publish_root` guarda la raíz con su fecha y su ledger en `root_at(epoca)`. Las épocas van en orden (1, 2, 3…) y una ya publicada nunca se reescribe. `publish_root` devuelve `Result` (`EpochOverflow` si se acabaran los números). Además, `publish_root` y `prove_tier` extienden el TTL de la instancia |
| R3 | **Prueba por época y tier guardado.** `prove_tier(agent, tier, nullifier, proof)` ya no recibe un contexto: el contrato usa la época vigente (`context_for(epoca)`, el número como campo). Una prueba vale para una época y se rehace cuando se publica otra raíz, aunque sea igual. El tier probado queda guardado como `Tier(agent) → (tier, epoca)` y se lee con `tier_record`. La prueba de `contract/fixtures` se regeneró para la época 1; la VK no cambió |
| R4 | **Consulta de tier.** `get_tier(agent)` da `(tier, epoca)` solo si la prueba es de la época vigente. Sin prueba, sin raíz publicada o con una prueba de una época vieja (vencida), da `None`. `tier_record` sigue mostrando el último registro aunque esté vencido |

## Pendiente

En labs (plan `PLAN_LABS_ESCROW_V2_Y_TIERS`):
- Nada. `escrow-v2` ya consulta `get_tier` para los trades grandes (X1).

Fuera de labs:
- Backend: job que arma el árbol y publica la raíz; endpoint con la ruta Merkle del agente.
- App: generar la prueba (`noir_js` + `bb.js`) y mostrar "Plata ✓ verificado en Stellar".
- Decisión de producto: dejar de devolver `trades_completed` / `completion_rate` exactos en `/merchants/available`.
