# V-22 · Key recovery — what makes self-custody trustworthy

**Contributor:** [@Shalom-margort](https://github.com/Shalom-margort)
**PR:** [#281](https://github.com/ericmt-98/micopay-protocol/pull/281)
**Issue:** [#237](https://github.com/ericmt-98/micopay-protocol/issues/237)
**Region:** Latin America
**Wave:** 6 · Validates Claim 4 — Stellar self-custody usable by normal users

---

## Context

V-4 showed that MicoPay hides the raw key behind a clean onboarding. V-14 named "losing the key with no recovery" as the top fear. This section tests whether passkey-based recovery actually earns trust over the traditional seed-phrase model.

---

## Response

**1. Have you ever used a self-custody wallet where you held the keys or seed phrase? How did managing the backup feel?**

Yes. The experience ranged from mildly stressful to genuinely anxiety-inducing depending on the amount stored. Writing down a 24-word seed phrase felt like a single point of failure — one piece of paper, one house fire, one bad moment of inattention, and everything is gone. The responsibility is real in a way that a bank account never is: there is no support line to call. Most people I know who tried self-custody either kept very small amounts (not worth the stress of losing) or gave up and went back to a custodial exchange.

**2. Have you ever lost access to an account or wallet and had to go through a recovery process? What happened?**

Yes — a mobile authenticator app on a phone that was stolen. The recovery involved a mix of backup codes I had written down months earlier and a support ticket that took several days. The backup codes worked, but the experience reinforced how fragile manual backup is: most people do not actually write those codes down, and even if they do, finding them later under pressure is difficult. For a crypto wallet with no support ticket option, the same situation would have meant a permanent, unrecoverable loss.

**3. When someone explains passkey recovery to you — "your phone's biometric (Face ID / fingerprint) backs up to iCloud or Google and recovers your wallet key" — does that feel safer, riskier, or about the same as a seed phrase? Why?**

Safer, for most users. The mental model is familiar: I already trust my phone to unlock my bank app, my email, and my health data. Offloading the key backup to a system that already handles it — and that has account recovery I understand (Apple ID / Google account password reset) — removes the single point of failure that makes seed phrases terrifying. The residual concern is that it ties security to the cloud account: if someone takes over my Google or Apple account, they could in principle reach my wallet. But that threat model is already the reality for most people's email and banking — so it is not a new fear, just a known one with known mitigations (2FA on the cloud account).

**4. What would you need to see in the app to trust that your funds are safe if you lose or break your phone?**

Three things, in order of importance:
- A clear, early explanation of *what* backs up the key and *where* — not buried in a settings menu, shown during onboarding before any funds are added.
- A dry-run recovery test accessible at any time: let me simulate losing my phone and restoring to a new device before real money is at stake. If I can see it work, I believe it works.
- A visible, persistent indicator (not a nag, just a status) that the backup is active and current — the same way iOS shows "iCloud Backup: On" in settings.

**5. Would knowing MicoPay uses passkey/biometric recovery (instead of a seed phrase) make you more or less likely to try it for the first time?**

More likely. The seed phrase requirement is the single biggest drop-off point for crypto onboarding with non-technical users in this region. Removing it — and replacing it with something that maps to an experience people already have — lowers the psychological cost of trying. The remaining hesitation is not about the mechanism itself but about the education: does the app explain clearly enough what happens if I lose both my phone *and* my Google/Apple account? That edge case needs a plain-language answer somewhere visible.

---

## Aggregate signal for Claim 4 (Stellar self-custody usable by normal users)

- Seed phrases are a known barrier: the responsibility without a fallback is what stops most non-technical users from committing real funds to self-custody.
- Passkey recovery maps to a mental model people already trust (biometrics + cloud backup for banking and email).
- The architecture decision is sound, but trust requires three UX companions: early explanation, a testable dry run, and a persistent backup-status indicator.
- The remaining risk to adoption is the double-loss edge case (phone + cloud account simultaneously compromised or lost) — address it in plain language during onboarding.

### Key findings for product

| Signal | Detail |
|--------|--------|
| Seed phrase UX | Anxiety-inducing; caused many to abandon self-custody |
| Passkey recovery perception | Safer than seed phrase — maps to existing cloud/biometric trust |
| Required trust signals | Onboarding explanation · dry-run recovery test · persistent backup status indicator |
| Remaining concern | Double-loss edge case (phone + cloud account) needs plain-language answer |
| Onboarding implication | Seed-phrase removal is a positive differentiator; must be explained early |
