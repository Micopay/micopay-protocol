# GrantFox Contributor Guide

MicoPay runs contribution campaigns on **[GrantFox](https://grantfox.xyz)** in parallel with the Stellar Drips Wave. This guide covers only what is **different** about GrantFox issues — everything else (in-scope paths, local setup, PR style, review SLA, UX bar) follows [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`docs/UX_MANIFESTO.md`](./UX_MANIFESTO.md), which you should read first.

---

## How to tell a GrantFox issue apart

Every issue in this repo belongs to **exactly one** campaign, marked by its labels:

| Campaign | Labels | Rewards come from |
|---|---|---|
| **GrantFox** | `grantfox:frontend`, `grantfox:backend`, `grantfox:docs` (+ the campaign label) | The GrantFox campaign budget |
| **Stellar Drips** | `wave:*` + `Stellar Wave` | The Drips Wave reward pool |

`grantfox:*` labels are **never** combined with `Stellar Wave` or `wave:*` on the same issue. If you see both, stop and ask — that is a labeling bug, not a double reward.

`complexity: low / medium / high` is shared by both campaigns and means the same thing (see the table in `CONTRIBUTING.md`).

## How GrantFox issues work

1. **Issues are published one at a time, in series.** When a series has dependent parts (e.g. the SPEI ramp series), the next issue is only published after the previous one is **merged**. Don't start work on a future part announced in an issue body — it doesn't exist yet.
2. **Apply through GrantFox**, not by commenting on the GitHub issue. The maintainer assigns exactly one contributor per issue via the GrantFox platform; the GitHub assignee mirrors that.
3. **Scope is the issue body.** The "What to build" checklist and "Acceptance criteria" are the review contract. `tsc --noEmit` passing is a hard gate for any TypeScript change.
4. **Reference prior work.** Some GrantFox issues touch territory that earlier Drips issues covered. The issue body links them; work already rewarded under a Drips issue is out of scope and will not be rewarded twice.

## Etherfuse / ramp issues: what you can and cannot test

The SPEI ramp (KYC, onramp, offramp) talks to the **Etherfuse sandbox** through `micopay/backend`, which requires an `ETHERFUSE_API_KEY`. **Sandbox credentials are never shared with contributors.**

- Frontend ramp issues are scoped so the UI can be built and reviewed against the shared dev backend or with the backend returning `ETHERFUSE_NOT_CONFIGURED` errors handled gracefully.
- End-to-end validation against the real sandbox (hosted KYC, webhooks, real orders) is done by maintainers before merge — the issue body will say exactly what you are expected to test locally.

## Getting help

- Unclear scope → comment on the GitHub issue.
- Application/reward questions → GrantFox platform support.
- Everything else → [`CONTRIBUTING.md`](../CONTRIBUTING.md) → "Getting help".
