<!-- Title: DEV-1 · Make the backend test scripts run on Windows (cross-env) -->
<!-- Labels: enhancement, test, wave:backend, wave:good-first, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: Product & Release -->
<!-- Status: first issue of the scoped Wave 9 reopening (decided 2026-09-25). Everything above this line is metadata; the issue body starts below. -->

## Problem statement

16 of the 32 scripts in `micopay/backend/package.json` set environment variables inline, POSIX style:

```
"test:challenge": "ALLOW_IN_MEMORY_DB=true MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=… node --import tsx src/tests/challenge.service.test.ts"
```

On Windows, `npm run` uses `cmd.exe` by default and the script fails before the test starts:

```
"ALLOW_IN_MEMORY_DB" no se reconoce como un comando interno o externo
```

(`'ALLOW_IN_MEMORY_DB' is not recognized as an internal or external command` on an English Windows.) The only workaround today is `npm run --script-shell` pointing at Git Bash.

Affected scripts at `afa6ae2`:

`test:challenge`, `test:trade-auth`, `test:refund`, `test:discovery`, `test:trade-flow`, `test:didit-sim`, `test:didit-webhook`, `test:cancel-policy`, `test:refund-eligibility`, `test:meeting-point`, `test:kyc-ledger`, `test:initiator`, `test:cash-handoff`, `test:trade-asset`, `test:trade-asset-pg`, `test:provider-inbox`.

## Why it matters

Anyone on Windows, including contributors, has to know the Git Bash workaround to run a single backend test. A plain `npm run test:<name>` should work on every platform.

## In-scope files

- `micopay/backend/package.json`: add `cross-env` as a devDependency and prefix the inline variables of the 16 scripts with `cross-env`.
- `micopay/backend/package-lock.json`: the lockfile update from adding the dependency.

## Out-of-scope

- Test files and their content. If a test fails the same way before and after your change, report it in the PR; do not fix it here.
- Any other script or `package.json` field.
- CI workflows.

## Acceptance criteria

- [ ] The 16 scripts use `cross-env`; no script sets a variable POSIX style.
- [ ] In the script strings, variables, values and the command after them are unchanged: the only change is the `cross-env` prefix. Adding the devDependency and updating the lockfile are also allowed.
- [ ] On Windows with the default `cmd.exe` shell, the scripts no longer fail with the "not recognized" error.
- [ ] On Linux or macOS, the same scripts give the same result as before the change.
- [ ] `npm run build` in `micopay/backend` passes.
- [ ] The PR description lists each of the 16 scripts with its result on both platforms (see Test notes).

## Test notes

- Three scripts need a real PostgreSQL: `test:trade-asset-pg`, `test:kyc-ledger` and `test:meeting-point` (see the header of `src/tests/meetingPointPrivacy.test.ts`). For those, it is enough to show that they start on Windows; a database is not required to accept the PR.
- The backend CI job only builds, so it cannot verify this change. The PR must include the local results.
- Report each script with one of these results:
  - **passed**
  - **started, needs PostgreSQL**
  - **pre-existing failure reproduced**: fails the same way before your change

## Dependency notes

None. This issue does not depend on other open work.
