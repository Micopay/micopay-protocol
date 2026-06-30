# SEC-24 — Trade state overridable via localStorage / query string

- **Issue:** #256
- **Component:** `micopay/frontend/src/components/TradeStateBadge.tsx` (lines 126-134)
- **Date:** 2026-06-29
- **Reviewer:** Security review (static / source-level analysis)
- **Estimated severity:** 🟡 **Medium** — the trade-status UI is fully spoofable from the client; no env guard restricts this to dev builds

---

## 1. Summary

The function `getTradeStateDebugOverride()` (`TradeStateBadge.tsx:126-134`) lets
any value from **localStorage** (`micopay_trade_state_override`) or a **URL
query parameter** (`?trade_state=`) override the authoritative trade state
before the badge is rendered. The override is applied with **higher priority**
than the backend/on-chain state, and **there is no `NODE_ENV`, `import.meta.env`,
or any other build-time guard**. It ships in every variant: development,
staging, testnet, and production.

```ts
// TradeStateBadge.tsx:126-134  —  no env check
export function getTradeStateDebugOverride(fallback: TradeState): TradeState {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const queryState = params.get('trade_state');
  if (queryState && isTradeState(queryState)) return queryState;
  const localStorageState = window.localStorage.getItem('micopay_trade_state_override');
  if (localStorageState && isTradeState(localStorageState)) return localStorageState;
  return fallback;
}
```

---

## 2. Resultado — Findings against the issue checklist

### Q1 — Does the override change the trade-status UI without touching the real state?

**Yes.** The override replaces the `fallback` (which comes from the backend or
on-chain status) before it reaches the `TradeStateBadge` component. The badge,
its label, colour, icon, and safety copy are all driven by this state value.
The real backend state is never checked again after the override.

**Call sites that apply the override in production code:**

| File | Line | Usage |
|------|------|-------|
| `CashoutRequest.tsx` | 11 | `getTradeStateDebugOverride('pending_cash')` — hardcoded fallback, override wins unconditionally |
| `DepositRequest.tsx` | 11 | `getTradeStateDebugOverride('pending_cash')` — same pattern |
| `QRReveal.tsx` | 60 | `getTradeStateDebugOverride(backendState)` — overrides the actual backend-normalised state |

In `QRReveal.tsx:60`, the backend-supplied state (`activeTrade?.status`,
normalised via `normalizeTradeState`) is passed as the fallback. The override
**silently replaces** it, so the user sees a spoofed badge while the real
on-chain state remains different.

### Q2 — Is the override active in release or only in dev?

**Active in release.** Evidence:

1. **No env guard in the function.** There is no `import.meta.env`, no
   `process.env.NODE_ENV`, no `__DEV__` check anywhere in `TradeStateBadge.tsx`.
2. **No build-time dead-code elimination.** `vite.config.ts` contains no
   `define` entries or `esbuild` configuration that would strip the function in
   production builds.
3. **Contrast with `IS_DEMO_MODE`.** The project already uses
   `import.meta.env.VITE_DEMO_MODE === 'true'` in `demoMode.ts:1` to gate demo
   behaviour — the same pattern is conspicuously absent from the trade-state
   override.
4. The function name itself (`getTradeState*Debug*Override`) indicates it was
   intended for debugging, but no mechanism prevents it from executing in
   release.

### Q3 — What user decisions could a falsified state induce?

The `TradeStateBadge` is the **primary trust signal** the user sees during a
trade. Each state carries specific "safety copy" that guides the user's next
action:

| Spoofed state | Badge text shown | Risk |
|---------------|-----------------|------|
| `completed` | "Operación completada · Tus fondos ya se movieron al destino final" | User believes the trade settled → **delivers cash to counterparty** when funds are still locked / pending |
| `locked` | "Fondos en garantía" | User believes funds are safe when they may already have been released → **false confidence** |
| `refunded` | "Fondos reembolsados · Tus fondos ya están de vuelta" | User stops monitoring a live trade, believing refund is done → **misses timeout / dispute window** |
| `cancelled` | "Operación cancelada" | Merchant may refuse cash delivery believing the trade was cancelled → **denial of service on a legitimate trade** |

The critical scenario: an attacker sets `completed` on the **buyer's device**
to convince the buyer that funds have been released, inducing the buyer to hand
over cash when the on-chain state is still `pending_cash` or `locked`.

### Q4 — Additional vector: query string override

The function also reads `?trade_state=` from the URL (line 128-129), which is
an even **lower-friction** attack surface:

- A malicious deep link (`micopay://...?trade_state=completed`) could be sent
  via chat, push notification, or QR code.
- On Capacitor (Android), App Links / deep links are handled, meaning a
  crafted link could open the app directly to a trade page with the spoofed
  state.
- The query parameter takes **priority over localStorage** (checked first).

---

## 3. Evidencia — Evidence

### 3.1 Source code (static analysis)

- **Vulnerable function:** [`TradeStateBadge.tsx:126-134`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/src/components/TradeStateBadge.tsx#L126-L134)
- **Caller — CashoutRequest:** [`CashoutRequest.tsx:11`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/src/pages/CashoutRequest.tsx#L11)
- **Caller — DepositRequest:** [`DepositRequest.tsx:11`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/src/pages/DepositRequest.tsx#L11)
- **Caller — QRReveal (most critical):** [`QRReveal.tsx:60`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/src/pages/QRReveal.tsx#L60)
- **Vite config (no stripping):** [`vite.config.ts`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/vite.config.ts) — no `define` or `esbuild.drop`
- **Contrast — env-gated demo mode:** [`demoMode.ts:1`](file:///c:/Users/cisat/.antigravity-ide/micopay-protocol-1/micopay/frontend/src/utils/demoMode.ts#L1) — uses `import.meta.env.VITE_DEMO_MODE`

### 3.2 Reproduction steps

**Via localStorage (WebView / DevTools / chrome://inspect):**

```js
// 1. In the WebView console (or via XSS payload):
localStorage.setItem('micopay_trade_state_override', 'completed');

// 2. Reload the trade page (CashoutRequest, DepositRequest, or QRReveal).

// 3. Observe: the badge now shows "Operación completada" with green icon
//    and the text "Tus fondos ya se movieron al destino final",
//    regardless of the actual backend/on-chain state.

// 4. The override persists across reloads until explicitly removed:
localStorage.removeItem('micopay_trade_state_override');
```

**Via query string (deep link / social engineering):**

```
https://<app-domain>/trade?trade_state=completed
```

or on native via intent:

```
micopay://trade?trade_state=completed
```

### 3.3 Attack vectors

| Vector | Effort | Prerequisite |
|--------|--------|-------------|
| XSS in the SPA | Low | Any reflected or stored XSS (single `localStorage.setItem` call) |
| Browser extension (web/PWA build) | Low | User installs a malicious extension with host permissions |
| Physical access (dev device with `chrome://inspect`) | Medium | Brief physical access to an unlocked device with USB debugging |
| Crafted deep link (query string) | Very low | Send a link via chat/SMS — no device access needed |
| Malicious QR code (query string) | Very low | Present a QR code encoding the spoofed URL |

---

## 4. Reproducible en testnet

**Sí.** The function does not check environment, network, or build variant.
The override works identically on testnet, staging, and production builds. The
Vite configuration applies no environment-specific transformations.

---

## 5. Sugerencia de fix

> ⚠️ **Report only — no code changes.**

### Option A — Remove entirely (recommended)

Delete `getTradeStateDebugOverride()` and its call sites. Replace all usages
with the direct backend/on-chain state (the `fallback` value that is already
computed):

- `CashoutRequest.tsx:11` → use the backend state directly
- `DepositRequest.tsx:11` → use the backend state directly
- `QRReveal.tsx:60` → use `backendState` directly (already computed on line 59)

If the function was used for manual QA testing of badge states, move that
capability into the existing `DebugOverlay` component behind the
`import.meta.env.DEV` guard (which Vite tree-shakes from production builds).

### Option B — Gate behind dev-only env check

If the override is still needed for development:

```ts
export function getTradeStateDebugOverride(fallback: TradeState): TradeState {
  if (!import.meta.env.DEV) return fallback;          // ← stripped in prod by Vite
  if (typeof window === 'undefined') return fallback;
  // ... existing override logic ...
}
```

`import.meta.env.DEV` is statically replaced by Vite at build time (`true` in
dev, `false` in production), and the dead branch is eliminated by esbuild's
minifier, so the override code never reaches the production bundle.

### Option C — Additional hardening (for either option)

- Remove the **query string vector** (`?trade_state=`) entirely — it is
  exploitable via deep links with zero device access.
- Audit for other `localStorage`/query-string overrides in the codebase that
  may follow a similar debug-in-production anti-pattern.
- Consider adding a CSP `navigate-to` directive or App Link validation to
  prevent arbitrary query parameters from being injected via external links.

---

## 6. Severity assessment

| Factor | Value |
|--------|-------|
| Confidentiality impact | None (no data leak) |
| Integrity impact | **Medium** — UI trust signal is fully spoofable |
| Availability impact | Low (can induce denial-of-service by showing `cancelled`) |
| Attack complexity | **Low** (single JS call or crafted URL) |
| Privileges required | None for query string; XSS or brief physical access for localStorage |
| User interaction | Required (user must act on the false UI) |
| Scope | UI-only; on-chain / backend state is unaffected |

**Final severity: 🟡 Medium.** The override manipulates only the UI badge, not
the on-chain or backend state. However, the badge is the primary trust signal
that guides real-world cash-handoff decisions, and the query-string vector
requires zero device access. Exploitation relies on social engineering the user
to act on the spoofed UI.
