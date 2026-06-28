# MicoPay — Stellar Testnet Reference

Canonical IDs for the **mobile stack** (micopay-backend + micopay/frontend).
The `micopay-api` x402 service uses a separate escrow contract; do not mix them.

## Contract IDs

| Contract | ID |
|----------|----|
| MicopayEscrow (HTLC) | `CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ` |
| MXNe token contract  | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| MXNe issuer address  | `GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV` |

Both contracts verified live on testnet (`stellar contract fetch --network testnet --id <ID>`
returns valid WASM with `initialize`, `lock`, `refund`, `release`, `get_trade` exports).

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
ESCROW_CONTRACT_ID=CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ
MXNE_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
MXNE_ISSUER_ADDRESS=GBZXN7PIRZGNMHGA7MUUUF4GWMTISGNQ5E72TFL6GDWPE6K4RCAVOALV
```

Frontend (`.env.testnet`):
```
VITE_ESCROW_CONTRACT_ID=CB4M5777YFQWKGDUULCX5W6PXEDJSJARDTMH4VV6FXC4W4UPANALO3HZ
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
  --network-passphrase "Test SDF Network ; September 2015"
# → prints new contract ID; update ESCROW_CONTRACT_ID everywhere
```

After redeploying, call `initialize` with the platform address before first use.
