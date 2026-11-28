# 🍄 MicoPay

**Cash in and cash out of Stellar in Mexico, with a Soroban escrow between the
client and a nearby cash agent.**

**Demo:** [app.micopay.com.mx](https://app.micopay.com.mx). To try it, connect
a Stellar wallet such as Varial. There is also an Android app (APK), not yet
distributed publicly.

> **Status:** live on **Stellar mainnet** since November 27, 2026 (BAF Ship It).
> Escrow contract
> [`CCM4E3DA…ZP3KO`](https://stellar.expert/explorer/public/contract/CCM4E3DA6QKAQOJYHH5UQ3AFXIUVYDDTBWTPLKAHYJK6ASATVVZZP3KO)
> locks XLM. The five escrow functions (`lock`, `report_paid`, `release`,
> `decline`, `refund`) were invoked from the app with real funds:
> [mainnet validation](./docs/validation/MISION_MAINNET_2026-11-27.md).

## What it is

A client who wants pesos in cash sells XLM to a cash agent near them (or buys
XLM by handing over cash). The client's funds sit in the escrow until the agent
confirms the cash handover, so neither side has to trust the other with the
digital side of the trade. Keys stay with each user: on the phone, or in the
user's own Stellar wallet on the web.

## How to use it

**Client (withdraw cash):**

1. Open [app.micopay.com.mx](https://app.micopay.com.mx), create an account and
   connect your Stellar wallet (for example Varial).
2. Pick an agent on the map and request a withdrawal in MXN.
3. Lock your XLM in the escrow (one signature).
4. Meet the agent and show your QR code.

**Agent (cash provider):**

1. Register as an agent: your location and the amounts you serve.
2. Accept the request in your inbox.
3. Scan the client's QR, hand over the cash, and release: the app records the
   cash delivery on-chain and pays you the XLM.
4. If you cannot serve the client, tap **"Rechazar y devolver al cliente"** and
   the XLM goes back at once.

If nobody releases, the client recovers the XLM with **"Recuperar fondos"**
once the 2-hour lock expires (the backend also refunds expired trades
automatically).

**Across the ecosystem.** Contributors also work on the other MicoPay
repositories through Drips:
[MicoPay Café](https://github.com/Micopay/micopay-cafe),
[MicoPay Rentas](https://github.com/Micopay/micopay-rentas) and
[MicoPay Issuer OS](https://github.com/Micopay/micopay-issuer-os).

---

MicoPay helps people send and receive digital assets, find nearby cash providers,
and coordinate cash deposits and withdrawals in Mexican pesos. The app combines
a Stellar wallet, a provider map, chat, and Soroban escrow.

This repository contains the **MicoPay mobile app and its supporting backend**.
ZK, AI-agent, x402, Bazaar, atomic-swap, and cross-chain work lives in
**[MicoPay Bridge](https://github.com/Micopay/micopaybridge)**. Its code and
product documentation are intentionally not duplicated here.

### Future integration possibilities

Connecting the app's cash network to AI assistants, bots, or paid APIs is a possible
future development direction. The related x402, ZK, atomic-swap, and cross-chain
work lives in MicoPay Bridge. **The combined agent-to-cash experience is not
fully implemented or available end to end in these early stages of the app.**
Individual prototypes or components do not establish that the complete integration
works with the mobile wallet and real cash providers.

For example, an assistant could eventually help a user request MXN cash, discover
a provider, and follow an escrow-backed exchange. This is an illustrative scenario,
not a currently supported single API call. Provider names, distances, reputation
scores, and transaction counts in earlier examples were illustrative, not evidence
of a live network or verified on-chain reputation. Cross-chain funding and automated
coordination would require further integration and validation. Escrow also cannot
guarantee that neither participant can cheat during physical cash handover.

## What is in the app?

| Area | Current scope |
| --- | --- |
| Wallet | Account access, balances, transaction history, and wallet backup flows. |
| Payments | Send and receive Stellar assets, including QR-based payment flows. |
| Cash deposits and withdrawals | Choose an amount and nearby provider, review the operation, coordinate through chat, and follow escrow and QR confirmation steps. |
| Provider network | Join the network, configure availability and offers, and manage incoming operations. “Agent” here means a cash provider. |
| Identity verification | Didit integration with verification levels and backend controls for operations and monthly volume. Enforcement depends on backend configuration. |
| Bank withdrawals | SPEI integration through Etherfuse: identity requirements, bank-account registration, quotes, and order status. Availability depends on the build and provider configuration and approval. |

### Cash exchange flow

1. Choose a cash deposit or withdrawal and enter the amount in MXN.
2. Select an available provider on the map.
3. Review the amount, asset, and fees before confirming.
4. Coordinate the meeting through the operation's chat.
5. Follow the escrow and QR steps for the selected direction of exchange.
6. Review the result in the operation history.

The escrow tracks the digital-asset side of the exchange. Physical cash handover
still depends on participants following the confirmation process; the contract
does not independently verify that cash changed hands.

## Availability and limitations

MicoPay is under active development. Code being present does not mean a feature
is enabled in every APK or ready for unrestricted mainnet use.

- **Stellar mainnet:** the web app uses real XLM. Only the XLM escrow is live
  on mainnet. The mainnet Android APK is not distributed publicly yet.
- **Stellar Testnet:** used for app testing. Testnet assets are not real funds.
  A Testnet APK can still connect to the shared backend and identity providers;
  this network setting does not isolate every service.
- **SPEI / Etherfuse:** requires the appropriate build flags, backend credentials,
  provider onboarding, KYC, and environment configuration.
- **CETES:** exploration and integration code exists, but trading is gated.
  The backend's CETES purchase endpoint is disabled outside Testnet/mock mode.
- **Blend:** supply and borrow flows are simulated and intended for internal testing.
- **Release validation:** builds and API health checks do not replace testing the
  complete flow on Android with two participants.

Feature visibility is defined in
[`features.ts`](./micopay/frontend/src/constants/features.ts):

| Build flag | Controls |
| --- | --- |
| `VITE_ENABLE_DEFI_TRADING` | Internal CETES and Blend screens. |
| `VITE_ENABLE_SPEI_RAMP` | Etherfuse SPEI ramp screens. |
| `VITE_ENABLE_BANK_WITHDRAW` | Bank withdrawal flow. |

## Custody model

MicoPay does not take custody of user funds in the wallet or the cash network.

- **Keys:** each user's key is generated and stored on their device, and users sign their own transactions.
- **Funds:** during a cash exchange, the asset sits in the Soroban escrow. The contract can only pay the buyer and the platform fee on release, or return the funds to the seller. Its admin has no function to withdraw them.
- **Backend:** it stores the secret of each escrow encrypted, to coordinate the QR step. The contract still decides where funds can go, but the exchange flow depends on the backend being available.

## Repository structure

| Path | Purpose |
| --- | --- |
| [`micopay/frontend/`](./micopay/frontend) | React, TypeScript, and Vite app; Android packaging with Capacitor. |
| [`micopay/backend/`](./micopay/backend) | Fastify API for authentication, trades, providers, payments, KYC, and integrations. |
| [`micopay/contracts/`](./micopay/contracts) | App escrow contract and network deployment notes. |
| [`micopay/sql/`](./micopay/sql) | PostgreSQL schema and migrations. |
| [`micopay/scripts/`](./micopay/scripts) | App development and operational utilities. |
| [`docs/`](./docs) | Indexed product, architecture, operations, audit, and historical documentation. |

The backend runs on **AWS ECS**, with images in **ECR**, PostgreSQL in **RDS**,
and runtime secrets in **SSM Parameter Store**. Older Render deployment references
and dated planning documents are historical.

### Repository boundary

This repository has no protocol/x402 workspace. The removed `apps/api`, SDK,
ZK circuits, verifier, Bazaar, and agent-facing skill are maintained in
[MicoPay Bridge](https://github.com/Micopay/micopaybridge). “Agent” inside this
repository means a **human cash provider**, not an autonomous AI agent.

## Local development

Use Node.js 22, npm, and PostgreSQL for the app stack. Android builds also require
the Android SDK and a compatible JDK; the Windows build workflow uses Android Studio's bundled JDK.

### Backend

From `micopay/backend`, run `npm ci`. Create a local `.env` using `.env.example`
as a reference and configure the database, JWT secret, and a 64-character
hexadecimal `SECRET_ENCRYPTION_KEY`. Example values are placeholders.

For actual Testnet transactions, configure the Stellar keys, RPC, contract, and
`MOCK_STELLAR=false`. External integrations require their own configuration.

```sh
npm run dev
```

The example backend port is `3000`. `MOCK_STELLAR=true` simulates blockchain
behavior and does not validate a real escrow transaction.

### Frontend

From `micopay/frontend`:

```sh
npm ci
npm run dev
```

Set `VITE_API_URL` to your local backend. The development server uses port `5181`.
Check the applicable environment mode files: Testnet, Play, and mainnet builds
have different settings.

### Android

From `micopay/frontend`:

```sh
npm run build:testnet
npx cap sync android
cd android
```

Run `gradlew.bat assembleDebug` on Windows or `./gradlew assembleDebug` on
macOS/Linux. The output is `app/build/outputs/apk/debug/app-debug.apk`.

The debug ID is `com.micopay.app.debug`, separate from release ID `com.micopay.app`.
It does not share the release app's stored session. Updating a release installation
while preserving its data requires the same application ID, compatible version
code, and signing identity.

See the [APK release checklist](./docs/guides/RELEASE_APK_CHECKLIST.md).
Never commit signing keys, wallet secrets, or environment credentials.

## Contributing

Focus on wallet access, payments, cash operations, provider onboarding, identity
verification, and bank withdrawals.

- Start with a scoped issue and describe the user-visible problem.
- Distinguish simulated behavior from real integrations in UI and documentation.
- Include reproduction steps and validation notes with behavior changes.
- Keep credentials, identity documents, and private wallet data out of issues and PRs.
- Treat dated roadmaps and audits as historical context; check the current code
  and issue before assuming a milestone is still pending.

Useful references:

- [Contributing guide](./CONTRIBUTING.md)
- [Product scope](./docs/product/PRODUCT_SCOPE.md)
- [UX manifesto](./docs/product/UX_MANIFESTO.md)
- [Drips team guide](./docs/guides/DRIPS_TEAM_GUIDE.md)
- [Issues](https://github.com/Micopay/micopay-protocol/issues)

## Background

MicoPay began at Código Alebrije in Mexico City and has participated in Stellar
Drips and the PULSO Hackathon. **Stellar Drips Wave 10 has been completed.**
For new contributions, start with [CONTRIBUTING.md](./CONTRIBUTING.md) and the current
issues rather than the historical Wave 6 audit. The current focus is making the mobile wallet and
cash exchange experience usable and reliable.

## License

See [LICENSE](./LICENSE).
