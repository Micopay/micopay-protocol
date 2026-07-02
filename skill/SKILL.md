# MicoPay Protocol — Agent Skill

**Payment:** x402 (USDC on Stellar or Base) — no API keys, no signup
**Discovery:** `GET /api/v1/services`
**Networks:** Stellar Testnet, Base Sepolia

---

## What is MicoPay?

MicoPay Protocol is the first API that gives AI agents access to **physical cash in Mexico**.

An agent can find a trusted merchant near the user's location, verify their on-chain reputation,
and initiate a trustless USDC → MXN cash exchange — all in milliseconds, paying per-request
with USDC via x402. No bank. No intermediary. No blind trust.

The agent receives a `claim_url` the user opens on their phone to show the QR at the merchant.
Works from any AI interface: Claude, GPT, Telegram bot, WhatsApp — no app required.

**The payment IS the authentication.**

---

## How to pay (x402)

1. Send a request to any paid endpoint — you get a `402 Payment Required` response
2. Build a Stellar USDC payment tx to the `pay_to` address in the challenge
3. Include the signed tx XDR in the `X-Payment` header
4. Resend the request with the header — you get a `200` with data

```
GET /api/v1/cash/agents?lat=19.42&lng=-99.16&amount=500
→ 402 { challenge: { amount_usdc: "0.001", pay_to: "G...", memo: "micopay:cash_agents" } }

GET /api/v1/cash/agents?lat=19.42&lng=-99.16&amount=500
X-Payment: <signed_xdr>
→ 200 { agents: [...], usdc_mxn_rate: 17.5 }
```

---

## Paying from Base

Every priced endpoint also accepts USDC on **Base Sepolia** — the 402 response's
`accepts[]` array lists both options (`stellar-usdc` and `exact`/`base-sepolia`);
don't hardcode one, read `accepts[]` and pick the network you're on.

```
POST /api/v1/credentials/buy
→ 402 {
    "accepts": [
      { "scheme": "stellar-usdc", "network": "testnet", "payTo": "G...", "asset": "G...", "maxAmountRequired": "0.01" },
      { "scheme": "exact", "network": "base-sepolia", "payTo": "0x...", "asset": "0x036CbD53...", "maxAmountRequired": "10000" }
    ]
  }
```

Base payments use **EIP-3009** (`transferWithAuthorization`) — sign an off-chain
authorization with your agent's own key (no relayer, no gas, no ETH needed on
your end), base64-encode the x402 JSON envelope, send it as `X-Payment`:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0x...", "to": "0x...", "value": "10000",
      "validAfter": "...", "validBefore": "...", "nonce": "0x..."
    }
  }
}
```

A full working reference implementation — discovers the payment requirement,
signs, pays, buys an anonymous ZK credential, and spends it at `/inference` —
lives at [`examples/agent/`](../examples/agent). It never touches a Stellar
account: it pays on Base, MicoPay verifies anonymous trust and settles on
Stellar/Soroban behind the API.

**The flagship Base-payable flow:** `credential_buy` (x402, public payment) →
`inference` (ZK proof, anonymous spend, nullifier burned on Soroban) — pay
once, spend privately, unlinkable to the purchase. See `credential_buy` and
`inference` in the service catalog below.

---

## Endpoints

### Free (no payment)

| Endpoint | Description |
|---|---|
| `GET /health` | API health check |
| `GET /api/v1/services` | Full service catalog |
| `GET /skill.md` | This file |
| `GET /api/v1/fund/stats` | Fund MicoPay live stats |
| `GET /api/v1/cash/request/:id` | Poll cash request status |

### Paid (x402 USDC)

| Endpoint | Price | Description |
|---|---|---|
| `GET /api/v1/cash/agents` | $0.001 | Find available cash merchants near a location |
| `GET /api/v1/reputation/:address` | $0.0005 | Verify merchant on-chain reputation |
| `POST /api/v1/cash/request` | $0.01 | Initiate USDC → MXN physical cash exchange |
| `POST /api/v1/fund` | $0.10 min | Fund the MicoPay project (meta-demo) |
| `POST /api/v1/credentials/buy` | $0.01 | Buy an anonymous, single-use ZK access credential (Stellar or Base) |
| `POST /api/v1/inference` | free* | *Spend a credential bought above — the ZK proof is the payment proof |

---

## Complete example: the full agent flow

```bash
# User says: "I need $500 MXN in cash near Roma Norte, CDMX"

# 1. Find nearby merchants ($0.001 USDC)
curl -H "X-Payment: <xdr>" \
  "https://api.micopay.xyz/api/v1/cash/agents?lat=19.4195&lng=-99.1627&amount=500"
# → { agents: [{ name: "Farmacia Guadalupe", distance_km: 0.3, tier: "maestro", ... }] }

# 2. Verify merchant reputation ($0.0005 USDC)
curl -H "X-Payment: <xdr>" \
  "https://api.micopay.xyz/api/v1/reputation/GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKUJI5KOOJ9TXWNTBBS2JN"
# → { tier: "maestro", completion_rate: 0.98, trades: 312, agent_signal: { trusted: true } }

# 3. Initiate cash exchange ($0.01 USDC)
# HTLC locks ~28.57 USDC (= $500 MXN at 17.5 rate). Returns claim_url for the user.
curl -X POST -H "X-Payment: <xdr>" -H "Content-Type: application/json" \
  -d '{"merchant_address":"GCEZWKCA5...","amount_mxn":500}' \
  "https://api.micopay.xyz/api/v1/cash/request"
# → {
#     "claim_url": "https://app.micopay.xyz/claim/mcr-4b6c0e5c",
#     "qr_payload": "micopay://claim?request_id=mcr-4b6c0e5c&...",
#     "instructions": "Go to Farmacia Guadalupe, Orizaba 45..."
#   }

# Agent responds to user:
# "Go to Farmacia Guadalupe at Orizaba 45.
#  Open this link on your phone to show the QR: https://app.micopay.xyz/claim/mcr-4b6c0e5c"

# User opens URL → sees QR → walks to pharmacy → shows phone → gets cash.
# Merchant scans QR → USDC released on-chain.

# 4. Fund MicoPay (meta-demo, $0.10 USDC)
curl -X POST -H "X-Payment: <xdr>" -H "Content-Type: application/json" \
  -d '{"message":"x402 works!"}' \
  "https://api.micopay.xyz/api/v1/fund"
# → { thank_you: true, total_funded_usdc: "12.60" }
```

**Total paid by agent: ~$0.1115 USDC**
**User received: $500 MXN in physical cash**

---

## The claim_url — how any agent delivers the QR

The `cash_request` response includes a `claim_url` pointing to a hosted QR page:

```
https://app.micopay.xyz/claim/<request_id>
```

- Works in any browser — no app install required
- Shows the QR full-screen, merchant name, amount, expiry countdown
- Live status polling: pending → accepted → completed
- Designed for mobile (user shows phone to merchant)

**This means any AI agent interface can complete the flow:**
- Claude / ChatGPT → paste the URL in chat
- Telegram bot → inline button `[Ver QR 📱]` that opens the URL
- WhatsApp → send the URL as a message
- SMS → send a short link

---

## Reputation tiers

| Tier | Emoji | Requirement | Agent recommendation |
|---|---|---|---|
| Maestro | 🍄 | ≥100 trades, ≥95% completion | Send user with full confidence |
| Experto | ⭐ | ≥30 trades, ≥88% completion | Reliable, good choice |
| Activo | ✅ | ≥10 trades, ≥80% completion | Growing reputation, acceptable |
| Espora | 🌱 | New merchant | Use with caution |

NFT soulbound badges certify top tiers. They cannot be transferred or purchased — earned only.

---

## Why not generic USDC/XLM swaps?

Those already exist on Stellar DEX, Uniswap, and any exchange — for free.
MicoPay only charges for what **only MicoPay can do**: access to physical cash
in Mexico through a verified merchant network.

---

## Architecture

- **Merchant network:** Real businesses in Mexico registered on MicoPay P2P app
- **Reputation:** On-chain trade records + NFT soulbound badges (non-transferable)
- **HTLC:** MicopayEscrow Soroban contract — trustless, atomic, no custodian
- **x402 middleware:** Payment IS authentication — no accounts, no API keys
- **claim_url:** Hosted QR page — works from any AI interface, no app required
- **Future:** AtomicSwapHTLC enables entry from any chain (ETH, BTC, SOL) → cash in Mexico

The merchant never receives USDC until the user physically collects the cash.
The user never loses USDC if they don't collect — timeout returns it.
