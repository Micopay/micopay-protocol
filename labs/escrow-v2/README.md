# escrow-v2 (labs)

Copia experimental del escrow de MicoPay para probar más reglas en cadena. **Solo testnet. No es un plan de migración:** el escrow de producción (`micopay/contracts/escrow/`) se queda simple y no se toca desde aquí.

Se copió de `micopay/contracts/escrow/` en `origin/main` 5d62348. El crate se llama `micopay-labs-escrow-v2`, para que su WASM (`micopay_labs_escrow_v2.wasm`) no se confunda con el de producción.

## Cómo funciona (igual que producción)

| Función | Quién firma | Qué hace |
|---|---|---|
| `lock` | El vendedor | Bloquea monto + comisión de MicoPay hasta el ledger de vencimiento |
| `release` | El comprador, con el secreto | Paga el monto al comprador y la comisión a MicoPay. Funciona también después del vencimiento |
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

Las siguientes funciones (E1–E12) están en el plan de labs.

## Plazos en ledgers, no en reloj

`timeout_minutes` se convierte en ledgers a razón de **12 por minuto** (5 s por ledger). Si la red va más rápida o más lenta, el vencimiento real cambia: el contrato solo ve ledgers.

## Pruebas

```bash
cargo test
```

21 pruebas: las 9 de producción, 5 de L1 y 7 de E1. Las de firmas usan **firmas reales**, sin `mock_all_auths()`:
- el constructor falla sin la firma del admin, y la registra cuando la hay;
- `decline` falla si solo firma el vendedor;
- `release` falla si lo firma el vendedor, aunque tenga el secreto;
- `refund` y `decline` terminan en estados distintos.
- solo el admin cambia los límites de tiempo (E1).
