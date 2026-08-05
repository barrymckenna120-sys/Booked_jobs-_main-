# BookedJobs — PWA Technical Audit (Read-Only)

No code was changed. Every finding below cites a file inspected in this session. Where evidence was not available in code, it is marked "Not confirmed from code inspection."

## Executive Summary

The app is a genuine, installable PWA with a correct manifest, valid icons, dual service workers (Workbox app shell + Firebase messaging), NetworkFirst HTML, safe-area handling and route-level code splitting. It works today on Android Chrome, installed Android PWA, iPhone Safari, installed iOS PWA and desktop.

Three structural issues hold it back: the update strategy is self-contradictory (`skipWaiting: true` with `registerType: "prompt"`), authenticated API responses are written to Cache Storage and never purged on logout, and `useAuth` is instantiated at 89 call sites, each opening its own session listener and redirect logic.

### Scores

| Area | Score |
| --- | --- |
| Production Readiness | 72/100 |
| PWA Health | 74/100 |
| Performance | 68/100 |
| Security | 70/100 |
| Mobile UX | 78/100 |
| Installability | 82/100 |
| Capacitor Readiness | 55/100 |

**Verdict: Production Ready with Minor Fixes** — with the caveat that findings 1 and 2 below should be treated as pre-requisites, not optional polish.

## Top Findings (highest priority first)

### 1. Cached authenticated API responses survive logout — Critical (security)
`vite.config.ts` lines 54-61 register a `NetworkFirst` runtime cache (`supabase-api`) for `https://ktkfuquqxbrmuqrmbmdj.supabase.co/rest`. Responses to authenticated REST calls (customers, jobs, finance) are stored in origin-scoped Cache Storage for up to 300s and are never deleted on sign-out (`src/hooks/useAuth.tsx` `signOut` only calls `supabase.auth.signOut()`). On a shared or handed-over device, or after "View as" org switching (`src/hooks/useAdminViewAs.tsx` clears only localStorage caches), previously fetched tenant data can be served from cache.
**Fix:** delete the `supabase-api` cache on sign-out and on org switch, or drop that runtime cache entirely (the app already has its own localStorage caches in `useEngineerJobs`, `Jobs.tsx`, `Customers.tsx`).

### 2. Update strategy is contradictory — users can land on a mixed build — High
`vite.config.ts` sets `registerType: "prompt"` but also `workbox.skipWaiting: true` and `clientsClaim: true`. The new worker activates and claims clients immediately, so the "Update available" banner in `src/components/pwa/PWAUpdateBanner.tsx` may never render, while the page continues running old JS against a new precache — the classic source of `ReferenceError` on a function that "no longer exists in source" (the `existingPhones` production error fits this signature exactly).
**Fix:** pick one model. Either `registerType: "autoUpdate"` with `skipWaiting: true`, or keep the prompt and set `skipWaiting: false`.

### 3. Hardcoded backend host in the SW cache rule — High
`vite.config.ts` line 54 hardcodes the project ref in the runtime-caching regex. Any backend rotation silently disables that rule; it also duplicates config that already lives in `VITE_SUPABASE_URL`.

### 4. `useAuth` is called at 89 sites — High (reliability + performance)
`rg -l "useAuth(" src` returns 89 files. `src/hooks/useAuth.tsx` calls `supabase.auth.getSession()` and `onAuthStateChange` per instance, each with its own `loading` state and redirect branch. Consequences: dozens of duplicate subscriptions per screen, repeated loading flashes on mount, and redirect races between siblings on session expiry. The module-level `linkAttempted` Set is a workaround for this fan-out, which confirms the problem.
**Fix:** one `AuthProvider` context at the router root; `useAuth` becomes a context read.

### 5. Inconsistent service-worker cleanup — Medium
`src/main.tsx` lines 32-34 unregister **every** registration in refused contexts, including the Firebase messaging worker; `src/components/pwa/PWAUpdateBanner.tsx` lines 74-78 correctly excludes `firebase-cloud-messaging-push-scope`. Preview/dev loses push registration unnecessarily and behaviour differs between the two code paths.

### 6. `100vh` without `dvh` fallback on key screens — Medium (iOS UX)
`src/index.css` lines 199-205 define `.h-screen-dvh` / `.min-h-screen-dvh`, but they are unused in `src/App.tsx` (131, 154 — inline `100dvh` with `100vh` min), `src/components/engineer/EngineerLayout.tsx:108` (`height: "100vh"`) and `src/pages/QuoteAcceptance.tsx:190`. On iOS Safari the toolbar makes `100vh` taller than the visible viewport, pushing engineer bottom nav off-screen.

### 7. Manifest missing rich-install and iOS launch fields — Medium (installability)
`public/manifest.json` has no `shortcuts` and no `screenshots` (Chrome then shows the minimal install sheet, not the rich one), and the `maskable` entry reuses the same square 512 artwork as `purpose: "any"` — Android will crop into the logo. `index.html` declares no `apple-touch-startup-image` splash screens, so installed iOS launches show a white flash, and `apple-mobile-web-app-status-bar-style` is `default` rather than `black-translucent`, so the app does not render under the Dynamic Island.

### 8. Expired social-preview image — Medium
`index.html` `og:image` / `twitter:image` point at a signed GCS URL with `Expires=1772066061` (Feb 2026 — already elapsed). Shared links render with no preview image.

### 9. Third-party script and blocking font CSS in `<head>` — Medium (performance)
`index.html` injects the reb2b tracker and a blocking Google Fonts stylesheet (three families, 16 weights) before the app bundle. Both delay first paint on 3G; the font request is a render-blocking round trip with no `preload`. Manual chunks already isolate `recharts`, `xlsx-js-style` and `firebase` (`vite.config.ts` 66-78), so the app code itself is reasonably split.

### 10. Precache volume vs mobile first visit — Medium
The published `sw.js` precaches ~125 entries (verified in a previous audit against `karlsgas.lovable.app`), taking ~24s to fill on first visit. `globPatterns` includes every `png`, so `icon-1024.png` and `landing-page.html` assets are pulled down whether needed or not.

### 11. Polling plus realtime on the same data — Medium (battery)
`refetchInterval: 30000` in `src/components/layout/AppLayout.tsx:89`, `src/pages/Parts.tsx:38`, `src/components/dashboard/LiveActivityFeed.tsx:45`, 60s in `RenewalsCard.tsx:143`, plus `setInterval` in `src/pages/Renewals.tsx:165` and `EngineerLayout.tsx:85`. Separately, 18 files subscribe to `postgres_changes`. Several screens therefore poll and hold a websocket for the same rows.

### 12. Error boundaries applied to one route only — Medium
In `src/App.tsx`, `ErrorBoundary` wraps `/dashboard` only; other lazy routes fall through to the root `Sentry.ErrorBoundary` in `src/main.tsx`, whose fallback is a bare `<p>An error has occurred</p>` with no recovery action. `src/components/shared/ErrorBoundary.tsx` also hard-navigates to `/dashboard`, which is wrong for engineer-role users.

### 13. `window.open` used in ~20 places — Medium now, High for Capacitor
`src/pages/engineer/EngineerJobDetail.tsx` 612-615, `EngineerCertificates.tsx` 90/97/248, `src/components/engineer/job-card/QuickActions.tsx` 28-31, `PaymentHistory.tsx`, `SendReminderModal.tsx`, `printReceipt.ts:111` and others. iOS standalone PWAs block non-gesture `window.open`; project memory already records this and prescribes `openExternalUrl`, so these are drift from the agreed pattern.

### 14. Hardcoded colours bypass the design system — Low
`src/components/pwa/InstallAppBanner.tsx` uses `bg-white` and inline `#4A86E8`; `src/App.tsx` loaders inline `#ffffff` / `#4A86E8`. Breaks theming and dark mode.

### 15. Auth token storage on iOS — Low/Medium
`src/integrations/supabase/client.ts` uses `localStorage` with `persistSession: true`. Correct for a SPA, but iOS evicts localStorage for sites unused for 7 days, so installed-PWA engineers can be silently logged out. Behavioural mitigation only (no code fix available in-browser).

### Not confirmed from code inspection
- Lighthouse numeric scores (no build/audit run in this read-only pass).
- CSP and security response headers (owned by hosting, not present in the repo).
- Accessibility contrast ratios and screen-reader traversal (requires an interactive audit run).
- Background sync: no `sync`/`periodicsync` handler exists — `src/hooks/useRetryQueue.ts` replays from `localStorage` on reconnect instead, which does not run while the app is closed.

## Journey Assessment

| Journey | State |
| --- | --- |
| First visit | Works; heavy head payload + 125-entry precache on mobile data |
| Returning visitor | Works from precache |
| Login / logout | Works; logout leaves the `supabase-api` cache populated (finding 1) |
| Session expiry | Redirect handled per-`useAuth`-instance; race risk (finding 4) |
| Refresh on nested route | Works — `navigateFallback: "/index.html"` plus allowlist in `vite.config.ts` |
| Offline | Marketing route redirects via `MarketingOfflineGate`; authenticated routes rely on their own states |
| Back online | `useNetworkStatus` probes with backoff and drains the retry queue — well implemented |
| Install PWA | Works; minimal install sheet only (finding 7) |
| Update PWA | Unreliable (finding 2) |
| Push notifications | Web push wired via `firebase-messaging-sw.js`; token stored per engineer in `useAuth` |
| Slow / no network | NetworkFirst with 15s HTML timeout, 5s API timeout — sane |

## Capacitor Readiness — Medium difficulty

No `@capacitor/*` dependency exists yet. Required work: `@capacitor/push-notifications` (Firebase web push does not function in an iOS WebView — APNs required), `@capacitor/browser` and `@capacitor/app` to replace the ~20 `window.open` calls, `@capacitor/camera` and `@capacitor/filesystem` for the Cloudinary media flow, `@capacitor/geolocation` if engineer location is added. `printReceipt.ts`'s `window.open('', '_blank')` print window will not work natively and needs `@capacitor/share` or a PDF viewer. Native permissions: notifications, camera, photo library, location.

## Recommended Sequencing

**Quick wins (under an hour each):** resolve the `skipWaiting`/`prompt` conflict; purge the `supabase-api` cache on sign-out and org switch; replace the hardcoded backend host with `VITE_SUPABASE_URL`; align `main.tsx` SW cleanup with the Firebase-scope exclusion; replace the expired `og:image`; swap `100vh` for the existing `dvh` utilities; add `shortcuts` and `screenshots` to the manifest.

**Medium:** centralise auth in one provider; add a padded maskable icon and iOS splash screens; wrap all lazy routes in a role-aware error boundary; deduplicate polling where realtime already covers the data; defer the reb2b script and preload fonts.

**Long-term:** replace remaining `window.open` calls with a single external-link helper (Capacitor prerequisite); trim precache scope; full interactive accessibility pass; decide native vs PWA before layering more browser-only APIs.
