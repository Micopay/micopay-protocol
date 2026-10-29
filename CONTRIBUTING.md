# Contributing to MicoPay

**Stellar Drips Wave 10 has been completed.** For the next contribution, check the
[current issues](https://github.com/Micopay/micopay-protocol/issues) and the
campaign attached to the issue. This guide does not announce a new Wave.

## Start with the current app

Read the [README](./README.md) for the product, feature flags, and limitations.
Contributions normally cover:

- `micopay/frontend/`: React/Vite app and Capacitor Android integration.
- `micopay/backend/`: Fastify API and application services.
- `micopay/sql/`: schema changes when explicitly required by the issue.
- `docs/`: documentation relevant to the app.

Contract changes in `micopay/contracts/`, deployments, and infrastructure need
explicit issue scope. ZK, AI-agent, x402, and Bazaar development belongs in
[MicoPay Bridge](https://github.com/Micopay/micopaybridge), not in this repository.

## Choose an issue before coding

1. Read the issue's current description, acceptance criteria, assignee, and comments.
2. Confirm that it is open for contributions and follow its assignment process.
3. Wait for assignment before starting to avoid duplicate work.
4. Ask on the issue when product behavior or scope is unclear.
5. Do not start blocked work until the maintainer clears the dependency.

Use the [milestone list](https://github.com/Micopay/micopay-protocol/milestones)
for context, but do not assume an older open milestone is the current priority.
The Wave 6 audit and Wave 8 plans are historical, not lists of unresolved tasks.

## Run the app locally

Use Node.js 22 and npm. Install dependencies with `npm ci` separately in
`micopay/backend` and `micopay/frontend`.

Follow the [README setup instructions](./README.md#local-development) to configure
PostgreSQL, backend secrets, Stellar settings, and the frontend API URL.
Example environment values are placeholders; do not use production credentials.

In separate terminals, from each package directory:

```sh
npm run dev
```

The backend example uses port **3000**; the frontend uses **5181**. Match
`VITE_API_URL` to your backend. State whether your validation uses mocks or real
Testnet transactions. Do not treat simulated DeFi screens as live products.

## Before opening a PR

- Keep the change within the assigned issue and avoid unrelated refactors.
- Follow the [UX manifesto](./docs/product/UX_MANIFESTO.md) for user-facing behavior.
- Describe what changed, why, and which issue it addresses.
- Record the checks you actually ran and any untested behavior.
- For UI changes, include screenshots or a short recording and reproduction steps.
- For trade or payment changes, cover affected states and failure paths.
- Never include wallet secrets, signing keys, credentials, or identity documents.
- Explain dependency, lockfile, build-script, or installation-hook changes explicitly.

Use a focused title such as `fix: preserve amount after identity verification`.
Reference the issue in the PR body (`Closes #123` when it fully resolves the issue).
If you change the code after review, summarize the new changes and request review
again. Avoid rewriting reviewed history without coordinating with the maintainer.

## Campaigns and rewards

Check the issue's campaign and the current terms shown by Drips before applying.
Eligibility, verification, points, deadlines, and payment rules are controlled by
the campaign; this repository does not freeze those rules or promise a payout.
Use the [Drips campaign page](https://www.drips.network/wave/stellar) for current information.
If an issue belongs to another campaign, follow that issue's instructions.

## Documentation and help

- [Documentation index](./docs/README.md): entry points and historical references.
- [Drips team guide](./docs/guides/DRIPS_TEAM_GUIDE.md): maintainer planning context.
- [Historical Wave 6 audit](./docs/audits/AUDIT_APK_WAVE6.md): findings from June 2026,
  which must be rechecked against current code before treating them as open work.

Ask scope and implementation questions on the relevant issue. Be direct,
respectful, and clear about blockers. Review timing depends on maintainer availability.
