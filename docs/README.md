# MicoPay documentation

This directory separates current product documentation from point-in-time
audits and historical material. A dated plan or audit is evidence of what was
known at that moment; it is not automatically the current backlog.

## Start here

1. [Project README](../README.md) — current scope, limitations, and local setup.
2. [Contributing](../CONTRIBUTING.md) — contribution and verification rules.
3. [Product scope](./product/PRODUCT_SCOPE.md) — boundaries of the mobile app.
4. [Current plans](./plans/README.md) — plans still treated as active.
5. [Current GitHub issues](https://github.com/Micopay/micopay-protocol/issues) —
   assignment, acceptance criteria, and implementation status.

## Directory map

| Directory | Purpose | Authority |
| --- | --- | --- |
| [`product/`](./product/) | Product scope, roadmap, and UX principles | Current reference; verify feature status in code |
| [`architecture/`](./architecture/) | Implemented mobile-app architecture | Current reference for the named subsystem |
| [`guides/`](./guides/) | Maintainer, release, and contract guides | Operational guidance |
| [`operations/`](./operations/) | AWS, Docker, recovery, and runtime notes | Verify dates and deployed configuration before acting |
| [`plans/current/`](./plans/current/) | Plans explicitly still active | Planning reference, not proof of completion |
| [`audits/`](./audits/) | Point-in-time technical reviews | Findings must be rechecked against current code |
| [`security-reports/`](./security-reports/) | Security findings and incident evidence | Historical evidence; status may have changed |
| [`presentations/`](./presentations/) | Shareable explanatory material | Communication artifacts |
| [`archive/`](./archive/) | Completed campaigns, superseded plans, and old issues | Historical only |

## Source-of-truth order

When documents disagree, use this order:

1. Deployed configuration and current code.
2. Current GitHub issue or pull request.
3. The current product, architecture, guide, or operations document.
4. A dated audit or active plan.
5. Anything under `archive/`.

Stellar Drips Wave 10 is complete. ZK, AI-agent, XRPL, x402, and Bazaar material
is maintained in [MicoPay Bridge](https://github.com/Micopay/micopaybridge), not
in this mobile-app repository. Git history preserves the former copies if an old
decision needs to be traced.
