# escrow-v2 (labs)

Copia experimental del escrow de MicoPay para probar más reglas en cadena. **Solo testnet. No es un plan de migración:** el escrow de producción (`micopay/contracts/escrow/`) se queda simple y no se toca desde aquí.

Se copió de `micopay/contracts/escrow/` en `origin/main` 5d62348. El crate se llama `micopay-labs-escrow-v2`, para que su WASM (`micopay_labs_escrow_v2.wasm`) no se confunda con el de producción.

## Cómo funciona (igual que producción)

| Función | Quién firma | Qué hace |
|---|---|---|
| `lock` | El vendedor | Bloquea monto + comisión de MicoPay hasta el ledger de vencimiento |
| `release` | El comprador, con el secreto | Paga el monto al comprador; la comisión de MicoPay se acumula en el contrato (E11). Funciona también después del vencimiento |
| `refund` | Nadie (cualquiera la llama) | Desde el vencimiento, devuelve monto + comisión al vendedor |
| `decline` | El comprador | Devuelve todo al vendedor, antes o después del vencimiento |

El escrow libera a quien debe (el comprador, con el secreto) o regresa el dinero a su dueño (quien lo bloqueó). MicoPay no decide a quién se le paga.

## Qué cambia frente a producción

| ID | Cambio |
|---|---|
| L1 | El constructor exige la firma del admin. En producción se guarda sin firma |
| L1 | `decline` deja el trade en `Declined`, no en `Refunded`. Así se distingue un rechazo de un reembolso por vencimiento |
| L1 | Nuevo estado `Resolved`, para `resolve` (E5) |
| E1 | `lock` rechaza un `timeout_minutes` fuera de [mínimo, máximo] (`TimeoutOutOfRange`). Nace con 1 min y 24 h; el admin los cambia con `set_timeout_bounds` y se leen con `timeout_bounds`. El máximo no puede llegar al TTL de un trade (~30 días). El vencimiento se calcula con aritmética comprobada: un valor enorme da error en vez de abortar. Producción acepta 0 y aborta con valores enormes |
| E2 | `lock` rechaza una comisión de MicoPay mayor que el tope (`FeeAboveCap`): piso de `monto × fee_cap_bps / 10000`. Nace con 100 bps (1 %); el admin lo cambia con `set_fee_cap` (0 a 10000) y se lee con `fee_cap`. Solo afecta a locks futuros. **La comisión del agente no se toca:** va dentro del precio y el contrato no la ve. Producción no tiene tope en cadena |
| E7 | Pausa de emergencia: `pause` y `unpause` (solo el admin), `is_paused` para leerla. En pausa, `lock` y `extend` (E8) fallan con `Paused`. **Las salidas siguen**: `release`, `decline` y `refund` funcionan en pausa, para que nadie quede con su dinero atrapado. Producción no tiene pausa |
| E9 | Cambio de admin en dos pasos: `propose_admin(nuevo)` (firma el admin actual) y `accept_admin()` (firma el nuevo). El admin actual conserva todos sus permisos hasta que el nuevo acepta, y una propuesta nueva reemplaza a la anterior. Se leen con `admin` y `pending_admin`. Así el contrato nunca queda en manos de una dirección que nadie controla. Producción no puede cambiar de admin |
| E11 | Comisiones acumuladas: `release` ya no manda la comisión a la billetera de MicoPay; la suma a un saldo interno (`accrued_fees`). `claim_fees(to)` (solo el admin) la cobra aparte. Así, si la billetera de MicoPay está congelada o sin trustline, **al comprador sí se le paga**. En producción, ese `release` fallaría. Siempre se cumple: saldo del contrato = Σ(monto + comisión de los trades abiertos) + comisiones acumuladas |
| E12 | El comprador acepta: `accept(trade_id)`, con su firma y mientras el trade siga abierto, marca `accepted` en el trade. No cambia cómo se libera ni a quién se paga; sirve para que solo los trades aceptados cuenten en las estadísticas (E6). Así nadie infla o ensucia una reputación con trades entre cuentas propias o con un comprador que nunca firmó |
| E8 | Extender el plazo: `extend(trade_id, nuevo_vencimiento)`, con **la firma de las dos partes** sobre el mismo nuevo vencimiento. Solo en `Locked`, antes de vencer y fuera de pausa. El nuevo vencimiento tiene que ser posterior al actual y no pasar el tope de vida del trade: al bloquear, el trade guarda `lock_ledger` y `max_total_ledgers` (el máximo de E1 en ese momento), así que si el admin cambia los límites después, el trade conserva los suyos. Producción no puede extender |
| E3 | **Margen antes del reembolso.** Después del vencimiento T, el comprador conserva un margen para cobrar con el secreto: `refund` falla con `ClaimWindowOpen` hasta G = T + margen, y desde G funciona. `release` y `decline` siguen funcionando dentro del margen. Nace con **15 minutos**; el admin lo cambia con `set_claim_margin` (no puede ser 0) y se lee con `claim_margin`. Cada trade guarda su margen al bloquear (`margin_ledgers`), así que un cambio solo afecta a trades nuevos. La vida máxima de un trade ahora cuenta el máximo de E1 más el margen, y tiene que quedar debajo del TTL (~30 días). En producción, `refund` funciona justo al vencer |
| E4 | **"Ya pagué".** `report_paid(trade_id)`: el comprador (con su firma) dice que pagó el efectivo y no tiene el secreto. Solo **entre T y G**: antes de T nadie puede reembolsar, así que reportar solo congelaría el dinero del vendedor; desde G llega tarde (`ClaimWindowClosed`). Pasa el trade a `Disputed` y fija **D = máx(G, ahora + plazo de disputa)**; reportar nunca adelanta un reembolso. En disputa, `refund` falla con `DisputeOpen` hasta D y desde D funciona; `release` y `decline` siguen funcionando, y `extend` ya no. No se puede reportar dos veces. Funciona en pausa. El plazo nace en **7 días**; el admin lo cambia con `set_dispute_window` (no puede ser 0) y se lee con `dispute_window`. Cada trade guarda su plazo al bloquear. La vida máxima de un trade cuenta el máximo de E1 + el margen + el plazo de disputa. El reporte deja al trade con la vida completa (~30 días). Producción no tiene disputas |
| E5 | **Árbitro (experimento: el escrow real no lo tendrá).** El admin fija el árbitro de los trades futuros con `set_arbiter` (se lee con `arbiter`); nace sin árbitro. Cada trade guarda el árbitro vigente al bloquear, y un árbitro nuevo no toca trades abiertos. El árbitro no puede ser el vendedor ni el comprador: ese `lock` falla con `ArbiterIsParty`. `resolve(trade_id, to_buyer)`: solo el árbitro guardado, solo en `Disputed` (`NotDisputed` si no), una sola vez. A favor del comprador paga el monto y la comisión se acumula (E11); a favor del vendedor le regresa monto + comisión. Solo paga a las direcciones del trade. Funciona antes y después de D, y en pausa. Si el trade no tiene árbitro, `resolve` da `NoArbiter` y la salida sigue siendo `refund` desde D |
| E6 | **Contador de operaciones.** `stats(address)` da cinco números de una dirección, como vendedor o como comprador: completadas (`release`), reembolsadas (`refund`), rechazadas (`decline`), disputas abiertas (`report_paid`) y disputas perdidas (`resolve` en su contra). **Solo cuentan los trades que el comprador aceptó (E12).** Un reembolso en D sin `resolve` cuenta como reembolso, no como disputa perdida. Un cierre que falla no suma nada. Una dirección sin trades da todo en 0. Las estadísticas viven en almacenamiento persistente con ~30 días de TTL que se renueva con cada trade: las de una dirección inactiva se pueden archivar y hay que restaurarlas |
| E10 | **Eventos de lo nuevo**, con los datos reales y no con los argumentos de entrada: `disputed` (trade, comprador, D), `resolved` (trade, árbitro, destinatario real, lo pagado, la comisión), `paused` / `unpaused`, `extended` (trade, vencimiento anterior, nuevo), `adm_prop` (propuesto) y `adm_acc` (admin anterior, nuevo), `arbiter` (árbitro), `fees` (destino, lo acumulado; sin evento si no había nada) y `accepted` (trade, comprador). Una llamada que falla no deja evento |
| X1 | **Trade grande con un participante con tier.** El admin fija una regla con `set_tier_gate(registry, umbral, tier_minimo)` (se quita con `clear_tier_gate`, se lee con `tier_gate`). Desde el umbral, en unidades del token, `lock` consulta `get_tier` del registro de `labs/agent-tier`: si el vendedor tiene el tier mínimo vigente, pasa (ya firmó); si no, y el comprador lo tiene, el comprador también tiene que firmar; si nadie lo tiene, falla con `TierRequired`. Abajo del umbral no se consulta. Si el registro falla, el `lock` falla. Nace sin regla. Garantiza "firmó un participante con tier", no "el agente": el contrato no sabe quién es el agente |

Las siguientes funciones (E1–E12) están en el plan de labs.

**Asimetría:** si el árbitro no actúa, o el trade no tiene árbitro, la salida en D favorece al vendedor: "ya pagué" solo retrasa el reembolso; no protege al comprador.

## Testnet

`EscrowFactory` (labs): [`CCHYYI3MJNSIBDRXJDXNBV6OQEACS46CVBHMHR7JK7EBBMYATNKO3DWN`](https://stellar.expert/explorer/testnet/contract/CCHYYI3MJNSIBDRXJDXNBV6OQEACS46CVBHMHR7JK7EBBMYATNKO3DWN). Token: XLM nativo de testnet (SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`). Desplegado el 2026-11-27 desde `main` (f4347c9), con cuentas solo de testnet. Registro de tiers: [`CDQO4V75GDUYM6BPX666LGHKDQA7QBV5CFBHINQNABL7OJCAKPCMINCS`](https://stellar.expert/explorer/testnet/contract/CDQO4V75GDUYM6BPX666LGHKDQA7QBV5CFBHINQNABL7OJCAKPCMINCS) (ver `labs/agent-tier`).

Recorrido real, en orden:

| Paso | Transacciones |
|---|---|
| Despliegue (constructor con firma del admin, L1) | [`ba152e36…`](https://stellar.expert/explorer/testnet/tx/ba152e36459e4b0efe8fef1f340a68d01610eb80c680bbcf590cef85fca08f61) |
| `set_arbiter` (E5) | [`6095360e…`](https://stellar.expert/explorer/testnet/tx/6095360e79650e260ba44a2557e4e0893792140962db7adc8686d79df97d0137) |
| `set_tier_gate`: desde 1000 XLM, Plata (X1) | [`8c8db0ef…`](https://stellar.expert/explorer/testnet/tx/8c8db0ef41eb9a068c3aa010ad99c573a6dc4179bb741a19f38fe27be236229c) |
| A: `lock` 10 XLM → `accept` (E12) → `release`; la comisión se acumula (E11) | [`8c67fb40…`](https://stellar.expert/explorer/testnet/tx/8c67fb409433f889b4a78b62b8b425854494ca1ee7336dcbf989560b17d68837) · [`ec424b76…`](https://stellar.expert/explorer/testnet/tx/ec424b766a746f43a47e9c6adca9c9d309b693b9fadedc64849bc898440f053b) · [`2a22e4eb…`](https://stellar.expert/explorer/testnet/tx/2a22e4eb9669c3f5692a9647e787516585423ce603bdc00ae93e8ce0cc97ce82) |
| B: `lock` → `accept` → `decline`, queda `Declined` (L1) | [`c7f357d9…`](https://stellar.expert/explorer/testnet/tx/c7f357d9a973fc03383b0fccc6f1e5d75114d252525c4aec3afcaea37d71e3f7) · [`805eff09…`](https://stellar.expert/explorer/testnet/tx/805eff0906f5668356daf7bcd26ec35227b66518aa7eee386cf2302bd0a411c1) · [`1896c242…`](https://stellar.expert/explorer/testnet/tx/1896c242a1b4276cd9bc8bdeb0593706368e0099e3b9adceca39b6ab53b6586b) |
| C: `lock` 1 min → `accept` → en T, `report_paid` fija D a 7 días (E4) → `resolve` a favor del comprador (E5). Un `refund` antes de D se rechazó con `#24` (`DisputeOpen`) | [`7be8b46b…`](https://stellar.expert/explorer/testnet/tx/7be8b46b53d58fb98fdedae3d23312b5ccbd68759afe942b5a38feb062b9e9f9) · [`41c605fb…`](https://stellar.expert/explorer/testnet/tx/41c605fb2ddccd82d7bb50e29491d4b9d2f6171274fdaad50aa03428f3425526) · [`0ef36b7d…`](https://stellar.expert/explorer/testnet/tx/0ef36b7d4490d54bce839c426a331ad17b32cf0e57f1cfc8ace80b06ad386c85) · [`4ee740db…`](https://stellar.expert/explorer/testnet/tx/4ee740db7bc513a6da6e987ba67e8436f60e8335482748ca86aa891882b96504) |
| X1: `lock` de 1000 XLM de Lupe, con Plata probada por ZK en el registro real → `release`. El mismo `lock` de un vendedor sin tier se rechazó con `#21` (`TierRequired`) | [`0a9f4c58…`](https://stellar.expert/explorer/testnet/tx/0a9f4c5840c8b2d7ce5879d4d89170b947392a4c80430a606d412551c2ee041a) · [`412d8729…`](https://stellar.expert/explorer/testnet/tx/412d8729d1c412bf6d8ddf3255854c284e19302968905b9c254f10e3cca717e5) |
| E7: `pause` → un `lock` se rechazó con `#16` (`Paused`) → `unpause` | [`d39bc3fb…`](https://stellar.expert/explorer/testnet/tx/d39bc3fbae320833e7c2116ef436b8daa4ed81871d92a1e8258d1cdeaac85a02) · [`cdbad438…`](https://stellar.expert/explorer/testnet/tx/cdbad438320266d229aeadfd4fd997643946d5d749a4a8b5d3282fd2abc18cce) |
| E11: `claim_fees` cobra 0.96 XLM (0.08 de A + 0.08 de C + 0.8 de X1) | [`febfa062…`](https://stellar.expert/explorer/testnet/tx/febfa062a5dda969276303aff626fb5c4b4145613aeedadb71cf99929807511c) |
| E8: `lock` → `extend` +60 min con **las firmas del vendedor y del comprador** (script con el SDK de JS: el CLI solo firma por la cuenta de origen) → `decline` | [`dba4ac7e…`](https://stellar.expert/explorer/testnet/tx/dba4ac7ec403e47a8ce48dd9e27cd5c0babb381fc455d583b49c51dae52db83f) · [`6051fddd…`](https://stellar.expert/explorer/testnet/tx/6051fddddb2168623abb6c932db07f2c0578348558e660d2f4dcc9cb2ec60e8f) · [`fcd39c51…`](https://stellar.expert/explorer/testnet/tx/fcd39c517bde6ded50d61a58ecc172a4212fbdc717d4dd31000426d64d202649) |
| R: `lock` 1 min → `accept` → `refund` en G − 8 se rechazó con `#22` (`ClaimWindowOpen`, E3) → `refund` en G pasa | [`5401fd47…`](https://stellar.expert/explorer/testnet/tx/5401fd4729c59db992c6628d3c74e37334e870c4e024b2dc7c0fe0c1d6aaa8bc) · [`17f1c411…`](https://stellar.expert/explorer/testnet/tx/17f1c41109e9df44d07883fd5d88bc4d15321742ff2c3a538b60a529d579f019) · [`b21722c5…`](https://stellar.expert/explorer/testnet/tx/b21722c5859107196e1caff45f16d9c3f14fea8def3cd099537f6a186fea1b38) |

Al final:
- `stats` del vendedor: 1 completada, 1 reembolsada, 1 rechazada, 1 disputa abierta, 1 perdida; del comprador, igual, sin disputa perdida (E6). Los trades de Lupe y de E8 no se aceptaron y no cuentan;
- **saldo del contrato: 0**. Todos los trades cerrados y las comisiones cobradas.

No se probó en cadena el `refund` desde D (7 días). Ese caso lo cubre `test_state_table`.

## Plazos en ledgers, no en reloj

`timeout_minutes`, el margen de E3 y el plazo de disputa de E4 se convierten en ledgers a razón de **12 por minuto** (5 s por ledger). Si la red va más rápida o más lenta, el vencimiento real cambia: el contrato solo ve ledgers.

## Pruebas

```bash
cargo test
```

97 pruebas: las 9 de producción, 5 de L1, 7 de E1, 7 de E2, 3 de E7, 5 de E9, 4 de E11, 4 de E12, 6 de E8, 7 de X1, 6 de E3, 13 de E4, 9 de E5, 6 de E6, 5 de E10 y **la tabla de estados completa** (`test_state_table`). La tabla recorre 9 estados y momentos × 6 funciones, con y sin pausa (108 casos). Cada caso usa un trade nuevo y revisa el resultado, el estado después y que el saldo del contrato = monto + comisión de los trades abiertos + comisiones acumuladas. Desde E3, las pruebas de producción que reembolsan esperan también el margen. Las de X1 usan un registro de tiers simulado (`MockTierRegistry`): `labs/agent-tier` usa otra versión del SDK y su verificación necesita la prueba ZK. Las de firmas usan **firmas reales**, sin `mock_all_auths()`:
- el constructor falla sin la firma del admin, y la registra cuando la hay;
- `decline` falla si solo firma el vendedor;
- `release` falla si lo firma el vendedor, aunque tenga el secreto;
- `refund` y `decline` terminan en estados distintos.
- solo el admin cambia los límites de tiempo (E1) y el tope de comisión (E2), y pausa o quita la pausa (E7);
- solo el admin propone a otro, solo el propuesto acepta, y el admin anterior pierde sus permisos (E9).
- solo el admin cobra las comisiones acumuladas (E11).
- solo el comprador acepta su trade, no el vendedor (E12).
- `extend` necesita las dos firmas, y una firma sobre un vencimiento no sirve para otro (E8).
- en un trade grande, si solo el comprador tiene tier, tiene que firmar el `lock` (X1); solo el admin fija la regla.
- solo el admin cambia el margen antes del reembolso (E3).
- solo el comprador reporta "ya pagué", no el vendedor; solo el admin cambia el plazo de disputa (E4).
- solo el árbitro guardado en el trade resuelve: ni el vendedor, ni el comprador, ni un árbitro nuevo; solo el admin fija el árbitro (E5).
