# PWA remediation — 20 audit findings in five stages

I re-checked every finding against the current code before planning. All 20 still reproduce. Notes below where my reading differs from the audit.

## Verification results

Confirmed by reading the files just now:

- `vite.config.ts` still has a `NetworkFirst` runtime rule matching the backend REST URL, 5s timeout, 300s TTL — authenticated JSON, keyed by URL only. **Release blocker.**
- `registerType: "prompt"` with no periodic or foreground update check; dismissing the banner sets `dismissed` state that persists for the life of the page. **Release blocker.**
- Exactly one route-level `ErrorBoundary` (`/dashboard`), plus one inside `EngineerCertificates`. 57 other routes have none.
- `new QueryClient()` — bare, no defaults at all.
- Only `/warranty`, `/insights`, `/warranty/:id`, `/settings` use `OfficeRoute`. `/finance`, `/parts`, `/products`, `/message-log`, `/system-logs`, `/debug/incoming-jobs`, `/pipeline` are auth-only, so an engineer can open all of them.
- `useAuth` runs `getSession()` + `onAuthStateChange` per mount, and its own comment says ~91 call sites.
- Recursive `setTimeout(..., 5000)` retries in `Jobs.tsx:155`, `Customers.tsx:156`, `useEngineerJobs.ts:186` — no cleanup, no backoff, no cap.
- All five certificate flows use the same pattern: `setInterval` poll plus `setTimeout(() => clearInterval(poll), 60000)` created inside an async handler, so neither is cleared on unmount.
- `Renewals.tsx:165` polls every 30s. `Pipeline.tsx` does not — the audit named it in error.
- `main.tsx` unregisters **all** service workers in skip contexts, including Firebase messaging; `PWAUpdateBanner` correctly filters that scope out. Two implementations, one wrong.
- `index.html` has `viewport-fit=cover` and one 192px apple-touch-icon; no startup images, no dark theme-color.
- `manifest.json` has `id`/`scope`/`orientation` and a 512 maskable, but no 192 maskable, `lang`, `dir`, `categories`, `shortcuts`, or `screenshots`.
- `public/offline.html` has duplicated `</body></html>`, its own 3s probe loop, and zero references anywhere in the project or build config.
- `src/pages/Quotes.tsx` — 1,558 lines, no import anywhere in `src`; `/quotes` redirects to `/pipeline`. Dead.
- `vite-plugin-compression` in `package.json`, absent from `vite.config.ts`.
- One `Suspense` boundary wrapping all 46 lazy routes.
- 86 occurrences of `min-h-screen`/`h-screen`/`100vh` across pages and `index.css`.

Two disagreements with the audit, and how I'll handle them:

- **Issue 16 (files over 1,000 lines)** is a maintainability observation, not a bug. Route splitting already protects first load. I'll delete `Quotes.tsx` and report measured chunk sizes, but I'm not extracting components from `AdminPanel`/`EngineerJobDetail`/`ImportCustomers` in this pass — a behaviour-preserving refactor of three large screens deserves its own plan with its own testing, not a tail-end stage.
- **Issue 17 (compression)** — Lovable hosting already serves compressed responses, so precompressed assets add build weight for nothing. I'll remove the unused package rather than configure it.

## Stage A — release blockers

**Issue 1 — stop caching authenticated API responses.** Delete the backend-REST `runtimeCaching` entry from `vite.config.ts`. HTML navigations keep `NetworkFirst`; hashed assets keep precache. No custom cache-key plugin — there is no offline API requirement here. Then add a session-change cache reset: clear the React Query cache on `SIGNED_OUT` and on organisation change (the admin view-as path), so a previous tenant's rows can't survive in memory either.

**Issue 2 — make updates unavoidable.** Keep the prompt banner and add: an update check on load, on `visibilitychange` to visible, and on a 30-minute interval while open; dismissal stored with a 45-minute expiry in `sessionStorage` rather than component state; and a single `controllerchange`-gated reload guarded by a session flag so it can't loop. No forced reload while a form is dirty — the project already has `useNavigationGuard`/`FormLeaveGuard`, so I'll reuse that signal rather than inventing a global form registry; if no dirty-state signal is available on a screen, the banner stays up instead of reloading.

Gate: typecheck, lint, tests, production build, and an inspection of the generated `sw.js` confirming no REST pattern remains. Stage B does not start until those pass.

## Stage B — stability and access

**Issue 3 — error boundaries at layout level.** Upgrade `ErrorBoundary` to report to Sentry, offer Retry (reset in place) and a role-appropriate home link, reset on location change, and keep the app shell. Mount it inside `AppLayout` and `EngineerLayout` around the outlet; drop the now-redundant per-route wrapper on `/dashboard`. Verified with a temporary throwing component that is removed afterwards.

**Issue 4 — gate the management routes.** Reuse `OfficeRoute` (it already resolves auth + role, blocks render while loading, and honours `can_access_office`) for `/finance`, `/parts`, `/products`, `/message-log`, `/pipeline`, `/settings/import`, `/whatsapp*`, and `/insights`. Add a stricter `AdminRoute` for `/system-logs`, `/debug/incoming-jobs`, `/debug/audio`, and the admin/tenant screens. This is UI hygiene only — RLS stays exactly as it is and remains the real boundary.

**Issue 5 — one auth listener.** Add an `AuthProvider` at the root owning session, user and loading; `useAuth()` becomes a context consumer keeping its current `{ user, loading, signOut }` shape so the ~91 call sites need no edits. The engineer-link/FCM side effect moves into the provider and keeps its once-per-session guard. Redirect logic stays in the route guards. Verified by counting listener registrations at runtime.

**Issue 6 — React Query defaults.** `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`, mutations `retry: 0`. Screens relying on focus refetch get it re-enabled explicitly.

## Stage C — lifecycle cleanup

**Issue 7** — replace the three recursive retries with one shared `useRetryingFetch`-style helper: capped exponential backoff (2/5/10/20s, max 30s), attempt limit, abort in-flight request and clear the timer on unmount, reset on success, then surface a manual Retry.

**Issue 8** — same fix in all five certificate flows: interval and timeout IDs in refs, cleared in an effect cleanup, an `isMounted`/abort guard before any `setState`, a re-entry guard so one certificate can't start two loops, and polling stopped on success.

**Issue 9** — drop the 30s `Renewals.tsx` poll for a realtime subscription on the relevant table plus a refresh on reconnect and on becoming visible, with a manual refresh control. Org filtering unchanged.

**Issue 10** — one shared `unregisterAppShellWorker()` helper used by both `main.tsx` and `PWAUpdateBanner`, filtering out the `firebase-cloud-messaging-push-scope` registration. Fixes the current bug where preview loads kill push registration.

## Stage D — installability and cleanup

**Issue 11** — generate iOS startup images for the main iPhone sizes in both orientations on the app background colour, wire them with correct media queries, add a dark `theme-color`. Any size I can't produce gets reported, not faked.

**Issue 12** — add `lang`, `dir`, `categories`, `display_override`, a 192 maskable icon with real safe-zone padding, `shortcuts` limited to routes that resolve for a signed-in user (Dashboard, Jobs, Customers, New Job), and `screenshots` only if I can produce real captures at declared dimensions.

**Issue 13** — delete `public/offline.html` (no references; the React `/offline` route stays, and the Workbox `navigateFallback` points at `index.html`).

**Issue 14** — delete `src/pages/Quotes.tsx` and any exports left dangling.

**Issue 15** — keep the global `Suspense` as a last resort and add content-area boundaries inside `AppLayout` and `EngineerLayout` with compact skeletons, so nav and header stay put during lazy navigation.

## Stage E — mobile and accessibility

**Issue 18** — an `app-min-height` class with a `100dvh` `@supports` upgrade, applied to the full-height app/auth/public-document screens only; small sections that intentionally use viewport height are left alone.

**Issue 19** — alt text on informative images, `alt=""` on decorative ones, accessible names on icon-only controls, `type` on buttons, titles/descriptions on dialogs. Radix focus management untouched.

**Issue 20** — extend `globPatterns` with the extensions actually present in the build output (`woff`, `woff2`, `webp`, `avif` as applicable). No JSON precaching unless it's static build content; nothing authenticated.

**Issue 17** — remove `vite-plugin-compression` from `package.json`.

## Capacitor backlog

A `docs/capacitor-backlog.md` recording the browser-only behaviours found (`window.open` for tel/WhatsApp/maps/PDFs, receipt printing via blank window, Firebase web push, downloads/share, storage, status bar, splash) each mapped to its plugin. No plugins installed, no migration started.

## Final report

`docs/pwa-remediation-report.md` with the eight sections requested: verdict, per-issue results table (Fixed / Partially fixed / Not fixed / Not reproducible / Requires device testing), before-and-after build and precache sizes, network behaviour comparison, explicit security confirmations, PWA validation, and remaining risks split into unresolved, device-only, and long-term.

Two things I can't verify from here and will label as such rather than claim: real installed-iOS/Android launch and update behaviour, and production response headers for compression.
