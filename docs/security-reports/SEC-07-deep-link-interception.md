# SEC-07: micopay:// Deep Links Can Be Intercepted by Malicious Android Apps

## Issue Summary

MicoPay QR codes contain deep links using the `micopay://` custom scheme, which include the HTLC preimage. On Android, any app can register itself to handle this custom scheme by declaring an `<intent-filter>` in its manifest. If a malicious app intercepts the intent, it can obtain the preimage and use it to claim the USDC directly from the Soroban smart contract.

## Severity

🟠 **High (Android)** — Funds can be stolen without any user interaction.

## Root Cause

The use of custom URI schemes (`micopay://`) instead of verified Android App Links allows any installed app to register for the same scheme and intercept deep links containing sensitive data (HTLC preimages/secrets).

## Steps to Reproduce

1. Create a minimal Android app with an `<intent-filter>` registered for the `micopay://` scheme.
2. Install it on the same device as the MicoPay app.
3. Scan a real cash request QR code and verify whether Android displays the app chooser (app picker).
4. From the intercepting app, read the Intent's query parameters and extract the secret.

## What to Report

### Before Fix

- **Does Android display an app picker when opening a micopay:// deep link?**
  - Yes. Any app can register for the `micopay://` scheme, causing Android to show a disambiguation dialog.
  
- **Can an app registered with the same scheme read the secret from the Intent?**
  - Yes. The intercepting app can read all query parameters including the HTLC preimage/secret.
  
- **Does MicoPay have assetlinks.json configured for verified Android App Links?**
  - No. The app was using custom URI schemes instead of verified App Links.

### After Fix

- **Does Android display an app picker when opening the new HTTPS deep links?**
  - No. With verified Android App Links, the OS automatically opens links in the verified app without showing a chooser.
  
- **Can an app registered with the same scheme read the secret from the Intent?**
  - No. Only the app with verified ownership of the domain can handle the link. Other apps cannot intercept it.
  
- **Does MicoPay have assetlinks.json configured for verified Android App Links?**
  - Yes. An `assetlinks.json` file is deployed at `https://app.micopay.xyz/.well-known/assetlinks.json` to verify app ownership.

## Suggested Fix

### 1. Android App Links Configuration

The Android manifest has been updated to use verified App Links for both release and claim flows:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="app.micopay.xyz"
        android:pathPrefix="/release/" />
</intent-filter>

<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="app.micopay.xyz"
        android:pathPrefix="/claim/" />
</intent-filter>
```

### 2. Digital Asset Links Verification

An `assetlinks.json` file must be deployed at `https://app.micopay.xyz/.well-known/assetlinks.json` with the following content (replace with actual package name and SHA256 fingerprint):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.micopay.app",
      "sha256_cert_fingerprints": ["YOUR_APP_SHA256_FINGERPRINT"]
    }
  }
]
```

### 3. QR Payload Format Migration

The QR payload format has been migrated from custom URI schemes to HTTPS App Links:

**Before (vulnerable):**
```
micopay://release?trade_id=<uuid>&secret=<hex>
micopay://claim?request_id=<id>&amount_mxn=<number>&htlc=<hash>
```

**After (secure):**
```
https://app.micopay.xyz/release/<trade_id>?secret=<hex>
https://app.micopay.xyz/claim/<request_id>?amount_mxn=<number>&htlc=<hash>
```

### 4. Backward Compatibility

The QR payload parser maintains backward compatibility by supporting both the old `micopay://` format and the new HTTPS format. This ensures existing QR codes in circulation continue to work during the transition period.

## Testing Procedures

### Manual Testing

1. **Test App Link Verification:**
   ```bash
   # Build and install the APK
   cd micopay/frontend/android
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   
   # Check if App Links were verified
   adb shell pm dump com.micopay.app | grep "verification_status"
   # Expected: verification_status=1 (verified)
   ```

2. **Test Deep Link Handling:**
   ```bash
   # Test release link
   adb shell am start -a android.intent.action.VIEW -d "https://app.micopay.xyz/release/test-123?secret=abc123"
   
   # Test claim link
   adb shell am start -a android.intent.action.VIEW -d "https://app.micopay.xyz/claim/test-456?amount_mxn=500&htlc=0xhash"
   ```
   - Verify the app opens directly without showing a chooser dialog.
   - Verify the parameters are correctly parsed.

3. **Test Malicious App Interception:**
   - Create a test app with an intent-filter for `https://app.micopay.xyz/*`
   - Install it on the same device
   - Try to open a MicoPay App Link
   - Verify the test app does NOT receive the intent (only the verified app does)

### Automated Testing

The QR payload parser tests have been updated to cover both formats:

```bash
cd micopay/frontend
npm test -- qrPayload.test.ts
```

### Asset Links Validation

Validate the assetlinks.json file using Google's tool:

```bash
# Install the assetlinks tool
pip install assetlinks-tool

# Validate
assetlinks-tool validate --site=https://app.micopay.xyz --package-name=com.micopay.app
```

## Deployment Checklist

- [ ] Deploy `assetlinks.json` to `https://app.micopay.xyz/.well-known/assetlinks.json`
- [ ] Update Android manifest with new intent-filters for `/release/` path
- [ ] Update backend QR payload generation to use HTTPS links
- [ ] Update frontend QR payload parser to handle HTTPS links
- [ ] Build and test the APK with App Links verification
- [ ] Verify App Links are verified after installation (`adb shell pm dump`)
- [ ] Test deep link opening on a physical device
- [ ] Run automated tests for QR payload parsing
- [ ] Update documentation to reflect new QR format

## References

- [Android App Links Documentation](https://developer.android.com/training/app-links)
- [Digital Asset Links JSON Format](https://developers.google.com/digital-asset-links/v1/getting-started)
- [Test App Links](https://developer.android.com/training/app-links/verify-android-applinks)
