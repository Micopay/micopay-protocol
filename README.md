# 🍄 MicoPay

**Private, verifiable resource access for AI agents — built on Stellar/Soroban ZK, reachable from Base.**

> Also the mobile app that turns digital dollars into physical pesos, trustlessly, on Stellar
> (see [below](#what-is-micopay)). One escrow engine, one growing ecosystem — the ZK Agent
> Credentials layer below is the newest, most active surface.

---

## 🔐 ZK Agent Credentials — private, verifiable, single-use access

> Full docs, audit trail, and work-package history:
> [`docs/zk-agent-credentials/`](./docs/zk-agent-credentials/STATUS.md).

**The problem.** AI agents already pay per API call over x402 — but every payment is public,
on-chain, permanent. Anyone can reconstruct an agent's full consumption pattern: which APIs, how
often, how much. Paying became an accidental confession of strategy.

**The fix.** Separate *paying* from *using*. An agent buys an anonymous access credential
(public x402 payment — a payment has nothing to hide), then *spends* it with a zero-knowledge
proof that reveals only "I hold one valid, unused credential" — never which one, never who holds
it. The nullifier burns on-chain, so it can be spent exactly once. Verified on **Stellar/Soroban**
using BN254 host functions (`g1_msm`, `pairing_check`, Protocol 25/26).

```
BUY    POST /api/v1/credentials/buy   (x402, PUBLIC payment — Stellar or Base)
       → issue an anonymous credential + activate its Merkle root on-chain
            │
SPEND  POST /api/v1/inference          (credential + ZK proof, ANONYMOUS)
       → verify_unique() burns the nullifier on-chain → Claude responds
            │
REUSE  same proof again → 409 NullifierAlreadyUsed (rejected on-chain, not app-level)
```

### What's real — deployed and verified on Stellar testnet

- **`ZkVerifierRegistry`** (Soroban/Rust): `CCZHC456HBJRTZP45V5AT3ILHP3MOVH36MHR7HUWQHV2JLN6MJEITXB2`
  — 3 circuits registered: `access_credential_v1` 🏆 (flagship, burn-once anonymous access),
  `reputation_v1` (private tier proof, same engine), `poseidon_preimage` (building block).
  Source: [`contracts/zk-verifier/src/lib.rs`](./contracts/zk-verifier/src/lib.rs).
- **Full pipeline, verified live, not simulated:** buy → real ZK proof (Noir/UltraHonk) → spend →
  real Claude completion → reuse rejected with `409`. Runnable end-to-end via
  `POST /api/v1/demo/run-zk` ([`apps/api/src/routes/demo.ts`](./apps/api/src/routes/demo.ts)) or
  the **"🔐 ZK Access"** tab in the dashboard
  ([`apps/web/src/components/ZKDemoTerminal.tsx`](./apps/web/src/components/ZKDemoTerminal.tsx)).
- **Security audit closed, not just run.** An independent audit against the payment/ZK pipeline
  found 7 issues (payment settlement wasn't actually confirmed on-chain, a mock-payment bypass
  reachable outside dev, a fail-open Merkle root check, a dead replay-protection store, a client
  could hijack the shared credential pool's trust root, one key held both hot gas-paying and cold
  admin rights, nullifier TTL lapsed in ~12 days) — **all 7 fixed and the contract redeployed**
  with the fixes live. Full writeup:
  [`docs/zk-agent-credentials/AUDIT_2026-07.md`](./docs/zk-agent-credentials/AUDIT_2026-07.md).

### Reachable from Base — not just Stellar

Agents live where the x402 volume is (Base), not necessarily on Stellar. Every priced endpoint
now accepts USDC on **Base Sepolia** via canonical **EIP-3009** (`transferWithAuthorization`),
alongside Stellar — same middleware, same credential, same anonymity guarantee:

- **Payment verification** ([`apps/api/src/middleware/x402.ts`](./apps/api/src/middleware/x402.ts)):
  server-built EIP-712 domain (never trusts a client-supplied domain), BigInt amount comparison,
  both `validAfter`/`validBefore` checked, atomic claim-before-settle (closes a concurrent
  double-spend window), facilitator-primary settlement with a self-submit fallback.
- **Verified live against the real network**, not just mocked: a real EIP-3009 signature,
  submitted to the actual deployed Base Sepolia USDC contract, real on-chain settlement, a real
  credential issued — see [`examples/agent/`](./examples/agent), a standalone reference agent
  that never imports `@stellar/stellar-sdk` or touches a Stellar key. Found and fixed a real
  signature bug (wrong EIP-712 domain name) by actually running it against testnet, not just
  reading the code.
- **Wallet provisioned**, hot/cold key separation by design: a treasury address that only ever
  *receives* payments (its key is deliberately kept out of any file the server reads) and a
  separate relayer key that only pays gas. **Not yet funded with testnet ETH/USDC** — the code
  path is complete and tested, the live balance is the one remaining step before a funded demo.
- **Not yet built:** Circle CCTP (Base→Stellar settlement bridge) is designed but not implemented
  — see [Roadmap](#roadmap). Listing on agentic.market is researched, not executed (needs a public
  deployment first). Full plan and review:
  [`docs/zk-agent-credentials/BASE_IMPLEMENTATION_PLAN_2026-07.md`](./docs/zk-agent-credentials/BASE_IMPLEMENTATION_PLAN_2026-07.md).

### Circuits

| Circuit | What it proves | Role |
|---|---|---|
| `access_credential_v1` 🏆 | "I hold a valid, unspent credential in this set" — without revealing which, who I am, or linking my uses | **Flagship.** Merkle membership + single-use nullifier. |
| `reputation_v1` | "My reputation tier is ≥ T" — without revealing identity, address, or exact score | Same engine, leaf = tier. |
| `poseidon_preimage` | "I know the secret behind this hash" — without revealing it | Building block for HTLC coordination. |

Built with **Noir + UltraHonk (barretenberg)**; hash is BN254 **Pedersen** (`poseidon::bn254` isn't
exported in nargo 1.0.0-beta.9). Toolchain pins: [`TOOLCHAIN.md`](./TOOLCHAIN.md). Product
narrative + demo script: [`docs/zk-agent-credentials/NARRATIVA_VENDIBLE_2026-07.md`](./docs/zk-agent-credentials/NARRATIVA_VENDIBLE_2026-07.md).

---

## What is MicoPay?

> 🌎 **PULSO Hackathon — NearX × Stellar Development Foundation.** Live on Stellar **testnet**,
> validated with real customer-discovery interviews across LATAM (Mexico, Argentina, Colombia)
> and beyond. Start with the app: [`micopay/frontend`](./micopay/frontend) · then the ecosystem below.

> 🌊 **Also supported by Stellar Drips (Waves 4–6).** Born at *Código Alebrije* (CDMX). The
> retail mobile app is the product; the Drips work hardens it into a two-phone reality. Contributors:
> see [`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md) and [Contributing](#contributing-drips).

---

MicoPay starts as **a mobile app for financial access in Mexico** — and grows into **an open
escrow protocol** that any AI agent or chain can plug into.

**1. The mobile app (our product).** Already live on Stellar testnet. A single wallet that lets
anyone:

- **Cash out / cash in** — convert USDC ↔ physical MXN cash through a nearby person or shop, with
  a Soroban HTLC escrow guaranteeing nobody gets robbed. *Think Uber for crypto cashout.*
- **Invest in CETES** — buy tokenized Mexican government bonds (Etherfuse) directly from the wallet,
  swapped over the **Stellar DEX** — no broker, no bank account.
- **On/off-ramp via SPEI** — connect a Mexican bank account and move pesos in and out through the
  **Etherfuse anchor**.

No bank account required. No CEX. The user never thinks about which chain their money lives on.

**2. The protocol (the ecosystem).** The *same* Soroban escrow that powers the app is exposed over
HTTP with **x402 micropayments**, so Claude, GPT, a Telegram or WhatsApp bot — any AI agent — can do
what a MicoPay user does in a single API call. We extend the escrow further into **agent-to-agent
atomic swaps**, **zero-knowledge private access**, and **cross-chain bridges** (Base via CCTP, XRPL).

The connection: **one contract, many doors.** `MicopayEscrow` (deployed on testnet) is the trust
primitive under both the app and the agent API. We didn't build a demo — we opened a real product to
the rest of the machine economy.

```
User → "I need $500 MXN in cash near Roma Norte, CDMX"

App (or an AI agent on the user's behalf):
  1.  find nearby cash provider → Farmacia Guadalupe, 0.3km, tier Maestro 🍄
  2.  check on-chain reputation → 98% completion, 312 trades, trusted: true
  3.  lock USDC in escrow (real Soroban HTLC) → returns a claim QR
  4.  "Go to Orizaba 45. Open: https://app.micopay.xyz/claim/mcr-xxx"

User opens link → full-screen QR on phone → walks to pharmacy → gets $500 MXN cash.
Merchant scans QR → USDC released on Soroban. Nobody could cheat.
```

---

## 🇲🇽 The Problem

Over 60% of Mexico's population is unbanked or underbanked. Cash is king. Crypto on-ramps require
bank accounts, KYC, and days of waiting. Even when someone *has* USDC — earned freelancing, received
from abroad, or bought on an exchange — converting it to physical pesos is slow, expensive, and
requires infrastructure that doesn't exist in most neighborhoods.

MicoPay is **the Uber of crypto cashout**: anyone with MXN cash can become a liquidity provider —
your neighbor, the taquero on the corner, a pharmacy, a tienda. They register, set their rate, and
wait for requests. On the other side, anyone with USDC — from any source, any chain — gets matched
to the nearest available person and walks away with pesos in minutes.

The HTLC escrow is what makes it trustless: the cash provider only receives USDC *after* handing over
cash, and the user always gets a full refund if no one shows up. No escrow service, no bank, no
intermediary — just two people and a smart contract.

This unlocks scenarios that have no good solution today:

- A freelancer paid in USDC needs rent money by Friday
- A tourist with ETH needs pesos in a neighborhood with no ATM
- **Remittances**: someone's family receives USDC from abroad and needs it as cash the same day — no
  bank account, no Western Union queue, no 5-day wait
- An AI agent managing a user's finances needs to liquidate USDC without touching a CEX

---

## 📱 The MicoPay Mobile App — our solution

The mobile app (`micopay/frontend`, port 5181) is the heart of the project. It shares the same
Soroban contracts and merchant network as the agent protocol. Three things in one wallet:

> **Demo scope**: The live demo runs against simulated testnet providers and simulated Etherfuse
> flows. The P2P matching engine, open provider registration, and the live Etherfuse SDK are the
> next implementation milestones (see roadmap). What is real on-chain today: the Soroban HTLC
> escrow and the Stellar DEX path-payment plumbing.

### 1️⃣ Cash In / Cash Out (P2P escrow) — *the trust engine*

Anyone with MXN cash can join as a liquidity provider — neighbors, street vendors, small shops,
anyone. They set their rate and availability; the app matches them with nearby users.

- User selects amount → map shows nearby providers sorted by distance, tier, and availability
- Provider is notified → chat opens for coordination
- USDC is locked on-chain via `MicopayEscrow` HTLC
- User walks to provider → shows QR → receives cash → USDC released
- **Provider never gets USDC without giving cash. User always gets a full refund if no one shows.**

This is the part our customer-discovery work validated most strongly: *"seeing the USDC locked in
escrow before I hand over any cash — that single guarantee removes most of my risk."* (see
[Customer Discovery](#-customer-discovery--validation)).

### 2️⃣ CETES Tokenizados — investment via the Stellar DEX (Etherfuse)

- Invest in Mexican government bonds tokenized on Stellar — competitive APY, from the same wallet
- No broker, no bank account
- Buy/sell with XLM, USDC, or MXNe over the **Stellar DEX** using `pathPaymentStrictSend`
- Full UI implemented; DEX swap path connected; live rates pulled from the Etherfuse API (with a
  graceful fallback) — mainnet requires CETES liquidity on Stellar

### 3️⃣ Etherfuse Anchor — SPEI on/off-ramp

- Connect a Mexican bank account → buy/sell CETES on Stellar via **SPEI** through the Etherfuse anchor
- **Onramp**: SPEI transfer to an Etherfuse CLABE → CETES credited to the user's Stellar wallet
- **Offramp** (anchor mode): the app signs a Stellar payment of CETES to Etherfuse's account with a
  memo → Etherfuse detects it on-chain → sends MXN via SPEI to the user's bank
- KYC-gated, B2B API key stays server-side. Full implementation plan in
  [`docs/SPEI_ANCHOR_PLAN.md`](./docs/SPEI_ANCHOR_PLAN.md); contributor flow runs against backend stubs.

### 4️⃣ Blend DeFi (bonus surface)

- **Borrow**: Deposit XLM as collateral → get USDC/MXNe instantly (health factor tracked)
- **Yield**: Supply crypto to earn yield via Blend Protocol
- Full UI implemented (pool data, health factor, supply/borrow flows); mainnet-ready architecture

### The claim_url — one QR for any interface

When a cash request is created (by the app **or** by an agent), it returns a `claim_url`:

```json
{
  "claim_url": "https://app.micopay.xyz/claim/mcr-4b6c0e5c",
  "qr_payload": "micopay://claim?request_id=mcr-4b6c0e5c&secret=...&contract=CBQINHLR...",
  "instructions": "Go to Farmacia Guadalupe, Orizaba 45..."
}
```

The user opens the URL → full-screen QR → shows it to the merchant. **No app install required.**

| Interface | How it works |
|---|---|
| **MicoPay app** | Renders natively via `ClaimQR.tsx` at `/claim/:id` |
| **Claude / ChatGPT** | Agent pastes the URL in chat |
| **Telegram bot** | Inline button `[Ver QR 📱]` links to the URL |
| **WhatsApp** | Agent sends the URL as a message |

---

## 🌐 The Ecosystem — extending the escrow

The same trust primitive, opened to the rest of the machine economy.

### 🤖 Agent access via x402 (paid APIs, no keys)

Every endpoint is pay-per-request via **x402** — no API key, no signup, no JWT. **Payment IS
authentication.** An AI agent autonomously pays a few cents of USDC per call to find cash merchants,
check reputation, and lock an HTLC — reaching physical MXN cash from any chat interface.

| What we built | How |
|---|---|
| Paid agent services / APIs | Every endpoint pay-per-request via x402 — no API key ever |
| Agent-to-agent payments | Agent autonomously pays for each service call with USDC |
| Agent marketplaces / discovery | `SKILL.md` + `/api/v1/services` — any agent finds us automatically |
| DeFi integrations | Soroban HTLC escrow (deployed) + AtomicSwapHTLC (built + 37 tests) |
| Agent intent layer (Bazaar) | Social feed where agents broadcast and coordinate cross-chain swaps |

### 🕸️ Agent Bazaar — the social layer for atomic swaps

The Bazaar is a public intent feed where AI agents broadcast what they have and what they want — and
other agents respond. Think Twitter/X for machine-to-machine liquidity coordination.

```
Agent A posts:  "Have 1.2 ETH on Ethereum. Want 3,200 USDC on Stellar."
Agent B replies: "I'll take it. Here's my quote."
Agent A accepts → Stellar side locked on Soroban via MicopayEscrow HTLC.
AtomicSwapHTLC resolves the ETH side on the other chain.
```

Every action costs a small x402 micropayment — this keeps the feed signal-rich and spam-free. Only
agents with real liquidity broadcast.

| Endpoint | Price | What it does |
|---|---|---|
| `POST /api/v1/bazaar/intent` | $0.005 | Broadcast: "I have X on chain A, want Y on chain B" |
| `GET /api/v1/bazaar/feed` | $0.001 | Read all active intents — live arbitrage and swap opportunities |
| `POST /api/v1/bazaar/quote` | $0.002 | Send a private quote to an intent's agent |
| `POST /api/v1/bazaar/accept` | $0.005 | Seal the deal — locks Stellar side on Soroban as cross-chain collateral |

> **Demo scope**: The Bazaar today coordinates Stellar ↔ Stellar swaps. True cross-chain
> (ETH/BTC/SOL) requires an off-chain watcher that reads the published secret from Soroban and claims
> the counterpart chain — that relayer is the next milestone after the AtomicSwapHTLC contract (37
> tests, deployed). The architecture is designed so that once the relayer is live, any agent on any
> chain can broadcast an intent and get matched to a MicoPay provider — walking their user to physical
> MXN cash without ever touching a CEX or a bridge.

### 🔗 Cross-chain — Base (x402 + CCTP) and XRPL

The dollars are already multichain; the last mile is in Mexico. MicoPay routes value to where it's
cheapest to move, then lands it as pesos:

- **Base x402 payment acceptance — built and tested live.** See the
  [ZK Agent Credentials](#-zk-agent-credentials--private-verifiable-single-use-access) section
  above for what's actually implemented (EIP-3009, real testnet verification, the example agent).
- **Base → Stellar via Circle CCTP — designed, not built.** An agent pays USDC on Base → CCTP
  burns it at source and mints **native USDC on Stellar** → moving it on Stellar costs fractions
  of a cent → the escrow lands it as physical pesos. This bridge leg (treasury rebalancing, not
  per-call) is roadmap — see [Roadmap](#roadmap).
- **XRPL**: planned as an additional inbound rail for the same escrow.

The user never sees a chain — the frontend abstracts all routing. The defensible asset is the
physical liquidity network; chains are just inputs that fill it.

### 🔐 ZK Agent Credentials — see top of this README

The full write-up (problem, how it works, what's deployed, the Fase 0 security audit, and the
Base integration) now leads this README:
[jump to it](#-zk-agent-credentials--private-verifiable-single-use-access).

---

## ⭐ Stellar integration depth

Every Stellar integration below is **load-bearing** — it powers how the product actually works, not
just a slide.

| Integration | Where | Status |
|---|---|---|
| **Soroban HTLC escrow** (`MicopayEscrow`) | trust engine for app + agent cash flow | **Deployed on testnet**, 17 tests |
| **Soroban cross-chain HTLC** (`AtomicSwapHTLC`) | agent-to-agent atomic swaps | **Deployed on testnet**, 15 tests |
| **Stellar DEX** (`pathPaymentStrictSend`) | CETES buy/sell swaps in the app | Connected; mainnet needs liquidity |
| **Etherfuse anchor (SPEI)** | bank on/off-ramp ↔ CETES | Architecture + stubs; SDK for mainnet |
| **x402 over Stellar USDC** | pay-per-call agent access | Live on testnet |
| **x402 over Base (EIP-3009)** | pay-per-call agent access from Base | **Built + tested live**; wallets not yet funded |
| **Soroban ZK verifier** (`ZkVerifierRegistry`, BN254) | anonymous credentials / reputation | **Deployed on testnet**, 3 circuits, Fase 0 audit closed |
| **Circle CCTP → native Stellar USDC** | Base settlement bridge | Designed, not implemented |

---

## 🔎 Customer Discovery & Validation

MicoPay's design is grounded in **first-person customer-discovery interviews** gathered through the
Stellar Drips program — privacy-first (no personal data, no money amounts), reported honestly as a
directional convenience sample, not a representative study.

**Coverage spans LATAM and beyond** — including **Mexico** (CDMX, Guadalajara, Monterrey),
**Argentina** (Buenos Aires), **Colombia** (Bogotá), Peru, Venezuela, plus Nigeria, India, and
Europe → LATAM remittance corridors. Full synthesis (mapped to fundable claims for the SDF):
[`docs/VALIDATION_DRIPS.md`](./docs/VALIDATION_DRIPS.md).

What the interviews proved:

| Claim | Evidence | One-line finding |
|---|---|---|
| **Demand exists** | cash-out, cash-in, remittances, unbanked | Recurring pain converting digital ↔ cash, across countries |
| **Supply exists** | liquidity-provider interviews | Real people/shops would provide cash for a 2–3% commission |
| **It can win** | alternatives + fee tolerance | Beats OXXO/ATMs/Binance-P2P on fees, trust, or reliability |
| **Stellar is usable** | non-custodial onboarding + key recovery | Passkey recovery beats seed phrases for normal users |
| **Trust / PMF** | flow trust + safety + repeat use | "USDC locked in escrow before I hand over cash" is the unlock |

> Representative quote (V-12, CDMX, unbanked): *"I would need… a secure escrow mechanism that
> guarantees the digital funds are locked before I hand over physical cash."* — exactly what
> `MicopayEscrow` provides.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/ericmt-98/micopay-protocol
cd micopay-protocol && npm install

# 2. Start the MicoPay mobile app (port 5181) — the product
cd micopay/frontend && npm run dev

# 3. (Ecosystem) Configure + start the agent protocol API (port 3000)
cp apps/api/.env.example apps/api/.env   # includes a funded testnet demo agent
cd apps/api && npm run dev

# 4. (Ecosystem) Start the protocol dashboard (port 5186)
cd apps/web && npm run dev

# 5. Run the full end-to-end agent demo
curl -X POST http://localhost:3000/api/v1/demo/run
```

---

## Services (x402)

| Service | Endpoint | Price | Why pay? |
|---|---|---|---|
| Find cash merchants | `GET /api/v1/cash/agents` | $0.001 | Real-time merchant inventory — not on any public API |
| Merchant reputation | `GET /api/v1/reputation/:address` | $0.0005 | On-chain trust signal — NFT soulbound, can't be faked |
| Broadcast intent | `POST /api/v1/bazaar/intent` | $0.005 | Global intent layer — find cross-chain bridge partners |
| Accept intent | `POST /api/v1/bazaar/accept` | $0.005 | Anchors Stellar side of cross-chain swap on Soroban |
| Scan agent intents | `GET /api/v1/bazaar/feed` | $0.001 | Access to live market data / arbitrage opportunities |
| Send private quote | `POST /api/v1/bazaar/quote` | $0.002 | Direct negotiation channel between agents |
| Initiate cash exchange | `POST /api/v1/cash/request` | $0.01 | HTLC lock on Soroban + QR generation + merchant notification |
| Verify ZK proof | `POST /api/v1/zk/verify` | $0.001 | On-chain UltraHonk verification — prove reputation/knowledge without revealing identity |
| Buy access credential | `POST /api/v1/credentials/buy` | $0.01 | x402 → issue an anonymous, single-use access credential (activates its root on-chain) |
| Consume inference | `POST /api/v1/inference` | credential | Spend a credential (ZK proof + nullifier burn) → Claude responds — anonymous, unlinkable to the purchase |
| Fund MicoPay | `POST /api/v1/fund` | $0.10 | Meta-demo: the protocol funds itself |
| Service discovery | `GET /api/v1/services` | free | Full catalog with prices, examples, and why_pay explanations |
| Agent skill | `GET /skill.md` | free | SKILL.md for Claude / OpenAI tool use autodiscovery |
| Request status | `GET /api/v1/cash/request/:id` | free | Poll pending cash request |

Not offered: running our own DEX or competing with Stellar DEX — those exist for free. MicoPay is the
**agentic liquidation layer**: we orchestrate the last mile so agents can reach physical MXN cash from
any chain.

### x402 Flow

```
Agent → POST /api/v1/cash/request
      ← 402 { challenge: { amount_usdc: "0.01", pay_to: "G...", memo: "micopay:cash_request" } }

Agent builds Stellar USDC payment tx, signs it

Agent → POST /api/v1/cash/request
        X-Payment: <signed_xdr>
      ← 201 { claim_url: "https://app.micopay.xyz/claim/mcr-xxx", htlc_tx_hash: "abc...", ... }
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│   MicoPay Mobile App  ·  app.micopay.xyz / :5181            │
│   Cash in/out · CETES (DEX) · SPEI ramp · Blend             │
└───────────────┬─────────────────────────────────────────────┘
                │ shares contracts + merchant network
                │
┌───────────────┴─────────────────────────────────────────────┐
│   AI Agent (Claude, GPT, Telegram, WhatsApp)               │
│   x402 USDC micropayments per call                          │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              MicoPay Protocol API (Fastify + x402)          │
│  POST /api/v1/bazaar/intent   → broadcast cross-chain intent│
│  POST /api/v1/bazaar/accept   → lock Stellar HTLC collateral│
│  GET  /api/v1/cash/agents     → merchant list + rates       │
│  GET  /api/v1/reputation/:a   → on-chain trust signal       │
│  POST /api/v1/cash/request    → Soroban HTLC + claim_url    │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│   MicopayEscrow     │      │   Etherfuse                  │
│   (Soroban HTLC)    │      │   CETES via Stellar DEX      │
│   lock()            │      │   SPEI anchor on/off-ramp    │
│   release() ← QR   │      └─────────────────────────────┘
│   refund()          │
│   deployed testnet  │
└─────────┬───────────┘
          ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│   AtomicSwapHTLC    │      │   ZkVerifierRegistry         │
│   (Soroban/Rust)    │      │   (Soroban, BN254)           │
│   37 tests · ETH/   │      │   anonymous credentials +    │
│   BTC/SOL → MXN     │      │   private reputation         │
│   (+ Base via CCTP) │      │   3 circuits, deployed       │
└─────────────────────┘      └─────────────────────────────┘
```

### Key design principles

1. **Payment IS authentication** — x402 replaces API keys entirely. No signup, no account, no JWT.
2. **claim_url bridges any interface** — app, Claude, Telegram, WhatsApp — all work identically.
3. **HTLC guarantees atomicity** — Merchant can't get USDC without giving cash. User always refunded.
4. **On-chain reputation** — NFT soulbound badges. Can't be bought, transferred, or faked.
5. **One contract, many doors** — `MicopayEscrow` powers the mobile app, the agent API, and swaps.
6. **The protocol funds itself** — Fund MicoPay proves x402 in 10 seconds, live on-chain.

---

## Repository Structure

```
micopay-protocol/
├── contracts/
│   ├── htlc-core/              # HashedTimeLock trait (Rust, shared)
│   ├── atomic-swap/            # AtomicSwapHTLC — cross-chain HTLC, 15 tests
│   ├── micopay-escrow/         # P2P escrow with platform fee, 17 tests
│   └── zk-verifier/            # ZkVerifierRegistry — ZK Agent Credentials, 9 tests
├── circuits/
│   ├── access_credential_v1/   # 🏆 flagship: burn-once anonymous access (Noir)
│   ├── reputation_v1/          # private reputation-tier proof (Noir)
│   └── poseidon_preimage/      # hash pre-image building block (Noir)
├── examples/
│   └── agent/                  # standalone reference agent — pays x402 on Base, spends a ZK
│                                # credential, never touches a Stellar account
├── micopay/
│   ├── backend/                # MicoPay P2P backend (Node.js, port 3002)
│   ├── frontend/               # Mobile app (React/Vite, port 5181)  ← the product
│   │   └── src/pages/
│   │       ├── Home.tsx        # Cashout / deposit entry
│   │       ├── ExploreMap.tsx  # Merchant map with P2P offers
│   │       ├── ChatRoom.tsx    # User ↔ merchant coordination
│   │       ├── QRReveal.tsx    # HTLC QR reveal + on-chain release
│   │       ├── ClaimQR.tsx     # Standalone QR page — accessible from any agent
│   │       ├── Explore.tsx     # DeFi product discovery
│   │       ├── CETESScreen.tsx # Tokenized bonds UI (Etherfuse + Stellar DEX)
│   │       └── BlendScreen.tsx # Borrow / yield (Blend Protocol)
│   └── contracts/
│       └── escrow/             # MicoPay escrow contract v0.1, 5 tests
├── apps/
│   ├── api/                    # MicoPay Protocol API (Fastify + x402, port 3000)
│   │   └── src/routes/
│   │       ├── cash.ts         # cash_agents + cash_request (Soroban HTLC lock)
│   │       ├── cetes.ts        # CETES rate/buy/sell (Etherfuse + DEX)
│   │       ├── reputation.ts   # on-chain merchant reputation + NFT soulbound
│   │       ├── bazaar.ts       # cross-chain intent broadcasting + Soroban lock
│   │       ├── credentials.ts  # buy an anonymous ZK access credential (x402)
│   │       ├── inference.ts    # spend a credential (ZK proof + nullifier burn) → Claude
│   │       ├── zk.ts           # pay-per-verification ZK endpoint
│   │       ├── demo.ts         # end-to-end agent demos: cash flow + ZK credential flow
│   │       └── fund.ts         # meta-demo: protocol funds itself
│   │   └── src/middleware/
│   │       └── x402.ts         # payment verification — Stellar XDR + Base EIP-3009
│   │   └── src/lib/
│   │       └── zkVerify.ts     # shared on-chain ZK verify/root helpers
│   │   └── demo/
│   │       ├── credential_pool.json  # demo credential pool (shared Merkle root)
│   │       └── zk_demo_proof.json    # pre-generated real proof fixture for the live demo
│   └── web/                    # Protocol dashboard (React, port 5186)
│       └── src/components/
│           ├── DemoTerminal.tsx    # Live cash-flow demo with tx hashes
│           ├── ZKDemoTerminal.tsx  # Live ZK credential demo: buy → spend → reuse rejected
│           ├── BazaarFeed.tsx      # Agent intent social layer
│           ├── ReputationPanel.tsx # Interactive reputation check
│           ├── ServiceCatalog.tsx  # Full API catalog with x402 explainer
│           └── FundWidget.tsx      # Live funding stats + meta-demo
├── docs/
│   └── zk-agent-credentials/   # ZK Agent Credentials: status, audit, plans, narrative
│       ├── STATUS.md                          # current state, what's built, what's next
│       ├── AUDIT_2026-07.md                    # Fase 0 security audit (7 findings, all closed)
│       ├── BASE_IMPLEMENTATION_PLAN_2026-07.md # Base wallet + x402 acceptance, reviewed
│       └── DEMO_RECORDING_PLAN_2026-07.md      # demo fixture + endpoint + script prep
└── skill/
    └── SKILL.md                # Agent autodiscovery (Claude tool use / OpenAI functions)
```

---

## Contracts (Soroban/Rust)

**46 unit tests, all passing:**

```bash
cd contracts && cargo test
# atomic-swap:    15 tests ✓
# micopay-escrow: 17 tests ✓
# zk-verifier:     9 tests ✓

cd micopay/contracts/escrow && cargo test
# micopay-escrow: 5 tests ✓
```

**Deployed on Stellar Testnet:**
- `MicopayEscrow`: `CBQINHLR3M7NZAPQY7EJ3TWOE22R57LMFDVEMOK3C3X7ZIBFWHVQQP3A`
- `AtomicSwapHTLC A`: `CCDOUXIXSFXT2HTJAJGFNUJN6CKCYX2M6AL2BHHPEF6ISNHP2BGLS4KX`
- `AtomicSwapHTLC B`: `CBLCGG44QQILWEIVBXDSZSLH7NI7SGJQKXQ7WTKP3W3YSXOBTGMZKSNN`
- `ZkVerifierRegistry`: `CCZHC456HBJRTZP45V5AT3ILHP3MOVH36MHR7HUWQHV2JLN6MJEITXB2` — ZKaaS, 3 circuits registered (`access_credential_v1` + `reputation_v1` + `poseidon_preimage`), redeployed 2026-07-02 with the Fase 0 security fixes

### MicopayEscrow — `contracts/micopay-escrow`

P2P escrow powering both the mobile app and the agent API.

| Function | Description |
|---|---|
| `lock(seller, buyer, amount, platform_fee, secret_hash, timeout_minutes)` | Lock funds + platform fee |
| `release(trade_id, secret)` | Pay buyer + collect platform fee |
| `refund(trade_id)` | Return everything to seller after timeout |

### AtomicSwapHTLC — `contracts/atomic-swap`

Cross-chain HTLC for multi-chain entry (ETH/BTC/SOL and Base-via-CCTP → physical MXN cash). Today:
Stellar ↔ Stellar demo. Tomorrow: any chain → Mexico cash.

| Function | Description |
|---|---|
| `lock(initiator, counterparty, token, amount, secret_hash, timeout_ledgers)` | Lock funds. `swap_id = sha256(secret_hash)`. Emits event for cross-chain watchers. |
| `release(swap_id, secret)` | Release to counterparty. **Publishes secret on-chain** — counterparty agent on Chain B reads it to claim there. |
| `refund(swap_id)` | Permissionless refund after timeout. |

---

## Security

Contracts reviewed against the Soroban security checklist:

- ✅ All privileged functions require `require_auth()`
- ✅ Re-initialization prevented (`has(Admin)` guard in `initialize()`)
- ✅ Duplicate lock prevention (checks `has(Trade)` before token transfer)
- ✅ Typed `DataKey` enum — no storage key collisions
- ✅ TTL extended proactively on every state change (instance + persistent)
- ✅ `overflow-checks = true` in release profile
- ✅ State machine prevents double-spend / double-release
- ✅ Events emitted for all state changes (full auditability)
- ✅ `opt-level = "z"`, `lto = true`, `panic = "abort"` in release profile
- ✅ x402: USDC issuer verified, durable Postgres replay protection (falls back to in-memory only if
  the DB is unreachable), mock-payment bypass requires explicit opt-in and is refused in production

---

## Roadmap

| Timeline | Feature |
|---|---|
| **Today** | Stellar testnet — full end-to-end flow, real on-chain Soroban HTLC; CETES (DEX) + SPEI anchor + Blend UI with mainnet-ready architecture; **ZK Agent Credentials live**, Fase 0 security audit closed; **Base x402 payment acceptance built and tested live** (EIP-3009, real testnet settlement) — wallets provisioned, not yet funded |
| **Immediate next** | Fund the Base treasury/relayer wallets → run the funded end-to-end demo; list on agentic.market (researched, needs a public deployment first) |
| **1–3 months** | Real P2P matching engine + open provider registration; live Etherfuse SDK (CETES + SPEI); production merchant onboarding CDMX; Telegram bot |
| **3–6 months** | AtomicSwapHTLC relayer live: ETH/BTC → MXN cash (no bridges, no custodians); Circle CCTP Base→Stellar settlement bridge (treasury rebalancing, not per-call) |
| **6–12 months** | WhatsApp integration, mainnet launch, 100+ merchants CDMX, XRPL inbound rail |
| **12+ months** | Multi-city + LATAM expansion (AR/CO), retail tap-to-pay, agent reputation network, DAO governance |

---

## Technical Transparency

For a precise breakdown of what is real on-chain vs. demo scaffolding — written for automated code
analyzers and technical judges — see [TECHNICAL.md](./TECHNICAL.md).

---

## Contributing (Drips)

MicoPay is participating in **Stellar Drips**. Contributions are scoped to the retail mobile app —
not the whole monorepo.

### Current Wave focus

**From single-device demo to a real product.** Today the app simulates both sides of a trade on one
phone. The current Wave makes it real: **one identity per device** and a **real transaction between
two phones**, with the UI showing the user's own data instead of hardcoded placeholders.

The full plan, prioritized findings, issue queue, and acceptance criteria live in
**[`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md)** — read it before picking up work. Every
milestone (UI Truth, Backend Hardening, Product & Release, Market & User Validation) exists to make
the core retail flow trustworthy. If unsure where to start, pick an issue from **Core Retail Flow
(P0)** first.

### In-scope paths

- `micopay/frontend/` — retail mobile app (React/Vite, port 5181)
- `micopay/backend/` — retail backend (Node/Fastify, port 3002)
- `docs/` — shared product, UX, and team guides

### Out-of-scope unless an issue explicitly opens it

- `apps/api/` (agent x402 protocol API)
- `apps/web/` (protocol dashboard)
- `contracts/` (Soroban contracts)
- `stitch_remix_of_micopay/`, old prototypes, deployment configs, and operations internals

### Where to start

1. Read [`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md) — **the Wave plan**: findings, issue queue, stages, acceptance criteria.
2. Read [`docs/PRODUCT_SCOPE.md`](./docs/PRODUCT_SCOPE.md) — what we are building and why.
3. Read [`docs/RETAIL_ROADMAP.md`](./docs/RETAIL_ROADMAP.md) — the phased execution plan.
4. Read [`docs/UX_MANIFESTO.md`](./docs/UX_MANIFESTO.md) — the trust and UX bar every PR is reviewed against.
5. Read [`docs/DRIPS_TEAM_GUIDE.md`](./docs/DRIPS_TEAM_GUIDE.md) — how issues, reviews, and merges work.
6. Pick an issue from the [open milestones](https://github.com/ericmt-98/micopay-protocol/milestones).

### Milestones

| Milestone | Focus |
|---|---|
| [Core Retail Flow (P0)](https://github.com/ericmt-98/micopay-protocol/milestone/14) | **Wave priority.** One identity per device, real counterparty, real wallet balance, APK fetch fix, minimal onboarding + key backup (P0-1…P0-5) |
| [UI Truth (P1)](https://github.com/ericmt-98/micopay-protocol/milestone/15) | Map, economics, agent name, and FX rate use real data instead of placeholders (P1-1…P1-4) |
| [Backend Hardening](https://github.com/ericmt-98/micopay-protocol/milestone/16) | Fail-fast prod config, no in-memory fallback, no demo seed, reproducible migrations + `init.sql` fix, real health/readiness (B-2…B-7) |
| [Product & Release](https://github.com/ericmt-98/micopay-protocol/milestone/17) | Label DeFi (CETES/Blend) as simulated; APK release config — push, signing, code-splitting (P2-2, P2-3) |
| [Market & User Validation](https://github.com/ericmt-98/micopay-protocol/milestone/18) | Privacy-first research feeding the SDF case — demand, supply, onboarding, trust (V-1…V-25, `research`) |

### Labels we use

- **Wave surface:** `wave:retail`, `wave:frontend`, `wave:backend`, `wave:merchant`, `wave:trust`, `wave:docs`
- **Complexity:** `complexity: low`, `complexity: medium`, `complexity: high`
- **Flow control:** `wave:good-first`, `wave:blocked`, `wave:needs-product`
- **Research:** `research` marks market/user validation issues (no code, no PR — close on a structured answer)
- **Rewards:** `Stellar Wave` marks work eligible for Drips

### What a good PR looks like

- Solves the issue as scoped (no side quests)
- Does not touch out-of-scope paths
- Matches the tone of UX_MANIFESTO for anything user-facing
- Includes local test notes when behavior changes
- Stays under the complexity tier declared on the issue

Review SLA during the Wave: first review within 24 hours.

---

## Team

Built by Eric + Stichui. Born at **Código Alebrije** (CDMX), hardened through **Stellar Drips
(Waves 4–6)**, and submitted to the **PULSO Hackathon** (NearX × Stellar Development Foundation).

Built with: Soroban SDK · Stellar SDK · Stellar DEX · Fastify · React · x402 · Turborepo · Etherfuse · Circle CCTP · Blend Protocol · Noir + UltraHonk
</content>
</invoke>
