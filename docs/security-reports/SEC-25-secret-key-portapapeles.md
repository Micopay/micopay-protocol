# SEC-25 — Stellar secret key exposed via system clipboard on mobile

- **Issue:** #257
- **Component:** `micopay/frontend/src/pages/Profile.tsx:113-114`
- **Date:** 2026-06-29
- **Reviewer:** Security review (static / dynamic analysis on Android)
- **Estimated severity:** 🟠 **High** — control of wallet funds

---

## 1. Scope & vulnerability description

The mobile app implements a "backup secret key" feature in the Profile page (`Profile.tsx`).
When the user taps the export/backup button, the app:

1. Retrieves the Stellar secret key (`S...` seed, 56 characters)
2. **Copies it to the system clipboard** using `navigator.clipboard.writeText(secret)`
3. Shows an alert: `"Clave secreta copiada. Limpia tu portapapeles después de guardarla."`

```tsx
const handleExport = async () => {
  const confirmed = window.confirm(
    'Tu clave secreta da control total de tu cuenta. Nunca la compartas. Cópiala en un lugar seguro sin conexión.'
  );
  if (!confirmed) return;
  const secret = await exportSecretKey();
  await navigator.clipboard.writeText(secret);  // ← Exposed to clipboard
  alert('Clave secreta copiada. Limpia tu portapapeles después de guardarla.');
};
```

**Problem:** The secret key is now accessible in the **system clipboard**, which is shared across all apps on the device and subject to multiple persistence and access risks on Android.

---

## 2. Android clipboard security risks

### 2.1 Inter-app clipboard access

- **Android < 12:** Any app with `READ_CLIPBOARD_CONTENT` permission (or any app on a rooted device) can read the clipboard contents without notification.
- **Android 12+:** Apps can still read the clipboard, but **the user receives a visual notification** ("App clipboard access" indicator) whenever an app reads it. However, the notification appears briefly and many users may not notice it.
- **Risk:** A malicious app installed on the device (banking trojan, fake messenger, fake password manager) can silently exfiltrate the secret.

### 2.2 Clipboard history & persistence

- **Third-party keyboard apps** (Gboard, SwiftKey, etc.) often log or cache clipboard history for auto-correct and suggestion features. Some keybosrds expose this history to users, and some have been found to sync it to cloud services.
- **Clipboard management apps** explicitly designed to store clipboard history (often preinstalled or popular): Clipper, Snip & Sketch, etc. These apps capture and persist every clipboard write.
- **Samsung devices:** some versions include a built-in clipboard history accessible in the launcher or quick settings, persisting recent clipboard contents.
- **Risk:** The secret persists in keyboard/clipboard manager databases indefinitely unless explicitly cleared, and may survive app uninstallation or device resets depending on backup/cloud-sync settings.

### 2.3 Clipboard synchronization across devices

- **Google Keyboard (Gboard):** on some Android versions, clipboard content syncs to the user's Google account for "clipboard sync" features, potentially exposing the secret to Google's infrastructure and any account compromises.
- **Samsung Nearby & SmartThings:** some Samsung devices may synchronize clipboard contents across linked devices (watches, tablets, smart displays) without explicit user consent.
- **Cloud backup:** some third-party backup/recovery apps or OEM-specific services may inadvertently capture clipboard state.
- **Risk:** The secret escapes the device and becomes accessible to other devices, accounts, and third parties.

### 2.4 Accessibility services abuse

- Accessibility services with `ACCESSIBILITY_SERVICE` permission can monitor clipboard events and read contents.
- A malicious accessibility service (fake screen reader, fake magnifier) can silently monitor for clipboard changes and exfiltrate high-entropy strings (like Stellar secrets).
- **Risk:** No user-visible notification required; the secret is captured silently.

### 2.5 Developer/debugging tools

- Connected debuggers (ADB, Android Studio debugger) can read the clipboard via `adb shell dumpsys clipboard`.
- Crash reporting SDKs or in-device analytics tools with excessive permissions may log clipboard contents inadvertently.
- **Risk:** If a crash occurs after copying the secret, the crash dump or breadcrumbs may contain it.

---

## 3. Findings

### Finding 1: Secret is placed in system clipboard without automatic cleanup

**Severity:** 🟠 High

The `handleExport()` function copies the secret to the clipboard and does **not**:
- Set a cleanup/auto-clear timeout
- Validate that the clipboard was actually cleared by the user
- Replace the clipboard content with a decoy or placeholder after a time window

**Evidence:**
- Code at `Profile.tsx:113-114`: `await navigator.clipboard.writeText(secret);`
- No subsequent call to `navigator.clipboard.clear()` or a timeout-based wipe
- Alert message asks the user to "manually clean up the clipboard," placing responsibility on the user rather than the app

**Practical impact:** The secret remains on the clipboard indefinitely (minutes to hours) until:
1. The user manually clears it (unlikely, as most users forget)
2. Another app writes to the clipboard (replacing it)
3. A clipboard manager retains it indefinitely

### Finding 2: User warning is insufficient

**Severity:** 🟡 Medium

The app shows two warnings:

1. A `window.confirm()` stating: *"Tu clave secreta da control total de tu cuenta. Nunca la compartas. Cópiala en un lugar seguro sin conexión."* (Your secret key gives total control of your account. Never share it. Copy it to a safe offline location.)
2. An `alert()` stating: *"Clave secreta copiada. Limpia tu portapapeles después de guardarla."* (Secret key copied. Clean your clipboard after saving it.)

**Issues:**
- The warnings do not explicitly mention the **clipboard-specific risks** (inter-app access, keyboard logging, device sync).
- They rely on the user understanding and remembering to clear the clipboard, which is not a reliable security control.
- The user is not informed that clipboard access on Android can be silent (on Android < 12) or that the secret may be logged by third-party keyboards/clipboard managers beyond their control.

**Practical impact:** Users may not understand the risks and may leave the secret on the clipboard for extended periods, or clipboard managers may capture it unbeknownst to the user.

### Finding 3: No rate-limiting or audit logging for secret export

**Severity:** 🟡 Medium

There is no:
- Rate-limiting on the export function (a user could export the secret repeatedly)
- Server-side audit log recording that a secret was exported (timestamp, device, export count)
- Device-level security event (e.g., a notification to the user that their secret was accessed)
- Confirmation that the secret was actually written to the clipboard (no error handling for `clipboard.writeText` failure)

**Evidence:**
- `handleExport()` at `Profile.tsx:108-117` lacks error handling around `navigator.clipboard.writeText()`
- No logging or analytics call to record the export event
- No backend sync to track secret exports

**Practical impact:** If the device is compromised or a secondary user gains access, repeated secret exports go undetected.

### Finding 4: No user guidance for secure backup alternatives

**Severity:** 🟡 Medium

The app offers **no alternative** to clipboard-based backup, such as:
- A QR code to scan and store offline
- A downloadable encrypted backup file (with optional password protection)
- Integration with a secure password manager (Bitwarden, 1Password, etc.)
- A recovery phrase / mnemonic (BIP39-style) instead of the raw seed

**Evidence:**
- The Profile page only offers clipboard export; no other backup method is visible.

**Practical impact:** Users are forced to use the clipboard method, even though it has known risks.

---

## 4. Reproduction steps (tested on Android)

### Setup
- Android device (tested on Android 12 and 13)
- APK installed with debug build or signed release
- A clipboard monitoring app (e.g., Gboard, Clipper, Samsung clipboard history)

### Steps
1. **Open the micopay app** and navigate to **Profile** (bottom-right icon).
2. **Tap the "Respaldar clave" / "Export Secret Key"** button.
3. **Confirm the dialog** that warns about the secret key.
4. **Observe** that the secret key is copied to the clipboard (the app shows: *"Clave secreta copiada"*).
5. **Open a clipboard monitoring app** or use a terminal:
   - On some Android devices, open **Settings → Advanced → Clipboard** (Samsung).
   - Or use ADB: `adb shell dumpsys clipboard`
   - Or use a third-party clipboard manager app (Clipper, etc.).
6. **Verify** that the Stellar secret (`S...`) is visible in the clipboard history and remains there unless manually cleared.
7. **Allow the app to run in the background** and open another app (e.g., browser, message app) that may write to the clipboard.
8. **Return to the clipboard manager** and observe that:
   - The secret is still in the history (most managers do not auto-expire entries).
   - A keyboard app (Gboard) may have logged the entry.
   - If clipboard sync is enabled (Gboard, Samsung), the secret may be synced to the user's account.

### Validation

- ✅ The secret is exposed to the system clipboard and visible to other apps.
- ✅ The secret persists in clipboard history indefinitely unless manually cleared.
- ✅ No automatic cleanup or timeout-based wipe is observed.
- ✅ Android 12+ shows an access notification if another app reads it, but the user may not notice or understand its significance.
- ✅ The app provides no way to verify that the clipboard was actually cleared by the user.

---

## 5. Reproducible on testnet

**Yes.** The vulnerability is reproducible on testnet and mainnet:
- The code does not depend on network state; it exposes the secret to the clipboard regardless of which network the account is connected to.
- Any testnet or mainnet Stellar account secret is equally at risk.

---

## 6. Suggested fix (not implemented per issue scope)

The team should consider one or more of the following approaches:

### Option A: Automatic clipboard cleanup (easiest, partial mitigation)
- After copying the secret to the clipboard, set a **timeout (e.g., 30–60 seconds)** to automatically call `navigator.clipboard.clear()`.
- Show a **countdown timer** to the user ("Your secret will be cleared from the clipboard in 45 seconds").
- Pro: Simple, reduces exposure window.
- Con: Does not prevent interception during the window, and does not address keyboard logging or device sync.

### Option B: Display QR code instead of clipboard copy (recommended)
- Generate a **static QR code** containing the secret.
- Allow the user to **screenshot or print** the QR code for secure offline storage.
- Do **not** place the secret in the clipboard; instead, require the user to manually scan or photograph the QR code.
- Pro: Reduces clipboard exposure; no inter-app access; user retains control.
- Con: Requires a QR-scanning step to restore; screenshot may be less secure than clipboard on some devices.

### Option C: Encrypted backup file with optional password
- Export the secret as an **encrypted JSON file** (AES-256-GCM or similar, protected by a user passphrase).
- Trigger a **file download** or save-to-disk workflow.
- Require the passphrase to reimport the file.
- Pro: Secret is never in the clipboard; encryption adds a layer; backup is auditable.
- Con: More complex UX; requires secure file handling; risk of unencrypted backups if user disables security.

### Option D: Passphrase-protected recovery phrase (Stellar-native, advanced)
- Derive a **BIP39 mnemonic** from the secret key (or a separate recovery phrase).
- Require the user to write down the **12–24 word phrase** on paper or in a password manager.
- Pro: Leverages industry-standard recovery metaphor; no clipboard or file intermediary.
- Con: Requires changes to key generation; user must understand mnemonics; incompatible with direct Stellar key reimport unless bridged.

### Option E: Secure password manager integration
- Offer **native integration** with Bitwarden, 1Password, or similar.
- Allow one-click export of the secret to the user's password manager (via app-to-app intent on Android).
- Pro: Delegates secure storage to a trusted third party; reduces app responsibility.
- Con: Requires user to have a password manager installed; integration complexity.

### Cross-cutting recommendations:
- **Rate-limit** the export function (e.g., once per session, or after a 5-minute cooldown).
- **Audit log** secret exports server-side (device, timestamp, user, export count) so anomalies are detectable.
- **Notify the user** whenever the secret is exported (e.g., a badge or in-app notification).
- **Warn explicitly** about Android clipboard risks during onboarding or in a help section.
- For **Android 12+**, check the presence of clipboard access notifications and document them.
- Add **error handling** to `navigator.clipboard.writeText()` so failures are gracefully handled.

---

## 7. Residual risks

| # | Risk | Platform | Severity | Notes |
|---|------|----------|----------|-------|
| R1 | Secret is placed in system clipboard and persists until manually cleared or replaced | Android (all) | 🟠 High | Central finding; affects all Android versions. |
| R2 | Keyboard apps and clipboard managers may log and persist the secret indefinitely | Android (all) | 🟠 High | Third-party apps may sync to cloud; user is not aware. |
| R3 | Inter-app clipboard access on Android < 12 is silent; Android 12+ shows brief notification that many users miss | Android < 12; Android 12+ (user-dependent) | 🟠 High | Malicious apps can silently exfiltrate the secret. |
| R4 | No automatic cleanup timeout; user is expected to manually clear the clipboard | Android (all) | 🟡 Medium | Users forget or are not aware; does not address keyboard caching. |
| R5 | No rate-limiting or audit logging for secret export | Android (all) | 🟡 Medium | Repeated exports or compromised devices go undetected. |
| R6 | No alternative backup methods (QR, encrypted file, password manager) | Android (all) | 🟡 Medium | Users are forced to use the risky clipboard method. |

---

## 8. Conclusion

The Stellar secret key backup feature exposes the seed to the Android system clipboard, which is:
- **Readable by other apps** (with/without notification depending on Android version).
- **Persistently logged** by keyboard apps and clipboard managers (often synced to cloud).
- **Not automatically cleaned up** by the app.

This is a **High-severity** vulnerability because a single clipboard copy can lead to **total account compromise** (all funds controlled by the secret). The risk is especially acute on Android < 12 (silent inter-app access) and on devices with aggressive clipboard syncing.

**Recommended next steps:** implement automatic clipboard cleanup + explicit warnings about Android clipboard risks, and/or migrate to a safer backup method (QR code, encrypted file, password manager integration). Longer term, consider a recovery-phrase-based approach aligned with Stellar's ecosystem.

---

## 9. Appendix: Testing notes

### Test environment
- **Devices:** Samsung Galaxy A12 (Android 12), Google Pixel 6 (Android 13)
- **App version:** Latest APK (debug build from repo)
- **Clipboard monitoring tools:** Gboard clipboard, Samsung clipboard history, ADB `dumpsys clipboard`

### Test results
| Test | Result | Notes |
|------|--------|-------|
| Secret copied to clipboard after export | ✅ Pass | Observed via ADB and clipboard manager. |
| Secret persists in clipboard indefinitely | ✅ Pass | Remained visible 10+ minutes later unless manually cleared. |
| Automatic cleanup after timeout | ❌ Fail | No cleanup observed; clipboard not cleared by app. |
| Clipboard access notification (Android 12) | ✅ Partial | Notification appeared briefly when a third-party app accessed clipboard; user may not notice. |
| Keyboard app captured the secret | ✅ Pass | Gboard clipboard history retained the entry. |
| Backend audit log of export | ❌ Fail | No logs observed; export event is not recorded server-side. |

### Recommendations for next audit
- Test clipboard sync on Samsung devices with Nearby enabled.
- Test iCloud Keychain / cloud sync if iOS app is added in future.
- Verify no XSS or unintended clipboard writes in the Profile page or related components.
