# MicoPay App Store Reviewer Guide

This guide is for Apple and Google app store reviewers. It walks you through every screen in the MicoPay app using a pre-configured demo account — no real wallet, no real money, no setup required.

---

## Demo Credentials

Use these credentials to log in. They are pre-filled on the login screen when demo mode is active.

| Field           | Value                                                         |
| --------------- | ------------------------------------------------------------- |
| Username        | `demo_reviewer`                                               |
| Password        | `MicoPay-Review-2025`                                         |
| Stellar Address | `GDEMOREVIEWER1111111111111111111111111111111111111111111111` |

> These credentials are for app store review only. They do not grant access to any real funds or real user data.

---

## Build Configuration

### Review Build (for app store submission)

Set the following environment variable on the API server before starting:

```
DEMO_MODE=true
```

This activates the demo account, pre-seeds all trade data, and enables the demo login endpoint.

To confirm demo mode is active, look for the amber banner at the top of every screen:

> 🎭 Demo Mode — App Store Review Session

If the banner is not visible, demo mode is not active. Check that `DEMO_MODE=true` is set and restart the API.

### Production Build

`DEMO_MODE` must be `false` or absent entirely. **Never set `DEMO_MODE=true` in a production environment.** The API enforces this: if `NODE_ENV=production` and `DEMO_MODE=true` are both set, the API ignores the flag and logs a warning.

---

## Step-by-Step Reviewer Flow

Follow these steps in order. Each step tells you what to do and what you should see.

---

### Step 1 — Open the App

**Action:** Launch the app.

**Expected:** An amber banner appears at the very top of the screen:

> 🎭 Demo Mode — App Store Review Session

This confirms demo mode is active and the review session is ready.

---

### Step 2 — View the Login Screen

**Action:** Navigate to the login screen (the app opens here by default if you are not logged in).

**Expected:**

- The email/username and password fields are already filled in with the demo credentials.
- A label below the fields reads: **"Demo credentials — for App Store review only"**
- You do not need to type anything.

---

### Step 3 — Log In with the Demo Account

**Action:** Tap the **"🎭 Entrar con Demo Account"** button.

**Expected:**

- Authentication succeeds immediately.
- You are redirected to the main app (home/dashboard screen).
- The amber demo banner remains visible at the top.

---

### Step 4 — View the Trades / History Screen

**Action:** Navigate to the trades or history tab/screen.

**Expected:** You see at least four trades, one in each of the following states:

| State           | What it means                         |
| --------------- | ------------------------------------- |
| Pending         | Trade created, awaiting lock          |
| Funded / Locked | Funds have been locked in escrow      |
| Completed       | Trade finished successfully           |
| Cancelled       | Trade was cancelled before completion |

All trades are pre-seeded demo data associated with the demo account.

---

### Step 5 — Inspect Each Trade Detail Screen

**Action:** Tap on each trade in the list to open its detail screen.

**Expected for each trade:**

- The detail screen loads without errors.
- The trade state (pending, funded/locked, completed, cancelled) is clearly displayed.
- Trade fields (amount, timestamps, counterparty address) are populated with realistic values.
- No blank screens, no error messages, no loading spinners that never resolve.

Repeat for all four trades.

---

### Step 6 — Navigate Through the Remaining Tabs

**Action:** Tap through each of the remaining tabs or sections: **Bazaar**, **Reputation**, **Fund**, **Services**.

**Expected for each tab:**

- The screen loads without errors.
- Content is displayed (listings, reputation data, funding options, or service entries as appropriate).
- The amber demo banner remains visible at the top throughout.

---

## Expected Outcomes Summary

| Step | Action                | What confirms it worked                                                 |
| ---- | --------------------- | ----------------------------------------------------------------------- |
| 1    | Open app              | Amber "🎭 Demo Mode" banner visible at top                              |
| 2    | View login screen     | Credentials pre-filled, review label visible                            |
| 3    | Tap demo login button | Authenticated, redirected to main app                                   |
| 4    | Open trades / history | At least one trade in each state: pending, funded, completed, cancelled |
| 5    | Tap each trade        | Detail screen loads, state and fields render correctly                  |
| 6    | Navigate all tabs     | Each tab loads without errors, banner stays visible                     |

---

## Troubleshooting

**The amber banner is not visible.**
Demo mode is not active. Verify that `DEMO_MODE=true` is set in the API environment and restart the API server.

**The login button is not pre-filled or the demo button is missing.**
The frontend cannot reach the API, or the API is not running in demo mode. Check that the API is running and that `DEMO_MODE=true` is set.

**Tapping the demo login button shows an error.**
The demo seed may not have run. Restart the API with `DEMO_MODE=true` — the seed runs automatically on startup.

**A trade detail screen shows an error or blank content.**
Try navigating back and tapping the trade again. If the issue persists, restart the API with `DEMO_MODE=true` to re-seed the demo trades.

**A tab fails to load.**
Check that the API is running and reachable. The demo banner should still be visible even if a tab fails — if the banner is also gone, the API connection has been lost.

---

## Notes for the Review Team

- All demo data is reset to a clean state every time the API restarts with `DEMO_MODE=true`.
- No real Stellar transactions are performed during the review flow.
- The demo account and its trades are isolated from any real user data.
- If credentials or seed data change in a future release, this guide will be updated in the same pull request.
