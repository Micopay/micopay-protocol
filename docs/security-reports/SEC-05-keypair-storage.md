# SEC-05 — Robustness of Stellar keypair storage on mobile devices

- **Issue:** #212
- **Component:** `micopay/frontend/src/services/secureStorage.ts`, `micopay/frontend/src/lib/keystore.ts`
- **Date:** 2026-06-29
- **Reviewer:** Security review (static / source-level analysis)
- **Estimated severity:** 🟡 Medium on native — 🟠 **High on web/PWA**

---

## 1. Scope & what is stored

The app generates a Stellar `Keypair` and persists it under the key
`stellar_keypair` as JSON `{ publicKey, secretKey }` (`lib/keystore.ts:4-18`).
The `secretKey` is the full Stellar seed (`S...`) — whoever reads it controls
the account's funds. Storage is abstracted behind `secureStorage.ts`, which
selects a backend at runtime:

- **Native (Capacitor):** `@aparajita/capacitor-secure-storage` →
  Android Keystore-backed encrypted store (`secureStorage.ts:30-41`).
- **Web / PWA:** a custom `webStore` wrapper over `window.localStorage`
  (`secureStorage.ts:13-23`).

Backend selection (`secureStorage.ts:27-44`):

```ts
async function getStore(): Promise<KvStore> {
  if (!Capacitor.isNativePlatform()) return webStore;   // web/PWA → localStorage
  // native → dynamic import of SecureStorage
}
```

---

## 2. Findings against the issue checklist

### Q1 — Does the native secure storage require biometrics / device-auth?

**No.** The plugin is invoked with default options
(`SecureStorage.get/set/remove`, `secureStorage.ts:31-40`). No access-control
flags, no biometric prompt, and no companion biometric plugin are configured.

- **Android:** values are encrypted with an AES key held in the Android
  Keystore and the ciphertext is kept in app-private `SharedPreferences`. The
  key is **not** created with `setUserAuthenticationRequired(true)`, so reads
  succeed silently for any code running as the app on an **unlocked** device.
- The keypair is therefore protected by *app sandboxing + Keystore at rest*,
  **not** by a per-read biometric / PIN challenge.

Practical impact: an attacker needs either (a) the app's own runtime (e.g. via
an injected/malicious build, an accessibility-abuse path, or a compromised
process) or (b) Keystore extraction on a rooted device. Plain file-system
access to the SharedPreferences XML yields only ciphertext.

### Q2 — Is the key included in automatic OS backups?

**Android: No — well mitigated.** Backups are disabled and explicitly
scrubbed at every layer:

- `AndroidManifest.xml:4` → `android:allowBackup="false"`
- `xml/backup_rules.xml` → `<exclude>` for `sharedpref`, `database`, `file`,
  `external`, `root` (legacy Auto Backup, API < 31).
- `xml/data_extraction_rules.xml` → same exclusions for both `<cloud-backup>`
  and `<device-transfer>` (API 31+).

So even if `allowBackup` were ever flipped, the Keystore-encrypted prefs are
excluded from Google Drive Auto Backup and from device-to-device transfer.
(Note: Keystore key material is hardware/TEE-bound and is never part of any
backup regardless.)

**iOS: Not applicable today — no iOS target exists** (`micopay/frontend/ios`
is absent; only `android/` is present). See the residual risk in §3 for when
iOS is added.

### Q3 — Is there a fallback path to `localStorage` on native?

**No silent fallback.** `getStore()` returns `webStore` **only** when
`!Capacitor.isNativePlatform()` (`secureStorage.ts:28`). On native it always
resolves the SecureStorage-backed store. If the dynamic import of the plugin
fails, the returned promise **rejects** — it does not degrade to `localStorage`
— so a plugin failure surfaces as an error rather than silently writing the
secret in plaintext. ✅

> Minor, unrelated observation: `TradeDetail.tsx:36` reads
> `localStorage.getItem('micopay_users')` directly in `isCurrentUserBuyer()`.
> On native, `micopay_users` lives in SecureStorage, so this read returns
> `null` (a functional UX bug, not a secret leak — it touches the session
> token/id, never `stellar_keypair`). Worth tracking separately.

### Q4 — Does the web build expose the key unencrypted?

**Yes — this is the High-severity finding.** On web/PWA, `writeJSON` →
`webStore.set` → `window.localStorage.setItem` (`secureStorage.ts:13-23`).
The full `{ publicKey, secretKey }` object is stored as **plaintext JSON**
under `stellar_keypair`, with no encryption, no key-wrapping, and no
non-extractable WebCrypto key.

Consequences on web/PWA:

- Any **XSS** in the SPA can read `localStorage.stellar_keypair` and exfiltrate
  the Stellar seed → full account/fund compromise.
- Malicious **browser extensions** with host access, shared/kiosk machines, and
  DevTools all expose the seed trivially.
- The secret persists indefinitely until `removeKey('stellar_keypair')` runs.

---

## 3. Residual risks

| # | Risk | Platform | Severity |
|---|------|----------|----------|
| R1 | Seed stored as plaintext in `localStorage` | Web / PWA | 🟠 High |
| R2 | No per-read biometric/device-auth on the secret | Native (Android) | 🟡 Medium |
| R3 | Keystore-extractable on rooted devices (no auth-bound key) | Native (Android) | 🟡 Medium |
| R4 | When iOS is added, plugin default Keychain accessibility is `afterFirstUnlock` (not `*ThisDeviceOnly`) and iCloud-sync default must be confirmed `off` — otherwise the item may ride along in encrypted backups / iCloud Keychain | iOS (future) | 🟡 Medium |
| R5 | `micopay_users` (session token) is also plaintext in `localStorage` on web | Web / PWA | 🟡 Medium |

---

## 4. Recommendations

**Web / PWA (R1 — priority):**
- Do not persist raw seeds in `localStorage`. Options, in order of preference:
  1. Treat web/PWA as a **non-custodial-display** context — keep the seed only
     in memory for the session, require re-import on reload, and never write it
     to `localStorage`.
  2. If persistence is required, wrap the seed with a **non-extractable
     WebCrypto key** derived from a user passphrase (PBKDF2/Argon2 → AES-GCM)
     and store only the ciphertext + salt/iv. The passphrase is never stored.
  3. At minimum, gate the web build behind an explicit "this device is
     untrusted" warning and a short session TTL with auto-wipe.
- Tighten XSS surface (CSP, no `dangerouslySetInnerHTML`, dependency hygiene)
  since `localStorage` secrets are only as safe as the absence of XSS.

**Native Android (R2/R3):**
- Bind the Keystore key to user authentication for the seed:
  configure the plugin / underlying key with `setUserAuthenticationRequired(true)`
  (+ `setUserAuthenticationParameters` / validity window) or add a
  biometric-auth plugin gate before `exportSecretKey()` / `signChallenge()`.
- Prefer `StrongBox` (`setIsStrongBoxBacked(true)`) where hardware supports it.
- Keep the existing backup exclusions — they are correct.

**iOS (R4 — before shipping an iOS build):**
- Set Keychain accessibility to `*ThisDeviceOnly`
  (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` or
  `WhenUnlockedThisDeviceOnly`) so the item cannot be restored to another
  device via encrypted backup.
- Confirm `SecureStorage.setSynchronize(false)` so the item is not pushed to
  iCloud Keychain.
- Add `Secure Enclave` / `kSecAccessControl` biometric gating for the seed.

**General (R5):**
- Apply the same "no plaintext secret in `localStorage`" rule to the
  `micopay_users` session token on web.

---

## 5. Conclusion

- **Native (Android):** robust *at rest* (Keystore-encrypted, backups fully
  disabled, no `localStorage` fallback) but **does not require biometric /
  device-auth per read** and is **not auth-bound**, so a rooted device or an
  in-app compromise can reach the seed → **🟡 Medium**.
- **Web / PWA:** the Stellar seed is stored **unencrypted in `localStorage`**,
  exfiltratable via XSS / extensions / shared devices → **🟠 High**.

**Recommended next steps:** prioritize R1 (web seed handling) and R2/R3
(auth-bound Keystore on Android); resolve R4 before any iOS release.
