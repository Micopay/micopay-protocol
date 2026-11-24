# MicoPay — Stellar Testnet Reference

Canonical IDs for the **mobile stack** (micopay-backend + micopay/frontend).
The AI-agent/x402 product is maintained separately in
[`Micopay/micopaybridge`](https://github.com/Micopay/micopaybridge); do not mix
its deployments with the mobile app escrow described here.

## Escrow multiactivo activo (desde 2026-10-28)

Instancias con el fix de `lock` (#420), constructor atomico y cancelacion
temprana `decline`, una por activo. Se desplegaron desde el alias local
`ensayo-mainnet-script` con el WASM SHA-256
`6ec8aba7d201c6fec89e40a1437910fdc393d5b606370142ae115372afcf2693`.

| Activo | Escrow | Token (SAC) |
|---|---|---|
| USDC (emisor propio de pruebas `GADK7SUS7NHIGERQBKF7R67A5DNIEFWG4YKNHLTQM5JN4KP2QISMJSHG`) | `CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3` | `CCVAWF4XCJ5DLXHOFGO4TDEQBR6VJTIE5JYCZTXHCDULZ4XYH4GCVD23` |
| XLM | `CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4` | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

- Admin y wallet de plataforma de ambas: `GBD4V322KREETWAVJXMYUJP6CIWFKBEYT6L4NAXTXLQ7XNY535QQEGMQ`
  (alias `ensayo-mainnet-script` del CLI `stellar`, solo testnet).
- El USDC de testnet es un activo propio, no el de Circle: asi se puede emitir
  a las billeteras de demo sin depender del faucet. La llave del emisor esta en
  `~/.micopay/ensayo-usdc.json` (PC de Eric).
- Backend ECS revision 33:
  `ESCROW_CONTRACTS=USDC=CALS…,XLM=CCX5…`, ambos IDs en
  `ESCROW_DECLINE_CONTRACT_IDS`, y `ESCROW_LEGACY_CONTRACT_ID=CB4M…` para
  las operaciones anteriores a la columna `escrow_contract_id`.

Pruebas live del 2026-10-28:

- XLM: `lock` de 0.1000000 XLM + 0.0010000 de fee y `decline`; el evento
  `declined` devolvio 0.1010000 XLM al seller.
- USDC: saldo 10.0000000 -> 8.9900000 tras `lock` -> 10.0000000 tras
  `decline`; devolucion exacta de monto y fee.

## Instancias multiactivo anteriores (sin `decline`)

| Activo | Escrow anterior |
|---|---|
| USDC | `CDUI253FSVVVXUBI4SU3PEQIDNCYWGABGUOCRBIINRCJ4SJ5XVKWYGAX` |
| XLM | `CBFDXYUPL4Q37JP3JD6JHFG6BQGNG6VOTTGMBTTPE5TYDHOVRY5UNQWE` |

Las operaciones que ya tengan uno de estos IDs en `trades.escrow_contract_id`
siguen usando ese contrato para `release` o `refund`. No agregar estas
instancias a `ESCROW_DECLINE_CONTRACT_IDS`.

## Contract IDs (instancia original, solo XLM, sin el fix de #420)

| Contract | ID |
|----------|----|
| MicopayEscrow (HTLC) | `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ` |
| **XLM (native) SAC** — token del escrow | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| MXNe issuer address (sin SAC desplegado) | `GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV` |

> ⚠️ **Corregido el 2026-09-05.** Esta tabla etiquetaba `CDLZFC3S…` como "MXNe
> token contract". **Es el Stellar Asset Contract del XLM nativo**, verificado
> de dos formas independientes: su `symbol()` devuelve `native`, y
> `Asset.native().contractId(Networks.TESTNET)` da exactamente ese ID.
>
> El error costo caro. El diagnostico WP0 del plan multiactivo (2026-07-02) leyo
> correctamente el `TokenId` del escrow en cadena, lo comparo contra esta tabla,
> concluyo "la instancia es MXNe" y de ahi dedujo que la conversion 1:1 del
> backend era correcta. No lo era: el escrow bloquea XLM, y `amount_stroops =
> amount_mxn * 10^7` hacia que una operacion de 500 pesos bloqueara 500 XLM
> (~1 563 pesos). La verificacion fue real; la referencia contra la que se
> comparo estaba mal.
>
> No hay ningun SAC de MXNe desplegado en testnet a dia de hoy. El issuer de
> arriba existe, pero su contrato de activo no.

La instancia original **no** incluye `decline`; no debe agregarse a
`ESCROW_DECLINE_CONTRACT_IDS`.

## Platform account

| Key | Value |
|-----|-------|
| Public key | `GDKKW2WSMQWZ63PIZBKDDBAAOBG5FP3TUHRYQ4U5RBKTFNESL5K5BJJK` |
| Secret key  | Set as `PLATFORM_SECRET_KEY` in Render dashboard (never commit) |
| Funded      | 2026-06-27 via friendbot |
| Role        | Signs all on-chain HTLC lock/release/refund txs as escrow operator |

To re-fund (testnet XLM expires):
```
stellar keys fund GDKKW2WSMQWZ63PIZBKDDBAAOBG5FP3TUHRYQ4U5RBKTFNESL5K5BJJK \
  --network testnet \
  --network-passphrase "Test SDF Network ; September 2015"
```

## Env vars

Backend (`render.yaml` / `.env`):
```
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK=TESTNET
ESCROW_CONTRACTS=USDC=CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3,XLM=CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4
ESCROW_LEGACY_CONTRACT_ID=CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ
ESCROW_DECLINE_CONTRACT_IDS=CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3,CCX5E4ALJ5J5ZUOW7ZKXYDJ23ZREKDWYR6JR62NBOSTHUQ3LIGKG6GU4
MXNE_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
MXNE_ISSUER_ADDRESS=GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV
```

Frontend (`.env.testnet`):
```
VITE_ESCROW_CONTRACT_ID=CALS46FVLSLLPASFHAZVRCSQCUFUSKW64547L6OUDLLPEORKNCXDUDH3
VITE_MXNE_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
VITE_MXNE_ISSUER_ADDRESS=GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV
VITE_API_URL=https://micopay-backend.onrender.com  # confirm after first Render deploy
```

## Re-deploying the escrow contract

Source: `micopay/contracts/escrow/` (Rust/Soroban).

```bash
cd micopay/contracts/escrow
stellar contract build
stellar contract deploy \
  --wasm target/wasm32v1-none/release/micopay_escrow.wasm \
  --source <platform_secret> \
  --network testnet \
  --network-passphrase "Test SDF Network ; September 2015" -- \
  --admin <platform_address> \
  --token_id <token_contract_id> \
  --platform_wallet <fee_wallet_address>
# → prints new contract ID; update ESCROW_CONTRACT_ID everywhere
```

El constructor inicializa el contrato dentro del despliegue. Agrega el nuevo ID
a `ESCROW_CONTRACTS` y `ESCROW_DECLINE_CONTRACT_IDS`; conserva los IDs viejos
para operaciones abiertas y reembolsos por timeout.
