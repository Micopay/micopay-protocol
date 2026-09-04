# MicoPay Bridge — XRPL Hackathon Submission Copy

> Registration deadline: 2026-07-21. Two fields below, ready to copy-paste as-is.

---

## Description (5000 char limit — currently ~4941 chars)

MicoPay Bridge brings trustless atomic swaps between the XRP Ledger and Stellar, coordinated by AI agents — extending escrow infrastructure already deployed on Soroban.

MicoPay is a hyperlocal liquidity network in Mexico: everyday merchants become cash↔crypto on/off-ramp nodes, every handoff secured by HTLC escrow so trust lives in the contract, not an intermediary. Around it we've built and deployed the agent-side pieces on Stellar: ZKaaS (anonymous reputation verification on Soroban), AIGENTS (our x402 agent-payment protocol), and Bazaar, an agent-to-agent asset marketplace.

MicoPay actually runs two purpose-built HTLC escrow contracts on Soroban today, not one generic bridge:
- `AtomicSwapHTLC` — business-logic-free, initiator/counterparty roles, backs Bazaar's agent-to-agent swaps. Its `AssetInfo` schema has reserved a `chain` field per asset since day one — parked waiting for a second chain worth pointing to.
- `MicopayEscrow` — the contract that runs our production retail flow: seller/buyer roles plus platform-fee collection on top of the same hashlock/timelock primitive, driving the real cash handoff (QR reveal) merchants and users transact with today.

We chose XRPL as that second chain because it's the best technical fit we've seen: native EscrowCreate/EscrowFinish with PREIMAGE-SHA-256 crypto-conditions implements our exact hashlock/timelock pattern at the ledger level — no smart contract needed. The same secret that releases funds on one chain unlocks the mirrored escrow on the other; a relay watches both ledgers, and when either side reveals the secret on-chain, resubmits the matching claim on the other — it never custodies funds itself, it only ever resubmits a preimage that's already public. AIGENTS coordinates the swap end to end: two agents discover each other, agree terms, and drive lock → reveal → claim autonomously via x402 calls, with ZKaaS available as an optional anonymous trust gate before a swap is proposed.

Hackathon deliverable: an XRPL swap escrow mirroring `AtomicSwapHTLC`, the two-ledger relay, and a live demo of an AI agent atomically swapping an XRPL asset for a Stellar-side asset with no custodian — unlocking Bazaar's original cross-chain vision.

Next step, already designed: a second XRPL escrow mirroring `MicopayEscrow` — same seller/buyer-plus-fee model, ported to XRPL's native primitives — plugs XRP and XRPL-native assets into the real cash handoff flow our users in Mexico use today, making XRPL assets spendable as physical pesos, not just something an agent swaps in a demo. (Dispute resolution and reputation hooks are on that contract's roadmap — not shipped yet — and would extend to its XRPL mirror the same way.)

We've shipped this HTLC pattern before, twice on XRPL and twice on Soroban — so this hackathon connects proven systems, not prototypes:
- `coffee_xrpl_platform` (XRPL testnet) — direct XRP/USDC/RLUSD payments to Mexican coffee producers, with an HTLC escrow mode (SHA-256 preimage) alongside real ISO 20022 messaging (pacs.008/pacs.002/camt.053/camt.054), so cooperatives build bank-grade credit history.
- `AvalesLiquidos` (XRPL testnet, 69 tests passing) — liquid rental guarantees using native XRPL `Condition`+`CancelAfter` escrow (deliberately not `FinishAfter`) plus XLS-70 Credentials for on-chain reputation tiers; publishes rails without operating the pool — non-custodial by design.
- `AtomicSwapHTLC` and `MicopayEscrow` — the two Soroban contracts described above, both already deployed and live.

Ecosystem framing: XRPL isn't a one-off bridge, it's the second door into a multichain settlement layer we're already building around Stellar. A parallel, already-scoped plan brings agents in from Base and Solana via Circle's CCTP into the same Soroban trust/settlement stack — ZK reputation and HTLC escrow stay the constant, each new chain is just another venue agents and users reach in from. MicoPay Bridge is that pattern's first concrete, shipped instance, not a one-off hackathon artifact.

Under the hood, the two ledgers don't speak the same language for either half of an HTLC. Soroban compares a raw sha256 digest byte-for-byte and expires escrows against an absolute ledger sequence; XRPL wraps the same hash in a typed crypto-condition encoding and expires escrows against a Ripple-epoch timestamp via `CancelAfter`. Mirroring the contract means deriving XRPL's condition from the identical preimage used on Soroban — not generating an independent one — and converting both timeouts into a common wall-clock margin that still honors the standard atomic-swap safety invariant: the initiator's timeout must exceed the counterparty's, so whoever locks first always has time to react after the other side reveals the secret. Get either translation wrong and one leg can expire before the other completes — exactly the class of bug our testing on this hackathon focuses on.

---

## Technical Description (1000 char limit — currently ~951 chars)

Two-ledger HTLC atomic swap between XRPL and Stellar/Soroban, coordinated by AIGENTS (our x402 agent-payment layer) — no custodian on either side.

**Stellar (deployed):** `AtomicSwapHTLC` — lock/release/refund under a sha256(secret) hash + ledger-sequence timeout; release publishes the secret on-chain. Backs Bazaar, our agent marketplace.

**XRPL (this hackathon):** native EscrowCreate/EscrowFinish, PREIMAGE-SHA-256 condition + CancelAfter — same hashlock/timelock, zero smart contract.

A relay watches both ledgers and resubmits the revealed secret on the other chain to complete the swap — it never custodies funds.

Key challenge: translating Soroban's raw hash + ledger-timeout into XRPL's typed condition encoding + CancelAfter timestamp, preserving the timeout safety invariant across chains.

Shipped this HTLC pattern before: twice on XRPL (coffee_xrpl_platform, AvalesLiquidos), twice on Soroban (AtomicSwapHTLC, MicopayEscrow).

---

## Notes / corrections applied

- `MicopayEscrow` (`contracts/micopay-escrow/src/lib.rs`) currently implements only `initialize/lock/release/refund/get_trade` — seller/buyer roles + platform-fee collection. Its module doc-comment claims "dispute mechanism" and "reputation hooks" but neither is implemented; both texts above correctly frame these as roadmap, not shipped.
- `AtomicSwapHTLC` (`contracts/atomic-swap/src/lib.rs`) has no fee/dispute/reputation logic at all — pure HTLC by design (`lock/release/refund/get_status/get_swap`).
