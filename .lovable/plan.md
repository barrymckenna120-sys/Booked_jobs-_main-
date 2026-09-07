# Mobile / iOS Safari readiness — investigation report

Investigation only. No code was changed. Findings below, each with file/line evidence, then a proposed fix plan.

---

## 1. Barry's complaint ("loading state, 5G, 2 bars, iPhone 14") — NOT resolved by today's fixes

Today's fixes wrap **data** reads in `withRequestTimeout` (`src/pages/JobDetail.tsx:456`, `src/pages/ServiceReceipt.tsx:90`, `src/pages/Jobs.tsx:103`, `src/hooks/useUserRole.ts:43`). Three paths that can hang forever are still unwrapped, and all three are more likely to bite on iOS Safari on a weak radio than on desktop Chrome.

**A. Session restore has no timeout and no error path — the most likely cause of Barry's screen. FAIL**
- `src/hooks/useAuth.tsx:126` — `supabase.auth.getSession().then(...)` with no `.catch()`, no timeout. `setLoading(false)` and `initialCheckDone` live only in the success branch.
- When a stored token is expired, this call performs a network refresh. On a stalled connection iOS Safari does not error quickly — it holds the socket. `loading` then stays `true` **indefinitely**.
- Everything gates on it: `src/App.tsx` `RootRoute` → `RouteFallback` (full-screen brand spinner), `src/components/layout/AppLayout.tsx:144` (`authLoading || roleLoading`), `src/components/engineer/EngineerLayout.tsx:98` (`if (authLoading)` spinner).
- Symptom is exactly "screen stuck loading, spinner forever, no error, pull-to-refresh doesn't help".

**B. Engineer data fetch has no per-request timeout. FAIL**
- `src/hooks/useEngineerJobs.ts:127-248` — every `await supabase...` is bare (no `withRequestTimeout`). `setLoading(false)` is in `finally` (line 251), which is correct, but `finally` is only reached once the awaits settle; a hung request never settles.
- Mitigating: a localStorage cache is painted first (`src/hooks/useEngineerJobs.ts:115-125`), so a *returning* engineer sees stale data rather than a spinner. A first login on that device, or a cleared cache, gets the spinner.
- The catch path retries unconditionally every 5s with no cap and no backoff (`src/hooks/useEngineerJobs.ts:249`) — on weak signal that is a permanent retry loop.

**C. iOS Safari's hung/cancelled fetches are deliberately silenced. FAIL (contributing)**
- `src/lib/globalErrorHandlers.ts:17` ignores `"load failed"` — iOS Safari's generic wording when it cancels a fetch (including on backgrounding). Reasonable for Sentry noise, but it means a stalled iOS request produces no Sentry event and no user-visible error, so there is nothing to see except the spinner. This is why the issue never showed up in desktop Chrome testing.

**iOS-specific behaviours confirmed relevant:** aggressive tab/process suspension (in-flight fetches are cancelled, timers frozen, promises never settle after resume), no error thrown for a stalled request, `AbortController` itself works correctly (used at `src/hooks/useNetworkStatus.ts:12` and `src/components/engineer/EngineerLayout.tsx:56`) — the gap is that auth and engineer fetches don't use one.

## 2. Safe-area / notch handling — PASS, with small leftovers

Addressed, not accidental:
- `index.html:7` — `viewport-fit=cover`.
- `src/index.css:187-206` — safe-area utilities plus `h-screen-dvh` / `min-h-screen-dvh` (`100vh` then `100dvh` fallback pair).
- `env(safe-area-inset-*)` applied on office header and bottom nav (`src/components/layout/AppLayout.tsx:255,324`), engineer nav and content (`src/components/engineer/EngineerLayout.tsx:190,202`), sheets (`src/components/ui/sheet.tsx:36-63`), update banner (`src/components/pwa/PWAUpdateBanner.tsx:42`), install banner, sound banner, Dashboard and CustomerDetail sticky bars.

Remaining raw `100vh` (no `dvh`, no inset) — cosmetic, worth testing:
- `src/components/engineer/EngineerLayout.tsx:104` — the auth spinner screen itself.
- `src/App.tsx:193-194` — `height: 100dvh` then `minHeight: 100vh`; the `minHeight` can exceed the visible viewport on iOS.
- `src/pages/QuoteAcceptance.tsx:191`, `src/components/messages/DirectMessageThread.tsx:135`, `src/components/engineer/ExtraWorkSheet.tsx:204`, `public/offline.html:16`.

## 3. Installed-PWA differences — PASS (little divergence, therefore little risk)

- `public/manifest.json:8` — `"display": "standalone"`, `orientation: portrait`, `scope: "/"`, `start_url: "/"`.
- Only two display-mode reads exist, both non-functional: `src/components/pwa/InstallAppBanner.tsx:44` (hide the install prompt when already installed) and `src/lib/sentryContext.ts:82` (diagnostics tag).
- No `navigator.standalone` anywhere in `src/`. No behaviour branches on installed vs tab.
- Note: standalone mode has no browser reload button, so a stuck spinner (finding 1) is *worse* in the installed app — the engineer has no way out except force-quitting.

## 4. Background / resume — PARTIAL

- `pageshow` bfcache restore is handled: `src/hooks/useAuth.tsx:153-163` re-validates the session and signs out if it is gone.
- `visibilitychange` handled in `src/hooks/useEngineerJobs.ts:822`, `src/hooks/useNotifications.ts:368` (throttled), `src/pages/Parts.tsx:138`, `src/pages/engineer/EngineerParts.tsx:167`, `src/components/layout/AppLayout.tsx:112` (audio unlock).
- **The auth-churn fix does cover mobile.** `nextUserState` (`src/hooks/useAuth.tsx:232`) keys on user identity, not on the trigger, so a lock/unlock cycle that emits `TOKEN_REFRESHED` is suppressed the same as a desktop tab switch.
- Gaps: no `freeze`/`resume` handling; `src/hooks/useEngineerJobs.ts:822` has **no throttle**, so each unlock fires a full multi-query `fetchAll()` — combined with finding 1B, repeated lock/unlock on weak signal stacks hanging requests.

## 5. Service worker on iOS Safari — PARTIAL / not addressed

Config is sound: `vite.config.ts:17-24` (`registerType: "prompt"`, `injectRegister: null`, `devOptions.enabled:false`), explicit `skipWaiting:false` / `clientsClaim:false` (`vite.config.ts:32-33`), banner-driven activation (`src/components/pwa/PWAUpdateBanner.tsx:32`), `CacheFirst` on `/assets/` so a stale tab still resolves old chunks (`vite.config.ts:126-144`), registration correctly guarded (`src/lib/isPreviewHost.ts:28`).

iOS-specific gaps:
- No periodic `registration.update()` and no update check on `visibilitychange`. `useRegisterSW` is called without `onRegisteredSW`/interval (`src/components/pwa/PWAUpdateBanner.tsx:22-27`), so an installed iOS PWA that is only ever backgrounded (never force-quit) may not check for a new version for a long time — the update banner effectively never appears for that engineer.
- iOS evicts service workers and caches after roughly 7 days of non-use, so an infrequent user always gets a cold, uncached start.

## 6. Network detection — the robust detector exists but the office app never uses it. FAIL

- `src/hooks/useNetworkStatus.ts` is genuinely robust: an active HEAD probe (line 16), two-consecutive-failure rule before declaring offline (line 94), backoff while offline, re-probe on visibility.
- But it has only two consumers: `src/hooks/useEngineerJobs.ts:57` and `src/components/landing/MarketingOfflineGate.tsx:11` (signed-out marketing home only).
- **The whole office app — Dashboard, Jobs, JobDetail, Schedule, Finance, Customers — has no connectivity awareness at all.** No offline banner, no "connection looks weak" state.
- Raw `navigator.onLine` still used at `src/pages/Auth.tsx:387`; `src/components/engineer/EngineerLayout.tsx:52-88` duplicates the probe with its own 30s interval instead of reusing the hook.
- `navigator.onLine` reports `true` on 2-bar 5G with a non-functional connection, so nothing tells the user the app is stalled rather than slow. This directly compounds Barry's report.

---

## Verdict

| # | Area | Status |
|---|---|---|
| 1 | Barry's stuck loader | **FAIL** — root cause is unwrapped session restore; today's fixes don't cover it |
| 2 | Safe areas / notch | PASS, minor `100vh` leftovers |
| 3 | Installed PWA mode | PASS |
| 4 | Background / resume | PARTIAL — auth fix covers mobile; unthrottled visibility refetch |
| 5 | SW on iOS | PARTIAL — no update check on resume |
| 6 | Network detection | **FAIL** — good detector, office app doesn't use it |

Testing is worth doing now for items 2, 3, 4. Items 1 and 6 should be fixed **before** the device pass, otherwise the test will just keep reproducing the same stuck spinner.

---

## Approved scope — Steps 1 and 3 only

Shipped as two independent, separately revertible changes.

**Step 1 — Bound session restore.** `src/hooks/useAuth.tsx` only: wrap the initial `getSession()` (line 126) in the existing `withRequestTimeout` helper and add a `.catch()`. On timeout or error it resolves to "no session", sets `loading` false and marks `initialCheckDone`, so the app always leaves the spinner — falling through to the normal signed-out path rather than hanging. The `onAuthStateChange` subscription still corrects the state if the session arrives late. Add a unit test for the timeout branch.

**Step 3 — Connectivity awareness for the office app.** Mount a shared offline/weak-connection banner in `src/components/layout/AppLayout.tsx` driven by the existing `useNetworkStatus` hook, and repoint `src/components/engineer/EngineerLayout.tsx` at the same hook instead of its duplicate 30s probe (`EngineerLayout.tsx:52-88`). Presentation and wiring only — no changes to `useNetworkStatus` itself, no query behaviour changes, engineer offline banner copy unchanged.

Verification: `tsgo --noEmit`, full Vitest suite, and an authenticated Playwright pass on `/dashboard` and `/jobs` at desktop and iPhone 14 widths confirming (a) normal load unaffected, (b) with the network blocked the banner appears and no screen hangs on a spinner.

**Held for later:** Step 2 (bound engineer fetches), Step 4 (resume hardening + iOS update check), Step 5 (cosmetic `100vh` cleanup).

Out of scope: offline write queueing, backend, RLS, payments, duplicate detection, and any change to `withRequestTimeout`'s 15s default.

