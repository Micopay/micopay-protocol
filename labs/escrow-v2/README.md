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
| L1 | Nuevo estado `Resolved`, reservado para `resolve` (E5). Todavía ninguna función lo usa |
| E1 | `lock` rechaza un `timeout_minutes` fuera de [mínimo, máximo] (`TimeoutOutOfRange`). Nace con 1 min y 24 h; el admin los cambia con `set_timeout_bounds` y se leen con `timeout_bounds`. El máximo no puede llegar al TTL de un trade (~30 días). El vencimiento se calcula con aritmética comprobada: un valor enorme da error en vez de abortar. Producción acepta 0 y aborta con valores enormes |
| E2 | `lock` rechaza una comisión de MicoPay mayor que el tope (`FeeAboveCap`): piso de `monto × fee_cap_bps / 10000`. Nace con 100 bps (1 %); el admin lo cambia con `set_fee_cap` (0 a 10000) y se lee con `fee_cap`. Solo afecta a locks futuros. **La comisión del agente no se toca:** va dentro del precio y el contrato no la ve. Producción no tiene tope en cadena |
| E7 | Pausa de emergencia: `pause` y `unpause` (solo el admin), `is_paused` para leerla. En pausa, `lock` y `extend` (E8) fallan con `Paused`. **Las salidas siguen**: `release`, `decline` y `refund` funcionan en pausa, para que nadie quede con su dinero atrapado. Producción no tiene pausa |
| E9 | Cambio de admin en dos pasos: `propose_admin(nuevo)` (firma el admin actual) y `accept_admin()` (firma el nuevo). El admin actual conserva todos sus permisos hasta que el nuevo acepta, y una propuesta nueva reemplaza a la anterior. Se leen con `admin` y `pending_admin`. Así el contrato nunca queda en manos de una dirección que nadie controla. Producción no puede cambiar de admin |
| E11 | Comisiones acumuladas: `release` ya no manda la comisión a la billetera de MicoPay; la suma a un saldo interno (`accrued_fees`). `claim_fees(to)` (solo el admin) la cobra aparte. Así, si la billetera de MicoPay está congelada o sin trustline, **al comprador sí se le paga**. En producción, ese `release` fallaría. Siempre se cumple: saldo del contrato = Σ(monto + comisión de los trades abiertos) + comisiones acumuladas |
| E12 | El comprador acepta: `accept(trade_id)`, con su firma y mientras el trade siga abierto, marca `accepted` en el trade. No cambia cómo se libera ni a quién se paga; sirve para que solo los trades aceptados cuenten en las estadísticas (E6). Así nadie infla o ensucia una reputación con trades entre cuentas propias o con un comprador que nunca firmó |
| E8 | Extender el plazo: `extend(trade_id, nuevo_vencimiento)`, con **la firma de las dos partes** sobre el mismo nuevo vencimiento. Solo en `Locked`, antes de vencer y fuera de pausa. El nuevo vencimiento tiene que ser posterior al actual y no pasar el tope de vida del trade: al bloquear, el trade guarda `lock_ledger` y `max_total_ledgers` (el máximo de E1 en ese momento), así que si el admin cambia los límites después, el trade conserva los suyos. Producción no puede extender |
| E3 | **Margen antes del reembolso.** Después del vencimiento T, el comprador conserva un margen para cobrar con el secreto: `refund` falla con `ClaimWindowOpen` hasta G = T + margen, y desde G funciona. `release` y `decline` siguen funcionando dentro del margen. Nace con **15 minutos**; el admin lo cambia con `set_claim_margin` (no puede ser 0) y se lee con `claim_margin`. Cada trade guarda su margen al bloquear (`margin_ledgers`), así que un cambio solo afecta a trades nuevos. La vida máxima de un trade ahora cuenta el máximo de E1 más el margen, y tiene que quedar debajo del TTL (~30 días). En producción, `refund` funciona justo al vencer |
| X1 | **Trade grande con un participante con tier.** El admin fija una regla con `set_tier_gate(registry, umbral, tier_minimo)` (se quita con `clear_tier_gate`, se lee con `tier_gate`). Desde el umbral, en unidades del token, `lock` consulta `get_tier` del registro de `labs/agent-tier`: si el vendedor tiene el tier mínimo vigente, pasa (ya firmó); si no, y el comprador lo tiene, el comprador también tiene que firmar; si nadie lo tiene, falla con `TierRequired`. Abajo del umbral no se consulta. Si el registro falla, el `lock` falla. Nace sin regla. Garantiza "firmó un participante con tier", no "el agente": el contrato no sabe quién es el agente |

Las siguientes funciones (E1–E12) están en el plan de labs.

## Plazos en ledgers, no en reloj

`timeout_minutes` y el margen de E3 se convierten en ledgers a razón de **12 por minuto** (5 s por ledger). Si la red va más rápida o más lenta, el vencimiento real cambia: el contrato solo ve ledgers.

## Pruebas

```bash
cargo test
```

63 pruebas: las 9 de producción, 5 de L1, 7 de E1, 7 de E2, 3 de E7, 5 de E9, 4 de E11, 4 de E12, 6 de E8, 7 de X1 y 6 de E3. Desde E3, las pruebas de producción que reembolsan esperan también el margen. Las de X1 usan un registro de tiers simulado (`MockTierRegistry`): `labs/agent-tier` usa otra versión del SDK y su verificación necesita la prueba ZK. Las de firmas usan **firmas reales**, sin `mock_all_auths()`:
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
