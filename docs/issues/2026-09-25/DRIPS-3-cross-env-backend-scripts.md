<!-- Title: DRIPS-3 · Make the backend test scripts run on Windows (cross-env) -->
<!-- Suggested labels: backend, tooling, complexity: low -->
<!-- Status: proposal, not published. Owner: Drips, first in the scoped reopening. -->

## Problem

16 of the 32 scripts in `micopay/backend/package.json` set environment variables inline, POSIX style:

```
"test:challenge": "ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=… node --import tsx src/tests/challenge.service.test.ts"
```

On Windows, `npm run` uses `cmd.exe` and fails with `"ALLOW_IN_MEMORY_DB" no se reconoce como un comando interno o externo`. Today the only workaround is `--script-shell` pointing at Git Bash.

Affected scripts at `d42e41d`: `test:challenge`, `test:trade-auth`, `test:refund`, `test:discovery`, `test:trade-flow`, `test:didit-sim`, `test:didit-webhook`, `test:cancel-policy`, `test:refund-eligibility`, `test:meeting-point`, `test:kyc-ledger`, `test:initiator`, `test:cash-handoff`, `test:trade-asset`, `test:trade-asset-pg`, `test:provider-inbox`.

## In scope

- Add `cross-env` as a devDependency of `micopay/backend`.
- Prefix the inline variables of those 16 scripts with `cross-env`, keeping the same variables, values and commands.
- Update the lockfile.

## Out of scope

- Test files and their content. If a test fails on both platforms before and after the change, report it in the PR; do not fix it here.
- Scripts that need PostgreSQL (`test:trade-asset-pg`, `test:kyc-ledger` and `test:meeting-point`, whose header says so) only need to start on Windows; a database is not required to accept the PR.
- CI changes. The backend CI job only builds, so this cannot be verified in CI; the PR must include the local results.

## Acceptance criteria

- [ ] The 16 scripts use `cross-env`; no script sets a variable POSIX style.
- [ ] In the script strings, variables, values and the command after them are unchanged: the only change is the `cross-env` prefix. Adding the devDependency and updating the lockfile are also allowed.
- [ ] On Windows with the default `cmd.exe` shell, the in-memory scripts run without the "no se reconoce" error.
- [ ] On Linux or macOS, the same scripts give the same result as before the change.
- [ ] The PR description lists each script with its result on both platforms, using one of: **passed**, **started, needs PostgreSQL**, or **pre-existing failure reproduced** (fails the same way before the change).
- [ ] `npm run build` in `micopay/backend` passes.
