# App Store and Play Store Compliance Checklist

This document tracks the requirements for Apple App Store and Google Play Store submission, specifically for financial applications with crypto interactions.

> [!IMPORTANT]
> This is a working document to track implementation status. It is not a legal treatise. Each item must be verified against the latest store guidelines before submission.

## Compliance Checklist

| Requirement | Platform | Status | Issue | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Privacy Policy** | Both | `not-started` | [#TBD] | Publicly accessible URL defining data collection, usage, and sharing. |
| **Terms of Service** | Both | `not-started` | [#TBD] | Clear user agreement including financial risk disclosures. |
| **Account Deletion** | Both | `not-started` | [#TBD] | Easy-to-find option to initiate account and data deletion within the app. |
| **Data Safety Form** | Google | `not-started` | [#TBD] | Completed Play Console form detailing data collection and encryption. |
| **App Privacy Labels** | Apple | `not-started` | [#TBD] | "Nutrition labels" in App Store Connect reflecting all third-party SDKs. |
| **Crypto Guideline 3.1.5(b)** | Apple | `not-started` | [#TBD] | Compliance with "Cryptocurrencies" rule: exchange/wallet licensing. |
| **Financial Disclosures** | Both | `not-started` | [#TBD] | Required regulatory disclosures (e.g., non-custodial nature, fee transparency). |
| **Export Compliance** | Apple | `not-started` | [#TBD] | ERN/Encryption registration if using non-standard encryption. |
| **3rd-Party Account Linking** | Both | `not-started` | [#TBD] | Secure OAuth/linking flows for external wallet or bank integrations. |
| **Accessibility Audit** | Both | `not-started` | [#TBD] | Smoke test with VoiceOver (iOS) and TalkBack (Android). |
| **Reviewer Demo Mode** | Both | `not-started` | [#TBD] | Dedicated test account or "Demo Mode" for store reviewers to test flows. |
| **Support Contact** | Both | `not-started` | [#TBD] | Functional support email or chat accessible from within the app. |

## Guidance Notes

### Apple Guideline 3.1.5(b) - Cryptocurrencies
Apple requires that apps facilitating the transmission or exchange of cryptocurrencies must be offered by the exchange itself or a recognized financial institution. We must document the regulatory status of the MicoPay protocol or its operators for the reviewer.

### Google Data Safety
Google requires a detailed breakdown of whether data is shared with third parties and if the user can request data deletion. This must match the actual behavior of the backend and any integrated SDKs (e.g., Posthog, Sentry).

### Export Compliance (US)
Apps using standard encryption (HTTPS/TLS) are generally exempt from filing, but crypto-specific libraries may require a self-classification report (ERN).

---
*Last Updated: 2026-04-24*
