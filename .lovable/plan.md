# BookedJobs — PWA Technical Audit (read-only)

No code was changed. Every finding below is tied to a file and line I read. Where the code could not prove something, it says "Not confirmed from code inspection."

## Executive summary

The app is a mature, well-structured Vite + React 18 + Supabase PWA with a genuinely careful service-worker guard layer (`src/lib/isPreviewHost.ts`) and correct SPA navigation fallback. It is close to production ready. Two findings are serious: authenticated Supabase REST responses are runtime-cached by URL only, and users can stay on an old build indefinitely because updates require a manual tap. Mobile UX, safe areas and realtime cleanup are in good shape.

| Score | /100 |
| --- | --- |
| Production readiness | 74 |
| PWA health | 68 |
| Performance | 70 |
| Security | 66 |
| Mobile UX | 82 |
| Installability | 72 |
| Capacitor readiness | 78 |

**Verdict: Production Ready with Minor Fixes** — conditional on the two Critical items below.

## Top findings (highest priority first)

**1. Critical — Authenticated API responses cached by URL only.** `vite.config.ts:54-61`: `NetworkFirst` on `https://ktkfuquqxbrmuqrmbmdj.supabase.co/rest` with `maxAgeSeconds: 300`. Workbox keys the cache on URL; the bearer token and the org header added by `installOrgHeaderInterceptor` (`src/main.tsx:7,10`) are not part of the key. On a slow network (5s timeout) a user, or another org after a "View as" switch, can be served a cached response fetched under different credentials. Multi-tenant data-leak class. Fix: remove this runtime-caching entry entirely (React Query + realtime already cover freshness), or restrict it to non-tenant reference endpoints with a `cacheKeyWillBeUsed` that appends the user/org id.

**2. Critical — Users can get stuck on an old build.** `vite.config.ts:18` `registerType: "prompt"`; the only path to activation is the banner tap in `src/components/pwa/PWAUpdateBanner.tsx:29-31`, and `handleDismiss` (lines 33-36) hides it with no persistence and no re-prompt. `PWAUpdateBanner` returns `null` in any refused context (line 81), so if it fails to mount there is no other registrar. A long-lived iOS home-screen tab can run a stale shell for weeks. Fix: keep the prompt UX but add a fallback — re-check `registration.update()` on `visibilitychange`, and auto-apply after a grace period or when no unsaved form is open.

**3. High — Only one route has an error boundary.** `src/App.tsx:178` wraps `Dashboard` only. `Jobs`, `Customers`, `JobDetail`, `Settings`, the engineer routes and `EngineerLayout` have none, so a render throw is a white screen (Sentry catches it at `src/main.tsx:19` but the user sees `An error has occurred` at best, nothing at worst). Fix: wrap the `AppLayout` and `EngineerLayout` outlets.

**4. High — Admin, finance and debug routes are auth-only, not role-gated.** `OfficeRoute` is applied to `/warranty`, `/insights`, `/settings` (`src/App.tsx:188-192`) but not to `/admin`, `/admin/tenants/:orgId`, `/finance`, `/system-logs`, `/message-log`, `/debug/incoming-jobs`, `/pipeline`, `/parts`, `/products`. Any signed-in engineer can open the admin panel UI. Server RLS still protects the rows, so this is UI exposure plus a confusing failure mode, not a direct read of other tenants' data. Fix: role-gate those routes.

**5. High — `useAuth` is a hook, not a context: ~91 call sites each open their own session listener.** `src/hooks/useAuth.tsx:99-129` runs `getSession()` and `onAuthStateChange` per mount; `src/App.tsx:81-109` adds a further independent listener. Consequences: duplicated network calls on every nested-route refresh, transient inconsistent `loading`/`user` between siblings (flash of the office-restriction toast, `OfficeRoute.tsx:24-30`), and many parallel `navigate("/auth")` triggers if a refresh momentarily reads `null`. Fix: promote to a single provider.

**6. High — React Query is unconfigured.** `src/App.tsx:78` `new QueryClient()` → `staleTime: 0`, `refetchOnWindowFocus: true`, `retry: 3`. On a mobile PWA every foreground refetches everything, on top of the realtime channels already pushing updates. Battery and data cost. Fix: `staleTime` 30-60s, `retry: 1`, disable focus refetch on heavy queries.

**7. Medium — Unbounded self-recursive retries with no unmount cancellation.** `src/hooks/useEngineerJobs.ts:186`, `src/pages/Jobs.tsx:155`, `src/pages/Customers.tsx:156`: `setTimeout(() => fetch(), 5000)` on failure, no `clearTimeout`, no backoff cap. An offline engineer generates an endless 5s fetch loop that survives navigation.

**8. Medium — Certificate-flow polls are not cleaned up on unmount.** `CertificateFlow.tsx:309`, `Cert2Flow.tsx:236`, `Cert3Flow.tsx:221`, `GasInstallationFlow.tsx:223`, `HazardNotificationFlow.tsx:273` each `setInterval` bounded only by a 60s `clearInterval` timer — navigating away mid-flow leaves the interval running against a stale closure.

**9. Medium — 30s polling on the renewals tab.** `src/pages/Renewals.tsx:165` `setInterval(fetchCustomers, 30000)`; confirmed live because `Renewals` is mounted by `src/pages/Pipeline.tsx:6`. Realtime already exists elsewhere; this is avoidable radio wake-up on mobile.

**10. Medium — Two unregister implementations disagree about the Firebase SW.** `src/components/pwa/PWAUpdateBanner.tsx:73-78` deliberately preserves the `firebase-cloud-messaging-push-scope` registration; `src/main.tsx:32-34` unregisters everything with no filter. In preview/dev both run, so the push worker gets wiped. Push in production is unaffected. Fix: apply the same scope filter in `main.tsx`.

**11. Medium — No iOS splash screens.** `index.html` has no `apple-touch-startup-image` links, so installed iOS launches flash white. Also a single `apple-touch-icon` with no `sizes` (line 28) and no dark-mode `theme-color`.

**12. Medium — Manifest gaps.** `public/manifest.json` has no `shortcuts`, `screenshots`, `categories`, `lang`, `dir`, `display_override`, and no maskable 192 icon (only maskable 512, lines 25-30). Installability is satisfied; install-card richness and Play-Store-quality metadata are not. All four referenced icon files do exist in `public/icons/`.

**13. Medium — `public/offline.html` is dead and malformed.** Duplicated `</body></html>` at lines 129-132 and a hardcoded Supabase project URL at line 105. Nothing references it: the real offline UX is the `/offline` route (`src/App.tsx:243`) reached via `MarketingOfflineGate.tsx:16-17`. Shipped as an orphan.

**14. Medium — `src/pages/Quotes.tsx` (1,558 lines) is unreferenced.** No static import anywhere; `/quotes` redirects to `/pipeline` (`src/App.tsx:198`). Dead weight in the repo and a maintenance trap. Dynamic-import references were not exhaustively ruled out.

**15. Medium — Coarse Suspense.** One boundary wraps the entire route tree (`src/App.tsx:172-246`), so every lazy navigation shows a full-screen loader instead of a page skeleton.

**16. Medium — Large page components.** `Quotes.tsx` 1,558, `NewJobPanel.tsx` 1,334, `AdminPanel.tsx` 1,224, `EngineerJobDetail.tsx` 1,133, `TeamManagement.tsx` 1,105, `ImportCustomers.tsx` 1,042 lines. Route splitting is in place (`src/App.tsx:29-77`) and `manualChunks` isolates recharts/xlsx/firebase (`vite.config.ts:69-75`), so first paint is protected, but individual chunks are heavy. Actual byte sizes: not confirmed from code inspection (no build run in this read-only pass).

**17. Low — `vite-plugin-compression` is installed but unused.** Present in `package.json` devDependencies, absent from `vite.config.ts`.

**18. Low — `min-h-screen` instead of `min-h-dvh`** in 20+ places (`Auth.tsx:208,279`, `EngineerApp.tsx:152,155`, `EngineerJobDetail.tsx:559,624`, `ResetPassword.tsx`, `Dashboard.tsx:152`), causing the mobile-browser toolbar jump. Safe areas themselves are handled well (`index.css:189-196`, `AppLayout.tsx:270`, `EngineerLayout.tsx:201`, `viewport-fit=cover` in `index.html:5`).

**19. Low — Accessibility gaps.** `<img>` without `alt` in `BeforeAfterSection.tsx:13` and `FounderSection.tsx:17`; only 15 files use `aria-label` at all, so icon-only buttons outside the engineer app are likely unlabelled. Radix primitives cover most focus/keyboard behaviour. Contrast: not confirmed from code inspection.

**20. Low — `globPatterns` omits `woff`, `webp`, `avif`, `json`** (`vite.config.ts:25`), so any such asset is never precached and there is no runtime image handler.

## Security notes

No private keys in client code. The Firebase web `apiKey` (`src/lib/firebase.ts:6`) and the Supabase publishable key are designed to be public. One `dangerouslySetInnerHTML` and it is the shadcn chart theme injector (`src/components/ui/chart.tsx:70`) — not user input. `localStorage` holds the Supabase session (library default) and `adminViewingOrgId`; impersonation is validated server-side by a signed token, which is the right design. CSP: not present and not settable from this codebase on Lovable hosting.

## Capacitor readiness — Medium-Low effort

Works in favour: file inputs use `capture="environment"` (`MediaSheet.tsx:216-217`, `PhotoSheet.tsx:117-118`) rather than `getUserMedia`; FCM is already wired; no geolocation usage anywhere. Needs work: `window.open` for tel/WhatsApp/maps/PDF (`EngineerJobDetail.tsx:612-615`, `EngineerCertificates.tsx:90,97,248`, `QuoteDetail.tsx:365`, `SendQuoteModal.tsx:107`) must move to `@capacitor/browser` or `App.openUrl`; `printReceipt.ts:111` `window.open('', '_blank')` will not work in a native webview; web-push FCM must be swapped for `@capacitor/push-notifications`; plugins needed: App, Browser, Push Notifications, Filesystem/Share, StatusBar, SplashScreen, Preferences.

## Quick wins (under an hour each)

Delete `public/offline.html`; delete `src/pages/Quotes.tsx`; add the Firebase scope filter to `src/main.tsx:32-34`; configure `QueryClient` defaults; add `alt` to the two landing images; add `min-h-dvh`; add `lang`/`categories`/`display_override` and a maskable 192 icon to the manifest; add `clearTimeout` cleanups to the three retry loops.

## Medium

Role-gate the admin/finance/debug routes; convert `useAuth` to a provider; broaden error boundaries; replace the Renewals 30s poll with realtime; per-route Suspense skeletons; iOS splash images.

## Long term

Remove or key the Supabase runtime cache; add a forced-update path for stale installed clients; split the six 1,000+ line pages; run a real Lighthouse and bundle-analyzer pass to replace the byte-size estimates above; systematic `aria-label` sweep.
