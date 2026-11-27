# smart-account (spike)

Pregunta: **¿el escrow real de MicoPay funciona con una smart wallet (cuenta de contrato `C…`), sin cambiar el escrow?**

Solo testnet. No es la smart wallet del producto: tiene un único firmante ed25519 y nada más (sin passkey, recuperación ni límites). El firmante ed25519 aísla la pregunta del escrow; el passkey en Capacitor es otro spike.

## El contrato

| Función | Qué hace |
|---|---|
| `__constructor(owner)` | Guarda la llave pública ed25519 que firma por la cuenta |
| `__check_auth` | Soroban la llama cuando un contrato pide `require_auth` de esta cuenta; verifica la firma del dueño |
| `owner()` | Lectura del firmante |

## Cómo se usa con el escrow

La cuenta `C…` no puede ser origen de una transacción ni pagar comisiones. Un **relayer** (`G…`) manda la transacción y paga; la smart account solo firma su **autorización** (el auth entry que devuelve la simulación).

## Resultado en testnet (2026-11-27)

Escrow real de XLM `CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4`, sin cambios. Smart account `CBOGBTLM6PLRFCCAYI5W575J7M7IJNZLEI4N4OP6XHSKCC7J7SZH4XQB`.

| Prueba | Resultado | Transacción |
|---|---|---|
| A. La `C…` bloquea 1 XLM + 0.01 de comisión | Saldo 5 → 3.99 | [613ee685…](https://stellar.expert/explorer/testnet/tx/613ee685980592c2b7686b0ca3c17e63f0031483bd2edbe2cf1e5a2a8b6bbf53) |
| A. El agente `G…` libera | Estado `Released`; el agente recibe 1 XLM | [3a9dc745…](https://stellar.expert/explorer/testnet/tx/3a9dc74584ae28e7a1ad97d77256dc6115a8d1a2bf6859c7fc0c6cd357ef60bb) |
| B. El agente `G…` bloquea | | [1da47779…](https://stellar.expert/explorer/testnet/tx/1da47779e5b70a8a5018246a04e0339c82671ba028b1abe683901279fd5dab84) |
| B. La `C…` libera y recibe | Recibe 1.0000000 XLM exacto (la comisión la pagó el relayer) | [6a4e8a7c…](https://stellar.expert/explorer/testnet/tx/6a4e8a7c95a9e83443512621a4a7feceeb3a233b1424cf0b3b31b8c142dadc26) |
| C. Lock firmado con otra llave | Rechazado: `Error(Auth, InvalidAction)` | — |

**Conclusión:** el escrow acepta una `C…` como vendedor y como comprador sin cambios. Lo que cambia está fuera del contrato: el backend tendría que dejar que el relayer sea el origen y devolver los auth entries para que la app los firme.

## Correr

```bash
cargo test                      # 4 pruebas del contrato
stellar contract build
node scripts/spike.mjs <ruta a @stellar/stellar-sdk>   # crea cuentas nuevas con friendbot
```

El script exige la passphrase de testnet y se detiene si el RPC dice otra. No guarda llaves.
