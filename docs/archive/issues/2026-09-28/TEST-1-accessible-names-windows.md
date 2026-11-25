<!-- Title: TEST-1 · The decorative-icon check skips its target screens on Windows -->
<!-- Labels: test, wave:frontend, wave:good-first, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: Product & Release -->
<!-- Status: proposal, not published (plan v0.2, reviewed by Codex). Everything above this line is metadata; the issue body starts below. -->

## Problem statement

`micopay/frontend/src/__tests__/accessibleNames.test.ts` has a test, *"hides decorative icons from the name on the acceptance-criteria screens"*, that checks that icons inside buttons are hidden from screen readers on a list of screens (`AC_SCREENS`, line 110).

The file path of each button is built with `relative(SRC, f)` (line 89). On Windows that returns `pages\PayHub.tsx`, while `AC_SCREENS` lists `pages/PayHub.tsx`. The comparison at line 120 never matches, so on Windows the test selects **no buttons** and passes without checking anything.

This is not hypothetical: a real leak in `PayHub.tsx` failed this test on Linux CI and passed on Windows on the same commit.

## Why it matters

A test that passes because it checked nothing is worse than no test: it gives false confidence to anyone running the suite on Windows.

## In-scope files

- `micopay/frontend/src/__tests__/accessibleNames.test.ts`

## Out-of-scope

- Any component or screen. This issue only fixes the test.
- Other tests. (`iconSubset.test.ts` already normalizes separators.) If you find the same defect elsewhere, report it in the PR; do not fix it here.

## Acceptance criteria

- [ ] Paths are normalized to `/` before comparing them with `AC_SCREENS`.
- [ ] The test asserts that it actually selected buttons from the expected screens, so an empty selection fails instead of passing.
- [ ] With the current code, the test passes on Windows and on Linux.
- [ ] Negative check: temporarily remove `aria-hidden="true"` from an icon inside a button **without** `aria-label` on one of the `AC_SCREENS` (buttons with `aria-label` are excluded by design). The test must fail on **both** Windows and Linux. Revert this change before submitting.
- [ ] `npm run test` in `micopay/frontend` passes.
- [ ] The PR only touches `accessibleNames.test.ts`.

## Test notes

- Include evidence for both platforms, for example a workflow run in your fork with `windows-latest` and `ubuntu-latest`, and the result of the negative check on each.
- The negative check is only evidence; the reverted mutation must not be part of the PR.

## Dependency notes

None.
