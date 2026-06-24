# 🍄 MicoPay Protocol

**The first API that gives AI agents access to physical cash in Mexico**

> Stellar Hacks: Agents — DoraHacks 2026

> 🌊 **We're in Drips Wave 6 — start here.** The focus is turning the retail mobile app (`micopay/frontend` + `micopay/backend`) from a single-device demo into a **real product**: one identity per device and a **real transaction between two phones**. **Contributors: read [`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md)** — it's the Wave 6 source of truth (plan, issue queue, and acceptance criteria). Then jump to [Contributing](#contributing-drips-wave-6) · [`docs/`](./docs/)

> 🔐 **Real-World ZK on Stellar — ZKaaS, live on testnet.** Through the **Zero-Knowledge proof hackathon** MicoPay shipped **ZKaaS**: anonymous, pay-per-use ZK verification on Soroban. You can prove *"my reputation tier is ≥ GOLD"* without revealing who you are — verified on-chain. See [ZK-as-a-Service](#-zk-as-a-service-zkaas) below.

---

## What is MicoPay?

MicoPay is two things that work together:

**1. A mobile P2P app** — already live on Stellar testnet. Think Uber for crypto cashout: anyone with MXN cash (a neighbor, a street vendor, a tienda) can become a liquidity provider. Users with USDC get matched to the nearest available person and walk away with pesos in minutes. The app also includes UI screens for CETES bonds (Etherfuse), Blend DeFi, and bank on-ramp — mainnet-ready architecture, simulated on testnet. No bank account required.

**2. An x402 Protocol API** — built for this hackathon. Exposes the merchant network and HTLC engine to any AI agent via HTTP + micropayments. Claude, GPT, a Telegram bot, or a WhatsApp assistant can now do what MicoPay users do — in a single API call.

The connection: **the same Soroban HTLC contract** (`MicopayEscrow`, deployed) powers both the app and the agent API. We didn't build a demo — we opened up a real product to AI agents.

```
User → "I need $500 MXN in cash near Roma Norte, CDMX"

Agent:
  0.  bazaar_broadcast ($0.005) → Broadcast: "Have ETH, need USDC" to intent layer
  0b. bazaar_accept   ($0.005) → Stellar side locked on-chain (real Soroban tx)
  1.  cash_agents     ($0.001) → Farmacia Guadalupe, 0.3km, tier Maestro 🍄
  2.  reputation      ($0.0005)→ 98% completion, 312 trades, trusted: true
  3.  cash_request    ($0.01)  → HTLC locks USDC, returns claim_url
  4.  Agent → "Go to Orizaba 45. Open: https://app.micopay.xyz/claim/mcr-xxx"

User opens link → full-screen QR on phone → walks to pharmacy → gets $500 MXN cash.
Merchant scans QR → USDC released on Soroban.

Total cost to agent: $0.1215 USDC
```

### Tracks covered

| Track | What we built |
|---|---|
| Paid agent services / APIs | Every endpoint pay-per-request via x402 — no API key ever |
| Agent-to-agent payments | Agent autonomously pays for each service call with USDC |
| Agent marketplaces / discovery | `SKILL.md` + `/api/v1/services` — any agent finds us automatically |
| DeFi integrations | Soroban HTLC escrow (deployed) + AtomicSwapHTLC (built + 37 tests) |
| Agent intent layer (Bazaar) | Social feed where agents broadcast and coordinate cross-chain swaps |

---

## 🇲🇽 The Problem

Over 60% of Mexico's population is unbanked or underbanked. Cash is king. Crypto on-ramps require bank accounts, KYC, and days of waiting. Even when someone has USDC — earned freelancing, received from abroad, or bought on an exchange — converting it to physical pesos is slow, expensive, and requires infrastructure that doesn't exist in most neighborhoods.

MicoPay is **the Uber of crypto cashout**: anyone with MXN cash can become a liquidity provider — your neighbor, the taquero on the corner, a pharmacy, a tienda. They register, set their rate, and wait for requests. On the other side, anyone with USDC — from any source, any chain — gets matched to the nearest available person and walks away with pesos in minutes.

The HTLC contract is what makes it trustless: the cash provider only receives USDC *after* handing over cash, and the user always gets a full refund if no one shows up. No escrow service, no bank, no intermediary — just two people and a smart contract.

This unlocks scenarios that have no good solution today:

- A freelancer paid in USDC needs rent money by Friday
- A tourist with ETH needs pesos in a neighborhood with no ATM
- **Remittances**: someone's family receives USDC from abroad and needs it as cash the same day — no bank account, no Western Union queue, no 5-day wait
- An AI agent managing a user's finances needs to liquidate USDC without touching a CEX

**AI agents are the perfect interface for this**: they find the best match, verify reputation signals a human would ignore, and handle the entire flow without the user touching crypto at all. And because the API is open to any agent via x402, this network becomes accessible from WhatsApp, Telegram, Claude, or any interface the user already has.

---

## 🕸️ Agent Bazaar — The Social Layer for Agents

The Bazaar is a public intent feed where AI agents broadcast what they have and what they want — and other agents respond. Think of it as a Twitter/X for machine-to-machine liquidity coordination.

```
Agent A posts:  "Have 1.2 ETH on Ethereum. Want 3,200 USDC on Stellar."
Agent B replies: "I'll take it. Here's my quote."
Agent A accepts → Stellar side locked on Soroban via MicopayEscrow HTLC.
AtomicSwapHTLC resolves the ETH side on the other chain.
```

Every action costs a small x402 micropayment — this is what keeps the feed signal-rich and spam-free. Only agents with real liquidity broadcast.

### Bazaar endpoints

| Endpoint | Price | What it does |
|---|---|---|
| `POST /api/v1/bazaar/intent` | $0.005 | Broadcast: "I have X on chain A, want Y on chain B" |
| `GET /api/v1/bazaar/feed` | $0.001 | Read all active intents — live arbitrage and swap opportunities |
| `POST /api/v1/bazaar/quote` | $0.002 | Send a private quote to an intent's agent |
| `POST /api/v1/bazaar/accept` | $0.005 | Seal the deal — locks Stellar side on Soroban as cross-chain collateral |

### Why it matters

> **Demo scope**: The Bazaar today coordinates Stellar ↔ Stellar swaps. True cross-chain (ETH/BTC/SOL) requires an off-chain watcher that reads the published secret from Soroban and claims the counterpart chain — that relayer is the next milestone after the AtomicSwapHTLC contract (37 tests, deployed).

The architecture is designed so that once the relayer is live, any agent on any chain can broadcast an intent and get matched to a MicoPay provider — walking their user to physical MXN cash in Mexico without ever touching a CEX or a bridge.

---

## 🔐 ZK-as-a-Service (ZKaaS)

> **Heading into the upcoming Real-World ZK on Stellar hackathon — and already live on testnet.**

MicoPay's reputation used to be public: exact scores and badges tied to your Stellar address. That's surveillance. ZKaaS adds the **private mode**: prove a claim about yourself without revealing your identity, address, or history.

**Your reputation, your choice — flaunt it publicly (badge) or prove it privately (ZK).**

ZKaaS is a generic, pay-per-use zero-knowledge verification service: a single Soroban contract (`ZkVerifierRegistry`) holds a registry of audited verification keys, and any agent pays cents via x402 to verify a Noir/UltraHonk proof on-chain.

### Verified on-chain (Stellar testnet)

- **Contract `ZkVerifierRegistry`:** `CC6YHSKDTINV4XSZNVT42XW4GPJIANNKNNKG73HYTO2OJ7DPF55A33UG`
- **Demo B — anonymous reputation:** alice proved *tier ≥ SILVER* (she's GOLD) **without revealing her identity**. Verified on-chain, tx [`330be3e4…02974`](https://stellar.expert/explorer/testnet/tx/330be3e4eae61901526206d33438e38e5b90a65d16871ef1727d5bc075902974)

### Two registered circuits

| Circuit | What it proves | Role |
|---|---|---|
| `poseidon_preimage` | "I know the secret behind this hash" — without revealing it | Building block for HTLC coordination and cross-chain swaps |
| `reputation_v1` 🏆 | "My reputation tier is ≥ T" — without revealing identity, address, or exact score | **Flagship.** Private reputation earned in MicoPay, consumed by merchants and AI agents |

### Why a VK registry (not one contract per circuit)

UltraHonk verification is bound to a circuit via its verification key. A registry keyed by `circuit_id` makes ZKaaS an actual *service*: new circuits are **registered, not redeployed**. It's also the security boundary — the API never accepts a caller-supplied VK (that would let an attacker forge `verified: true` with a trivial circuit). Only the admin registers audited VKs.

### The agent use case

> An AI agent pays **$0.001** to verify that an anonymous counterparty has good reputation *before* locking funds in escrow — without doxxing anyone. Trust, bought autonomously, on-chain.

Built with **Noir + UltraHonk (barretenberg)**, verified inside Soroban via the BN254/Poseidon host functions (Protocol 25/26). Full spec: [`docs/ZK-as-a-Service/README.md`](./docs/ZK-as-a-Service/README.md) · toolchain pins: [`TOOLCHAIN.md`](./TOOLCHAIN.md).

---

## 📱 MicoPay Mobile App

The mobile app (`micopay/frontend`, port 5181) is the user-facing side of the same protocol. It shares the same Soroban contracts and merchant network as the agent API.

> **Demo scope**: The live demo runs against 4 simulated testnet providers. The P2P matching engine and open provider registration are the next implementation milestone (see roadmap).

### Cash In / Cash Out (P2P)
Anyone with MXN cash can join as a liquidity provider — neighbors, street vendors, small shops, anyone. They set their rate and availability; the app matches them with nearby users.

- User selects amount → map shows nearby providers sorted by distance, tier, and availability
- Provider is notified → chat opens for coordination
- USDC is locked on-chain via `MicopayEscrow` HTLC
- User walks to provider → shows QR → receives cash → USDC released
- Provider never gets USDC without giving cash. User always gets a full refund if no one shows.

### 📊 CETES Tokenizados (via Etherfuse)
- Invest in Mexican government bonds tokenized on Stellar
- **~10% APY** — accessible from the same wallet, no broker, no bank account
- Buy/sell with XLM, USDC, or MXNe (uses Stellar `pathPaymentStrictReceive`)
- Full UI implemented; transactions simulated on testnet — mainnet-ready architecture

### 🏦 Blend DeFi
- **Borrow**: Deposit XLM as collateral → get USDC/MXNe instantly (70% LTV, health factor tracked)
- **Yield**: Supply crypto to earn yield via Blend Protocol
- Full UI implemented (pool data, health factor, supply/borrow flows); mainnet-ready architecture

### 🔗 Etherfuse On/Off Ramp
- Architecture supports connecting a Mexican bank account → transfer MXN ↔ USDC on Stellar
- Entry point is the P2P merchant network (cash in/out); full SPEI bridge planned for mainnet

### The claim_url — QR for any interface

When the API's `cash_request` endpoint is called (by an agent OR by the app), it returns a `claim_url`:

```json
{
  "claim_url": "https://app.micopay.xyz/claim/mcr-4b6c0e5c",
  "qr_payload": "micopay://claim?request_id=mcr-4b6c0e5c&secret=...&contract=CBQINHLR...",
  "instructions": "Go to Farmacia Guadalupe, Orizaba 45..."
}
```

The user opens the URL → full-screen QR → shows it to the merchant. **No app install required.** Works from any interface:

| Interface | How it works |
|---|---|
| **Claude / ChatGPT** | Agent pastes the URL in chat |
| **Telegram bot** | Inline button `[Ver QR 📱]` links to the URL |
| **WhatsApp** | Agent sends the URL as a message |
| **MicoPay app** | Renders natively via `ClaimQR.tsx` at `/claim/:id` |

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/ericmt-98/micopay-mvp
cd micopay-mvp && npm install

# 2. Configure
cp apps/api/.env.example apps/api/.env
# .env already includes a funded testnet demo agent

# 3. Start the API (port 3000)
cd apps/api && npm run dev

# 4. Start the protocol dashboard (port 5186)
cd apps/web && npm run dev

# 5. Start the MicoPay mobile app (port 5181)
cd micopay/frontend && npm run dev

# 6. Run the full 6-step agent demo
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
| Fund MicoPay | `POST /api/v1/fund` | $0.10 | Meta-demo: the protocol funds itself |
| Service discovery | `GET /api/v1/services` | free | Full catalog with prices, examples, and why_pay explanations |
| Agent skill | `GET /skill.md` | free | SKILL.md for Claude / OpenAI tool use autodiscovery |
| Request status | `GET /api/v1/cash/request/:id` | free | Poll pending cash request |

Not offered: running our own DEX or competing with Stellar DEX — those exist for free. MicoPay is the **agentic liquidation layer**: we orchestrate the last mile so agents can reach physical MXN cash from any chain.

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
│         AI Agent (Claude, GPT, Telegram bot, WhatsApp)      │
│  Receives: "User needs $500 MXN near Roma Norte, CDMX"      │
└────────────────────────┬────────────────────────────────────┘
                         │ x402 USDC micropayments per call
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              MicoPay Protocol API (Fastify + x402)          │
│                                                             │
│  POST /api/v1/bazaar/intent   → broadcast cross-chain intent│
│  POST /api/v1/bazaar/accept   → lock Stellar HTLC collateral│
│  GET  /api/v1/cash/agents     → merchant list + rates       │
│  GET  /api/v1/reputation/:a   → on-chain trust signal       │
│  POST /api/v1/cash/request    → Soroban HTLC + claim_url    │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│   MicopayEscrow     │      │   MicoPay Mobile App         │
│   (Soroban HTLC)    │      │   app.micopay.xyz / :5181    │
│                     │      │                             │
│   lock()            │      │   /claim/:id → ClaimQR      │
│   release() ← QR   │      │   /cashout  → P2P flow      │
│   refund()          │      │   /explore  → DeFi products  │
│   deployed testnet  │      │   CETES · Blend · bank ramp  │
└─────────────────────┘      └─────────────────────────────┘
              │
              ▼
┌─────────────────────┐
│   AtomicSwapHTLC    │
│   (Soroban/Rust)    │
│   37 tests passing  │
│   ETH/BTC/SOL →     │
│   MXN cash (roadmap)│
└─────────────────────┘
```

### Key design principles

1. **Payment IS authentication** — x402 replaces API keys entirely. No signup, no account, no JWT.
2. **claim_url bridges any agent interface** — Claude, Telegram, WhatsApp, native app — all work identically.
3. **HTLC guarantees atomicity** — Merchant can't get USDC without giving cash. User always gets a refund.
4. **On-chain reputation** — NFT soulbound badges. Can't be bought, transferred, or faked.
5. **One contract, two interfaces** — `MicopayEscrow` powers both the mobile app and the agent API.
6. **The protocol funds itself** — Fund MicoPay proves x402 in 10 seconds, live on-chain.

---

## Repository Structure

```
micopay-mvp/
├── contracts/
│   ├── htlc-core/              # HashedTimeLock trait (Rust, shared)
│   ├── atomic-swap/            # AtomicSwapHTLC — cross-chain HTLC, 15 tests
│   └── micopay-escrow/         # P2P escrow with platform fee, 17 tests
├── micopay/
│   ├── backend/                # MicoPay P2P backend (Node.js, port 3002)
│   ├── frontend/               # Mobile app (React/Vite, port 5181)
│   │   └── src/pages/
│   │       ├── Home.tsx        # Cashout / deposit entry
│   │       ├── ExploreMap.tsx  # Merchant map with P2P offers
│   │       ├── ChatRoom.tsx    # User ↔ merchant coordination
│   │       ├── QRReveal.tsx    # HTLC QR reveal + on-chain release
│   │       ├── ClaimQR.tsx     # Standalone QR page — accessible from any agent
│   │       ├── Explore.tsx     # DeFi product discovery
│   │       ├── CETESScreen.tsx # Tokenized bonds UI (Etherfuse, testnet simulation)
│   │       └── BlendScreen.tsx # Borrow / yield (Blend Protocol)
│   └── contracts/
│       └── escrow/             # MicoPay escrow contract v0.1, 5 tests
├── apps/
│   ├── api/                    # MicoPay Protocol API (Fastify + x402, port 3000)
│   │   └── src/routes/
│   │       ├── cash.ts         # cash_agents + cash_request (Soroban HTLC lock)
│   │       ├── reputation.ts   # on-chain merchant reputation + NFT soulbound
│   │       ├── bazaar.ts       # cross-chain intent broadcasting + Soroban lock
│   │       ├── demo.ts         # 6-step end-to-end agent demo runner
│   │       └── fund.ts         # meta-demo: protocol funds itself
│   └── web/                    # Protocol dashboard (React, port 5186)
│       └── src/components/
│           ├── DemoTerminal.tsx    # Live 6-step demo with tx hashes
│           ├── BazaarFeed.tsx      # Agent intent social layer
│           ├── ReputationPanel.tsx # Interactive reputation check
│           ├── ServiceCatalog.tsx  # Full API catalog with x402 explainer
│           └── FundWidget.tsx      # Live funding stats + meta-demo
└── skill/
    └── SKILL.md                # Agent autodiscovery (Claude tool use / OpenAI functions)
```

---

## Contracts (Soroban/Rust)

**37 unit tests, all passing:**

```bash
cd contracts && cargo test
# atomic-swap:    15 tests ✓
# micopay-escrow: 17 tests ✓

cd micopay/contracts/escrow && cargo test
# micopay-escrow: 5 tests ✓
```

**Deployed on Stellar Testnet:**
- `MicopayEscrow`: `CBQINHLR3M7NZAPQY7EJ3TWOE22R57LMFDVEMOK3C3X7ZIBFWHVQQP3A`
- `AtomicSwapHTLC A`: `CCDOUXIXSFXT2HTJAJGFNUJN6CKCYX2M6AL2BHHPEF6ISNHP2BGLS4KX`
- `AtomicSwapHTLC B`: `CBLCGG44QQILWEIVBXDSZSLH7NI7SGJQKXQ7WTKP3W3YSXOBTGMZKSNN`
- `ZkVerifierRegistry`: `CC6YHSKDTINV4XSZNVT42XW4GPJIANNKNNKG73HYTO2OJ7DPF55A33UG` — ZKaaS, 2 circuits registered (`poseidon_preimage` + `reputation_v1`)

### AtomicSwapHTLC — `contracts/atomic-swap`

Cross-chain HTLC for future multi-chain entry (ETH/BTC/SOL → physical MXN cash). Today: Stellar ↔ Stellar demo. Tomorrow: any chain → Mexico cash.

| Function | Description |
|---|---|
| `lock(initiator, counterparty, token, amount, secret_hash, timeout_ledgers)` | Lock funds. `swap_id = sha256(secret_hash)`. Emits event for cross-chain watchers. |
| `release(swap_id, secret)` | Release to counterparty. **Publishes secret on-chain** — counterparty agent on Chain B reads it to claim there. |
| `refund(swap_id)` | Permissionless refund after timeout. |

### MicopayEscrow — `contracts/micopay-escrow`

P2P escrow powering both the mobile app and the agent API.

| Function | Description |
|---|---|
| `lock(seller, buyer, amount, platform_fee, secret_hash, timeout_minutes)` | Lock funds + platform fee |
| `release(trade_id, secret)` | Pay buyer + collect platform fee |
| `refund(trade_id)` | Return everything to seller after timeout |

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
- ✅ x402: USDC issuer verified, tx hash replay protection (in-memory Set), mock mode only in testnet browser UI

---

## Roadmap

| Timeline | Feature |
|---|---|
| **Today** | Stellar testnet — full 6-step agent flow, real on-chain Soroban HTLC; CETES/Blend UI with mainnet-ready architecture; **ZKaaS live** — anonymous reputation proofs verified on-chain |
| **Next hackathon (Real-World ZK on Stellar)** | Harden ZKaaS: more circuits in the registry, ZK-gated Bazaar matching, private HTLC pre-image commitments, judges' demo of agent-buys-trust flow |
| **1–3 months** | Telegram bot integration, production merchant onboarding CDMX, live CETES rate from Etherfuse API |
| **3–6 months** | AtomicSwapHTLC live: ETH/BTC → MXN cash (no bridges, no custodians); Etherfuse SPEI on-ramp |
| **6–12 months** | WhatsApp integration, mainnet launch, 100+ merchants CDMX |
| **12+ months** | Multi-city expansion, agent reputation network, DAO governance |

---

## Technical Transparency

For a precise breakdown of what is real on-chain vs. demo scaffolding — written for automated code analyzers and technical judges — see [TECHNICAL.md](./TECHNICAL.md).

---

## Contributing (Drips Wave 6)

MicoPay is participating in **Stellar Drips Wave 6**. Contributions are scoped to the retail mobile app — not the whole monorepo.

### Current Wave focus

**From single-device demo to a real product.** Today the app simulates both sides of a trade on one phone. Wave 6 makes it real: **one identity per device** and a **real transaction between two phones**, with the UI showing the user's own data instead of hardcoded placeholders.

The full plan, prioritized findings, issue queue, and acceptance criteria live in **[`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md)** — read it before picking up work. The milestones below organize that work; every milestone (UI Truth, Backend Hardening, Product & Release, Market & User Validation) exists to make the core retail flow trustworthy. If you are unsure where to start, pick an issue from **Core Retail Flow (P0)** first.

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

1. Read [`docs/AUDIT_APK_WAVE6.md`](./docs/AUDIT_APK_WAVE6.md) — **the Wave 6 plan**: findings, issue queue, stages, and acceptance criteria.
2. Read [`docs/PRODUCT_SCOPE.md`](./docs/PRODUCT_SCOPE.md) — what we are building and why.
3. Read [`docs/RETAIL_ROADMAP.md`](./docs/RETAIL_ROADMAP.md) — the phased execution plan.
4. Read [`docs/UX_MANIFESTO.md`](./docs/UX_MANIFESTO.md) — the trust and UX bar every PR is reviewed against.
5. Read [`docs/DRIPS_TEAM_GUIDE.md`](./docs/DRIPS_TEAM_GUIDE.md) — how issues, reviews, and merges work during the Wave.
6. Pick an issue from the [open milestones](https://github.com/ericmt-98/micopay-protocol/milestones).

### Milestones

| Milestone | Focus |
|---|---|
| [Core Retail Flow (P0)](https://github.com/ericmt-98/micopay-protocol/milestone/14) | **Wave priority.** One identity per device, real counterparty, real wallet balance, APK fetch fix, minimal onboarding + key backup (P0-1…P0-5) |
| [UI Truth (P1)](https://github.com/ericmt-98/micopay-protocol/milestone/15) | Map, economics, agent name, and FX rate use real data instead of placeholders (P1-1…P1-4) |
| [Backend Hardening](https://github.com/ericmt-98/micopay-protocol/milestone/16) | Fail-fast prod config, no in-memory fallback, no demo seed, reproducible migrations + `init.sql` fix, real health/readiness (B-2…B-7) |
| [Product & Release](https://github.com/ericmt-98/micopay-protocol/milestone/17) | Label DeFi (CETES/Blend) as simulated; APK release config — push, signing, code-splitting (P2-2, P2-3) |
| [Market & User Validation](https://github.com/ericmt-98/micopay-protocol/milestone/18) | Privacy-first research feeding the SDF case — demand, supply, onboarding, trust (V-1…V-5, `research`) |

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

Built for **Stellar Hacks: Agents** (DoraHacks 2026) by Eric + Stichui.

Built with: Soroban SDK · Stellar SDK · Fastify · React · x402 · Turborepo · Etherfuse · Blend Protocol
