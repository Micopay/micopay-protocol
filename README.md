# 🍄 MicoPay

**A mobile wallet connecting Stellar payments with cash in Mexico.**

MicoPay helps people send and receive digital assets, find nearby cash providers,
and coordinate cash deposits and withdrawals in Mexican pesos. The app combines
a Stellar wallet, a provider map, chat, and Soroban escrow.

This repository focuses on the **MicoPay mobile app and its supporting backend**.
The ZK, AI-agent, and x402 projects have moved to a separate repository. Historical
code and documents may remain here, but those projects are outside the current app scope.

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

## Repository structure

| Path | Purpose |
| --- | --- |
| [`micopay/frontend/`](./micopay/frontend) | React, TypeScript, and Vite app; Android packaging with Capacitor. |
| [`micopay/backend/`](./micopay/backend) | Fastify API for authentication, trades, providers, payments, KYC, and integrations. |
| [`micopay/contracts/`](./micopay/contracts) | App escrow contract and network deployment notes. |
| [`micopay/sql/`](./micopay/sql) | PostgreSQL schema and migrations. |
| [`micopay/scripts/`](./micopay/scripts) | App development and operational utilities. |
| [`docs/`](./docs) | Product decisions, contributor guides, release notes, and historical plans. |

The backend runs on **AWS ECS**, with images in **ECR**, PostgreSQL in **RDS**,
and runtime secrets in **SSM Parameter Store**. Older Render deployment references
and dated planning documents are historical.

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

See the [APK release checklist](./docs/RELEASE_APK_CHECKLIST.md).
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
- [Product scope](./docs/PRODUCT_SCOPE.md)
- [UX manifesto](./docs/UX_MANIFESTO.md)
- [Drips team guide](./docs/DRIPS_TEAM_GUIDE.md)
- [Issues](https://github.com/Micopay/micopay-protocol/issues)

## Background

MicoPay began at Código Alebrije in Mexico City and has participated in Stellar
Drips and the PULSO Hackathon. **Stellar Drips Wave 10 has been completed.**
For new contributions, start with [CONTRIBUTING.md](./CONTRIBUTING.md) and the current
issues rather than the historical Wave 6 audit. The current focus is making the mobile wallet and
cash exchange experience usable and reliable.

## License

See [LICENSE](./LICENSE).
