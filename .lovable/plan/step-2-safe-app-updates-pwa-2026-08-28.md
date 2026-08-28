# Step 2 — Safe app updates (PWA)

## What the investigation found

Already correct, no change needed:
- `vite.config.ts` already uses `registerType: "prompt"`, `injectRegister: null`, `devOptions.enabled: false`, `strategies: "generateSW"`, `filename: "sw.js"`.
- `cleanupOutdatedCaches: true` is already set.
- Step 1 is confirmed intact: the only `runtimeCaching` entry left is the `NetworkFirst` HTML navigation rule — no backend/REST caching. It will not be touched.
- The update banner already exists (`src/components/pwa/PWAUpdateBanner.tsx`), mounted once in `src/App.tsx`, registration correctly guarded via `src/lib/isPreviewHost.ts`, and it already calls `updateServiceWorker(true)` only on user tap.
- Error tracking: **Sentry is already configured** (`@sentry/react` in `src/main.tsx`, DSN set, `tracesSampleRate: 0.2`, one root `Sentry.ErrorBoundary`). Step 3 can build on it rather than adding it.

Two real gaps:
1. `workbox.skipWaiting: true` and `clientsClaim: true` in `vite.config.ts` contradict `registerType: "prompt"`. The new worker activates and claims open tabs immediately, so the banner is decorative — the swap happens whether or not the user taps it. This is what silently swaps code under a user with an open completion form.
2. There is **no runtime cache for `/assets/`**. Precache only covers the current build's hashed files; after a deploy, an un-updated tab that lazy-loads an old chunk hits a 404 and throws `ChunkLoadError` / "Failed to fetch dynamically imported module" — the white-screen reports.

## Changes

### 1. `vite.config.ts` (small edit)
- Remove `skipWaiting: true` and `clientsClaim: true` so activation is driven only by the banner's `updateServiceWorker(true)`.
- Keep `cleanupOutdatedCaches: true` (already there).
- Add one `runtimeCaching` entry, appended after the existing HTML rule (the HTML rule stays byte-identical):
  - matches same-origin `GET` requests under `/assets/`
  - handler `CacheFirst` (hashed filenames are immutable, so this is safe)
  - own cache name (`assets`), `maxEntries` ~200, `maxAgeSeconds` 30 days, `cacheableResponse: { statuses: [0, 200] }`
  - This is what lets a stale tab still resolve an old chunk after a deploy.

### 2. `src/components/pwa/PWAUpdateBanner.tsx` (small edit)
- Keep the current structure and styling. Add only:
  - copy that makes the choice explicit and non-forced: headline "New version available", plus a short line "Finish what you're doing first — nothing will change until you tap Update."
  - rename the action to `Update` (from `Refresh`), keep the dismiss `X`.
  - keep dismiss as "stay on the current version" — the waiting worker is left waiting and the banner reappears on next load, so a user with an open form is never interrupted.
- No forced reloads, no timers, no auto-activation.

That is two files. No third file is needed and no other file changes.

## Out of scope
No backend, Supabase, Edge Function, schema, routing, or Step 1 changes. No `ChunkLoadError` reload handler or global error handlers — those belong to Step 3.

## Verification (important)
- In Lovable preview the service worker is deliberately never registered, so **this step cannot be verified in preview**. It needs a real production deploy.
- Post-deploy manual check on `karlsgas.lovable.app`: load the app, deploy again, confirm (a) the banner appears and the page keeps running on the old version until tapped, (b) navigating around the stale tab does not white-screen, (c) tapping Update reloads onto the new version, (d) `caches.keys()` does not accumulate old precache buckets after two deploys.
- Because activation now waits for the user, expect one deploy cycle where returning users see the banner rather than an instant swap. That is the intended behaviour.

## Risk
Low code risk, but it changes update timing for every live user, so it ships on its own with the deploy check above rather than bundled with other work.
