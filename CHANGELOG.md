# Changelog

All notable changes to MicoPay are documented here going forward, per
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This file starts
from the pre-mainnet audit (2026-07-01) — see `git log` for the full history
before that point.

## [Unreleased]

### Security
- `POST /users/register` now requires a signed challenge (same SEP-10-style
  flow already used by login), closing an address-squatting gap where anyone
  could register another user's public Stellar address before they did.
- `PATCH /users/me/availability`, and auth applied to all fund-moving
  `/defi/*` routes (`cetes/buy`, `cetes/sell`, `blend/supply`,
  `blend/borrow`), which were previously callable without a token.
- `/defi/ramp/order/:orderId` and its `regenerate_tx` sibling now verify the
  caller created the order (new `ramp_orders` ownership table) instead of
  allowing any authenticated user to poll any order.
- Production boot now refuses to start with a weak/default `JWT_SECRET`,
  `MOCK_STELLAR=true`, or a malformed `SECRET_ENCRYPTION_KEY`.

### Fixed
- Cancelling a `locked`/`revealing` trade now has a real path to recover the
  on-chain funds: either participant can trigger a refund once the
  contract's timeout passes, and a background sweep does it automatically
  every 5 minutes without requiring any user action.
- SPEI (CETES onramp/offramp) quote/order flow, broken by a frontend/backend
  payload mismatch, now works end-to-end.
- KYC start/status calls, previously sent without an auth token and always
  rejected, now authenticate correctly.
- The deposit flow's QR code was a hardcoded stock image — it now encodes
  the real trade for the agent to scan.
- The 401 session-expiry handler was clearing the wrong local storage key,
  leaving orphaned sessions behind.
- `GET /trades/history` no longer loads every user in the database to
  resolve counterparty usernames — replaced with a SQL join and
  server-side pagination.

### Added
- `GET /rate/usdc-mxn`, mirroring the existing `/rate/xlm-mxn` multi-source
  live rate endpoint, so screens showing USDC-MXN conversions stop using a
  hardcoded `17.5`.
- `POST /client-errors` is now actually registered (the route existed but
  was never wired up, so client crash reports were silently dropped).

### Removed
- CETES buy/sell and Blend supply/borrow are hidden behind
  `VITE_ENABLE_DEFI_TRADING` until they're implemented against the user's
  own wallet instead of the platform account.
- Dead code: an `updateMerchantReputation` function that wrote to a
  `merchants` table that doesn't exist in this schema (silently caught and
  logged on every completed trade).

See `docs/AUDIT_MOBILE_MAINNET.md` for the full pre-mainnet audit, findings,
and remaining open items.
