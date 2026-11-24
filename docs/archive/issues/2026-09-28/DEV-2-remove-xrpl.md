<!-- Title: DEV-2 · Remove the unused xrpl dependency from the frontend -->
<!-- Labels: enhancement, wave:frontend, wave:good-first, complexity: low, Stellar Wave, wave-9-drips -->
<!-- Milestone: Wave 9: Product & Release -->
<!-- Status: proposal, not published (plan v0.2, reviewed by Codex). Everything above this line is metadata; the issue body starts below. -->

## Problem statement

`micopay/frontend/package.json` (line 41) declares `"xrpl": "^5.0.0"`, but no file in the frontend imports the package.

The word `xrpl` does appear in three places, but none of them uses the package:
- `src/constants/escrowAssets.ts:21`: the string `'xrpl'` in the `EscrowNetwork` type.
- `src/constants/escrowAssets.ts:44`: a disabled `XRP` entry that describes a possible future asset.
- `src/__tests__/assetSelector.test.tsx:41`: a test reference to that entry.

## Why it matters

An unused dependency adds install time, lockfile churn and supply-chain surface for no benefit.

## In-scope files

- `micopay/frontend/package.json`
- `micopay/frontend/package-lock.json`

## Out-of-scope

- The `EscrowNetwork` type, the disabled `XRP` entry and its test: they stay.
- Any other dependency. The lockfile diff must not upgrade or change unrelated packages.

## Acceptance criteria

- [ ] `xrpl` is removed from `package.json`, and the lockfile is updated only as a consequence of that removal.
- [ ] A clean install **with the lockfile you submit** works: `npm ci`, then `npm run build` and `npm run test` in `micopay/frontend`.
- [ ] The PR states the Node and npm versions used.
- [ ] The PR only touches `package.json` and `package-lock.json`.

## Test notes

- Our CI deletes the frontend lockfile and reinstalls (`.github/workflows/ci.yml:64`), so a green CI does **not** prove your lockfile works. The `npm ci` evidence above is required.
- If you want, report how much `node_modules` shrinks, measured before and after in the same environment. This is informative, not a requirement.

## Dependency notes

None.
