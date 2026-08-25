# Drips issues — APK audit 2026-08

**Source:** `docs/AUDITORIA_APK_2026-08-24.md`
**Convention:** `docs/AUDIT_APK_WAVE6.md` §6.2 (issue matrix) + `docs/DRIPS_TEAM_GUIDE.md`
**Surface:** `micopay/frontend` — in-scope for the current Wave
**Verified:** 2026-08-24 against branch `fix/auditoria-apk-2026-08`
**Published:** 2026-08-25 as #355–#360, milestones Wave 8: UI Truth (P1) and Wave 8: Product & Release

> Issue bodies are in **English**, matching the convention of #151, #160, #329–#331 and #340–#351.
> The `APK-N ·` prefix avoids collisions with the existing `P0-N`, `P1-N`, `P2-N`, `B-N`, `V-N`,
> `T-N` and `SEC-NN` namespaces.

---

## Issue matrix

Following the format of `AUDIT_APK_WAVE6.md` §6.2. Labels span five axes: **surface**, **track**,
**complexity**, **`Stellar Wave`** eligibility, and **milestone**.

| ID | Short title | Surface | Track | Complexity | Type | `Stellar Wave` | Milestone |
|----|-------------|---------|-------|:----------:|------|:--------------:|-----------|
| [APK-1](https://github.com/Micopay/micopay-protocol/issues/355) | KYC approval lands on Home instead of CETES | `wave:frontend` | `wave:retail` | medium | `bug` | ✅ | #25 UI Truth |
| [APK-2](https://github.com/Micopay/micopay-protocol/issues/356) | Fix `Home.test.tsx` — incomplete hook mock | `wave:frontend` | `wave:docs` | low | `test` | ✅ | #27 Product & Release |
| [APK-3](https://github.com/Micopay/micopay-protocol/issues/357) | Fix `TradeDetail.test.tsx` — literals vs i18next | `wave:frontend` | `wave:docs` | medium | `test` | ✅ | #27 Product & Release |
| [APK-4](https://github.com/Micopay/micopay-protocol/issues/358) | Strip x86 ABIs and limit packaged locales | `wave:frontend` | `wave:docs` | low | `enhancement` | ✅ | #27 Product & Release |
| [APK-5](https://github.com/Micopay/micopay-protocol/issues/359) | Remove 7 dead buttons from chat screens | `wave:frontend` | `wave:retail` | medium | `bug`, `ux` | ✅ | #25 UI Truth |
| [APK-6](https://github.com/Micopay/micopay-protocol/issues/360) | Accessible names for icon-only buttons | `wave:frontend` | `wave:retail` | high | `accessibility` | ✅ | #25 UI Truth |

**Also apply `wave:good-first`** to APK-2 and APK-4 — both are single-file, low-risk onboarding tasks.

**Dependency:** APK-6 must merge **after** APK-5. Both touch `ChatRoom.tsx` and `DepositChat.tsx`.

### Not published as Drips issues

Per §6.2 "Tratamiento especial" and the Risk Controls in `DRIPS_TEAM_GUIDE.md` — internal maintainer
work is not handed to contributors:

| Finding | Why internal | Where it went |
|---|---|---|
| ISSUE-01 · Debug build signed with the public Android key | Needs the release keystore | `SEC-32`, fixed in T-05 |
| ISSUE-02 · Offline queue discards merchant changes | P0 data loss, critical path | Fixed in T-07…T-11 |
| ISSUE-03 · Secret key to system clipboard | Key handling + native plugin | `SEC-33`, fixed in T-12/T-13. **See note** |
| ISSUE-05 · `versionCode` frozen at 1 | Release/CI process | Fixed in T-04 |
| ISSUE-08 · Unnecessary permissions | Blocked the Play Store upload | Fixed in T-19 |
| ISSUE-06 · Deep links | Blocked on a domain decision, and needs the Play App Signing fingerprint | Plan phase 5 |

> ⚠️ **ISSUE-03 was already known.** `#348 [SEC-25]` documents the same defect with a better analysis
> than ours — tested on a Samsung Galaxy A12 (Android 12) and a Pixel 6 (Android 13), with the key
> confirmed in Gboard's clipboard, Samsung's clipboard history and `adb shell dumpsys clipboard`. It
> was **closed as NOT_PLANNED on 2026-08-18**, so the fix delivered in T-12/T-13 contradicts a
> deliberate decision. `#257` is the same issue in Spanish, closed as completed. Before publishing
> anything, decide whether to reopen `#348`, and reconcile `SEC-33` with `SEC-25`.

> 📝 **Draft P0-5 is still unpublished.** `AUDIT_APK_WAVE6.md` §10 holds a complete issue draft on
> onboarding and key backup, blocked by `#160` — which has been **closed as completed** for a while.
> Its acceptance criteria are already met by the current code, except one: *"cannot start a
> real-funds trade without confirming the backup"*. That criterion was broken by an unconditional
> `setBackupConfirmed()` call, fixed in T-13. **P0-5 can be closed out rather than published.**

---

# APK-1 · KYC approval lands on Home instead of CETES

**Labels:** `wave:frontend` · `wave:retail` · `complexity: medium` · `bug` · `Stellar Wave`
**Milestone:** Wave 8: UI Truth (P1)

## Problem statement

When identity verification is approved, `src/App.tsx:562` runs:

```ts
window.location.hash = '/#/cetes';
```

The app uses `HashRouter` (`src/App.tsx:1071`), so the route lives in the URL fragment. Assigning
`'/#/cetes'` to the fragment produces `https://localhost/#/#/cetes`, and the router reads the route
as `/#/cetes`. None of the 29 registered routes match, so it falls through to the catch-all:

```tsx
// src/App.tsx:1106
<Route path="*" element={<Navigate to="/" replace />} />
```

The user ends up on the Home screen instead of CETES — the exact feature that was just unlocked for
them.

The very next function in the same file does it correctly:

```ts
function Lj(){ const g = useNavigate(); return useEffect(() => { g("/cetes") }, …) }
```

The right pattern is already in the codebase, one function away.

## Why it matters

This happens at the product's highest-value conversion point. The user has already uploaded documents
and waited for approval. When it finally lands, the app drops them on Home with no signal that
anything changed — no success message, no new screen, nothing.

It is entirely reasonable for them to conclude that verification failed and never try again. We lose
the user at the end of the most expensive funnel we have.

## In-scope files

- `micopay/frontend/src/App.tsx` (~line 562)
- `micopay/frontend/src/services/api.ts` (401 interceptor, ~line 783) — see "Secondary scope"

## Secondary scope, optional

The 401 interceptor at `api.ts:783` does `window.location.href = '/#/login'`. **This currently
works**: only the fragment changes, so the browser does not reload the document and `HashRouter`
navigates to login correctly.

It is a fragile pattern — if the path ever stopped being `/`, it would trigger a full app reload —
but it is **not an observable defect today**. Fixing it is welcome and adds to the issue, but it is
not required to close it. If you take it on, note that the interceptor lives outside the React tree
and cannot use `useNavigate()`; you will need to expose the router instance from a module.

## Out-of-scope

- **Do not migrate to `BrowserRouter`.** `HashRouter` is correct for a Capacitor-packaged app served
  from `https://localhost/`.
- **Do not set up ESLint.** The project has none today; that is a separate issue.
- Do not redesign the KYC or CETES screens.
- Do not touch identity verification logic or the provider integration.

## Acceptance criteria

- [ ] On KYC approval the app navigates to `/cetes` and renders that screen.
- [ ] The resulting URL is `…#/cetes`, with no duplicated `#`.
- [ ] `grep -rn "window.location.hash" micopay/frontend/src/` returns 0 results.
- [ ] A test asserts the resulting route after KYC approval.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Pre-existing test failures stay at exactly 30 — not one more.

## Test notes

The fix itself is one line; the value of this issue is in the test that comes with it.

To test without a backend: render the component that receives `onApproved`, fire it, and assert the
resulting route using react-router's `MemoryRouter` or `renderHook`. There are examples of the
pattern in `src/__tests__/useOfflineQueue.test.ts`.

**Do not assert only that `navigate` was called.** That would pass with the bug present if the mock
is set up loosely. Assert the final route.

## Dependency notes

None. Can be picked up immediately.

---

# APK-2 · Fix `Home.test.tsx` — incomplete `useWalletBalance` mock

**Labels:** `wave:frontend` · `wave:docs` · `complexity: low` · `test` · `wave:good-first` · `Stellar Wave`
**Milestone:** Wave 8: Product & Release

## Problem statement

All 10 tests in `src/__tests__/Home.test.tsx` fail with:

```
TypeError: Cannot read properties of undefined (reading 'reduce')
 ❯ Home src/pages/Home.tsx:127:27
```

The cause is the mock, not the component. The file calls `vi.mock('../hooks/useWalletBalance')` and
returns an object that **omits the `tokens` field**. The real hook always provides it — initialised as
`[]` at `useWalletBalance.ts:36`.

`Home.tsx:127` calls `tokens.reduce(...)` and throws because the mock handed it `undefined`.

**This is not a production bug.** In the real app `tokens` is never `undefined`. It is a test that
went stale as the hook grew.

## Why it matters

With 30 tests permanently red, nobody reads the suite output. A new, genuine failure disappears into
the noise, and we cannot require tests to pass before merging.

These 10 are the easiest block to recover and the fastest way to get useful signal back on the app's
main screen.

## In-scope files

- `micopay/frontend/src/__tests__/Home.test.tsx`

## Out-of-scope

- **Do not modify `src/pages/Home.tsx`.** The component is fine; the defect is in the test. If you
  believe you have found a real bug in the component, say so in the issue instead of changing it.
- **Do not touch `src/hooks/useWalletBalance.ts`.**
- Do not touch `TradeDetail.test.tsx` — that is APK-3.
- Do not add new dependencies.

## Acceptance criteria

- [ ] `npx vitest run src/__tests__/Home.test.tsx` → 10 passed, 0 failed.
- [ ] A reusable helper (e.g. `makeWalletBalance(overrides)`) returns the **complete** object the hook
      returns, and every mock in the file uses it.
- [ ] No test uses `as any` or `@ts-ignore` to bypass the hook's type.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Total suite failures drop from 30 to 20.

## Test notes

The real hook signature is at `src/hooks/useWalletBalance.ts:113`:

```ts
return { balance, xlmBalance, stellarAddress, loading, error, refresh, tokens, usdMxnRate };
```

The helper should return all 8 fields with sensible defaults and accept partial overrides so each test
only changes what it cares about. That way, when the hook gains a field, it is added in one place
instead of ten.

The tests cover several states (unfunded account, Horizon loading, Horizon error, rate fetch failure).
Check which field each one simulates before touching them.

## Dependency notes

None. A good first issue for someone new to the repo.

---

# APK-3 · Fix `TradeDetail.test.tsx` — asserts literals i18next no longer renders

**Labels:** `wave:frontend` · `wave:docs` · `complexity: medium` · `test` · `Stellar Wave`
**Milestone:** Wave 8: Product & Release

## Problem statement

20 of the 21 tests in `src/__tests__/TradeDetail.test.tsx` fail with variants of:

```
TestingLibraryElementError: Unable to find an element with the text: Pendiente
TestingLibraryElementError: Unable to find an element with the text: Bloqueado
… (Revelando, Revelado, Completado, Cancelado, Expirado, "detalle de operación", "contactar soporte")
```

The tests assert literal Spanish strings. After the i18next migration those strings resolve through
`t()` and do not appear verbatim in the DOM during tests, because i18next is not initialised in the
test environment.

Like APK-2, **this is not a production bug** — the strings render correctly in the app. The suite is
what fell behind.

## Why it matters

This is the largest block of broken tests, and it covers the trade detail screen — where the user sees
the state of their money. That is precisely where regression coverage matters most, and today it
covers nothing.

Recovering these 20 tests is what makes a CI test gate possible, which in turn is what stops bugs like
the ones in this audit from landing unnoticed.

## In-scope files

- `micopay/frontend/src/__tests__/TradeDetail.test.tsx`
- `micopay/frontend/vitest.config.ts` and the setup file, if i18next needs initialising for tests
- Adding `data-testid` to state components, **only if** that approach is chosen (see Test notes)

## Out-of-scope

- **Do not change translation strings** in `src/i18n/`.
- **Do not change component logic.** If you find a real bug, report it separately instead of fixing it
  here.
- Do not touch `Home.test.tsx` — that is APK-2.
- Do not convert the tests to snapshots.

## Acceptance criteria

- [ ] `npx vitest run src/__tests__/TradeDetail.test.tsx` → 21 passed, 0 failed.
- [ ] The tests still assert **behaviour**, not just that the component renders. Every trade state
      keeps its own assertion.
- [ ] The chosen approach is documented in a comment at the top of the file, so the next person knows
      why.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Total suite failures drop to 0 if APK-2 is already merged, or to 10 if not.

## Test notes

There are two valid approaches. Pick one; do not mix them.

**Option A — initialise i18next in the vitest setup.** Tests keep asserting Spanish strings and also
end up verifying the translations exist. Closer to what the user sees, but couples tests to the locale
files: change a translation and the test breaks.

**Option B — assert via `data-testid`.** Decouples tests from copy. Requires touching components to add
the attributes, which widens the scope slightly.

**Recommendation: Option A**, because it does not require modifying components, and in a two-locale app
verifying that a translation exists has real value. If it turns out brittle in practice, Option B is
acceptable — explain why in the PR.

One test fails for a different reason:

```
AssertionError: expected "vi.fn()" to be called with arguments: [ 'unique-trade-456', 'mock-token' ]
```

That one is not i18next. Look at it separately; it may be the only failure pointing at something real.

## Dependency notes

Independent of APK-2, though both touch the suite. If taken in parallel there is no file conflict —
they are different files. Only coordinate if you touch the shared vitest setup.

---

# APK-4 · Strip x86 ABIs from release builds and limit packaged locales

**Labels:** `wave:frontend` · `wave:docs` · `complexity: low` · `enhancement` · `wave:good-first` · `Stellar Wave`
**Milestone:** Wave 8: Product & Release

## Problem statement

> **Scope note (2026-08-24).** The project now produces an AAB for Play Store (14.4 MiB upload), and
> Play splits the download per architecture automatically, so **users installing from the store are not
> affected**. This issue still matters for APKs handed to testers via direct link, which is how the app
> is distributed today, but its impact is smaller than the original audit suggested. Take it with that
> expectation.

The APK bundles native libraries for all four architectures. The x86 and x86_64 builds of
`libbarhopper_v3.so` — ML Kit's native QR engine — add up to **12.1 MB** and are only usable on
emulators and a handful of Chromebooks.

Measured on the current release APK:

```
release  25,031,671 B total — x86 + x86_64: 12,131,144 B  (48.5%)

lib/x86/libbarhopper_v3.so          6,122,368 B
lib/x86_64/libbarhopper_v3.so       5,909,280 B
lib/arm64-v8a/libbarhopper_v3.so    4,946,720 B
lib/armeabi-v7a/libbarhopper_v3.so  3,244,440 B
```

Because the APK uses `extractNativeLibs="false"`, those libraries ship uncompressed and count in full
toward the download size.

Secondary issue of the same kind: `resources.arsc` (390 KB) carries the app label translated into
roughly 80 locales inherited from AndroidX (`application-label-af`, `-am`, `-ar`, `-as`, `-az`…), while
the app only ships Spanish and English.

## Why it matters

Dropping x86 takes the release APK from 25.2 MB to roughly 13 MB — half the download, half the storage,
for anyone installing by direct link.

A good part of the pilot audience in Mexico downloads over mobile data rather than WiFi, on entry-level
phones where free storage is scarce. A 25 MB app is a decision someone weighs; a 13 MB app is a tap.
That difference is measurable install abandonment, and it is entirely avoidable.

## In-scope files

- `micopay/frontend/android/app/build.gradle`

## Out-of-scope

- **Do not apply the ABI filter to the `debug` build type.** It breaks the team's emulators — see Test
  notes.
- **Do not migrate to App Bundle (`.aab`) in this issue.** The project already produces one; changing
  the distribution process is a team decision, not this issue's.
- Do not touch `extractNativeLibs`, `minifyEnabled` or `shrinkResources` — all three are correct.
- Do not remove plugins or dependencies.
- Do not touch translation files in `src/i18n/`.

## Acceptance criteria

- [ ] `buildTypes.release` includes `ndk { abiFilters "armeabi-v7a", "arm64-v8a" }`.
- [ ] **`buildTypes.debug` does NOT carry the filter**, so x86_64 emulators keep working.
- [ ] `defaultConfig` includes `resConfigs "es", "en"`.
- [ ] `unzip -l` on the **release** APK lists no `lib/x86*`.
- [ ] `unzip -l` on the **debug** APK still lists `lib/x86_64`.
- [ ] The release APK is under 15 MB; put the exact figure in the PR.
- [ ] Both `./gradlew assembleDebug` and `./gradlew assembleRelease` build without errors.

## Test notes

**The filter goes in `release` only, never in `debug`.** This is deliberate and it is the delicate part
of the issue.

Android Studio emulators are x86_64 by default, because they run natively on an Intel/AMD host and that
is what makes them fast. If the debug APK has no `lib/x86_64`, Android sees that no architecture in the
package matches the device and **refuses to install** with `INSTALL_FAILED_NO_MATCHING_ABIS`. It is not
that the scanner breaks — the app will not install at all. Keeping the filter in `release` only means
users download half as much while the team keeps its emulators.

Verifying both variants:

```bash
cd micopay/frontend/android
./gradlew assembleRelease assembleDebug

unzip -l app/build/outputs/apk/release/app-release.apk | grep "lib/"   # no x86
unzip -l app/build/outputs/apk/debug/app-debug.apk     | grep "lib/"   # WITH x86_64
ls -l app/build/outputs/apk/release/app-release.apk                    # size
```

**You do not need two phones of different architectures.** It is enough to show that both variants
build, that the release one no longer carries `lib/x86*`, that the debug one still does, and how much
the release one weighs. QR scanner testing on real arm64 and armeabi-v7a devices is done by the
integrator at merge time; say so in the PR.

`assembleRelease` needs the signing keystore, which is not in the repo. If you do not have it, build
`assembleDebug` only and verify the release side with `./gradlew :app:assembleRelease --dry-run`, or ask
the integrator to confirm it.

Gradle needs JDK 17+. If `java -version` reports 8, use the JDK bundled with Android Studio:

```bash
JAVA_HOME="/path/to/Android Studio/jbr" ./gradlew assembleRelease
```

## Dependency notes

None. Single file, no overlap with the other issues.

---

# APK-5 · Remove the 7 dead buttons from the chat screens

**Labels:** `wave:frontend` · `wave:retail` · `complexity: medium` · `bug` · `ux` · `Stellar Wave`
**Milestone:** Wave 8: UI Truth (P1)

## Problem statement

The two chat screens render **7 buttons with no event handler at all**. They are drawn, they respond
visually to touch, and they do absolutely nothing.

| File | Line | Control | Has visible text |
|---|---|---|---|
| `ChatRoom.tsx` | 117 | `more_vert` (menu) | no |
| `ChatRoom.tsx` | 266 | `location_on` + "Compartir ubicación" | **yes** |
| `ChatRoom.tsx` | 290 | `add_circle` (attach) | no |
| `ChatRoom.tsx` | 303 | `mood` (emoji) | no |
| `DepositChat.tsx` | 104 | `more_vert` (menu) | no |
| `DepositChat.tsx` | 207 | `location_on` + "Compartir ubicación" | **yes** |
| `DepositChat.tsx` | 226 | `add_circle` (attach) | no |

The two "Compartir ubicación" buttons are the worst of the set: they carry a text label, take up half
the action row, and have their own translation key (`chatRoom.shareLocation`). They advertise a named
feature that does not exist.

Example, `ChatRoom.tsx:266`:

```tsx
<button className="flex items-center justify-center gap-3 w-full h-[46px] rounded-lg …">
    <span className="material-symbols-outlined …">location_on</span>
    <span className="font-body text-sm">{t('chatRoom.shareLocation')}</span>
</button>
```

No `onClick`. Compare with the button right next to it at `:270`, which has `onClick={onViewQR}`.

## Why it matters

Chat is the channel where a buyer and a merchant who have never met coordinate a cash exchange. It is
the highest-tension moment in the entire product.

There, the most natural action in the world is tapping `+` to send a photo of a receipt, or "Compartir
ubicación" to say where you are. The app silently ignores both — no message, no feedback, no
explanation.

The user does not conclude "that feature isn't ready yet". They conclude "this app is broken", right
when their money is on the line. That drives support tickets, abandoned trades, and distrust that
spreads to the rest of the product.

A visible button that does nothing is worse than no button.

## In-scope files

- `micopay/frontend/src/pages/ChatRoom.tsx`
- `micopay/frontend/src/pages/DepositChat.tsx`
- `micopay/frontend/src/i18n/` — only to remove keys left orphaned

## Out-of-scope

- **Do not implement the features.** Not image attachment, not location sharing, not the context menu,
  not an emoji picker. Each is a feature with a backend behind it and belongs in its own issue.
- **Do not touch the buttons that work:** send message, view QR, scan QR, back.
- **Do not redesign the chat layout.** Removing the buttons shifts the spacing; adjust only enough that
  nothing looks broken.
- Do not touch messaging logic or `useChatMessages.ts`.

## Acceptance criteria

- [ ] The 7 buttons in the table are gone from the DOM.
- [ ] Both screens look correct with no gaps or misplaced elements; attach before/after screenshots.
- [ ] The working buttons still work: send message, view QR, scan QR, back.
- [ ] Translation keys left unused (`chatRoom.shareLocation` and any others) are removed from both `es`
      and `en`.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Pre-existing test failures stay the same — not one more.

## Test notes

**Attach screenshots.** This is a visual change across two screens and it needs to be seen. Both
screens, before and after.

The "Compartir ubicación" action row in `DepositChat.tsx:206` is a `grid grid-cols-2`. Removing one of
the two buttons leaves the grid lopsided: switch to a single column, or let the remaining button span
the width. Decide and explain in the PR.

In `ChatRoom.tsx`, the emoji button is `absolute`-positioned inside the `textarea` container (`:303`),
and the `textarea` carries `pr-12` to make room for it. Removing it means adjusting that padding or the
text keeps a right margin for no reason.

Before deleting an i18n key, check it is not used elsewhere:

```bash
grep -rn "shareLocation" micopay/frontend/src/
```

## Dependency notes

No upstream dependency. **APK-6 depends on this one** and must merge after it: both touch
`ChatRoom.tsx` and `DepositChat.tsx`, and running them in parallel guarantees a conflict.

---

# APK-6 · Accessible names for icon-only buttons

**Labels:** `wave:frontend` · `wave:retail` · `complexity: high` · `accessibility` · `Stellar Wave`
**Milestone:** Wave 8: UI Truth (P1)

> **Why `high` and not `medium`:** roughly 150 buttons to label, i18n keys in two locales, and a
> TalkBack pass across four screens. That is beyond "a self-contained screen". `DRIPS_TEAM_GUIDE.md`
> asks for `high` to be used sparingly and only when the issue is still realistically mergeable
> inside the Wave — this one is, because the work is mechanical and the out-of-scope list below
> keeps it from turning into a redesign. Consider it for a contributor who already has repo context.

## Problem statement

The app has 183 `<button>` elements and only 33 carry an `aria-label`. At the same time there are 242
Material Symbols icons. Most buttons are an icon alone, with no text.

To a screen reader such as TalkBack, a button like that has no name — it is announced simply as
"button". The user has no way to tell whether it is "back", "copy", "close" or "cancel trade".

Typical example, `CETESScreen.tsx:287`:

```tsx
<button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full …">
  <span className="material-symbols-outlined">arrow_back</span>
</button>
```

A span containing the icon name. TalkBack may literally read out "arrow_back", which helps nobody.

Separately, from the same sweep: `src/pages/Explore.tsx:24` renders the profile avatar from a
placeholder URL on a Google CDN (`https://lh3.googleusercontent.com/aida-public/…`), left over from a
design tool. That is an uncontrolled external dependency inside production UI.

> **Note:** issue `#10 "Accessibility pass: aria-labels and keyboard nav on key interactive elements"`
> was closed as **completed**. The current counts (33 labels for 183 buttons) suggest it either covered
> only part of the surface or regressed since. Decide whether to reopen `#10` or file this as a new
> issue that references it.

## Why it matters

For people using a screen reader, MicoPay is currently unusable: there is no way to know what any
button does. For a financial service that is not only a product problem, it is a compliance risk —
accessibility of financial services is regulated in a growing number of jurisdictions.

It does not only affect daily screen-reader users, either. It affects anyone who turns TalkBack on
temporarily, anyone navigating with an external keyboard, and the automated accessibility checks Play
Store runs against uploaded builds.

The remote avatar is minor but real: if that URL stops serving, the explore screen looks broken, and we
are loading a third-party CDN image on every visit.

## In-scope files

- `micopay/frontend/src/pages/**` — icon-only buttons
- `micopay/frontend/src/components/**` — icon-only buttons
- `micopay/frontend/src/pages/Explore.tsx` — placeholder avatar
- `micopay/frontend/src/i18n/` — new keys for the accessible names

## Out-of-scope

- **Do not set up ESLint.** The project has none today. Adding it with `eslint-plugin-jsx-a11y` is
  worthwhile but is a separate issue — do not fold it in here.
- **Do not redesign components.** No changing icons, sizes, colours or layout.
- **Do not touch the theme system or Tailwind config.**
- **Do not add dependencies.**
- Do not touch `ChatRoom.tsx` or `DepositChat.tsx` until APK-5 has merged.
- Do not convert buttons to other elements or change their behaviour.

> This issue overflows easily. If you find yourself changing component structure, you have left the
> scope. These are attributes, not a redesign.

## Acceptance criteria

- [ ] Every `<button>` without visible text has a descriptive `aria-label` naming **the action**, not
      the icon. "Volver", not "arrow_back". "Copiar dirección", not "content_copy".
- [ ] Accessible names go through i18n, with keys in both `es` and `en`. No loose literals in JSX.
- [ ] The `Explore.tsx` avatar no longer points at `lh3.googleusercontent.com`: use a local asset or the
      user's initials over a colour background.
- [ ] `grep -rn "lh3.googleusercontent.com" micopay/frontend/src/` returns 0 results.
- [ ] A TalkBack pass over at least Map, Profile, Pay and History: every control is announced with a
      name that makes sense. Attach notes or a video.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] Zero visual changes. If a before/after screenshot differs, something left the scope.

## Test notes

To find candidates:

```bash
grep -rn -A3 '<button' micopay/frontend/src/pages micopay/frontend/src/components --include=*.tsx \
  | grep -B3 'material-symbols-outlined'
```

Filter out by hand the ones that **do** have visible text next to the icon: those need no `aria-label`,
and adding one makes the experience worse, because the reader would announce the label instead of the
text.

If you cannot test with TalkBack, say so in the PR and list which label you gave each button so the
integrator can review. **Do not claim you tested it if you did not.**

Turning TalkBack on: Settings → Accessibility → TalkBack. To exit, hold both volume buttons.

## Dependency notes

**Depends on APK-5** and must merge **after** it. Both touch `ChatRoom.tsx` and `DepositChat.tsx`;
APK-5 deletes buttons you would otherwise have labelled for nothing.

If you pick this up before APK-5 has merged, leave those two files for last and say so in the PR.

---

## Publishing

Every label used here already exists in the repo. Verify before publishing:

```bash
gh label list --limit 100 | grep -E "wave:|complexity:|Stellar Wave|accessibility|^test|^ux|^bug|^enhancement"
```

Milestones for Wave 8 (created 2026-08-25). Every issue also carries `wave-8-drips`:

```
#25  Wave 8: UI Truth (P1)             ← APK-1, APK-5, APK-6
#27  Wave 8: Product & Release         ← APK-2, APK-3, APK-4
```

Example creation command (one body file per issue):

```bash
gh issue create \
  --title "APK-1 · KYC approval lands on Home instead of CETES" \
  --milestone "Wave 8: UI Truth (P1)" \
  --label "wave:frontend" --label "wave:retail" \
  --label "complexity: medium" --label "bug" --label "Stellar Wave" \
  --body-file /path/to/apk-1-body.md
```

**Publish order:** APK-5 before APK-6 (file conflict). The rest in any order.

**Complexity drives the reward.** Drips computes points automatically from the `complexity` label
set on each issue, so the label is not cosmetic — it is the payout. Keep it honest in both
directions: `DRIPS_TEAM_GUIDE.md` warns against inflating a small task to chase points, and
under-labelling real work is just as unfair to whoever picks it up.

**Decide before publishing:**

1. Whether `Stellar Wave` applies — that label is what makes an issue reward-eligible.
2. What to do with `#348` / `SEC-25`, closed as NOT_PLANNED but fixed in T-12/T-13.
3. What to do with `#10`, closed as completed, versus APK-6.
4. Whether to close out draft P0-5 in `AUDIT_APK_WAVE6.md` §10, now that `#160` has merged and its
   criteria are met.
