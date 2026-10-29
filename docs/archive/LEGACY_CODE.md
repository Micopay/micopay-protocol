# Legacy code still present

The repository is centered on `micopay/frontend`, `micopay/backend`,
`micopay/contracts`, and `micopay/sql`. The following root directories belong
to an older protocol/x402/ZK line and are not the default app surface:

| Path | Why it remains |
| --- | --- |
| `apps/api/` | The old protocol API. Removal remains coupled to the unfinished payment-link/`ClaimQR` boundary. |
| `packages/` | SDK and shared types consumed by `apps/api`. |
| `circuits/` | Noir circuits used by the legacy ZK API and verifier. |
| `contracts/zk-verifier/` | Verifier used by the legacy ZK flow. |
| `contracts/micopay-badges/` | Preserved until the provider-reputation mechanism is decided. |
| Root Turbo/Node workspace files | Still describe `apps/*` and `packages/*`; remove only with those consumers. |
| `render.yaml` | Historical Render manifest retained until the remaining service is explicitly retired. It is not the AWS production source of truth. |

Do not add new mobile-app features to these directories. Their dependency and
removal history is preserved in
[`PLAN_LIMPIEZA_REPO_2026-10-04.md`](../plans/archive/PLAN_LIMPIEZA_REPO_2026-10-04.md).
